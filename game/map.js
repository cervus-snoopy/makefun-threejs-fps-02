// map.js — "Dustworks Yard": an original 64 x 44 m industrial yard built only
// from boxes, cylinders and planes. Two attack lanes (north and south), a
// central container stack at mid, two objective sites (A north-east, B
// south-east), Vanguard spawning west, Sentinel east. Every solid object
// registers an AABB collider, so movement and bullets agree on what is solid.

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

// Procedural concrete for the ground: canvas-painted, no external image.
// The speckle comes from a fixed-seed stream, so the texture is identical
// on every load.
function groundTexture() {
  const rng = mulberry32(1337);
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#3a3f45";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 52 + Math.floor(rng() * 26);
    g.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    g.fillRect(Math.floor(rng() * 256), Math.floor(rng() * 256), 2, 2);
  }
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, 256);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * 64);
    g.lineTo(256, i * 64);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 6);
  return tex;
}

// Place one solid box: a mesh in the scene and, unless told otherwise, its
// AABB in the collider list.
function addBox(scene, colliders, mat, cx, cy, cz, sx, sy, sz, solid = true) {
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
  // One row per material: key and the MeshStandardMaterial options.
  const MATERIAL_ROWS = [
    ["ground", { map: groundTexture(), roughness: 0.95 }],
    ["wall", { color: 0x4a4f57, roughness: 0.9 }],
    ["wallTrim", { color: 0x2e333a, roughness: 0.85 }],
    ["crate", { color: 0x8a6b3a, roughness: 0.85 }],
    ["crateDark", { color: 0x6b5a2e, roughness: 0.85 }],
    ["containerAmber", { color: 0xb07f2a, roughness: 0.7, metalness: 0.25 }],
    ["containerTeal", { color: 0x2a7f74, roughness: 0.7, metalness: 0.25 }],
    ["containerRust", { color: 0x7d4a2d, roughness: 0.75, metalness: 0.2 }],
    ["siteA", { color: 0xe8a33d, roughness: 0.6, emissive: 0xe8a33d, emissiveIntensity: 0.25 }],
    ["siteB", { color: 0x2fb3a3, roughness: 0.6, emissive: 0x2fb3a3, emissiveIntensity: 0.25 }],
    ["barrel", { color: 0x5a2e2e, roughness: 0.6, metalness: 0.3 }],
  ];
  const materials = Object.fromEntries(
    MATERIAL_ROWS.map(([key, def]) => [key, new THREE.MeshStandardMaterial(def)]),
  );
  // The site pads glow through their emissive materials (set above).

  // Ground plane.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.width, MAP.depth), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const W = MAP.width / 2;
  const D = MAP.depth / 2;
  const H = MAP.wallHeight;
  // Perimeter walls.
  addBox(scene, colliders, materials.wall, 0, H / 2, -D, MAP.width + 2, H, 1);
  addBox(scene, colliders, materials.wall, 0, H / 2, D, MAP.width + 2, H, 1);
  addBox(scene, colliders, materials.wall, -W, H / 2, 0, 1, H, MAP.depth);
  addBox(scene, colliders, materials.wall, W, H / 2, 0, 1, H, MAP.depth);
  // Trim stripes along the walls (visual only, no collider).
  addBox(scene, colliders, materials.wallTrim, 0, H - 0.25, -D + 0.55, MAP.width, 0.5, 0.1, false);
  addBox(scene, colliders, materials.wallTrim, 0, H - 0.25, D - 0.55, MAP.width, 0.5, 0.1, false);

  // Cover layout: one row per solid box — material key, centre, size.
  // Mid is the container stack, the fight's centrepiece, with a gap lane
  // on each side; north lane crates force crossfire angles towards site A;
  // south lane has barrels and a low wall towards site B; the last three
  // rows are cover at the spawns.
  const COVER_BOXES = [
    ["containerRust", 0, 1.3, -3, 8, 2.6, 3],
    ["containerTeal", 0, 3.9, -3, 6, 2.6, 3],
    ["containerAmber", -2, 1.3, 6, 5, 2.6, 3],
    ["crate", 6, 0.6, 8, 2.4, 1.2, 2.4],
    ["crateDark", -8, 0.6, -10, 2.4, 1.2, 2.4],
    ["crate", 12, 0.6, -14, 2.4, 1.2, 2.4],
    ["crate", 14, 1.8, -14, 2.4, 1.2, 2.4],
    ["crateDark", -14, 0.6, -13, 2.4, 1.2, 2.4],
    ["containerTeal", 20, 1.3, -8, 5, 2.6, 2.6],
    ["crate", -20, 0.6, -6, 2.4, 1.2, 2.4],
    ["crateDark", 12, 0.6, 14, 2.4, 1.2, 2.4],
    ["containerAmber", -12, 1.3, 13, 5, 2.6, 2.6],
    ["containerRust", 20, 1.3, 10, 5, 2.6, 2.6],
    ["crate", -22, 0.6, 8, 2.4, 1.2, 2.4],
    ["crate", -26, 0.6, -6, 2.4, 1.2, 2.4],
    ["crate", -26, 0.6, 6, 2.4, 1.2, 2.4],
    ["crateDark", 26, 0.6, 0, 2.4, 1.2, 2.4],
  ];
  for (const [mat, cx, cy, cz, sx, sy, sz] of COVER_BOXES) {
    addBox(scene, colliders, materials[mat], cx, cy, cz, sx, sy, sz);
  }
  // South lane barrels: a tight cluster that blocks the lane's centre.
  for (const [bx, bz] of [[-4, 15], [-2.4, 15], [-3.2, 13.4]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 12), materials.barrel);
    barrel.position.set(bx, 0.7, bz);
    barrel.castShadow = true;
    scene.add(barrel);
    colliders.push(makeBox(bx, 0.7, bz, 1.1, 1.4, 1.1));
  }

  // Objective sites: a flat painted pad and a low marker pylon each.
  function buildSite(cx, cz, mat) {
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
  }
  buildSite(24, -14, materials.siteA);
  buildSite(24, 14, materials.siteB);

  // (Spawn cover is part of the COVER_BOXES table above.)

  // Lighting: a low sun, a sky fill, and fog for depth.
  scene.fog = new THREE.Fog(0x9aa7b5, 55, 130);
  const hemi = new THREE.HemisphereLight(0xbfd4e6, 0x3a352c, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b3, 1.6);
  sun.position.set(30, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
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

// r2 polish: map re-authored (same yard, same crates, same spawns; the box
// helper is now addBox and the site builder no longer takes a dead label).
