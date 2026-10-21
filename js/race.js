// A race on one circuit: the racers (you and the CPU), where each is round the lap, positions, lap times, the
// finish; the CPU drivers; and the ghosts for the time trial (recorded at 15 Hz, played back interpolated).
//
// Progress is measured against the circuit's samples (every 2 m): each racer keeps the nearest sample, looked
// for in a window round the last one, so a circuit that passes close to itself can't teleport you a lap. Crossing
// from the last tenth of the samples to the first tenth is the line; the first crossing starts lap 1 (the grid
// sits behind the line), and the race timer runs from GO.
import { routeSamples, TRACK_W, OPEN_START } from './routes.js';
import { createBody, driveStep, circles, blockedAt, depenetrate } from './drive.js';
import { groundAt } from './world.js';
import { DT } from './tuning.js';
import { clamp, wrapAngle } from './utils.js';

export const LAPS = 3, GHOST_HZ = 15; // (an open run, the final level, is one lap: start to finish)

export class Track {
  constructor(route) {
    this.route = route; this.S = routeSamples(route, 2); this.n = this.S.length; this.open = !!route.open; this.laps = this.open ? 1 : LAPS;
  }
  at(i) { const n = this.n; return this.open ? this.S[clamp(i, 0, n - 1)] : this.S[((i % n) + n) % n]; }
  // The nearest sample to (x, z): searched round `hint` (±back/ahead), or everywhere.
  nearest(x, z, hint = null, back = 12, ahead = 30) {
    let best = 0, bd = Infinity;
    if (hint === null) { for (let i = 0; i < this.n; i++) { const s = this.S[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } } }
    else for (let k = -back; k <= ahead; k++) { const i = this.open ? clamp(hint + k, 0, this.n - 1) : ((hint + k) % this.n + this.n) % this.n, s = this.S[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return { i: best, d: Math.sqrt(bd) };
  }
  heading(i) { const s = this.at(i); return Math.atan2(s.tx, s.tz); }
  // A grid slot k places behind the line, two abreast.
  grid(k) {
    const i = (this.open ? OPEN_START : this.n) - 3 - Math.floor(k / 2) * 4, s = this.at(i), side = k % 2 ? 1 : -1, o = 2.2 * side;
    return { x: s.x - s.tz * o, z: s.z + s.tx * o, heading: Math.atan2(s.tx, s.tz), i: ((i % this.n) + this.n) % this.n };
  }
}

export class Racer {
  constructor(track, W, H, slot, opts = {}) {
    const g = track.grid(slot);
    this.track = track; this.W = W; this.name = opts.name || 'You'; this.key = opts.key; this.cpu = !!opts.cpu; this.color = opts.color;
    this.body = createBody(H, g.x, 0, g.z, g.heading); this.body.y = groundAt(W, g.x, g.z, 1).h;
    this.idx = g.i; this.c = 0; this.lapStart = 0; this.laps = []; this.finished = false; this.finishT = 0; this.prog = this.c + this.idx / track.n;
    this.wrongT = 0; this.stuckT = 0; this.revT = 0; this.offT = 0; this.lane = opts.lane ?? 0; this.laneT = this.lane; this.skill = opts.skill ?? 1;
    this.ev = [];
  }
  get lap() { return clamp(this.c, 1, this.track.laps); }
  get best() { return this.laps.length ? Math.min(...this.laps) : null; }
  // Advance the lap bookkeeping after a step (t: race time since GO).
  progress(t) {
    const T = this.track, n = T.n, prev = this.idx, B = this.body;
    const near = T.nearest(B.x, B.z, prev);
    this.idx = near.i; this.off = near.d;
    if (T.open) { // a run: the start line is part way in, the finish is the end of the line
      if (this.c === 0 && this.idx >= OPEN_START) this.c = 1;
      if (this.idx >= n - 3 && !this.finished) { this.c = 2; this.laps.push(t); this.finished = true; this.finishT = t; this.onLap?.(this); this.onFinish?.(this); }
    } else if (prev > n * 0.85 && this.idx < n * 0.15) { // over the line
      this.c++;
      if (this.c >= 2 && !this.finished) { this.laps.push(t - this.lapStart); this.lapStart = t; this.onLap?.(this); }
      if (this.c - 1 >= T.laps && !this.finished) { this.finished = true; this.finishT = t; this.onFinish?.(this); }
    } else if (prev < n * 0.15 && this.idx > n * 0.85) this.c--; // (back over it)
    const p = T.open ? this.idx / n : this.c + this.idx / n;
    // wrong way: going backwards round the lap at speed for a second
    const dh = Math.abs(wrapAngle(B.heading - T.heading(this.idx)));
    this.wrongT = dh > 2.0 && Math.abs(B.speed) > 3 ? this.wrongT + DT * 4 : Math.max(0, this.wrongT - DT * 8);
    this.prog = p;
  }
  // Back on the racing line, a few metres behind where you are, pointing the right way.
  respawn() {
    this.respawns = (this.respawns || 0) + 1;
    const T = this.track, i = this.idx - 2, s = T.at(i), B = this.body;
    Object.assign(B, { x: s.x, z: s.z, heading: T.heading(i), vh: T.heading(i), speed: 0, vy: 0, kx: 0, kz: 0, grounded: true, crashT: 0, grind: null });
    B.y = groundAt(this.W, s.x, s.z, 1).h; depenetrate(this.W, B);
    this.idx = T.open ? clamp(i, 0, T.n - 1) : ((i % T.n) + T.n) % T.n; this.stuckT = 0; this.revT = 0;
  }
}

// The CPU driver: aim at a point up the racing line (further at speed), in its own lane, ease off for the bends
// ahead, pull out round a car in front, and back out of anything it gets stuck on.
export function cpuControl(r, others, raceT, dt) {
  const T = r.track, B = r.body, v = Math.abs(B.speed);
  // traffic: someone close in front, in my lane? pull to the other side for a bit
  r.laneT = r.lane;
  const fx = Math.sin(B.heading), fz = Math.cos(B.heading);
  for (const o of others) {
    if (o === r) continue; const dx = o.body.x - B.x, dz = o.body.z - B.z, ahead = dx * fx + dz * fz, side = dx * fz - dz * fx;
    if (ahead > 0 && ahead < 9 && Math.abs(side) < 2.4) { r.laneT = side > 0 ? -2.6 : 2.6; break; }
  }
  const look = Math.round((6 + v * 0.5) / 2), tgt = T.at(r.idx + look), lane = r.laneT;
  const tx = tgt.x - tgt.tz * lane, tz = tgt.z + tgt.tx * lane;
  // the bend ahead: how much the line turns over the next ~1.4 s
  const h0 = T.heading(r.idx + 2), h1 = T.heading(r.idx + 2 + Math.round((v * 1.4) / 2) + 2);
  const bend = Math.abs(wrapAngle(h1 - h0));
  B.pace = clamp(1.04 - bend * 0.5, 0.42, 1) * r.skill;
  // stuck: crawling for a while with the gas down → back up and turn, then try again; long stuck → respawn
  // (measured by how far it has actually got: a car grinding along a wall still shows speed)
  if (!r.chk || raceT < r.chk.t) r.chk = { x: B.x, z: B.z, t: raceT };
  if (raceT - r.chk.t > 1) {
    const moved = Math.hypot(B.x - r.chk.x, B.z - r.chk.z);
    if (raceT > 2 && moved < 2 && r.revT <= 0) { r.revT = 1.1; r.unstick = (r.unstick || 0) + 1; if (r.unstick > 3) { r.respawn(); r.unstick = 0; r.revT = 0; } }
    else if (moved > 6) r.unstick = 0;
    r.chk = { x: B.x, z: B.z, t: raceT };
  }
  if (r.off > TRACK_W * 3) { r.offT += dt; if (r.offT > 3) { r.respawn(); r.offT = 0; } } else r.offT = 0;
  if (r.revT > 0) { r.revT -= dt; const err = wrapAngle(Math.atan2(tx - B.x, tz - B.z) - B.heading); return { turn: err > 0 ? 1 : -1, throttle: -1 }; }
  const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1;
  return { dir: { x: dx / d, z: dz / d, mag: 1 } };
}

// Car against car: the circles push apart by weight; the one doing the hitting loses some speed.
export function bump(W, a, b) {
  const A = a.body, Bb = b.body;
  if (Math.abs(A.x - Bb.x) > 8 || Math.abs(A.z - Bb.z) > 8 || Math.abs(A.y - Bb.y) > 1.5) return false;
  let hit = false;
  for (const [ax, az, ar] of circles(A)) for (const [bx, bz, br] of circles(Bb)) {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), min = ar + br;
    if (d >= min || d < 1e-4) continue;
    hit = true;
    const nx = dx / d, nz = dz / d, push = min - d, ma = A.H.MASS || 4, mb = Bb.H.MASS || 4, ka = mb / (ma + mb), kb = ma / (ma + mb);
    const mv = (B, s, k) => { const x = B.x + nx * push * k * s, z = B.z + nz * push * k * s; if (!blockedAt(W, B, x, z)) { B.x = x; B.z = z; } };
    mv(A, -1, ka); mv(Bb, 1, kb);
    const va = A.speed * (Math.sin(A.vh) * nx + Math.cos(A.vh) * nz), vb = Bb.speed * (Math.sin(Bb.vh) * nx + Math.cos(Bb.vh) * nz);
    if (va - vb > 0.5) { A.speed *= 0.96; Bb.speed = Math.min(Bb.speed + (va - vb) * 0.15, Bb.speed * 1.02 + 0.5); a.bumped = b.bumped = 0.3; }
  }
  return hit;
}

// A ghost: [t, x, y, z, heading] at GHOST_HZ, stored flat and rounded (cm, mrad) so it fits in localStorage.
export class GhostRecorder {
  constructor() { this.f = []; this.next = 0; }
  sample(t, B) { if (t < this.next) return; this.next = t + 1 / GHOST_HZ; this.f.push(Math.round(B.x * 100), Math.round(B.y * 100), Math.round(B.z * 100), Math.round(B.heading * 1000)); }
}
export function ghostAt(g, t, out) {
  const f = g.f, n = f.length / 4;
  if (!n) return false;
  const u = clamp(t * GHOST_HZ, 0, n - 1), i = Math.floor(u), j = Math.min(n - 1, i + 1), k = u - i;
  const L = (a, b) => a + (b - a) * k;
  out.x = L(f[i * 4], f[j * 4]) / 100; out.y = L(f[i * 4 + 1], f[j * 4 + 1]) / 100; out.z = L(f[i * 4 + 2], f[j * 4 + 2]) / 100;
  out.heading = (f[i * 4 + 3] + wrapAngle((f[j * 4 + 3] - f[i * 4 + 3]) / 1000) * 1000 * k) / 1000;
  return t <= n / GHOST_HZ + 0.5;
}

// The pro time: a CPU driver at full pace runs the whole race alone, headless, from pole (glass counts as already
// broken, loose props are ignored). Its run is the first ghost to beat.
export function simulatePro(track, W, H, glassPlats = []) {
  const saved = glassPlats.map((p) => p.ghost); for (const p of glassPlats) p.ghost = true;
  const r = new Racer(track, W, H, 0, { cpu: true, skill: 1, lane: 0 }), rec = new GhostRecorder();
  let t = 0;
  const MAX = 900;
  for (let steps = 0; t < MAX && !r.finished; steps++) {
    const ctl = cpuControl(r, [], t, DT);
    driveStep(W, r.body, ctl, DT, null);
    t += DT; r.progress(t); rec.sample(t, r.body);
  }
  glassPlats.forEach((p, k) => { p.ghost = saved[k]; });
  return { t: r.finished ? r.finishT : Infinity, laps: r.laps, f: rec.f, pro: true, respawns: r.respawns || 0 };
}
