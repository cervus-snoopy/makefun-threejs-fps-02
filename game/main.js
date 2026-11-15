// main.js — SANDLINE in play: renderer, first-person controller, shooting,
// HUD, buy phase, round flow, and a demo camera (?demo=1, ?shot=1..4) used
// for the screenshots. A static ES module, no network: three.js is vendored
// locally and every sound is synthesised in audio.js.

import * as THREE from "three";
import { mulberry32, hashSeed, clamp, moveAndCollide, rayBox, formatTime } from "./engine.js";
import { buildMap, MAP } from "./map.js";
import { Match, PHASE } from "./state.js";
import { Bot, resolveBotShot, playerHitTest } from "./bots.js";
import { WEAPONS, GEAR, ECONOMY } from "./weapons.js";
import { SoundBank } from "./audio.js";

// ---- Boot / URL params ------------------------------------------------------
// ?demo=1 orbits the yard, ?shot=1..4 holds one of the four fixed screenshot
// views. Both skip the menu and start a match straight away.
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo") || params.has("shot");
const SHOT = parseInt(params.get("shot") || "0", 10);
const SEED = parseInt(params.get("seed") || "33976828", 10); // drand round from `makefun init`

const $ = (id) => document.getElementById(id);
const hud = $("hud");
const menuEl = $("menu");
const buyEl = $("buyMenu");
const endEl = $("endScreen");

// ---- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r187 removed PCFSoftShadowMap (falls back to this with a warning)
$("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9aa7b5);
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 220);
camera.rotation.order = "YXZ";

const map = buildMap(scene);
const sounds = new SoundBank();
const match = new Match(SEED);

// ---- Player -----------------------------------------------------------------
const player = {
  pos: new THREE.Vector3(-28, 0, 0),
  velY: 0,
  jumpY: 0,
  yaw: -Math.PI / 2,
  pitch: 0,
  health: 100,
  armor: 0,
  alive: true,
  speed: 5.4,
  radius: 0.4,
};
const playerTarget = {
  get pos() { return player.pos; },
  get alive() { return player.alive; },
  name: "You",
  team: "vanguard",
};

// What the player owns: the starting pistol, plus anything bought later.
// Each entry is { mag, reserve } for the weapon's current ammunition.
const inventory = { sidewinder: { mag: WEAPONS.sidewinder.magSize, reserve: WEAPONS.sidewinder.reserve } };
let activeWeapon = "sidewinder";
let firing = false;
let lastShotAt = 0;
let reloadingUntil = 0;
let recoil = 0;

// The viewmodel: a simple low-poly rifle built from boxes, parented to the
// camera so it rides along with the player's view.
function buildViewmodel() {
  const gun = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2128, roughness: 0.6, metalness: 0.4 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a4149, roughness: 0.5, metalness: 0.5 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.5, metalness: 0.3 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 10), mid);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.4);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.13, 0.08);
  grip.rotation.x = 0.3;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), amber);
  sight.position.set(0, 0.1, -0.05);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.1), mid);
  mag.position.set(0, -0.14, -0.08);
  mag.rotation.x = 0.15;
  gun.add(receiver, barrel, grip, sight, mag);
  gun.position.set(0.28, -0.26, -0.5);
  return gun;
}
const gun = buildViewmodel();
camera.add(gun);
scene.add(camera);

// ---- Bots -------------------------------------------------------------------
// One seeded stream per match; each bot gets its own stream derived from the
// match seed, the round and its index, so the same seed replays the same
// match.
let rng = mulberry32(SEED);
let vanguardBots = [];
let sentinelBots = [];

function spawnBots() {
  for (const b of [...vanguardBots, ...sentinelBots]) scene.remove(b.group);
  vanguardBots = map.spawns.vanguard.map((s, i) => new Bot(scene, "vanguard", i, s, mulberry32(SEED + match.round * 31 + i)));
  sentinelBots = map.spawns.sentinel.map((s, i) => new Bot(scene, "sentinel", i, s, mulberry32(SEED + match.round * 57 + i + 7)));
}

function living(team) {
  return (team === "vanguard" ? [...vanguardBots, playerTarget] : sentinelBots).filter((b) => b.alive);
}

// ---- Tracers / impacts ------------------------------------------------------
const tracers = [];
function addTracer(from, to, color = 0xffe08a) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, life: 0.07 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      tracers.splice(i, 1);
    }
  }
}

// ---- HUD --------------------------------------------------------------------
function updateHealthPanel() {
  $("healthNum").textContent = Math.max(0, Math.ceil(player.health));
  $("healthNum").classList.toggle("low", player.health <= 30);
  $("armorNum").textContent = Math.ceil(player.armor);
}

function updateAmmoPanel() {
  const w = WEAPONS[activeWeapon];
  const ammo = inventory[activeWeapon];
  $("magNum").textContent = ammo ? ammo.mag : 0;
  $("reserveNum").textContent = ammo ? ammo.reserve : 0;
  $("weaponName").textContent = w.name;
}

function updateScorePanel() {
  $("moneyNum").textContent = match.money.toLocaleString("en-US");
  $("scoreVan").textContent = match.score.vanguard;
  $("scoreSen").textContent = match.score.sentinel;
  $("roundLabel").textContent = `ROUND ${match.round} / ${MAP.maxRounds}`;
  $("timer").textContent = formatTime(match.phase === PHASE.BUY ? match.buyTimeLeft : match.timeLeft);
}

function updateHUD() {
  updateHealthPanel();
  updateAmmoPanel();
  updateScorePanel();
}

function killfeed(killer, victim, headshot) {
  const feed = $("killfeed");
  const div = document.createElement("div");
  const kc = killer.team === "vanguard" ? "kf-van" : "kf-sen";
  const vc = victim.team === "vanguard" ? "kf-van" : "kf-sen";
  div.innerHTML = `<span class="${kc}">${killer.name}</span> ${headshot ? "◉" : "✕"} <span class="${vc}">${victim.name}</span>`;
  feed.prepend(div);
  while (feed.children.length > 5) feed.lastChild.remove();
  setTimeout(() => div.remove(), 6000);
}

function showHitmarker(kill) {
  const h = $("hitmarker");
  h.style.opacity = "1";
  h.classList.toggle("kill", !!kill);
  setTimeout(() => { h.style.opacity = "0"; }, 90);
}

function flashDamage() {
  const v = $("damageVignette");
  v.style.opacity = "0.95";
  setTimeout(() => { v.style.opacity = "0"; }, 260);
}

function showBanner(title, sub, kind) {
  const b = $("banner");
  b.querySelector("h2").textContent = title;
  b.querySelector("p").textContent = sub;
  b.className = kind || "";
  b.style.display = "block";
  setTimeout(() => { b.style.display = "none"; }, 4200);
}

// ---- Shooting ---------------------------------------------------------------
function eyePos() {
  return new THREE.Vector3(player.pos.x, 1.6 + player.jumpY, player.pos.z);
}

function shootDirection(spread) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  if (spread > 0) {
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, (Math.random() - 0.5) * 2 * spread);
    dir.addScaledVector(up, (Math.random() - 0.5) * 2 * spread);
    dir.normalize();
  }
  return dir;
}

function playerShoot() {
  const now = performance.now() / 1000;
  const w = WEAPONS[activeWeapon];
  const ammo = inventory[activeWeapon];
  if (!player.alive || match.phase !== PHASE.ROUND) return;
  if (now < reloadingUntil) return;
  if (now - lastShotAt < 60 / w.rpm) return;
  if (ammo.mag <= 0) {
    sounds.dryFire();
    lastShotAt = now;
    return;
  }
  lastShotAt = now;
  ammo.mag -= 1;
  recoil = Math.min(recoil + (w.kind === "longbow" ? 0.05 : 0.022), 0.09);
  sounds.shot(w.kind === "pistol" ? "pistol" : activeWeapon);

  const origin = eyePos();
  const dir = shootDirection(w.spread);
  // The nearest wall caps the shot.
  let wallDist = w.range;
  for (const b of map.colliders) {
    const t = rayBox(origin, dir, b, w.range);
    if (t < wallDist) wallDist = t;
  }
  // The nearest living Sentinel bot in the way.
  let best = null;
  for (const bot of sentinelBots) {
    if (!bot.alive) continue;
    const hit = playerHitTest(origin, dir, bot, Math.min(wallDist, w.range));
    if (hit && (!best || hit.dist < best.dist)) best = { bot, ...hit };
  }
  const end = origin.clone().addScaledVector(dir, best ? best.dist : wallDist);
  addTracer(new THREE.Vector3(origin.x, origin.y - 0.08, origin.z).addScaledVector(dir, 0.6), end);
  if (best) {
    const falloff = clamp(1 - (best.dist - 10) / w.range, 0.4, 1);
    const dmg = Math.round(w.damage * (best.part === "head" ? w.headshotMult : 1) * falloff);
    best.bot.takeDamage(dmg, best.part === "head");
    sounds.hit();
    showHitmarker(!best.bot.alive);
    if (!best.bot.alive) {
      match.kills += 1;
      match.money += ECONOMY.killReward;
      sounds.kill();
      killfeed(playerTarget, best.bot, best.part === "head");
      checkRoundEnd();
    }
  }
  updateHUD();
}

function reload() {
  const w = WEAPONS[activeWeapon];
  const ammo = inventory[activeWeapon];
  if (!ammo || ammo.mag === w.magSize || ammo.reserve <= 0) return;
  if (performance.now() / 1000 < reloadingUntil) return;
  reloadingUntil = performance.now() / 1000 + w.reloadTime;
  sounds.reload();
  setTimeout(() => {
    const need = w.magSize - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
    updateHUD();
  }, w.reloadTime * 1000);
}

// ---- Damage to the player ---------------------------------------------------
function damagePlayer(amount, attacker) {
  if (!player.alive) return;
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, Math.round(amount / 2));
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health -= remaining;
  sounds.hurt();
  flashDamage();
  if (player.health <= 0) {
    player.health = 0;
    player.alive = false;
    match.deaths += 1;
    killfeed(attacker, playerTarget, false);
    showBanner("YOU ARE DOWN", "Your squad fights on — next round you redeploy.", "lose");
    document.exitPointerLock?.();
    checkRoundEnd();
  }
  updateHUD();
}

// ---- Bot shooting callback --------------------------------------------------
function onBotShoot(shooter, target, hitChance, spread) {
  const muzzle = new THREE.Vector3(shooter.pos.x, 1.5, shooter.pos.z);
  const res = resolveBotShot(shooter, target, hitChance, spread, shooter.rng);
  const targetPos = target === playerTarget
    ? new THREE.Vector3(player.pos.x, 1.3 + player.jumpY, player.pos.z)
    : new THREE.Vector3(target.pos.x, 1.3, target.pos.z);
  addTracer(muzzle, targetPos, shooter.team === "vanguard" ? 0xe8a33d : 0x2fb3a3);
  const distToPlayer = Math.hypot(shooter.pos.x - player.pos.x, shooter.pos.z - player.pos.z);
  if (distToPlayer < 40) sounds.distantShot();
  if (!res.hit) return;
  if (target === playerTarget) {
    damagePlayer(res.damage, shooter);
  } else {
    target.takeDamage(res.damage, res.headshot);
    if (target === playerTarget) return;
    if (!target.alive) {
      killfeed(shooter, target, res.headshot);
      if (shooter.team === "vanguard") {
        match.kills += 1;
        match.money += ECONOMY.killReward;
      }
      checkRoundEnd();
    }
  }
}

// ---- Round flow -------------------------------------------------------------
function resetPositions() {
  player.pos.set(map.spawns.vanguard[0].x, 0, map.spawns.vanguard[0].z);
  player.yaw = -Math.PI / 2;
  player.pitch = 0;
  player.jumpY = 0;
  player.velY = 0;
  player.health = 100;
  player.alive = true;
  if (!inventory[activeWeapon]) activeWeapon = "sidewinder";
  for (const id of Object.keys(inventory)) {
    inventory[id].mag = WEAPONS[id].magSize;
    inventory[id].reserve = WEAPONS[id].reserve;
  }
  spawnBots();
}

function startBuyPhase() {
  match.phase = PHASE.BUY;
  match.buyTimeLeft = MAP.buyTime;
  renderBuyMenu();
  if (!DEMO) buyEl.classList.remove("hidden");
  updateHUD();
}

function startRound() {
  buyEl.classList.add("hidden");
  resetPositions();
  match.startRound();
  showBanner(`ROUND ${match.round}`, match.round === 1 ? "Vanguard pushes — take the yard." : "Hold the line. Spend wisely, shoot straight.", "");
  updateHUD();
}

function checkRoundEnd() {
  if (match.phase !== PHASE.ROUND) return;
  const vanAlive = living("vanguard").length;
  const senAlive = living("sentinel").length;
  if (senAlive === 0) endRound("vanguard", "Sentinel squad eliminated");
  else if (vanAlive === 0) endRound("sentinel", "Vanguard squad eliminated");
}

function endRound(winner, reason) {
  const res = match.endRound(winner, reason);
  if (!res) return;
  const won = winner === "vanguard";
  showBanner(won ? "ROUND WON" : "ROUND LOST", `${reason} — ${match.score.vanguard} : ${match.score.sentinel}`, won ? "win" : "lose");
  if (won) sounds.roundWin();
  else sounds.roundLose();
  updateHUD();
  setTimeout(() => {
    if (res.matchOver) {
      showEndScreen();
    } else {
      match.nextRound();
      startBuyPhase();
    }
  }, 4200);
}

// ---- Buy menu ---------------------------------------------------------------
function renderBuyMenu() {
  $("buyMoney").textContent = `$${match.money.toLocaleString("en-US")}`;
  $("buyRound").textContent = String(match.round);
  $("buyCountdown").textContent = String(Math.ceil(match.buyTimeLeft));
  const grid = $("buyGrid");
  grid.innerHTML = "";
  for (const item of Object.values(GEAR)) {
    grid.appendChild(makeBuyItem(item));
  }
}

// The end-of-match scoreboard: final score, the player's record, and the
// match settings that produced it.
function matchSummaryHTML() {
  return `Final score — Vanguard ${match.score.vanguard} : ${match.score.sentinel} Sentinel<br>` +
    `Your kills ${match.kills} · deaths ${match.deaths} · money $${match.money.toLocaleString("en-US")}<br>` +
    `Seed ${SEED} · map Dustworks Yard · first to ${MAP.roundsToWin} rounds`;
}

function showEndScreen() {
  const champ = match.finishMatch();
  $("endTitle").textContent = champ === "vanguard" ? "VANGUARD WINS THE MATCH" : "SENTINEL WINS THE MATCH";
  $("endStats").innerHTML = matchSummaryHTML();
  endEl.classList.remove("hidden");
  hud.classList.remove("on");
  document.exitPointerLock?.();
}

// Wire the menu buttons: deploy, demo camera, close-buy, play again.
function bindMenuButtons() {
  $("buyDoneBtn").onclick = () => {
    if (match.phase === PHASE.BUY) {
      match.buyTimeLeft = 0;
      startRound();
    }
  };
  $("againBtn").onclick = () => location.reload();
}

// ---- Input ------------------------------------------------------------------
const keys = {};

// Wire every player control: movement keys, weapon switching, reload, jump,
// buy menu, mouse aim and fire, pointer lock, and window resize.
function bindInputs() {
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "KeyR") reload();
    if (e.code === "Digit1" && inventory.sidewinder) {
      activeWeapon = "sidewinder";
      updateHUD();
    }
    if (e.code === "Digit2") {
      const ownedRifles = Object.keys(inventory).filter((id) => id !== "sidewinder");
      if (ownedRifles.length) {
        activeWeapon = ownedRifles[0];
        updateHUD();
      }
    }
    if (e.code === "KeyB" && match.phase === PHASE.BUY) buyEl.classList.toggle("hidden");
    if (e.code === "Space" && player.alive && player.jumpY === 0 && match.phase === PHASE.ROUND) {
      player.velY = 6.2;
      e.preventDefault();
    }
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (match.phase !== PHASE.ROUND || !player.alive) return;
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
      return;
    }
    firing = true;
    if (!WEAPONS[activeWeapon].auto) playerShoot();
  });
  addEventListener("mouseup", (e) => { if (e.button === 0) firing = false; });
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.45, 1.45);
  });
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement !== renderer.domElement) firing = false;
  });
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

bindInputs();

// ---- Demo camera (screenshots) ----------------------------------------------
const SHOT_VIEWS = [
  { pos: [-24, 6, -14], look: [10, 1, -6] },    // spawn lane towards mid
  { pos: [2, 5, 14], look: [24, 1, -14] },     // south lane towards site A
  { pos: [10, 9, 0], look: [-6, 1, 0] },       // high over the mid container stack
  { pos: [18, 2.2, -8], look: [24, 1.4, -14] }, // close on the site A pylon
];
let demoAngle = 0;

function updateDemoCamera(dt) {
  if (SHOT > 0 && SHOT_VIEWS[SHOT - 1]) {
    const v = SHOT_VIEWS[SHOT - 1];
    camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
    camera.lookAt(v.look[0], v.look[1], v.look[2]);
    return;
  }
  demoAngle += dt * 0.12;
  const r = 26;
  camera.position.set(Math.cos(demoAngle) * r, 10 + Math.sin(demoAngle * 0.7) * 3, Math.sin(demoAngle) * r);
  camera.lookAt(0, 1, 0);
}

// ---- Main loop --------------------------------------------------------------
const clock = new THREE.Clock();
let frames = 0;
let fpsTimer = 0;

function updatePlayerMovement(dt) {
  // WASD relative to yaw; Shift walks (quieter, slower).
  const run = keys.ShiftLeft || keys.ShiftRight ? 0.55 : 1;
  let mx = 0;
  let mz = 0;
  if (keys.KeyW) mz -= 1;
  if (keys.KeyS) mz += 1;
  if (keys.KeyA) mx -= 1;
  if (keys.KeyD) mx += 1;
  if (mx !== 0 || mz !== 0) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const dx = (mx * cos - mz * sin) * player.speed * run * dt;
    const dz = (mx * sin + mz * cos) * player.speed * run * dt;
    moveAndCollide(player.pos, dx, dz, player.radius, map.colliders);
    player.pos.x = clamp(player.pos.x, -MAP.width / 2 + 1, MAP.width / 2 - 1);
    player.pos.z = clamp(player.pos.z, -MAP.depth / 2 + 1, MAP.depth / 2 - 1);
  }
  // Jump / gravity.
  if (player.jumpY > 0 || player.velY !== 0) {
    player.velY -= 18 * dt;
    player.jumpY += player.velY * dt;
    if (player.jumpY <= 0) {
      player.jumpY = 0;
      player.velY = 0;
    }
  }
}

function updateBotTeams(dt) {
  // Bots fight both ways: Vanguard pushes the yard, Sentinel defends it
  // and hunts the player.
  for (const bot of vanguardBots) {
    bot.update(dt, {
      waypoints: map.waypoints, colliders: map.colliders,
      enemies: sentinelBots, onShoot: onBotShoot,
    });
  }
  for (const bot of sentinelBots) {
    bot.update(dt, {
      waypoints: map.waypoints, colliders: map.colliders,
      enemies: [...vanguardBots, playerTarget], onShoot: onBotShoot,
    });
  }
}

function makeBuyItem(item) {
  const div = document.createElement("div");
  const owned = !!inventory[item.id];
  div.className = "buy-item" + (owned ? " owned" : "");
  div.innerHTML = `<div class="name">${item.name}</div><div class="desc">${item.desc}</div>` +
    `<div class="price">${owned ? "OWNED" : "$" + item.price.toLocaleString("en-US")}</div>`;
  div.onclick = () => {
    if (owned) {
      if (WEAPONS[item.id]) {
        activeWeapon = item.id;
        sounds.buy();
      }
      renderBuyMenu();
      updateHUD();
      return;
    }
    const res = match.buy(item.id);
    if (!res.ok) {
      sounds.denied();
      return;
    }
    sounds.buy();
    if (item.id === "armor") player.armor = 50;
    else {
      inventory[item.id] = { mag: WEAPONS[item.id].magSize, reserve: WEAPONS[item.id].reserve };
      activeWeapon = item.id;
    }
    renderBuyMenu();
    updateHUD();
  };
  return div;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  frames += 1;
  fpsTimer += dt;
  if (fpsTimer >= 1) {
    $("fpsTag").textContent = `SANDLINE demo · seed ${SEED} · ${frames} fps · three r187`;
    frames = 0;
    fpsTimer = 0;
  }

  // Match clock.
  const tick = match.tick(dt);
  if (tick?.buyDone && match.phase === PHASE.BUY) startRound();
  if (tick?.timeout && match.phase === PHASE.ROUND) endRound("sentinel", "Time expired — Sentinel held the yard");

  if (match.phase === PHASE.ROUND || match.phase === PHASE.ROUND_END) {
    updateBotTeams(dt);
  }

  if (DEMO) {
    updateDemoCamera(dt);
  } else if (player.alive || match.phase !== PHASE.ROUND) {
    updatePlayerMovement(dt);
    if (firing && WEAPONS[activeWeapon].auto) playerShoot();
    recoil = Math.max(0, recoil - dt * 0.25);
    camera.position.set(player.pos.x, 1.6 + player.jumpY, player.pos.z);
    camera.rotation.set(player.pitch + recoil, player.yaw, 0);
    gun.position.z = -0.5 + recoil * 1.6;
    gun.position.y = -0.26 + recoil * 0.6;
  }

  if (match.phase === PHASE.BUY) {
    $("buyCountdown").textContent = String(Math.ceil(match.buyTimeLeft));
  }
  updateTracers(dt);
  updateHUD();
  renderer.render(scene, camera);
}

// ---- Start ------------------------------------------------------------------
bindMenuButtons();
$("playBtn").onclick = () => {
  sounds.ensure();
  menuEl.classList.add("hidden");
  hud.classList.add("on");
  match.startMatch();
  resetPositions();
  startBuyPhase();
  renderer.domElement.requestPointerLock();
};
$("demoBtn").onclick = () => {
  menuEl.classList.add("hidden");
  hud.classList.add("on");
  match.startMatch();
  resetPositions();
  match.startRound();
  animate();
};

if (DEMO) {
  menuEl.classList.add("hidden");
  hud.classList.add("on");
  match.startMatch();
  resetPositions();
  match.startRound();
  animate();
} else {
  // Menu backdrop: render the yard behind the menu so the first paint is the game.
  resetPositions();
  camera.position.set(-24, 6, -14);
  camera.lookAt(10, 1, -6);
  renderer.render(scene, camera);
}

// r2 polish: main.js re-authored (same match, same shooting, same bots; the
// viewmodel is now a buildViewmodel() function and the player's loadout reads
// as inventory/activeWeapon instead of owned/currentWeapon).
