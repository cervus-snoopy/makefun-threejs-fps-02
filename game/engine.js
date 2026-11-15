// engine.js — the deterministic core: a seeded RNG, small math helpers,
// AABB collision, and ray tests for shooting. No network, no Date-based
// randomness: every random draw comes from a mulberry32 stream seeded per
// match, so the same seed replays the same bot behaviour, shot for shot.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mix = Math.imul(state ^ (state >>> 15), 1 | state);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

// A small deterministic hash of a string into a uint32 seed (FNV-1a).
export function hashSeed(str) {
  let hash = 0x811c9dc5;
  for (let idx = 0; idx < str.length; idx++) {
    hash ^= str.charCodeAt(idx);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export const TAU = Math.PI * 2;

export function angleLerp(a, b, t) {
  let delta = (b - a) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return a + delta * t;
}

// ---- AABB helpers -----------------------------------------------------------
// A box is { minX, minY, minZ, maxX, maxY, maxZ } in world space.
export function makeBox(cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  return {
    minX: cx - hx, maxX: cx + hx,
    minY: cy - hy, maxY: cy + hy,
    minZ: cz - hz, maxZ: cz + hz,
  };
}

// The min/max of one box along one horizontal axis, as [lo, hi].
function axisBounds(box, axis) {
  return axis === "x" ? [box.minX, box.maxX] : [box.minZ, box.maxZ];
}

// Slide one axis of a point-sized actor (radius r) past the solid boxes,
// clamping it to the face it meets. X first, then Z, each against the
// actor's position after the other axis resolved.
function slideAxis(pos, delta, r, boxes, axis) {
  const across = axis === "x" ? "z" : "x";
  let next = pos[axis] + delta;
  for (const b of boxes) {
    const tallEnough = pos.y + 1.7 > b.minY && pos.y + 0.1 < b.maxY;
    const [loAcross, hiAcross] = axisBounds(b, across);
    const overlapsAcross = pos[across] + r > loAcross && pos[across] - r < hiAcross;
    if (!tallEnough || !overlapsAcross) continue;
    const [loAlong, hiAlong] = axisBounds(b, axis);
    if (next + r > loAlong && next - r < hiAlong) {
      next = delta > 0 ? loAlong - r : hiAlong + r;
    }
  }
  pos[axis] = next;
}

// Move a point-sized actor (radius r, height h) by (dx, dz) with per-axis
// resolution against a list of solid boxes. Returns the resolved position.
export function moveAndCollide(pos, dx, dz, r, boxes) {
  slideAxis(pos, dx, r, boxes, "x");
  slideAxis(pos, dz, r, boxes, "z");
  return pos;
}

// Slab test: ray origin o, direction d (normalised), box b, max distance.
// Returns the hit distance, or Infinity when there is no hit.
export function rayBox(o, d, b, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const origins = [o.x, o.y, o.z];
  const dirs = [d.x, d.y, d.z];
  const los = [b.minX, b.minY, b.minZ];
  const his = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    const origin = origins[i];
    const dir = dirs[i];
    const lo = los[i];
    const hi = his[i];
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return Infinity;
      continue;
    }
    let t1 = (lo - origin) / dir;
    let t2 = (hi - origin) / dir;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Ray vs sphere (centre c, radius r). Returns hit distance or Infinity.
export function raySphere(o, d, c, r, maxDist) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const halfChord = Math.sqrt(disc);
  const t = -b - halfChord;
  if (t < 0 || t > maxDist) return Infinity;
  return t;
}

// Format seconds as M:SS for the round timer.
export function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

// r2 polish: engine re-authored (same RNG stream, same collision math;
// the per-axis slide is now one shared helper instead of two copies).
