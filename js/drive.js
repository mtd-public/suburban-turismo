// The character controller, lifted out of Dr. Mow's mower step (dr-mow js/sim.js step(): steering, speed,
// slick-lawn drift, wall slide, hop with coyote time and a jump buffer, step-up / snap-down, landing) and
// made generic: one body, one HANDLING profile (js/tuning.js). The shopper's cart and the dasher's car are the
// same code with different numbers, and the CPU dashers drive through it too (js/ai.js) — they get no cheats.
//
// What changed from the mower:
//   * throttle: Dr. Mow's mower never stops. A body here cruises while the stick is pushed (a light push walks,
//     a full push runs), coasts to a stop when it's released (profile AUTO_CRUISE brings the old way back), and
//     relative controls (keys in the chase cam) can brake and back up;
//   * grip: the slick-lawn drift (travel direction lagging the heading) is a per-profile GRIP, always on, so the
//     car slides through hard turns and the cart barely skids;
//   * yaw by speed: a car can't spin on the spot (YAW_FULL / YAW_LOW); the cart can, like the Zero-Turn;
//   * bodies are two circles along the heading (a cart + shopper, a hatchback), tested against walls, posts
//     and each other; a head-on crash stops you and kicks you back a little;
//   * ceilings: a hop under a mezzanine slab bumps its head;
//   * grind rails (Dr. Mow's rails, ported: magnetic catch, slide, hop off or pop off the end), now sloped and
//     chained end to end, so a handrail carries you all the way down a travelator;
//   * a hop off a ramp keeps the ramp's climb on top of the hop (kickers: big air).
//
// ctl: { dir: { x, z, mag } world-space "go this way" (stick / CPU) or null,
//        turn: -1..1 relative steering (+1 = right), throttle: -1..1 relative (keys, chase cam), jump: bool (edge) }
import { clamp, damp, wrapAngle } from './utils.js';
import { groundAt, ceilingAt, wallAt, wallPen, postsNear } from './world.js';

const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

export function createBody(H, x, y, z, heading) {
  return { H, x, y, z, vy: 0, heading, vh: heading, speed: 0, grounded: true, plat: null, coyote: 0, jumpBuf: 0, airT: 0, turnErr: 0, kx: 0, kz: 0, safe: { x, y, z, heading }, crashT: 0, steer: 0 };
}

// The body's collision circles in world space: [[x, z, r], …].
export function circles(B) {
  const s = Math.sin(B.heading), c = Math.cos(B.heading);
  return B.H.CIRCLES.map(([o, r]) => [B.x + s * o, B.z + c * o, r]);
}

// Would the body, moved to (x, z), push into a wall? Every circle is tested (Dr. Mow tested one nose point), each
// from the floor under it: on a ramp a car's nose is higher than its middle, so the deck at the top isn't a wall.
export function blockedAt(W, B, x, z) {
  const s = Math.sin(B.heading), c = Math.cos(B.heading);
  for (const [o, r] of B.H.CIRCLES) {
    const cx = x + s * o, cz = z + c * o;
    let fy = B.y;
    if (B.grounded) { // (a long body pitches on a slope: its nose or tail can sit up to ~24° up a ramp)
      const g = groundAt(W, cx, cz, B.y + B.H.STEP + Math.abs(o) * 0.45);
      if (g && (g.h <= B.y + B.H.STEP || g.p.ramp)) fy = Math.max(B.y, g.h);
    }
    const hit = wallAt(W, cx, cz, fy, Math.max(B.H.WALL_MARGIN, r * 0.9), B.H.STEP, B.H.HEIGHT);
    if (hit) return hit;
  }
  return null;
}

// Vertical speed from driving along the ramp under you (m/s; 0 off a ramp).
function rampClimb(B) {
  const r = B.plat?.ramp;
  if (!r) return 0;
  const along = r.axis === 'x' ? Math.sin(B.vh) * (r.h1 - r.h0) / B.plat.w : Math.cos(B.vh) * (r.h1 - r.h0) / B.plat.d;
  return B.speed * along;
}

// The floor under each of the body's circles where it stands now (a long body pitches on a slope: its nose or
// tail can sit up to ~24° up a ramp). Decided once per step and reused for every trial move, so a hair of drift
// can't flip a ramp from floor to wall mid-step (that left bodies wedged against ramp sides).
function circleFloors(W, B) {
  const s = Math.sin(B.heading), c = Math.cos(B.heading);
  return B.H.CIRCLES.map(([o]) => {
    if (!B.grounded) return B.y;
    const g = groundAt(W, B.x + s * o, B.z + c * o, B.y + B.H.STEP + Math.abs(o) * 0.45);
    return g && (g.h <= B.y + B.H.STEP || g.p.ramp) ? Math.max(B.y, g.h) : B.y;
  });
}
// How deep the body, moved to (x, z), sits in walls (0: clear).
export function penAt(W, B, x, z, floors = circleFloors(W, B)) {
  const s = Math.sin(B.heading), c = Math.cos(B.heading);
  let pen = 0;
  B.H.CIRCLES.forEach(([o, r], k) => { pen += Math.max(0, wallPen(W, x + s * o, z + c * o, floors[k], Math.max(B.H.WALL_MARGIN, r * 0.9), B.H.STEP, B.H.HEIGHT)); });
  return pen;
}

// Deep in a wall (spawned there, shoved in): out to the nearest free spot.
export function depenetrate(W, B) {
  if (penAt(W, B, B.x, B.z) < 0.3) return true; // (shallow: the moves below slide it out)
  for (let d = 0.05; d <= 2.2; d += 0.05) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = B.x + Math.sin(a) * d, z = B.z + Math.cos(a) * d;
    if (!blockedAt(W, B, x, z)) { B.x = x; B.z = z; return true; }
  }
  return false;
}
// Turn the body to a heading if its circles fit there (a dazed spin, a shove).
export function turnTo(W, B, h) { const h0 = B.heading, p0 = penAt(W, B, B.x, B.z); B.heading = h; if (penAt(W, B, B.x, B.z) > p0 + 1e-6) B.heading = h0; }

export function driveStep(W, B, ctl, dt, ev = null) {
  const H = B.H;
  const emit = (type, data) => ev?.push({ type, B, ...data });
  if (B.grind) { grindStep(W, B, ctl, dt, emit); return; }
  depenetrate(W, B);
  const auth = B.grounded ? 1 : H.AIR_CONTROL;
  if (B.crashT > 0) B.crashT = Math.max(0, B.crashT - dt);

  // --- steering: an absolute target from the stick, or relative from the keys (Dr. Mow)
  const yawK = (H.YAW_FULL > 0 ? clamp(Math.abs(B.speed) / H.YAW_FULL, H.YAW_LOW, 1) : 1) // (a car needs to roll to turn)
    * (H.UNDERSTEER ? 1 - H.UNDERSTEER * clamp(Math.abs(B.speed) / H.CRUISE, 0, 1) ** 2 : 1); // (and pushes wide at speed)
  let slow = 0, throttle = H.AUTO_CRUISE ? 1 : 0;
  B.turnErr = 0;
  const h0 = B.heading;
  if (ctl.dir && ctl.dir.mag > H.STICK_MIN) {
    const target = Math.atan2(ctl.dir.x, ctl.dir.z);
    const err = wrapAngle(target - B.heading);
    const mag = Math.min(1, ctl.dir.mag);
    const maxRate = H.YAW_MAX * (H.YAW_MIN_FRAC + (1 - H.YAW_MIN_FRAC) * mag) * yawK;
    B.heading = wrapAngle(B.heading + clamp(err * H.YAW_GAIN, -maxRate, maxRate) * auth * dt);
    B.turnErr = err;
    slow = H.TURN_SLOW * smooth(0.5, 1.8, Math.abs(err)); // the stick far off the heading: dig in (tightens the turn)
    throttle = H.THROTTLE_MIN + (1 - H.THROTTLE_MIN) * smooth(H.STICK_MIN, 0.85, mag);
  } else if (ctl.turn || ctl.throttle || B.wheel) {
    if (H.STEER_LAG) { B.wheel = damp(B.wheel || 0, ctl.turn || 0, H.STEER_LAG, dt); if (Math.abs(B.wheel) < 0.01 && !ctl.turn) B.wheel = 0; ctl = { ...ctl, turn: B.wheel }; } // (the wheel winds on, and back)
    const back = (ctl.throttle || 0) < 0 && B.speed < 0.5 ? -1 : 1; // (backing up: the wheel steers the tail)
    B.heading = wrapAngle(B.heading - (ctl.turn || 0) * H.KEY_YAW * auth * yawK * back * dt);
    B.turnErr = -(ctl.turn || 0);
    slow = H.KEY_SLOW * Math.abs(ctl.turn || 0);
    throttle = ctl.throttle ?? (ctl.turn ? 1 : 0);
    if (throttle < 0) throttle = B.speed > 0.5 ? 0 : -H.REVERSE; // brake first, then reverse
  }
  // Turning swings the body's circles round its middle: a car's nose can't swing into a wall (the turn waits
  // until you've rolled clear). Dr. Mow's mower was one point, so it never had to ask.
  if (B.heading !== h0) { const h1 = B.heading; B.heading = h0; const fl = circleFloors(W, B), before = penAt(W, B, B.x, B.z, fl); B.heading = h1; const after = penAt(W, B, B.x, B.z, fl); if (after > before + 0.06 && after > 0.06) B.heading = h0; } // (a little slack: pivoting in a corner may brush a wall; the move below slides you clear)
  if (H.WANDER && B.grounded && Math.abs(B.speed) > 3) { // a little life in the wheel: slow wander, more off the asphalt
    B.age = (B.age || 0) + dt; const n = Math.sin(B.age * 1.3 + B.x * 0.05) + Math.sin(B.age * 3.1 + B.z * 0.07) * 0.6;
    B.heading = wrapAngle(B.heading + n * (H.WANDER + H.BUMP * (B.offroad || 0)) * clamp(Math.abs(B.speed) / H.CRUISE, 0, 1) * dt);
  }
  B.steer = wrapAngle(B.heading - h0) / dt; // (yaw rate this step: the renderer leans and steers the wheels with it)
  if (B.grounded) {
    const target = H.CRUISE * throttle * (1 - slow) * (B.plat?.slow ?? 1) * (B.boost ?? 1) * (B.pace ?? 1); // (boost: a smash lunge; pace: CPU dashers run slower)
    B.speed = damp(B.speed, target, Math.abs(target) > Math.abs(B.speed) && Math.sign(target) === Math.sign(B.speed || target) ? H.ACCEL : H.BRAKE, dt);
    if (Math.abs(B.speed) < 0.02 && !throttle) B.speed = 0;
  }

  // --- travel direction: on full grip it IS the heading; with low grip it lags (Dr. Mow's slick lawns), so a
  // hard turn at speed becomes a drift: the nose points in, the body slides out. In the air it carries on.
  if (B.grounded) B.vh = H.GRIP >= 100 ? B.heading : wrapAngle(B.heading - wrapAngle(B.heading - B.vh) * Math.exp(-H.GRIP * dt));
  B.slip = wrapAngle(B.heading - B.vh);

  // --- horizontal: walls slide (try the move, then each axis alone), posts push out
  const fx = Math.sin(B.vh), fz = Math.cos(B.vh);
  if (B.kx || B.kz) { const k = Math.exp(-4 * dt); B.kx = Math.abs(B.kx * k) < 0.05 ? 0 : B.kx * k; B.kz = Math.abs(B.kz * k) < 0.05 ? 0 : B.kz * k; } // knockback fades
  const nx = B.x + (fx * B.speed + B.kx) * dt, nz = B.z + (fz * B.speed + B.kz) * dt;
  B.blocked = false;
  // a move is fine if it's clear, or if it's at least less into the wall than you are now (you can always back out)
  const fl = circleFloors(W, B), penNow = penAt(W, B, B.x, B.z, fl), free = (x, z) => { const p = penAt(W, B, x, z, fl); return p <= 1e-9 || p < penNow - 1e-6; };
  if (free(nx, nz)) { B.x = nx; B.z = nz; }
  else {
    B.blocked = true;
    const slideX = free(nx, B.z), slideZ = !slideX && free(B.x, nz);
    if (slideX) B.x = nx; else if (slideZ) B.z = nz;
    const v = Math.abs(B.speed);
    if (!slideX && !slideZ) { // head-on: stop, and a hard hit bounces you back a touch
      if (v > H.CRUISE * 0.45 && B.crashT <= 0) { B.kx = -fx * v * 0.3; B.kz = -fz * v * 0.3; B.crashT = 0.5; emit('crash', { v }); }
      B.speed = 0;
    } else { // scraping along a wall bleeds speed by how square you hit it
      const along = slideX ? Math.abs(fx) : Math.abs(fz);
      B.speed *= 1 - (1 - along) * Math.min(1, 6 * dt);
      if (v > 2 && B.crashT <= 0 && along < 0.75) { B.crashT = 0.35; emit('scrape', { v }); }
    }
  }
  // tree trunks, pillars, bollards: pushed round them (Dr. Mow's hay bales), every circle of the body
  for (let pass = 0; pass < 2; pass++) for (const [cx, cz, r] of circles(B)) for (const q of postsNear(W, cx, cz)) {
    if (q.y1 <= B.y + H.STEP || q.y0 >= B.y + H.HEIGHT) continue;
    const dx = cx - q.x, dz = cz - q.z, d = Math.hypot(dx, dz), min = q.r + r;
    if (d >= min || d < 1e-6) continue;
    const push = min - d;
    if (wallAt(W, B.x + (dx / d) * push, B.z + (dz / d) * push, B.y, H.WALL_MARGIN * 0.5, H.STEP, H.HEIGHT)) continue; // (never shoved into a wall)
    B.x += (dx / d) * push; B.z += (dz / d) * push;
    B.blocked = true;
    if (Math.abs(B.speed) > H.CRUISE * 0.5 && B.crashT <= 0) { B.crashT = 0.4; B.speed *= 0.5; emit('crash', { v: Math.abs(B.speed) * 2, post: q }); }
  }

  // --- hop input (buffered) + vertical
  if (ctl.jump) B.jumpBuf = H.JUMP_BUFFER;
  B.jumpBuf -= dt;
  if (B.grounded) {
    const g = groundAt(W, B.x, B.z, B.y + H.STEP);
    if (g && g.h >= B.y - H.SNAP_DOWN) { B.y = g.h; B.plat = g.p; }
    else { // rolled off a ledge. Off the top of a ramp you keep its climb (Dr. Mow set vy = 0): kickers launch cars
      B.vy = Math.max(0, rampClimb(B)); B.grounded = false; B.plat = null; B.coyote = H.COYOTE; B.airT = 0;
      if (B.vy > 1.5) emit('launch', { vy: B.vy });
    }
  } else {
    B.coyote -= dt;
    B.airT += dt;
    const prevY = B.y;
    B.vy -= H.GRAVITY * dt;
    B.y += B.vy * dt;
    const ceil = ceilingAt(W, B.x, B.z, prevY + 0.1);
    if (B.vy > 0 && B.y + H.HEIGHT > ceil) { B.y = ceil - H.HEIGHT; B.vy = 0; emit('bonk'); } // head on the slab
    if (B.vy <= 0 && H.GRIND && W.rails?.length) { railMagnet(W, B, dt); if (catchRail(W, B, prevY, emit)) return; }
    if (B.vy <= 0) {
      const g = groundAt(W, B.x, B.z, prevY + 0.02);
      if (g && B.y <= g.h) {
        B.y = g.h; B.plat = g.p; B.grounded = true;
        if (B.airT > 0.12) emit('land', { v: -B.vy, airT: B.airT, drop: (B.peakY ?? B.y) - B.y });
        B.railLeft = null; B.peakY = null;
        B.vy = 0;
      }
    }
  }
  if (B.jumpBuf > 0 && (B.grounded || B.coyote > 0)) {
    const kick = B.grounded ? Math.max(0, rampClimb(B)) : 0; // (off a kicker: the ramp's climb rides on the hop)
    B.vy = H.JUMP_V + kick; B.grounded = false; B.plat = null; B.coyote = 0; B.jumpBuf = 0; B.airT = 0;
    emit('jump', { kick });
    if (kick > 1) emit('launch', { vy: B.vy });
  }
  if (!B.grounded) B.peakY = Math.max(B.peakY ?? B.y, B.y);
  if (B.grounded && !B.blocked) B.safe = { x: B.x, y: B.y, z: B.z, heading: B.heading };
  if (B.y < -30) { Object.assign(B, { ...B.safe, vy: 0, speed: 0, vh: B.safe.heading, grounded: false }); emit('respawn'); } // (out of the world: back where you last stood)
}

// Two bodies touching: pushed apart, the heavier one moving less (Dr. Mow's Versus bump, with mass).
// Returns the closing speed of the hit (0 when they don't touch).
export function bumpBodies(A, B, W = null) {
  if (Math.abs(A.y - B.y) > Math.min(A.H.HEIGHT, B.H.HEIGHT)) return 0;
  // (separation never pushes a body into a wall: the other one takes the whole push, or neither moves)
  const move = (P, dx, dz) => { if (!W || penAt(W, P, P.x + dx, P.z + dz) <= penAt(W, P, P.x, P.z) + 1e-6) { P.x += dx; P.z += dz; return true; } return false; };
  let hit = 0;
  for (const [ax, az, ar] of circles(A)) for (const [bx, bz, br] of circles(B)) {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), min = ar + br;
    if (d >= min || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d, over = min - d, ka = B.H.MASS / (A.H.MASS + B.H.MASS), kb = 1 - ka;
    if (!move(A, -nx * over * ka, -nz * over * ka)) move(B, nx * over * ka, nz * over * ka);
    if (!move(B, nx * over * kb, nz * over * kb)) move(A, -nx * over * kb, -nz * over * kb);
    const va = A.speed * (Math.sin(A.vh) * nx + Math.cos(A.vh) * nz), vb = B.speed * (Math.sin(B.vh) * nx + Math.cos(B.vh) * nz);
    const closing = va - vb;
    if (closing > 0) {
      hit = Math.max(hit, closing);
      // the lighter body gets shoved along the hit; both lose some speed
      B.kx += nx * closing * ka * 0.9; B.kz += nz * closing * ka * 0.9;
      A.kx -= nx * closing * kb * 0.9; A.kz -= nz * closing * kb * 0.9;
      A.speed *= 1 - 0.5 * ka; B.speed *= 1 - 0.5 * kb;
    }
  }
  return hit;
}

// ------------------------------------------------------------------ grind rails (Dr. Mow js/sim.js, ported)
// Rails are magnetic: coming down anywhere near one, you're pulled in sideways and grab it from up to RAIL_CATCH
// away, a little above its top or a little past its ends. The rail you just hopped off only grabs the strict way
// until you land, so hopping off sideways still works.
export const RAIL = { CATCH: 1.1, ABOVE: 0.35, ENDS: 0.6, PULL: 2.2, PULL_V: 3.5, LEFT_CATCH: 0.45, MIN_SPEED: 1.15 };

const railY = (r, t) => r.y0 + (r.y1 - r.y0) * Math.max(0, Math.min(1, t));
function railNear(r, B) { // nearest point: [t (0..1), sideways distance, dx, dz] or null
  const along = (B.x - r.x0) * r.ux + (B.z - r.z0) * r.uz;
  if (along < -RAIL.ENDS || along > r.len + RAIL.ENDS) return null;
  const t = Math.max(0, Math.min(1, along / r.len)), px = r.x0 + r.ux * r.len * t, pz = r.z0 + r.uz * r.len * t;
  return [t, Math.hypot(B.x - px, B.z - pz), px - B.x, pz - B.z];
}
function railMagnet(W, B, dt) { // airborne and falling: drift toward the nearest rail below
  let best = null;
  for (const r of W.rails) {
    if (B.railLeft === r.i) continue;
    const n = railNear(r, B);
    if (!n) continue;
    const y = railY(r, n[0]);
    if (B.y < y - 0.05 || B.y > y + RAIL.PULL) continue;
    if (n[1] > 0.02 && n[1] <= RAIL.PULL && (!best || n[1] < best[1])) best = n;
  }
  if (!best) return;
  const k = Math.min(best[1], RAIL.PULL_V * dt) / best[1];
  B.x += best[2] * k; B.z += best[3] * k;
}
function catchRail(W, B, prevY, emit) {
  for (const r of W.rails) {
    const n = railNear(r, B);
    if (!n) continue;
    const y = railY(r, n[0]), left = B.railLeft === r.i;
    if (prevY < y - 0.05 || B.y > y + RAIL.ABOVE) continue; // coming down onto the rail top (or just above it) this step
    if (n[1] > (left ? RAIL.LEFT_CATCH : RAIL.CATCH) || (left && (n[0] <= 0 || n[0] >= 1))) continue;
    const dir = Math.sin(B.heading) * r.ux + Math.cos(B.heading) * r.uz >= 0 ? 1 : -1;
    B.grind = { r, t: n[0], dir, time: 0 };
    B.x = r.x0 + r.ux * r.len * n[0]; B.z = r.z0 + r.uz * r.len * n[0]; B.y = y; B.vy = 0;
    B.heading = B.vh = Math.atan2(r.ux * dir, r.uz * dir);
    B.speed = Math.max(Math.abs(B.speed), B.H.CRUISE * RAIL.MIN_SPEED);
    B.grounded = false; B.plat = null; B.peakY = null;
    emit('grindStart', { rail: r });
    return true;
  }
  return false;
}
function grindStep(W, B, ctl, dt, emit) {
  const g = B.grind, H = B.H;
  B.speed = Math.max(B.speed, H.CRUISE * RAIL.MIN_SPEED) * (B.boost ?? 1) ** dt; // (a smash lunge on a rail: faster still)
  g.t += (g.dir * B.speed * dt) / g.r.len;
  g.time += dt;
  // run off an end onto the next rail (a landing rail into a handrail), or pop off
  if (g.t > 1 || g.t < 0) {
    const link = g.t > 1 ? g.r.next : g.r.prev;
    if (link) {
      const over = (g.t > 1 ? g.t - 1 : -g.t) * g.r.len, r = link.r;
      g.r = r; g.dir = link.at === 0 ? 1 : -1; g.t = link.at === 0 ? over / r.len : 1 - over / r.len;
    }
  }
  const r = g.r;
  const off = g.t < 0 || g.t > 1;
  const t = Math.max(0, Math.min(1, g.t));
  B.x = r.x0 + r.ux * r.len * t; B.z = r.z0 + r.uz * r.len * t; B.y = railY(r, t);
  B.heading = B.vh = Math.atan2(r.ux * g.dir, r.uz * g.dir);
  B.steer = 0;
  if (ctl.jump) B.jumpBuf = H.JUMP_BUFFER;
  B.jumpBuf -= dt;
  if (B.jumpBuf > 0 || off) {
    B.vy = off ? 3 : H.JUMP_V; // hop off, or pop off the end
    // (a hop off can lean left or right off the rail: the stick's sideways push)
    if (!off && ctl.dir && ctl.dir.mag > 0.3) { const side = ctl.dir.x * -r.uz * g.dir + ctl.dir.z * r.ux * g.dir; B.kx += -r.uz * g.dir * Math.sign(side) * 3; B.kz += r.ux * g.dir * Math.sign(side) * 3; }
    B.jumpBuf = 0; B.grind = null; B.grounded = false; B.plat = null; B.airT = 0; B.coyote = 0; B.peakY = B.y;
    B.railLeft = r.i;
    emit('grindEnd', { time: g.time, hop: !off });
    if (!off) emit('jump');
  }
}
