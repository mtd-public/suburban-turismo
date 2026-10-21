// TUNING (from store-smash; Suburban Turismo uses HANDLING.car as the base and each vehicle overrides it in js/cars.js) — every number that shapes the feel, each with the reason it has that value (the Dr. Mow
// convention: the sim, the CPU dashers and the renderer all read from here).
//
// One character controller (js/drive.js, lifted from Dr. Mow's mower step) drives every body in the game.
// A HANDLING profile is all that separates a shopper pushing a cart from a car: the same steering spring,
// turn slow-down, grip/drift, hop with coyote time and jump buffer, step-up and snap-down, wall sliding.
export const DT = 1 / 120; // fixed step (Dr. Mow): identical hops and turns in the browser and the headless proof

const COMMON = {
  GRAVITY: 24,        // m/s² — heavier than real (9.8) so hops are snappy toy hops, not floaty (Dr. Mow)
  COYOTE: 0.1,        // s after rolling off a ledge in which a tap still hops (forgives late taps at the lip)
  JUMP_BUFFER: 0.15,  // s a tap is remembered before landing (forgives early taps)
  STICK_MIN: 0.12,    // stick magnitude under which the heading is left alone (thumb resting on the stick)
  YAW_MIN_FRAC: 0.4,  // a light push turns at 40% of max: small thumb movements give fine lines
  AIR_CONTROL: 0.6,   // steering authority in the air: enough to correct a hop, not enough to fly round corners
};

export const HANDLING = {
  // A shopper sprinting behind a cart. Handles like Dr. Mow's Zero-Turn: point the stick back and it nearly
  // stops and swings round on its casters, so a 3.4 m aisle is easy to turn in.
  cart: {
    ...COMMON,
    name: 'cart',
    CRUISE: 6.2,       // m/s flat out: ~one aisle-width per half second, a run you can still aim down a 3.4 m aisle
    ACCEL: 5,          // 1/s ease toward the target speed when speeding up: a shove off the line, not a snap
    BRAKE: 7,          // 1/s when slowing (stick released): carts stop in about a body length
    REVERSE: 0.45,     // share of CRUISE when backing up (relative keys / chase cam only)
    THROTTLE_MIN: 0.45, // a light stick push walks the cart at 45%: fine positioning at a shelf
    AUTO_CRUISE: false, // Dr. Mow's mower never stops; a cart does when you let go
    YAW_GAIN: 13,      // yaw rate = gain × heading error (damped spring): a flick lands on the new heading at once
    YAW_MAX: 8,        // rad/s at full deflection: 180° in ~0.4 s (Zero-Turn was 9.5)
    YAW_FULL: 0,       // m/s needed for full yaw (0: casters pivot at a standstill)
    YAW_LOW: 1,
    TURN_SLOW: 0.8,    // stick far off the heading drops it to 20%: it pivots almost on the spot
    KEY_YAW: 4.4,      // rad/s for relative keys (chase cam)
    KEY_SLOW: 0.35,
    GRIP: 14,          // 1/s the travel direction catches up with the heading: casters skid a touch on a hard flick
    JUMP_V: 7.5,       // m/s up: apex 1.17 m, clears a 1.1 m railing or a fallen cart, never a 2.2 m shelf
    STEP: 0.35,        // m climbed without hopping (curbs are 0.15, ramp seams); a 0.5 ledge needs a hop
    SNAP_DOWN: 0.35,   // m it stays glued going down a ramp instead of going briefly airborne
    HEIGHT: 1.75,      // m shopper height: overhead clearance (the mezzanine slab, a lintel)
    // collision: two circles along the heading (the cart in front, the shopper behind)
    CIRCLES: [[0.45, 0.45], [-0.45, 0.42]], // [offset m along heading, radius m]
    WALL_MARGIN: 0.42, // m kept from walls round each circle
    MASS: 1,
    PICK_R: 1.7,       // m from a shelf slot that grabs the item (you reach out as you roll past)
    GRIND: true,       // carts grind rails (railing tops, handrails, ledges)
  },
  // A dasher's hatchback. Same controller: faster, heavier, drifts (low grip), and it can't spin on the spot.
  car: {
    ...COMMON,
    name: 'car',
    CRUISE: 20,        // m/s (72 km/h): a 100 m city block in ~5 s, so a 300 m dash is a 20 s sprint
    ACCEL: 1.25,       // 1/s: ~1.8 s to 90% of top speed — corners cost you something
    BRAKE: 3.2,
    REVERSE: 0.3,
    THROTTLE_MIN: 0.5,
    AUTO_CRUISE: false,
    YAW_GAIN: 6,       // a softer spring than the cart: a car leans into a turn
    YAW_MAX: 2.7,      // rad/s: with TURN_SLOW the tightest turn is a ~4 m radius, a U-turn fits a 14 m street
    YAW_FULL: 7,       // m/s at which the steering has full authority…
    YAW_LOW: 0.3,      // …and 30% of it at a standstill: you can creep round in a garage, but not spin like a cart
    TURN_SLOW: 0.45,   // stick far off the heading: speed falls to 55% (Dr. Mow's mower value) — the auto-brake into a corner
    KEY_YAW: 2.4,
    KEY_SLOW: 0.25,
    GRIP: 5.5,         // low grip (Dr. Mow's slick lawns, always on): a hard turn at speed slides ~0.3 rad, a drift
    JUMP_V: 7,         // a Mario Kart hop: 1 m up, enough to jump a curb or a fallen cart, or to drift-hop a corner
    STEP: 0.4,         // curbs (0.15) and ramp seams roll under; a 0.5 m ledge doesn't
    SNAP_DOWN: 0.5,
    HEIGHT: 1.6,
    CIRCLES: [[1.15, 1.0], [0, 1.0], [-1.15, 1.0]], // a 4.3 m × 2 m hatchback as three circles (nose, middle, tail)
    WALL_MARGIN: 0.95,
    MASS: 4,           // a car shoves a cart aside; two cars shove evenly
    DROP_R: 5,         // m from the drop-off pad that counts as delivered (pull up to the curb)
  },
};

export const MATCH = {
  READY: 3,            // s countdown (3-2-1-GO) after the order board
  BOARD_TIME: 25,      // s to pick orders off the board before the countdown starts on its own
  LIMIT: 360,          // s: when the clock runs out, whatever's still on the board is cancelled
  DOOR_R: 2.6,         // m from your own car that gets you in (with at least one order complete)
  PARK_R: 4.5,         // m from your parking spot that parks you and puts you back on foot (no orders left in the car)
  MIN_DROP_DIST: 120,  // m (straight line) between the store and a drop-off: a real dash across town
  ITEMS: [2, 4],       // items per order
  STACK: 3,            // orders a dasher can hold at once
  ORDERS: (n) => Math.max(3, Math.min(7, Math.round(n * 1.25) + 1)), // board size for n dashers: always a race for some
};

// Cart combat: one move, SMASH — a lunge with the cart. Whoever it lands on (touching, or right in front of your cart
// as you lunge) loses an item you still need straight into your cart; if they carry nothing you need, their stuff
// spills on the floor, where anyone who needs it can grab it. A car hitting a shopper spills them too.
export const COMBAT = {
  SMASH_TIME: 0.45,    // s of lunge: about 4 m at the boosted speed
  SMASH_BOOST: 1.8,    // × cruise while lunging
  SMASH_CD: 1.5,       // s before the next one
  SMASH_REACH: 1.7,    // m from your cart's nose to a rival's nearest circle that lands it
  SMASH_ARC: 1.3,      // rad either side of your heading
  STUN_SMASH: 0.9,     // s dazed after a smash spills you (no control, the cart spins)
  STUN_STEAL: 0.45,    // s after having something snatched
  STUN_CAR: 1.3,       // hit by a car
  CAR_HIT: 7,          // m/s closing speed for a car to knock a shopper's items loose
  SPILL_SMASH: 2,      // items knocked loose
  SPILL_CAR: 3,
  GUARD: 1.6,          // s after being hit when you can't be hit again (no stun-locking)
  GUARD_THIEF: 2,      // s a thief can't be robbed back (otherwise two dashers needing one item trade it forever)
  LOOSE_WAIT: 0.5,     // s before a spilled item can be picked up (the victim waits LOOSE_WAIT × 2)
  HOSTILE_R: 9,        // m: a rival this close, coming your way, raises the warning banner
};

// CPU dashers run a little slower than you, on foot and at the wheel (the same controller, a lower top speed).
export const CPU = { PACE_CART: 0.84, PACE_CAR: 0.86 };

// Slow-mo (Dr. Mow's slow-mo meter): tricks fill a style meter; hold SLO-MO to spend it and the whole world
// runs at SCALE. Sick moments (a kicker launch, a rail grab off a hop, a big drop) also drop into a short burst
// of bullet time on their own.
export const SLOWMO = {
  SCALE: 0.4,       // the world at 40% while you hold it: lines up a rail, a gap, a steal
  AUTO: 0.35,       // the automatic burst's speed…
  AUTO_TIME: 0.75,  // …and how long it lasts (real seconds)
  AUTO_GAP: 2.5,    // s between automatic bursts (so a grind combo doesn't crawl)
  DRAIN: 0.3,       // meter per real second held: a full meter lasts ~3.3 s
  MAX: 2,           // banks up to 200% (Dr. Mow)
  START: 0.5,
  MIN: 0.08,        // can't start on less than this
  GRIND: 0.3,       // meter per second grinding
  AIR: 0.25,        // for a big air (over 0.8 s off the ground)
  DROP: 0.4,        // for a drop of over 3 m (off the upper floor)
  STEAL: 0.25, SMASH: 0.3,
};

// Camera (Dr. Mow's isometric diorama, pulled out further in the car).
export const CAMERA = {
  FOV: 30,            // degrees. Narrow perspective keeps the isometric read with real 3D depth (Dr. Mow CAM_FOV)
  PITCH: 46,          // degrees. A touch steeper than Dr. Mow's 42: you look down into aisles past the shelves
  YAW: 45,            // degrees. The classic diorama diagonal; the store and streets run along screen diagonals
  VIEW_CART: 11,      // m half the visible height round a shopper: two or three aisles in view
  VIEW_CAR: 24,       // m in the car: ~1.5 city blocks in view at speed
  LOOK_CART: 2.2,     // m the camera leads in the heading direction
  LOOK_CAR: 9,
  PORTRAIT_K: 0.62,   // portrait shows VIEW/aspect×K tall (Dr. Mow)
  CHASE: { back: 6.2, height: 3.6, ahead: 3, lookUp: 0.4, fov: 55, fovPortrait: 70, yawRate: 5 }, // Dr. Mow's chase rig
  CHASE_CAR: { back: 9.5, height: 4.2, ahead: 6, lookUp: 0.6, fov: 60, fovPortrait: 75, yawRate: 4 },
};
