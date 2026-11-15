// map.js — "Dustworks Yard": an original 64 x 44 m industrial yard built only
// from boxes, cylinders and planes. Two attack lanes (north / south), a central
// container stack at mid, two objective sites (A north-east, B south-east),
// Vanguard spawn west, Sentinel spawn east. Every solid object registers an
// AABB collider so movement and bullets agree on what is solid.

import * as THREE from "three";
import { makeBox, mulberry32 } from "./engine.js";

export const MAP = {
  width: 64,
  depth: 44,
  wallHeight: 4.5,
  roundTime: 100,
  buyTime: 15,
  roundsToWin: 5,
  maxRounds: 9,
};

function groundTexture() {
  // Procedural concrete: canvas-painted, no external image. Speckle uses a
  // fixed-seed stream so the texture is identical on every load.
  const rng = mulberry32(1337);
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#3a3f45"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 52 + Math.floor(rng() * 26);
    g.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    g.fillRect(Math.floor(rng() * 256), Math.floor(rng() * 256), 2, 2);
  }
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 6);
  return tex;
}

function box(scene, colliders, mat, cx, cy, cz, sx, sy, sz, solid = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (solid) colliders.push(makeBox(cx, cy, cz, sx, sy, sz));
  return mesh;
}

export function buildMap(scene) {
  const colliders = [];
  const mats = {
    ground: new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.9 }),
    wallTrim: new THREE.MeshStandardMaterial({ color: 0x2e333a, roughness: 0.85 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x8a6b3a, roughness: 0.85 }),
    crateDark: new THREE.MeshStandardMaterial({ color: 0x6b5a2e, roughness: 0.85 }),
    containerAmber: new THREE.MeshStandardMaterial({ color: 0xb07f2a, roughness: 0.7, metalness: 0.25 }),
    containerTeal: new THREE.MeshStandardMaterial({ color: 0x2a7f74, roughness: 0.7, metalness: 0.25 }),
    containerRust: new THREE.MeshStandardMaterial({ color: 0x7d4a2d, roughness: 0.75, metalness: 0.2 }),
    siteA: new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.6, emissive: 0xe8a33d, emissiveIntensity: 0.25 }),
    siteB: new THREE.MeshStandardMaterial({ color: 0x2fb3a3, roughness: 0.6, emissive: 0x2fb3a3, emissiveIntensity: 0.25 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x5a2e2e, roughness: 0.6, metalness: 0.3 }),
  };
  // Site pads glow through their emissive materials (set in `mats` above).

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.width, MAP.depth), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const W = MAP.width / 2, D = MAP.depth / 2, H = MAP.wallHeight;
  // Perimeter walls
  box(scene, colliders, mats.wall, 0, H / 2, -D, MAP.width + 2, H, 1);
  box(scene, colliders, mats.wall, 0, H / 2, D, MAP.width + 2, H, 1);
  box(scene, colliders, mats.wall, -W, H / 2, 0, 1, H, MAP.depth);
  box(scene, colliders, mats.wall, W, H / 2, 0, 1, H, MAP.depth);
  // Wall trim stripes (visual only)
  box(scene, colliders, mats.wallTrim, 0, H - 0.25, -D + 0.55, MAP.width, 0.5, 0.1, false);
  box(scene, colliders, mats.wallTrim, 0, H - 0.25, D - 0.55, MAP.width, 0.5, 0.1, false);

  // Mid: container stack — the fight's centrepiece. Two stacked boxes form a
  // climbable-feeling block with a gap lane on each side.
  box(scene, colliders, mats.containerRust, 0, 1.3, -3, 8, 2.6, 3);
  box(scene, colliders, mats.containerTeal, 0, 3.9, -3, 6, 2.6, 3);
  box(scene, colliders, mats.containerAmber, -2, 1.3, 6, 5, 2.6, 3);
  // Mid side cover
  box(scene, colliders, mats.crate, 6, 0.6, 8, 2.4, 1.2, 2.4);
  box(scene, colliders, mats.crateDark, -8, 0.6, -10, 2.4, 1.2, 2.4);

  // North lane (towards site A): staggered crates force crossfire angles.
  box(scene, colliders, mats.crate, 12, 0.6, -14, 2.4, 1.2, 2.4);
  box(scene, colliders, mats.crate, 14, 1.8, -14, 2.4, 1.2, 2.4);
  box(scene, colliders, mats.crateDark, -14, 0.6, -13, 2.4, 1.2, 2.4);
  box(scene, colliders, mats.containerTeal, 20, 1.3, -8, 5, 2.6, 2.6);
  box(scene, colliders, mats.crate, -20, 0.6, -6, 2.4, 1.2, 2.4);

  // South lane (towards site B): barrels + low wall for crouch-free cover.
  box(scene, colliders, mats.crateDark, 12, 0.6, 14, 2.4, 1.2, 2.4);
  box(scene, colliders, mats.containerAmber, -12, 1.3, 13, 5, 2.6, 2.6);
  box(scene, colliders, mats.containerRust, 20, 1.3, 10, 5, 2.6, 2.6);
  box(scene, colliders, mats.crate, -22, 0.6, 8, 2.4, 1.2, 2.4);
  for (const [bx, bz] of [[-4, 15], [-2.4, 15], [-3.2, 13.4]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 12), mats.barrel);
    barrel.position.set(bx, 0.7, bz);
    barrel.castShadow = true;
    scene.add(barrel);
    colliders.push(makeBox(bx, 0.7, bz, 1.1, 1.4, 1.1));
  }

  // Objective sites: flat painted pads + a low marker pylon each.
  function sitePad(cx, cz, mat, label) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 7),
      new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.9 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(cx, 0.02, cz);
    pad.receiveShadow = true;
    scene.add(pad);
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3.2, 8), mat);
    pylon.position.set(cx, 1.6, cz);
    pylon.castShadow = true;
    scene.add(pylon);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.12, 8, 40), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, 0.06, cz);
    scene.add(ring);
    void label;
  }
  sitePad(24, -14, mats.siteA, "A");
  sitePad(24, 14, mats.siteB, "B");

  // Spawn cover
  box(scene, colliders, mats.crate, -26, 0.6, -6, 2.4, 1.2, 2.4);
  box(scene, colliders, mats.crate, -26, 0.6, 6, 2.4, 1.2, 2.4);
  box(scene, colliders, mats.crateDark, 26, 0.6, 0, 2.4, 1.2, 2.4);

  // Lighting: low sun + sky fill, fog for depth.
  scene.fog = new THREE.Fog(0x9aa7b5, 55, 130);
  const hemi = new THREE.HemisphereLight(0xbfd4e6, 0x3a352c, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b3, 1.6);
  sun.position.set(30, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  scene.add(sun);

  return {
    colliders,
    spawns: {
      vanguard: [
        { x: -28, z: -6 }, { x: -28, z: -2 }, { x: -28, z: 2 },
        { x: -28, z: 6 }, { x: -26, z: 0 },
      ],
      sentinel: [
        { x: 28, z: -6 }, { x: 28, z: -2 }, { x: 28, z: 2 },
        { x: 28, z: 6 }, { x: 26, z: 0 },
      ],
    },
    sites: { A: { x: 24, z: -14 }, B: { x: 24, z: 14 } },
    // Waypoints bots walk between: mid, both lanes, both sites, both spawns.
    waypoints: [
      { x: 0, z: -3 }, { x: 0, z: 6 }, { x: 12, z: -14 }, { x: 12, z: 14 },
      { x: -12, z: -13 }, { x: -12, z: 13 }, { x: 24, z: -14 }, { x: 24, z: 14 },
      { x: -20, z: 0 }, { x: 20, z: 0 }, { x: 6, z: -8 }, { x: 6, z: 10 },
    ],
  };
}
