// engine.js — deterministic core: seeded RNG, math helpers, AABB collision,
// ray-vs-AABB / ray-vs-sphere tests used by shooting. No network, no Date-based
// randomness: every random draw comes from a mulberry32 stream seeded per match,
// so the same seed replays the same bot behaviour.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Small deterministic hash of a string -> uint32 seed (FNV-1a).
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

// ---- AABB helpers -----------------------------------------------------------
// A box is { minX, minY, minZ, maxX, maxY, maxZ } in world space.
export function makeBox(cx, cy, cz, sx, sy, sz) {
  return {
    minX: cx - sx / 2, maxX: cx + sx / 2,
    minY: cy - sy / 2, maxY: cy + sy / 2,
    minZ: cz - sz / 2, maxZ: cz + sz / 2,
  };
}

// Move a point-sized actor (radius r, height h) by (dx, dz) with per-axis
// resolution against a list of solid boxes. Returns the resolved position.
export function moveAndCollide(pos, dx, dz, r, boxes) {
  // X axis
  let nx = pos.x + dx;
  for (const b of boxes) {
    if (pos.y + 1.7 > b.minY && pos.y + 0.1 < b.maxY &&
        pos.z + r > b.minZ && pos.z - r < b.maxZ) {
      if (nx + r > b.minX && nx - r < b.maxX) {
        nx = dx > 0 ? b.minX - r : b.maxX + r;
      }
    }
  }
  pos.x = nx;
  // Z axis
  let nz = pos.z + dz;
  for (const b of boxes) {
    if (pos.y + 1.7 > b.minY && pos.y + 0.1 < b.maxY &&
        pos.x + r > b.minX && pos.x - r < b.maxX) {
      if (nz + r > b.minZ && nz - r < b.maxZ) {
        nz = dz > 0 ? b.minZ - r : b.maxZ + r;
      }
    }
  }
  pos.z = nz;
  return pos;
}

// Slab test: ray origin o, direction d (normalised), box b, max distance.
// Returns the hit distance, or Infinity when there is no hit.
export function rayBox(o, d, b, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const axes = [
    [o.x, d.x, b.minX, b.maxX],
    [o.y, d.y, b.minY, b.maxY],
    [o.z, d.z, b.minZ, b.maxZ],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return Infinity;
    } else {
      let t1 = (lo - origin) / dir;
      let t2 = (hi - origin) / dir;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Ray vs sphere (centre c, radius r). Returns hit distance or Infinity.
export function raySphere(o, d, c, r, maxDist) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return Infinity;
  return t;
}

// Format seconds as M:SS for the round timer.
export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
