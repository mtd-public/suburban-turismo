// The collision world: Dr. Mow's platform model (js/sim.js groundAt / blocked), unchanged in spirit, with a
// spatial hash so a whole city of boxes stays cheap. No three.js, no DOM: the headless proof runs it.
//
//   plat: an axis-aligned box. Its top is `h` (or a ramp's interpolated height), its bottom is top − thick.
//         { x, z, w, d, h, thick, ramp?: { axis: 'x'|'z', h0, h1 } (h0 at the low-coordinate edge) }
//   post: a round obstacle (a pillar, a tree trunk, a bollard). { x, z, r, y0, y1 }
//
// The rules are Dr. Mow's: the ground under you is the highest top at or below your feet + STEP; anything
// whose top is more than STEP above your feet and whose bottom is below your head is a wall. That one rule
// gives multi-storey buildings for free: the mezzanine slab is a ceiling on the ground floor (its bottom is
// over your head) and a floor upstairs (its top is under your feet).
export const FLOOR = { h: 0, thick: 1, ground: true, x: 0, z: 0, w: Infinity, d: Infinity }; // the city's base (roads)
const CELL = 8;

export function createWorld({ plats = [], posts = [], rails = [] } = {}) {
  const W = { plats, posts, rails: prepRails(rails), grid: new Map(), pgrid: new Map() };
  plats.forEach((p) => { p.top ??= p.ramp ? Math.max(p.ramp.h0, p.ramp.h1) : p.h; p.bot ??= (p.ramp ? Math.min(p.ramp.h0, p.ramp.h1) : p.h) - p.thick; });
  for (const p of plats) insert(W.grid, p.x - p.w / 2 - 1.5, p.x + p.w / 2 + 1.5, p.z - p.d / 2 - 1.5, p.z + p.d / 2 + 1.5, p);
  for (const q of posts) insert(W.pgrid, q.x - q.r - 2, q.x + q.r + 2, q.z - q.r - 2, q.z + q.r + 2, q);
  return W;
}

function insert(grid, x0, x1, z0, z1, item) {
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
      const key = i * 4096 + k;
      let a = grid.get(key);
      if (!a) grid.set(key, (a = []));
      a.push(item);
    }
}
const EMPTY = [];
export const platsNear = (W, x, z) => W.grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) || EMPTY;
export const postsNear = (W, x, z) => W.pgrid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) || EMPTY;

export const contains = (p, x, z, m = 0) => Math.abs(x - p.x) <= p.w / 2 + m && Math.abs(z - p.z) <= p.d / 2 + m;

export function heightAt(p, x, z) {
  if (!p.ramp) return p.h;
  const r = p.ramp, k = r.axis === 'x' ? (x - (p.x - p.w / 2)) / p.w : (z - (p.z - p.d / 2)) / p.d;
  return r.h0 + (r.h1 - r.h0) * Math.max(0, Math.min(1, k));
}

// Highest walkable top at (x, z) that is at or below maxY ({ h, p }); the base floor if nothing is.
export function groundAt(W, x, z, maxY) {
  let best = null, bh = -Infinity;
  for (const p of platsNear(W, x, z)) {
    if (p.ghost || !contains(p, x, z)) continue;
    const h = heightAt(p, x, z);
    if (h <= maxY && h > bh) { bh = h; best = p; }
  }
  if (best) return { h: bh, p: best };
  return maxY >= 0 ? { h: 0, p: FLOOR } : null;
}

// Lowest underside above y (a ceiling over the head), or Infinity.
export function ceilingAt(W, x, z, y) {
  let c = Infinity;
  for (const p of platsNear(W, x, z)) if (!p.ghost && contains(p, x, z) && p.bot >= y - 0.05 && p.bot < c) c = p.bot;
  return c;
}

// A platform side (or a post) a body standing at height y would push into at (x, z), kept `margin` away.
export function wallAt(W, x, z, y, margin, step, height) {
  for (const p of platsNear(W, x, z)) {
    if (p.ghost || !contains(p, x, z, margin)) continue;
    // a ramp is tested at the clamped point nearest the body (its edge), like a box
    const hx = Math.max(p.x - p.w / 2, Math.min(p.x + p.w / 2, x)), hz = Math.max(p.z - p.d / 2, Math.min(p.z + p.d / 2, z));
    if (heightAt(p, hx, hz) > y + step && p.bot < y + height) return p;
  }
  for (const q of postsNear(W, x, z)) if (q.y1 > y + step && q.y0 < y + height && Math.hypot(x - q.x, z - q.z) < q.r + margin) return q;
  return null;
}

// How far a body at (x, z), kept `margin` away, is pushed into walls (0: clear). Like wallAt, but it measures, so
// the controller can always let a body move *out* of something it's overlapping.
export function wallPen(W, x, z, y, margin, step, height) {
  let pen = 0;
  for (const p of platsNear(W, x, z)) {
    if (p.ghost || !contains(p, x, z, margin)) continue;
    const hx = Math.max(p.x - p.w / 2, Math.min(p.x + p.w / 2, x)), hz = Math.max(p.z - p.d / 2, Math.min(p.z + p.d / 2, z));
    if (!(heightAt(p, hx, hz) > y + step && p.bot < y + height)) continue;
    const ox = Math.abs(x - p.x) - p.w / 2, oz = Math.abs(z - p.z) - p.d / 2;
    const d = ox > 0 || oz > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) : Math.max(ox, oz); // (negative inside)
    pen = Math.max(pen, margin - d);
  }
  for (const q of postsNear(W, x, z)) if (q.y1 > y + step && q.y0 < y + height) pen = Math.max(pen, q.r + margin - Math.hypot(x - q.x, z - q.z));
  return pen;
}

// Is the straight line a→b drivable for body profile H (used by the nav graph and the CPU's shortcuts)?
// Walks it in small steps, carrying the ground height along like the controller does.
export function walkable(W, H, ax, az, ay, bx, bz, by = null, opts = {}) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  const n = Math.max(1, Math.ceil(len / (opts.stepLen || 0.5))), m = opts.margin ?? H.WALL_MARGIN;
  let y = ay;
  for (let i = 1; i <= n; i++) {
    const x = ax + (dx * i) / n, z = az + (dz * i) / n;
    if (wallAt(W, x, z, y, m, H.STEP, H.HEIGHT)) return false;
    const g = groundAt(W, x, z, y + H.STEP);
    if (!g || g.h < y - H.SNAP_DOWN - 0.05) return false; // a drop (off a mezzanine, a ramp side): not a nav link
    y = g.h;
    if (ceilingAt(W, x, z, y + 0.05) < y + H.HEIGHT) return false;
  }
  return by == null || Math.abs(y - by) < 0.6;
}

// Rails from the level, with lengths, directions and their neighbours end to end (so grinds chain).
export function prepRails(list) {
  const rails = list.map((r, i) => {
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz);
    return { ...r, i, len, ux: dx / len, uz: dz / len, next: null, prev: null };
  });
  const near = (ax, ay, az, bx, by, bz) => Math.hypot(ax - bx, az - bz) < 0.3 && Math.abs(ay - by) < 0.3;
  for (const a of rails) for (const b of rails) {
    if (a === b) continue;
    if (near(a.x1, a.y1, a.z1, b.x0, b.y0, b.z0)) { a.next = { r: b, at: 0 }; b.prev = { r: a, at: 1 }; }
    else if (near(a.x1, a.y1, a.z1, b.x1, b.y1, b.z1)) { a.next = { r: b, at: 1 }; b.next ??= { r: a, at: 1 }; }
    else if (near(a.x0, a.y0, a.z0, b.x0, b.y0, b.z0)) { a.prev = { r: b, at: 0 }; }
  }
  return rails;
}
