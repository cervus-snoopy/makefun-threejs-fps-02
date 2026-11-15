// bots.js — bot operatives: movement, aiming, shooting and dying.
// Each bot is a small capsule + head sphere + a coloured name plate in the
// scene. Behaviour is a simple state machine (patrol -> engage -> reposition)
// driven by the match's seeded RNG, so a fixed seed replays the same match.

import * as THREE from "three";
import { clamp, angleLerp, moveAndCollide, rayBox, raySphere } from "./engine.js";

const BOT_NAMES = {
  vanguard: ["Ash", "Bravo", "Cypher", "Dagger"],
  sentinel: ["Echo", "Fang", "Ghost", "Havoc", "Iris"],
};

const TEAM_COLORS = { vanguard: 0xe8a33d, sentinel: 0x2fb3a3 };

export class Bot {
  constructor(scene, team, index, spawn, rng) {
    this.team = team;
    this.name = BOT_NAMES[team][index % BOT_NAMES[team].length];
    this.rng = rng;
    this.health = 100;
    this.alive = true;
    this.speed = 3.4 + rng() * 0.8;
    this.yaw = team === "vanguard" ? -Math.PI / 2 : Math.PI / 2;
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.waypoint = null;
    this.target = null;
    this.reaction = 0;
    this.shootCooldown = 0;
    this.burstLeft = 0;
    this.strafeDir = rng() > 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.damage = 13; // per bot bullet
    this.fireInterval = 0.16;

    const color = TEAM_COLORS[team];
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c2128, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 6, 12), bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), darkMat);
    head.position.y = 1.85;
    head.castShadow = true;
    group.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }));
    visor.position.set(0, 1.87, 0.2);
    group.add(visor);
    // Shoulder plates make teams readable at a glance.
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.4), darkMat);
      plate.position.set(s * 0.38, 1.5, 0);
      group.add(plate);
    }
    group.position.copy(this.pos);
    scene.add(group);
    this.group = group;
    this.body = body;
    this.head = head;
  }

  get headPos() {
    return new THREE.Vector3(this.pos.x, 1.85, this.pos.z);
  }

  get bodyPos() {
    return new THREE.Vector3(this.pos.x, 1.05, this.pos.z);
  }

  pickWaypoint(waypoints) {
    this.waypoint = waypoints[Math.floor(this.rng() * waypoints.length)];
  }

  // Find the nearest visible living enemy. Visibility is a ray test against
  // the map's colliders so bots cannot shoot through walls.
  acquire(enemies, colliders) {
    let best = null;
    let bestDist = 34;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const o = { x: this.pos.x, y: 1.6, z: this.pos.z };
      const d = { x: dx / dist, y: (1.2 - 1.6) / dist, z: dz / dist };
      let blocked = false;
      for (const b of colliders) {
        if (rayBox(o, d, b, dist) !== Infinity) { blocked = true; break; }
      }
      if (!blocked) { best = e; bestDist = dist; }
    }
    this.target = best;
    return best;
  }

  update(dt, ctx) {
    if (!this.alive) return;
    const { waypoints, colliders, enemies, onShoot } = ctx;
    this.shootCooldown -= dt;
    this.strafeTimer -= dt;

    const target = this.acquire(enemies, colliders);
    if (target) {
      // Engage: face the target, strafe, fire in bursts after a reaction delay.
      const dx = target.pos.x - this.pos.x;
      const dz = target.pos.z - this.pos.z;
      const wantYaw = Math.atan2(-dx, -dz);
      this.yaw = angleLerp(this.yaw, wantYaw, Math.min(1, dt * 6));
      if (this.reaction <= 0) this.reaction = 0.35 + this.rng() * 0.5;
      this.reaction -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir *= -1;
        this.strafeTimer = 0.7 + this.rng() * 0.9;
      }
      const dist = Math.hypot(dx, dz);
      const strafe = this.strafeDir * this.speed * 0.45;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const mx = -fz * strafe + (dist > 14 ? -fx * this.speed * 0.5 : 0);
      const mz = fx * strafe + (dist > 14 ? -fz * this.speed * 0.5 : 0);
      moveAndCollide(this.pos, mx * dt, mz * dt, 0.4, colliders);
      if (this.reaction <= 0 && this.shootCooldown <= 0 && dist < 34) {
        this.shootCooldown = this.fireInterval;
        // Inaccuracy grows with distance; bots miss sometimes on purpose.
        const spread = 0.03 + dist * 0.0016;
        const hitChance = clamp(0.62 - dist * 0.008, 0.18, 0.62);
        onShoot(this, target, hitChance, spread);
        if (this.rng() < 0.12) this._burstPause();
      }
    } else {
      // Patrol: walk to a waypoint, pick a new one on arrival.
      if (!this.waypoint) this.pickWaypoint(waypoints);
      const dx = this.waypoint.x - this.pos.x;
      const dz = this.waypoint.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        this.pickWaypoint(waypoints);
      } else {
        const wantYaw = Math.atan2(-dx, -dz);
        this.yaw = angleLerp(this.yaw, wantYaw, Math.min(1, dt * 4));
        moveAndCollide(this.pos, (dx / dist) * this.speed * dt, (dz / dist) * this.speed * dt, 0.4, colliders);
      }
    }
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw + Math.PI;
  }

  _burstPause() {
    this.shootCooldown += 0.55 + this.rng() * 0.5;
  }

  takeDamage(amount, isHeadshot) {
    if (!this.alive) return 0;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.group.visible = false;
    }
    return isHeadshot ? amount : amount;
  }

  reset(spawn) {
    this.health = 100;
    this.alive = true;
    this.pos.set(spawn.x, 0, spawn.z);
    this.group.position.copy(this.pos);
    this.group.visible = true;
    this.waypoint = null;
    this.target = null;
    this.reaction = 0;
    this.shootCooldown = 0;
  }
}

// Shared shooting resolution for a bot firing at the player or another bot.
// Returns { hit, damage, killed } — the caller applies effects and sounds.
export function resolveBotShot(shooter, target, hitChance, spread, rng) {
  const dist = Math.hypot(target.pos.x - shooter.pos.x, target.pos.z - shooter.pos.z);
  const roll = rng();
  if (roll > hitChance) return { hit: false, damage: 0, killed: false };
  const headshot = rng() < 0.12;
  const falloff = clamp(1 - (dist - 10) / 60, 0.45, 1);
  const damage = Math.round(shooter.damage * (headshot ? 1.6 : 1) * falloff);
  return { hit: true, damage, killed: false, headshot };
}

export function playerHitTest(origin, dir, bot, maxDist) {
  // Returns { dist, part } for the closest hit on a bot, or null.
  const headD = raySphere(origin, dir, bot.headPos, 0.28, maxDist);
  const bodyD = raySphere(origin, dir, bot.bodyPos, 0.5, maxDist);
  if (headD === Infinity && bodyD === Infinity) return null;
  if (headD <= bodyD) return { dist: headD, part: "head" };
  return { dist: bodyD, part: "body" };
}
