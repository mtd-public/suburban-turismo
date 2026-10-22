// Suburban Turismo — the game. Pick a mode (a 3-lap race against five of the neighbours, or a time trial against
// a ghost), a circuit and a car; race on the circuit's see-through track layer, on and off road, through glass,
// hedges and the odd hydrant.
//
//   Race        3 laps, six cars, a rolling grid behind the line, positions live, results at the flag
//   Time trial  3 laps alone against a ghost: the pro's run first; once you've beaten it, your own best
//   Motor Murder  the death match: six cars on a circuit, weapon pickups (js/combat.js), last car running wins
//   Cameras     chase or bumper (C / pad RB, or Y outside Motor Murder / the camera button); backing up pops a rear-view mirror
//
// The world (renderer, town, props, light) is js/stage.js, shared with the art test (viewer.html).
import * as THREE from 'three';
import { PS1, U as PS1U, basic, ps1ify } from './ps1.js';
import * as T from './tex.js';
import { createStage, LIGHTS, handlingFor, buildMapExtras } from './stage.js';
import { buildVehicle, poseVehicle, flashLights, carLights, VEHICLES, VEHICLE_ORDER } from './cars.js';
import { posePerson, CAST } from './people.js';
import { ROUTES, buildRouteLayer, routeLength, routeSamples } from './routes.js';
import { Track, Racer, cpuControl, bump, GhostRecorder, ghostAt, simulatePro } from './race.js';
import { driveStep } from './drive.js';
import { wallAt, platsNear, contains } from './world.js';
import { DT } from './tuning.js';
import { Controls } from './controls.js';
import { createCombat, WEAPONS, COMBAT_TIME } from './combat.js';
import { CarAudio } from './audio.js';
import { Snowfall, Wreckage } from './fx.js';
import { clamp, damp, wrapAngle } from './utils.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const store = { // (localStorage can be missing or throw: the game works without it, it just forgets)
  get(k) { try { return JSON.parse(localStorage.getItem(`suburban-turismo:${k}`)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(`suburban-turismo:${k}`, JSON.stringify(v)); } catch (_) { /* full or blocked */ } },
};

// ------------------------------------------------------------------ the world
// The season is chosen before the town is built (its textures are painted for it): changing it reloads.
const season = ['autumn', 'winter'].includes(params.get('season')) ? params.get('season') : (store.get('season') === 'winter' ? 'winter' : 'autumn');
T.setWinter(season === 'winter');
const canvas = $('#game');
const stage = createStage(canvas);
const { R, scene, cam, skyDome, town, W, props, people, dale } = stage;
const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 900);
const mirrorCam = new THREE.PerspectiveCamera(52, 3, 0.5, 260);
const mapExtras = buildMapExtras(scene);
const mapLayers = ROUTES.map((r) => { const g = buildRouteLayer(r); g.visible = false; scene.add(g); return g; });
const trackLayers = ROUTES.map((r) => { const g = buildRouteLayer(r, { heightAt: (x, z) => groundAt0(x, z), opacity: 0.7 }); g.userData.band.material = g.userData.band.material.clone(); g.userData.kerb.material = g.userData.kerb.material.clone(); g.visible = false; scene.add(g); return g; });
// Distance culling: props and people that would be under a pixel and a half at 240 lines, or lost in the fog, go to a
// layer the camera doesn't draw (their own code owns .visible). Checked every few frames; the overhead map draws all.
const cullList = [], CULL_LAYER = 3, box = new THREE.Box3(), sph = new THREE.Sphere();
let cullI = 0;
function buildCull() {
  cullList.length = 0;
  for (const o of [...props.list.map((P) => P.mesh), ...Object.values(people)]) { box.setFromObject(o); box.getBoundingSphere(sph); cullList.push({ o, r: Math.max(0.25, Number.isFinite(sph.radius) ? sph.radius : 1), off: false }); }
}
function cullStep(all) {
  if (!cullList.length) buildCull();
  if (!all && cullI++ % 4) return;
  const c = cam.position, fog = scene.fog.far;
  for (const e of cullList) {
    const p = e.o.position, d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z), off = !all && (d > fog + e.r * 2 || d > e.r * 280);
    if (off !== e.off) { e.off = off; e.o.traverse((m) => m.layers.set(off ? CULL_LAYER : 0)); }
  }
}

// PS1 sprites: sprites and points snap to the low-res pixel grid like every other vertex (ps1ify covers the meshes),
// and additive glows skip the fog (fogging an additive sprite brightens it toward the haze colour: a lit square).
function ps1Sprites() {
  scene.traverse((o) => {
    if (!(o.isSprite || o.isPoints)) return;
    const m = o.material; if (m.userData.ps1) return; m.userData.ps1 = true;
    if (m.blending === THREE.AdditiveBlending) m.fog = false;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSnap = PS1U.uSnap; sh.uniforms.uJitter = PS1U.uJitter;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uSnap; uniform float uJitter;')
        .replace('#include <logdepthbuf_vertex>', 'if (gl_Position.w > 0.0) { vec2 n = gl_Position.xy / gl_Position.w; gl_Position.xy = mix(n, floor(n * uSnap * 0.5 + 0.5) / (uSnap * 0.5), uJitter) * gl_Position.w; }\n#include <logdepthbuf_vertex>');
    };
    m.customProgramCacheKey = () => 'ps1sprite'; m.needsUpdate = true;
  });
}

// Compile every shader up front (smoke, sparks, wreckage, weapons, lights: all hidden until the first drift or crash),
// so the first one doesn't hitch the frame.
function warmShaders() {
  ps1Sprites();
  const hidden = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { R.r.compile(scene, cam); } finally { for (const o of hidden) o.visible = false; }
}
const RIGHT_WAY = new THREE.Color(0x40d868), WRONG_WAY = new THREE.Color(0xf03030), tintTo = new THREE.Color();
// The track under you: green going the right way round, red going the wrong way (by which way you're moving).
function trackTint(dt) {
  const L = G.route && trackLayers[ROUTES.indexOf(G.route)], P = G.player; if (!L || !P) return;
  const B = P.body;
  if (G.mode === 'combat') G.wrongWay = false; // (no right way round in a death match)
  else if (Math.abs(B.speed) > 1.2) G.wrongWay = Math.abs(wrapAngle(B.heading + (B.speed < 0 ? Math.PI : 0) - G.track.heading(P.idx))) > Math.PI / 2;
  // (the band is unlit paint: dim it with the light, or it glows at night)
  const lit = LIGHTS[light].night ? 0.42 : LIGHTS[light].lamps ? 0.6 : 1; L.userData.kerb.material.color.setScalar(lit);
  tintTo.copy(G.wrongWay ? WRONG_WAY : RIGHT_WAY).multiplyScalar(lit);
  L.userData.band.material.color.lerp(tintTo, Math.min(1, dt * 8));
}
function groundAt0(x, z) { let h = 0; for (const p of platsNear(W, x, z)) if (!p.ghost && contains(p, x, z) && p.h <= 0.5 && p.h > h) h = p.h; return h; }
let light = params.get('light') in LIGHTS ? params.get('light') : (store.get('light') in LIGHTS ? store.get('light') : 'autumn');

// smoke off the tyres (and exhaust in the cold, and a damaged engine's smoke), pooled
const puffs = Array.from({ length: 110 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke(), transparent: true, depthWrite: false })); s.visible = false; s.userData = { t: 0 }; scene.add(s); return s; });
let puffI = 0;
const puff = (x, y, z, o = {}) => { const s = puffs[puffI++ % puffs.length], u = s.userData; s.position.set(x, y, z); s.visible = true; u.t = 0; u.v = o.v ?? 0.6 + Math.random() * 0.6; u.life = o.life ?? 1.1; u.s0 = o.s0 ?? 0.8; u.grow = o.grow ?? 3; u.a = o.a ?? 0.65; u.vx = o.vx || 0; u.vz = o.vz || 0; s.material.color.setHex(o.color ?? 0xffffff); if (nightOn()) s.material.color.multiply(NIGHT_SMOKE); }; // (sprites aren't lit: dim them at night)
const NIGHT_SMOKE = new THREE.Color(0x4a5268);
const tickPuffs = (dt) => { for (const s of puffs) if (s.visible) { const u = s.userData; u.t += dt; const k = u.t / u.life; if (k >= 1) { s.visible = false; continue; } s.scale.setScalar(u.s0 + k * u.grow); s.position.y += u.v * dt; s.position.x += u.vx * dt; s.position.z += u.vz * dt; s.material.opacity = u.a * (1 - k) * Math.min(1, Math.max(0, (s.position.distanceTo(cam.position) - 1.5) / 3)); } }; // (fades out right at the lens, where a puff would be a wall of big pixels)
// weather, wreckage, the night headlamp, sound
const snow = new Snowfall(scene); snow.on = T.WINTER;
const wreck = new Wreckage(scene, W);
const headlamp = new THREE.SpotLight(0xfff0d0, 0, 70, 0.5, 0.55, 1); scene.add(headlamp, headlamp.target); // (always in the scene, so the shaders never recompile; off by day)
const audio = new CarAudio();
let muted = store.get('muted') === true; audio.setMuted(muted);
const nightOn = () => !!LIGHTS[light].lamps;
// How loud / where a sound at (x, z) is from the camera: { vol, pan } (null when it's too far to hear).
function near(x, z, range = 70) {
  const dx = x - cam.position.x, dz = z - cam.position.z, d = Math.hypot(dx, dz); if (d > range) return null;
  const rx = Math.cos(camYaw()), rz = -Math.sin(camYaw()); // (the camera's right)
  return { vol: Math.max(0.05, 1 - d / range) ** 1.4, pan: clamp((dx * rx + dz * rz) / Math.max(8, d), -0.9, 0.9) };
}
const camYaw = () => { cam.getWorldDirection(tmpDir); return Math.atan2(tmpDir.x, tmpDir.z); };
const tmpDir = new THREE.Vector3();
const sfxAt = (name, x, z, vol = 1, range) => { const n = near(x, z, range); if (n) audio.play(name, { pan: n.pan, vol: n.vol * vol }); };
props.onEvent = (type, P) => {
  const x = P.plat?.x ?? P.mesh?.position.x, z = P.plat?.z ?? P.mesh?.position.z;
  if (type === 'glass') sfxAt('shatter', x, z, 1.2); else if (type === 'bush') sfxAt('bush', x, z); else if (type === 'hydrant') sfxAt('hydrant', x, z);
  else if (type === 'hit') sfxAt(/cart|stray/.test(P.kind) ? 'cart' : 'thud', x, z);
};

// Motor Murder: the weapons, pickups and health live in js/combat.js
const combat = createCombat(scene, W, {
  puff, shake: (k) => { G.shake = Math.max(G.shake || 0, k); },
  wall: (x, z, y) => !!wallAt(W, x, z, y - 0.4, 0.05, 0.3, 0.8),
  onFire: (r, kind) => sfxAt({ fireworks: 'launch', turkey: 'swish', vape: 'vape', chainsaw: 'clank', nuts: 'thud', candle: 'candle', bottles: 'launch', mortar: 'mortar', crackers: 'crackle', fountain: 'fizzle' }[kind] || 'launch', r.body.x, r.body.z),
  boom: (x, z, big) => { sfxAt(big ? 'bigBoom' : 'boom', x, z, 1, 140); if (near(x, z, 30)) G.shake = Math.max(G.shake || 0, big ? 0.9 : 0.5); },
  pop: (x, z) => sfxAt('pop', x, z, 0.8),
  crackle: (x, z) => sfxAt('crackle', x, z, 0.7),
  onCough: (r) => sfxAt('cough', r.body.x, r.body.z, 0.6),
  onPickup: (r, kind) => { sfxAt(kind === 'casserole' ? 'heal' : 'pickup', r.body.x, r.body.z); if (r === G.player) msg(kind === 'casserole' ? '+35 HEALTH' : `${WEAPONS[kind].icon} ${WEAPONS[kind].name}`, 1.2, kind === 'casserole' ? 'good' : 'final'); },
  onWreck: (r) => { sfxAt('wreck', r.body.x, r.body.z, 1, 160); if (r === G.player) msg('WRECKED!', 3, 'bad'); else if (r.lastHit === G.player) msg(`TOTALLED ${r.name}!`, 1.6, 'final'); },
});

// ------------------------------------------------------------------ the field: who you race
const RIVALS = [
  { who: 'karen', car: 'minivan', color: 0x2a3a5a }, { who: 'mrJones', car: 'luxury', color: 0x1b1c22 }, { who: 'brenda', car: 'minivan', color: 0xa6987e },
  { who: 'greg', car: 'sedan', color: 0x8a1e1e }, { who: 'harold', car: 'hybrid', color: 0xc9ccc8 }, { who: 'tyler', car: 'sedan', color: 0x4a5a3a },
];
const rivalName = (w) => CAST[w]?.name || w;
const COPS = ['Unit 1', 'Unit 4', 'Car 54', 'Sgt. Murtaugh', 'Officer Dale\'s Boss', 'State Trooper', 'Unit 9'];
const BLOCKS = [[0.24, 1, 1.3], [0.24, -1, -1.2], [0.47, 1, 1.4], [0.8, -1, -1.3], [0.8, 1, 1.25]]; // [how far along, side, angle]
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const fmt = (t) => { if (t == null || !isFinite(t)) return '–:––.––'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
const fmtD = (d) => `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;

// ------------------------------------------------------------------ game state
const controls = new Controls(canvas);
const G = {
  state: 'menu', mode: 'race', route: ROUTES[0], car: 'sedan', camMode: store.get('cam') === 'bumper' ? 'bumper' : 'chase',
  racers: [], player: null, track: null, t: 0, count: 0, acc: 0, meshes: [], ghost: null, ghostMesh: null, rec: null, msgT: 0, endT: 0,
  auto: params.get('auto') === '1', mirror: 0, results: null,
};
const ghostPose = { x: 0, y: 0, z: 0, heading: 0 };

function clearRace() {
  combat.clear(); headlamp.intensity = 0;
  for (const m of G.meshes) scene.remove(m);
  if (G.ghostMesh) scene.remove(G.ghostMesh);
  G.meshes = []; G.ghostMesh = null; G.racers = []; G.blocks = []; G.player = null;
  for (const g of trackLayers) g.visible = false;
}

// A see-through copy of a car for the ghost (same model, PS1 wobble kept).
function ghostCar(key) {
  const m = buildVehicle(key, { color: 0xe8f0ff });
  m.traverse((o) => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; const nm = mats.map((x) => { const c = ps1ify(x.clone()); c.transparent = true; c.opacity = 0.38; c.depthWrite = false; return c; }); o.material = Array.isArray(o.material) ? nm : nm[0]; } });
  return m;
}

function startRace(mode = G.mode, routeKey = G.route.key, carKey = G.car) {
  clearRace();
  G.mode = mode; G.route = ROUTES.find((r) => r.key === routeKey) || ROUTES[0]; G.car = carKey;
  props.reset();
  const track = G.track = new Track(G.route);
  trackLayers[ROUTES.indexOf(G.route)].visible = true; G.wrongWay = false; trackLayers[ROUTES.indexOf(G.route)].userData.band.material.color.copy(RIGHT_WAY);
  const H = handlingFor(carKey), seg = VEHICLES[carKey].segway;
  const mk = (r, key, color, livery) => { const m = buildVehicle(key, { ...(color != null ? { color } : {}), livery }); scene.add(m); G.meshes.push(m); r.mesh = m; r.key = key; r.paint = color ?? VEHICLES[key].color ?? 0x888888; r.len = VEHICLES[key].len; r.tall = VEHICLES[key].segway ? 2.3 : 1.9; G.racers.push(r); return r; };
  if (mode === 'race' && G.route.final) { // the last run: you on pole, seven cruisers behind, roadblocks ahead
    G.player = mk(new Racer(track, W, H, 0, { name: 'You' }), carKey);
    const cop = seg ? 'segway' : 'sedan', h = handlingFor(cop);
    for (let slot = 2; slot < 9; slot++) mk(new Racer(track, W, h, slot, { cpu: true, name: COPS[slot - 2], skill: (H.CRUISE / h.CRUISE) * (0.76 + Math.random() * 0.07), lane: (Math.random() - 0.5) * 3 }), cop, seg ? null : 0x141418, 'police').chase = true;
    for (const [fi, side, ang] of BLOCKS) { // parked across half the road: push through them, or go round
      const s = track.at(Math.round(fi * track.n)), r = new Racer(track, W, handlingFor('sedan'), 0, { cpu: true, name: 'Roadblock' });
      Object.assign(r.body, { x: s.x - s.tz * side * 2.6, z: s.z + s.tx * side * 2.6, heading: Math.atan2(s.tx, s.tz) + ang, speed: 0 }); r.body.vh = r.body.heading; r.parked = true;
      r.body.H = { ...r.body.H, MASS: 6 };
      const m = buildVehicle('sedan', { color: 0x141418, livery: 'police' }); scene.add(m); G.meshes.push(m); r.mesh = m; r.key = 'sedan'; r.paint = 0x141418; G.blocks.push(r);
    }
  } else if (mode === 'combat') { // spread round the circuit, a sixth of a lap apart
    track.laps = Infinity;
    const field = RIVALS.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    for (let k = 0; k < 6; k++) {
      const f = k ? field[k - 1] : null, key = k ? (seg ? 'segway' : f.car) : carKey, h = k ? handlingFor(key) : H;
      const r = mk(new Racer(track, W, h, 0, k ? { cpu: true, name: rivalName(f.who), skill: (H.CRUISE / h.CRUISE) * 0.82, lane: (Math.random() - 0.5) * 2 } : { name: 'You' }), key, k && !seg ? f.color : null);
      const i = Math.round((k / 6) * track.n), s = track.at(i);
      Object.assign(r.body, { x: s.x, z: s.z, heading: Math.atan2(s.tx, s.tz), vh: Math.atan2(s.tx, s.tz) }); r.body.y = groundAt0(s.x, s.z); r.idx = i; r.c = 1;
      if (!k) G.player = r;
    }
    combat.start(track, G.racers, G.player);
  } else if (mode === 'race') {
    const field = RIVALS.slice().sort(() => Math.random() - 0.5).slice(0, 5), playerSlot = 3;
    let k = 0;
    for (let slot = 0; slot < 6; slot++) {
      if (slot === playerSlot) { G.player = mk(new Racer(track, W, H, slot, { name: 'You' }), carKey); continue; }
      const f = field[k++], key = seg ? 'segway' : f.car, h = handlingFor(key);
      const skill = (H.CRUISE / h.CRUISE) * (0.84 + Math.random() * 0.07) * (slot < playerSlot ? 0.97 : 1); // (matched to your car, so any car can win)
      mk(new Racer(track, W, h, slot, { cpu: true, name: rivalName(f.who), skill, lane: (Math.random() - 0.5) * 3 }), key, seg ? null : f.color);
    }
  } else {
    G.player = mk(new Racer(track, W, H, 0, { name: 'You' }), carKey);
    const pro = proGhost(G.route.key, carKey), best = store.get(`best:${G.route.key}:${carKey}`);
    G.ghost = best && best.t < pro.t ? { ...best, label: 'Your best' } : { ...pro, label: 'Pro' };
    G.pro = pro; G.best = best;
    G.ghostMesh = ghostCar(carKey); scene.add(G.ghostMesh);
    G.rec = new GhostRecorder();
  }
  G.player.H0 = G.player.body.H; G.drift = false;
  for (const r of [...G.racers, ...G.blocks]) { r.onLap = onLap; r.onFinish = onFinish; r.mesh.position.set(r.body.x, r.body.y, r.body.z); r.mesh.rotation.y = r.body.heading; }
  G.combatDone = false; G.haze = 0; document.body.classList.toggle('combat', mode === 'combat');
  G.t = 0; G.count = 3.6; G.acc = 0; G.state = 'countdown'; G.endT = 0; G.results = null; G.splits = [];
  camState.init = false;
  showMenu(null); setHud(true); warmShaders(); // (the new cars, their lights and the weapons)
  msg('', 0);
}

// The pro's run for a circuit + car: simulated once, then remembered.
const proCache = new Map();
function proGhost(rk, ck) {
  const k = `${rk}:${ck}`;
  if (proCache.has(k)) return proCache.get(k);
  const ver = `h2:${k}:${ROUTES.find((r) => r.key === rk).pts.flat().reduce((a, b) => a + b, 0).toFixed(1)}`; // (a changed circuit re-times its pro)
  let g = store.get(`pro:${k}`); if (g && g.ver !== ver) g = null;
  if (!g || !g.f) { g = simulatePro(new Track(ROUTES.find((r) => r.key === rk)), W, handlingFor(ck), town.glass.map((x) => x.plat)); g.ver = ver; store.set(`pro:${k}`, g); }
  proCache.set(k, g);
  return g;
}

function onLap(r) {
  if (r !== G.player) return;
  const n = r.laps.length;
  if (G.mode === 'tt' && G.ghost?.laps?.length >= n) {
    const mine = r.laps.reduce((a, b) => a + b, 0), theirs = G.ghost.laps.slice(0, n).reduce((a, b) => a + b, 0);
    G.splits.push(mine - theirs); msg(`${fmtD(mine - theirs)}`, 2.2, mine < theirs ? 'good' : 'bad');
  }
  if (n === G.track.laps - 1) setTimeout(() => G.state === 'race' && msg('FINAL LAP', 2, 'final'), G.mode === 'tt' ? 1500 : 0);
}
function onFinish(r) {
  if (r !== G.player) return;
  G.endT = 2.5;
  if (G.mode === 'tt') {
    const run = { t: r.finishT, laps: r.laps, f: G.rec.f };
    const best = store.get(`best:${G.route.key}:${G.car}`);
    G.newBest = !best || run.t < best.t;
    if (G.newBest) store.set(`best:${G.route.key}:${G.car}`, run);
    G.beatPro = run.t < G.pro.t;
    msg(G.newBest ? 'NEW BEST!' : 'FINISH', 3, G.newBest ? 'final' : '');
  } else msg(G.route.final ? (standings().indexOf(r) === 0 ? 'MADE IT!' : 'BUSTED!') : `${ordinal(standings().indexOf(r) + 1)}!`, 3, G.route.final ? (standings().indexOf(r) === 0 ? 'good' : 'bad') : standings().indexOf(r) === 0 ? 'final' : '');
}
const standings = () => G.racers.slice().sort((a, b) => (a.finished && b.finished ? a.finishT - b.finishT : a.finished ? -1 : b.finished ? 1 : b.prog - a.prog));

// ------------------------------------------------------------------ the frame
let last = performance.now();
function frame(now) {
  let dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20)); last = now;
  tick(dt);
  render();
  requestAnimationFrame(frame);
}
let time = 0;
function tick(dt) {
  time += dt;
  for (const k in people) posePerson(people[k], time);
  posePerson(dale.userData.rider, time);
  const inp = controls.read();
  if (G.state === 'countdown') {
    const before = Math.ceil(G.count); G.count -= dt; const now = Math.ceil(G.count);
    if (now !== before && now >= 1 && now <= 3) { msg(String(now), 0.9); audio.play('beep'); }
    if (G.count <= 0) { G.state = 'race'; audio.play('beepGo'); msg(G.mode === 'combat' ? 'MURDER!' : G.route.final && G.mode === 'race' ? 'LOSE THE COPS!' : 'GO!', 1.4, G.mode === 'combat' ? 'bad' : 'good'); }
  }
  if (G.state === 'race') raceStep(dt, inp);
  if (G.state === 'race' || G.state === 'countdown' || G.state === 'results') for (const r of [...G.racers, ...G.blocks]) { r.mesh.position.set(r.body.x, r.body.y, r.body.z); r.mesh.rotation.y = r.body.heading; poseVehicle(r.mesh, r.body, dt); flashLights(r.mesh, time + r.body.x * 0.01); carVisuals(r, dt); }
  if (G.ghostMesh) { const on = G.state !== 'menu' && ghostAt(G.ghost, G.state === 'countdown' ? 0 : G.t, ghostPose); G.ghostMesh.visible = on; if (on) { G.ghostMesh.position.set(ghostPose.x, ghostPose.y, ghostPose.z); G.ghostMesh.rotation.y = ghostPose.heading; } }
  props.step(dt);
  combat.frame(dt, time);
  wreck.step(dt); snow.night = nightOn(); snow.step(dt, cam);
  sounds(inp);
  tickPuffs(dt);
  if (G.msgT > 0 && (G.msgT -= dt) <= 0) $('#msg').classList.remove('on');
  if (G.state === 'results' || (G.state === 'race' && G.endT > 0)) { if (G.endT > 0 && (G.endT -= dt) <= 0) showResults(); }
  cameraFor(dt);
  skyDome.position.copy(cam.position);
  if (G.state !== 'menu') hud();
}

function raceStep(dt, inp) {
  const P = G.player, PB = P.body;
  G.acc += dt;
  for (const r of G.racers) props.collide(r.body, dt);
  for (const r of G.blocks) props.collide(r.body, dt);
  let ctlP;
  if (G.mode === 'combat' && (P.dead || combat.over)) ctlP = { throttle: 0 };
  else if (G.auto && G.mode === 'combat') ctlP = combat.cpu(P, dt);
  else if (P.finished || G.auto) ctlP = cpuControl(P, G.racers, G.t, dt);
  else {
    // brake + steer at speed is a drift: the back steps out (low grip, quicker yaw) and you keep most of your
    // speed; brake alone slows you, then reverses
    const brake = inp.brake > 0.1, drift = brake && Math.abs(inp.steer) > 0.25 && PB.speed > 7;
    if (drift && !G.drift) { PB.H = P.driftH ??= { ...P.H0, GRIP: 2.4, KEY_YAW: P.H0.KEY_YAW * 1.35, KEY_SLOW: 0, YAW_FULL: 4 }; }
    if (!drift && G.drift) PB.H = P.H0;
    G.drift = drift;
    ctlP = drift ? { turn: inp.steer, throttle: Math.max(0.78, inp.gas), jump: G.hop } : { turn: inp.steer, throttle: brake ? -inp.brake : inp.gas, jump: G.hop };
  }
  G.hop = false; G.brakeK = inp.brake > 0.1 && PB.speed > 0.5 ? 1 : 0; trackTint(dt);
  G.reversing = !P.finished && !G.auto && !ctlP.dir && ((ctlP.throttle < 0 && PB.speed < 0.6) || PB.speed < -0.4);
  while (G.acc >= DT) {
    G.acc -= DT; G.t += DT;
    for (const r of G.racers) {
      const ev = r.ev; ev.length = 0;
      const ctl = r.dead ? { throttle: 0 } : r === P ? ctlP : r.chase ? copControl(r, P) : G.mode === 'combat' ? combat.cpu(r, DT) : cpuControl(r, G.racers, G.t, DT);
      driveStep(W, r.body, ctl, DT, ev);
      r.progress(G.t); r.body.offroad = r.off > 6 ? 1 : 0;
      for (const e of ev) if (e.type === 'crash') {
        const B = r.body, fx = Math.sin(B.heading), fz = Math.cos(B.heading), L = VEHICLES[r.key].len / 2 + 0.6, hit = wallAt(W, B.x + fx * L, B.z + fz * L, B.y, 0.8, 0.4, 1.6);
        if (hit?.shelf) props.spill(B.x + fx * L, B.y, B.z + fz * L, fx, fz, e.v);
        if (G.mode === 'combat' && e.v > 7) combat.hurt(r, (e.v - 5) * 0.5);
        smash(r, B.x + fx * (L - 0.4), B.y, B.z + fz * (L - 0.4), fx, fz, e.v, true);
      } else if (e.type === 'scrape' && G.t - (r.scrapeT || -1) > 0.08) { r.scrapeT = G.t; const B = r.body; wreck.spark(B.x, B.y + 0.4, B.z, (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4); if (G.t - (r.scrapeSfx || -1) > 0.25) { r.scrapeSfx = G.t; sfxAt('scrape', B.x, B.z, 0.7); } } // (throttled: a scrape fires every physics step)
    }
    for (const b of G.blocks) { driveStep(W, b.body, { throttle: 0 }, DT, null); }
    const all = G.blocks.length ? [...G.racers, ...G.blocks] : G.racers;
    for (const r of all) if (r.hitCd > 0) r.hitCd -= DT;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const v = bump(W, all[i], all[j]);
      if (v > 5) { const a = all[i].body, b = all[j].body, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1; smash(all[j], (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, dx / d, dz / d, v, false, all[i]); }
    }
    if (G.rec && !P.finished) G.rec.sample(G.t, PB);
    if (G.mode === 'combat') combat.step(DT);
  }
  // CPUs back on the road on their own; you get the R / Back / ↺ button (or this, if you're truly lost)
  if (P.off > 60 && !P.finished) P.respawn();
  for (const r of G.racers) { const B = r.body, S = VEHICLES[r.key]; if (B.grounded && Math.abs(B.slip || 0) > 0.2 && Math.abs(B.speed) > 8 && G.t - (r.puffT || -1) > 0.07 && (r === P || near(B.x, B.z, 70))) (r.puffT = G.t), puff(B.x - Math.sin(B.heading) * S.len * 0.3, B.y + 0.3, B.z - Math.cos(B.heading) * S.len * 0.3); }
  if (G.mode === 'combat') { // the end: one car left, you're wrecked, or time's up
    if (!combat.over && G.t >= COMBAT_TIME) { combat.over = true; msg('TIME!', 2.5); }
    if (combat.over && G.endT <= 0 && !G.combatDone) { G.combatDone = true; G.endT = 2.8; if (!P.dead) msg(combat.standing()[0] === P ? 'LAST CAR STANDING!' : 'SURVIVED', 3, 'final'); }
    G.haze = combat.player?.inCloud ? 1 : 0;
    return;
  }
  if (P.wrongT > 1 && G.msgT <= 0) msg('WRONG WAY', 0.6, 'bad');
  // everyone home (or 20 s after you): the results
  if (P.finished && (G.racers.every((r) => r.finished) || G.t - P.finishT > 20) && G.endT <= 0) showResults();
}

// A crash: debris in the car's paint, sparks, a dent, the sound, the shake, and a hard jolt on the body's springs
// (pops it up and spins it over: the body lands back on its wheels) and plays in slow motion if it's yours.
// wall: hit a wall (r alone) or another car (other: the one that hit it).
function smash(r, x, y, z, nx, nz, v, wall, other = null) {
  const big = v > (wall ? 13 : 11), mine = r === G.player || other === G.player;
  wreck.crash(x, y, z, nx, nz, v, r.paint, big ? 1 : 0.55);
  if (other) wreck.crash(x, y, z, -nx, -nz, v * 0.6, other.paint, 0.4);
  sfxAt(big ? 'bigCrash' : v > 7 ? 'metal' : 'thud', x, z, mine ? 1 : 0.8);
  for (const c of other ? [r, other] : [r]) { c.dmg = Math.min(100, (c.dmg || 0) + v * (c === r ? 1 : 0.5)); dent(c); }
  if (mine) G.shake = Math.max(G.shake || 0, Math.min(0.8, v / 18));
  // the jolt: the body rocks on its springs away from the hit (both cars), no cartoon roll-over
  for (const [c, s] of other ? [[r, 1], [other, -0.7]] : [[r, -1]]) jolt(c, nx * s, nz * s, v);
}
function jolt(c, nx, nz, v) {
  const u = c.mesh.userData, h = c.body.heading, lx = nx * Math.cos(h) - nz * Math.sin(h), lz = nx * Math.sin(h) + nz * Math.cos(h), k = Math.min(1.6, v * 0.09);
  u.kick = { roll: -lx * k, pitch: lz * k, heave: k * 0.6 };
}
// Dents: the body crumples a little with every hit (shorter at the nose, a twist), up to a point.
function dent(r) {
  const b = r.mesh.userData.body, k = Math.min(1, (r.dmg || 0) / 100); if (!b || r.key === 'segway') return;
  b.scale.set(1 - k * 0.04, 1 - k * 0.06, 1 - k * 0.09); r.mesh.userData.twist = (r.mesh.userData.twist || (Math.random() - 0.5) * 0.06) ;
}
// Per frame for each car: the lights, exhaust in the cold, smoke when it's hurt.
function carVisuals(r, dt) {
  const u = r.mesh.userData, B = r.body, b = u.body;
  if (u.twist) b.rotation.y = u.twist * Math.min(1, (r.dmg || 0) / 60);
  const night = nightOn(); carLights(r.mesh, night, r === G.player ? (G.brakeK || 0) : (r.brakeK || 0));
  if (r === G.player) { // your own headlamps really light the road (a spot light; everyone else's are painted pools)
    const fx0 = Math.sin(B.heading), fz0 = Math.cos(B.heading), L0 = VEHICLES[r.key].len / 2;
    headlamp.intensity = night && !r.dead ? (LIGHTS[light].night ? 2.6 : 1.6) : 0;
    headlamp.position.set(B.x + fx0 * L0, B.y + 0.9, B.z + fz0 * L0); headlamp.target.position.set(B.x + fx0 * 24, B.y - 1.5, B.z + fz0 * 24); headlamp.target.updateMatrixWorld();
  }
  r.brakeK = damp(r.brakeK || 0, B.speed < (r.lastV ?? B.speed) - 0.08 ? 1 : 0, 10, dt); r.lastV = B.speed;
  const S = VEHICLES[r.key], fx = Math.sin(B.heading), fz = Math.cos(B.heading);
  if (T.WINTER && !S.segway && !r.dead && (r.exT = (r.exT || 0) - dt) <= 0) { // exhaust: little white clouds off the tailpipe, thicker on the gas
    r.exT = 0.07 + Math.random() * 0.05; const L = S.len / 2 + 0.1;
    puff(B.x - fx * L + fz * 0.45, B.y + 0.32, B.z - fz * L - fx * 0.45, { v: 0.35, life: 1.4, s0: 0.25, grow: 1.6, a: 0.45, vx: -fx * Math.min(3, Math.abs(B.speed) * 0.15) + 0.4, vz: -fz * Math.min(3, Math.abs(B.speed) * 0.15) });
  }
  if ((r.dmg || 0) > 55 && G.mode !== 'combat' && Math.random() < dt * (r.dmg / 18)) puff(B.x + fx * S.len * 0.35, B.y + 1.1, B.z + fz * S.len * 0.35, { color: 0x555555, a: 0.55, v: 1.2 }); // (a hurt engine)
}
// All the sound, once a frame: your engine and tyres, the nearest rival, the nearest siren, the chainsaws.
function sounds(inp) {
  if (!audio.ctx) return;
  const P = G.player, racing = P && (G.state === 'race' || G.state === 'countdown' || (G.state === 'results' && !P.dead));
  if (!racing || G.state === 'paused') { audio.hush(); return; }
  const B = P.body, S = VEHICLES[P.key];
  audio.drive(P.dead ? null : { speed: B.speed, cruise: B.H.CRUISE, throttle: G.state === 'countdown' ? inp.gas : (inp.brake > 0.1 ? -inp.brake : inp.gas || (G.auto ? 0.8 : 0)), slip: B.slip || 0, grounded: B.grounded, offroad: B.offroad, segway: S.segway });
  let rv = null, rd = 1e9, cop = null, cd = 1e9, saw = 0;
  for (const r of G.racers) {
    if (r === P || r.dead) continue; const d = Math.hypot(r.body.x - B.x, r.body.z - B.z);
    if (r.chase) { if (d < cd) { cd = d; cop = r; } } else if (d < rd) { rd = d; rv = r; }
    if (r.sawT > 0) saw = Math.max(saw, 1 - d / 40);
  }
  const nr = rv && near(rv.body.x, rv.body.z, 45); audio.rival(nr ? nr.vol : 0, rv ? Math.abs(rv.body.speed) / rv.body.H.CRUISE : 0, nr?.pan || 0);
  const nc = cop && near(cop.body.x, cop.body.z, 90); audio.siren(nc ? nc.vol : 0, nc?.pan || 0);
  audio.chainsaw(Math.max(P.sawT > 0 ? 1 : 0, saw * 0.7), P.sawT > 0 && P.sawBite ? 1 : 0);
}

// A cruiser: follows the line like any CPU, but once it's close behind you it stops racing and goes for your
// back bumper (where you'll be in half a second), and it doesn't let up.
function copControl(r, P) {
  const ctl = cpuControl(r, G.racers, G.t, DT), B = r.body, PB = P.body;
  if (ctl.dir && !P.finished) {
    const d = Math.hypot(PB.x - B.x, PB.z - B.z);
    if (d < 26 && r.prog <= P.prog + 0.004) {
      const lead = clamp(d / 30, 0.15, 0.6), tx = PB.x + Math.sin(PB.vh) * PB.speed * lead, tz = PB.z + Math.cos(PB.vh) * PB.speed * lead, dd = Math.hypot(tx - B.x, tz - B.z) || 1;
      ctl.dir = { x: (tx - B.x) / dd, z: (tz - B.z) / dd, mag: 1 }; B.pace = Math.max(B.pace, r.skill * 0.98);
    }
  }
  return ctl;
}

// ------------------------------------------------------------------ cameras: chase, bumper, the mirror, the menu map
const camState = { pos: new THREE.Vector3(), init: false, yaw: 0 };
const tmp = new THREE.Vector3();
function cameraFor(dt) {
  if (G.state === 'menu') return menuCamera(dt);
  const r = G.player, B = r.body, S = VEHICLES[r.key];
  // the chase cam swings after the car, half way between where it points and where it's going (a drift doesn't whip it)
  const want = B.heading + wrapAngle((B.speed < -0.5 ? B.heading : B.vh ?? B.heading) - B.heading) * 0.5;
  camState.yaw = camState.init && G.camMode !== 'bumper' ? camState.yaw + wrapAngle(want - camState.yaw) * Math.min(1, dt * 5) : B.heading;
  const fx = Math.sin(G.camMode === 'bumper' ? B.heading : camState.yaw), fz = Math.cos(G.camMode === 'bumper' ? B.heading : camState.yaw);
  if (G.camMode === 'bumper') { // on the nose, low, looking down the road
    const f = S.segway ? 0.2 : S.len / 2 + 0.05, up = S.segway ? 1.75 : 0.95;
    cam.position.set(B.x + fx * f, B.y + up, B.z + fz * f); cam.lookAt(B.x + fx * 30, B.y + up - 0.4, B.z + fz * 30); cam.fov = 68 + clamp(Math.abs(B.speed), 0, 25) * 0.4;
    camState.init = false; r.mesh.visible = !!S.segway ? false : true;
  } else { // Driver's chase cam: low, close, lagging the heading a little; pulls in rather than sit inside a wall
    r.mesh.visible = true;
    const back = S.segway ? 3.6 : 6.5, up = S.segway ? 2.0 : 2.3;
    tmp.set(B.x - fx * back, B.y + up, B.z - fz * back);
    let pulled = false;
    for (let k = 0.15; k <= 1.001; k += 0.05) {
      const x = B.x - fx * back * k, z = B.z - fz * back * k, y = B.y + 1.2 + (up - 1.2) * k;
      if (platsNear(W, x, z).some((p) => !p.ghost && contains(p, x, z, 0.4) && p.bot < y && p.top > y - 0.3)) { const kk = k - 0.05; tmp.set(B.x - fx * back * kk, B.y + 1.2 + (up - 1.2) * kk, B.z - fz * back * kk); pulled = true; break; }
    }
    if (!camState.init) { camState.pos.copy(tmp); camState.init = true; }
    const rate = pulled ? 30 : 4.5; // (lags a heavy car a touch more)
    camState.pos.x = damp(camState.pos.x, tmp.x, rate, dt); camState.pos.z = damp(camState.pos.z, tmp.z, rate, dt); camState.pos.y = damp(camState.pos.y, tmp.y, 4, dt);
    cam.position.copy(camState.pos); cam.lookAt(B.x + fx * 4, B.y + 1.0, B.z + fz * 4); cam.fov = 60 + clamp(Math.abs(B.speed), 0, 25) * 0.4;
  }
  if (G.shake > 0) { cam.position.x += (Math.random() - 0.5) * G.shake * 0.5; cam.position.y += (Math.random() - 0.5) * G.shake * 0.4; G.shake = Math.max(0, G.shake - dt * 3); }
  const hz = $('#haze'); G.hazeK = damp(G.hazeK || 0, G.state !== 'menu' && G.haze ? 1 : 0, 4, dt); hz.style.opacity = G.hazeK.toFixed(2);
  cam.updateProjectionMatrix();
  // the rear-view mirror: slides down while you're backing up
  G.mirror = damp(G.mirror, G.reversing && G.state === 'race' ? 1 : 0, 10, dt);
  if (G.mirror > 0.02) {
    const h = S.segway ? 1.7 : 1.25;
    mirrorCam.position.set(B.x - fx * (S.segway ? 0.3 : S.len * 0.1), B.y + h, B.z - fz * (S.segway ? 0.3 : S.len * 0.1));
    mirrorCam.lookAt(B.x - fx * 30, B.y + h - 0.6, B.z - fz * 30);
  }
}
// Menus: the selected circuit from overhead (the Routes map), the car on show at its pole slot.
function menuCamera() {
  const r = G.route, b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const s of routeSamples(r, 6)) { b.x0 = Math.min(b.x0, s.x); b.x1 = Math.max(b.x1, s.x); b.z0 = Math.min(b.z0, s.z); b.z1 = Math.max(b.z1, s.z); }
  const a = innerWidth / innerHeight, wide = innerWidth > 760, pad = 16;
  const w = b.x1 - b.x0 + pad * 2, d = b.z1 - b.z0 + pad * 2, fracX = wide ? 0.52 : 1, fracY = wide ? 0.86 : 0.42;
  const half = Math.max(d / 2 / fracY, w / 2 / a / fracX);
  ocam.left = -half * a; ocam.right = half * a; ocam.top = half; ocam.bottom = -half;
  // (the menu panel sits on the left on a wide screen, at the bottom on a phone: the map fills the rest)
  const cx = (b.x0 + b.x1) / 2 - (wide ? half * a * (1 - fracX) : 0), cz = (b.z0 + b.z1) / 2 + (wide ? 0 : half * (1 - fracY) - half * 0.12);
  ocam.position.set(cx, 400, cz); ocam.up.set(0, 0, -1); ocam.lookAt(cx, 0, cz); ocam.updateProjectionMatrix();
}
function render() {
  const menu = G.state === 'menu';
  if (menu !== R.mapOn) { // the map is drawn sharp, unfogged, skyless, with crowns; the race isn't
    R.mapOn = menu; R.native = menu; resize();
    mapExtras.visible = menu; skyDome.visible = !menu;
    if (menu) { scene.fog.near = 1e4; scene.fog.far = 2e4; } else stage.applyLight(light);
  }
  mapLayers.forEach((g, k) => { g.visible = menu && ROUTES[k] === G.route; });
  cullStep(menu);
  R.render(scene, menu ? ocam : cam);
  if (!menu && G.mirror > 0.02) {
    const w = Math.round(Math.min(440, innerWidth * 0.5)), h = Math.round(w * 0.3 * G.mirror), x = Math.round((innerWidth - w) / 2), y = 10;
    if (h > 4) { mirrorCam.aspect = w / Math.max(1, Math.round(w * 0.3)); mirrorCam.updateProjectionMatrix(); R.renderInset(scene, mirrorCam, x, y, w, h); }
    Object.assign($('#mirror').style, { display: 'block', left: `${x - 4}px`, top: `${y - 4}px`, width: `${w + 8}px`, height: `${h + 8}px` });
  } else $('#mirror').style.display = 'none';
}

// ------------------------------------------------------------------ HUD
function setHud(on) { document.body.classList.toggle('racing', on); }
function msg(text, t, cls = '') { const el = $('#msg'); el.textContent = text; el.className = ''; if (text) { void el.offsetWidth; el.className = `on ${cls}`; } G.msgT = t; } // (the reflow restarts the slam)
function hud() {
  const P = G.player; if (!P) return;
  if (G.mode === 'combat') return combatHud(P);
  const st = standings(), pos = st.indexOf(P) + 1, lapNow = P.finished ? G.track.laps : clamp(P.c, 1, G.track.laps), lapT = G.state === 'race' && !P.finished ? G.t - P.lapStart : (P.laps.at(-1) ?? 0);
  $('#h-pos').innerHTML = G.mode === 'race' ? `${ordinal(pos).replace(/(\d+)(\D+)/, '$1<small>$2</small>')}<i>/${G.racers.length}</i>` : '<span class="tt">TIME TRIAL</span>';
  $('#h-lap').textContent = G.track.open ? `${Math.round(clamp(P.prog, 0, 1) * 100)}% TO THE MALL` : `LAP ${lapNow}/${G.track.laps}`;
  $('#h-time').textContent = fmt(P.finished ? P.finishT : G.t);
  $('#h-laps').innerHTML = `<span class="lbl">LAP</span>${fmt(lapT)}<br><span class="lbl">BEST</span>${fmt(P.best)}`;
  speedo(Math.abs(P.body.speed) * 2.237);
  $('#h-ghost').innerHTML = G.mode === 'tt' ? `<span class="lbl">GHOST</span><b>${G.ghost.label}</b> ${fmt(G.ghost.t)}${G.splits.length ? ` <span class="${G.splits.at(-1) < 0 ? 'good' : 'bad'}">${fmtD(G.splits.at(-1))}</span>` : ''}` : '';
}

function combatHud(P) {
  const left = combat.alive().length;
  $('#h-pos').innerHTML = `${left}<small> LEFT</small><i>/${G.racers.length}</i>`;
  $('#h-lap').innerHTML = `<span class="hp"><span style="width:${Math.round(clamp(P.hp / 100, 0, 1) * 100)}%" class="${P.hp < 25 ? 'low' : P.hp < 50 ? 'mid' : ''}"></span></span>`;
  $('#h-time').textContent = fmt(Math.max(0, COMBAT_TIME - G.t));
  $('#h-laps').innerHTML = `<span class="lbl">KILLS</span>${P.kills}`;
  const w = P.weapon ? WEAPONS[P.weapon] : null;
  $('#h-ghost').innerHTML = P.sawT > 0 ? `<span class="wpn">🪚</span> <b>Chainsaw</b> ${P.sawT.toFixed(1)} s` : w ? `<span class="wpn">${w.icon}</span> <b>${w.name}</b> ×${P.ammo} <span class="lbl">${controls.usedTouch ? 'FIRE' : controls.usedPad ? 'Y' : 'F'}</span>` : '<span class="lbl">NO WEAPON</span> grab a pickup';
  speedo(Math.abs(P.body.speed) * 2.237);
}

// The speedometer: a round cream dial in the corner (Dr. Mow's toy-ink look for now), 0–80 MPH, the number in the middle.
const sp = $('#speedo'), sg = sp.getContext('2d'), INK = '#3b2e5a', POP = "'Luckiest Guy', 'Lilita One', system-ui, sans-serif";
let lastMph = -1;
document.fonts?.load(`20px ${POP}`).then(() => { lastMph = -1; }, () => {});
function speedo(mph) {
  const v = Math.round(mph); if (v === lastMph) return; lastMph = v;
  const w = sp.width, c = w / 2, r = c - 10, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, at = (m) => a0 + (a1 - a0) * clamp(m / 80, 0, 1);
  const ring = (rr, fill) => { sg.beginPath(); sg.arc(c, c, rr, 0, Math.PI * 2); sg.fillStyle = fill; sg.fill(); };
  sg.clearRect(0, 0, w, w);
  ring(r + 6, INK); sg.save(); sg.translate(0, -5); ring(r + 6, INK); ring(r + 1, '#fffdf8'); sg.restore(); // (the hard drop shadow under it)
  const cy = c - 5;
  sg.lineCap = 'round';
  sg.strokeStyle = '#efe9f7'; sg.lineWidth = 9; sg.beginPath(); sg.arc(c, cy, r - 9, a0, a1); sg.stroke();
  sg.strokeStyle = v >= 60 ? '#ee4b5e' : '#3ddc84'; sg.beginPath(); sg.arc(c, cy, r - 9, a0, at(mph)); sg.stroke(); // (the speed fills the arc)
  sg.strokeStyle = '#ee4b5e'; sg.lineWidth = 3; sg.beginPath(); sg.arc(c, cy, r - 2, at(60), a1); sg.stroke(); // (the red zone)
  sg.fillStyle = INK; sg.strokeStyle = INK; sg.font = `${Math.round(w * 0.085)}px ${POP}`; sg.textAlign = 'center'; sg.textBaseline = 'middle';
  for (let m = 0; m <= 80; m += 20) { const a = at(m); sg.fillText(String(m), c + Math.cos(a) * (r - 28), cy + Math.sin(a) * (r - 28) + 1); }
  const a = at(mph);
  sg.lineWidth = 5; sg.beginPath(); sg.moveTo(c, cy); sg.lineTo(c + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); sg.stroke();
  sg.strokeStyle = '#ff8a2a'; sg.lineWidth = 2.5; sg.stroke();
  sg.beginPath(); sg.arc(c, cy, 7, 0, Math.PI * 2); sg.fillStyle = INK; sg.fill();
  sg.font = `${Math.round(w * 0.2)}px ${POP}`; sg.lineJoin = 'round'; sg.lineWidth = 6; sg.strokeStyle = INK; sg.strokeText(String(v), c, cy + r * 0.5); sg.fillStyle = '#ffd45e'; sg.fillText(String(v), c, cy + r * 0.5);
  sg.fillStyle = INK; sg.font = `${Math.round(w * 0.07)}px ${POP}`; sg.fillText('MPH', c, cy + r * 0.78);
}

// ------------------------------------------------------------------ menus (keys / pad / touch / mouse)
const menu = { screen: null, items: [], focus: 0, back: null };
function showMenu(screen) {
  const el = $('#menu');
  menu.screen = screen;
  if (!screen) { el.className = ''; el.innerHTML = ''; if (G.state === 'menu') G.state = 'idle'; return; }
  if (screen !== 'pause' && screen !== 'results') { clearRace(); G.state = 'menu'; setHud(false); props.reset(); msg('', 0); }
  const S = SCREENS[screen]();
  el.className = `on ${screen}`;
  el.innerHTML = `<div class="panel">${S.head || ''}<div class="items">${S.items.map((it, i) => `<button data-i="${i}" class="${it.cls || ''}">${it.html}</button>`).join('')}</div>${S.foot || ''}</div>`;
  menu.items = S.items; menu.back = S.back || null; menu.focus = clamp(S.focus ?? 0, 0, S.items.length - 1);
  el.querySelectorAll('button[data-i]').forEach((b) => {
    b.addEventListener('click', () => pick(+b.dataset.i));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { menu.focus = +b.dataset.i; paintFocus(); } });
  });
  paintFocus();
}
function paintFocus() {
  document.querySelectorAll('#menu button[data-i]').forEach((b) => b.classList.toggle('focus', +b.dataset.i === menu.focus));
  menu.items[menu.focus]?.hover?.();
}
function pick(i) { const it = menu.items[i]; if (it) { menu.focus = i; it.go(); } }
controls.onMenu = (d) => {
  if (!menu.screen) return;
  if (d === 'up' || d === 'left') { menu.focus = (menu.focus - 1 + menu.items.length) % menu.items.length; paintFocus(); }
  else if (d === 'down' || d === 'right') { menu.focus = (menu.focus + 1) % menu.items.length; paintFocus(); }
  else if (d === 'ok') pick(menu.focus);
  else if (d === 'back' && menu.back) menu.back();
};
controls.onAction = (a) => {
  if (a === 'pause' && (G.state === 'race' || G.state === 'countdown')) { G.paused = G.state; G.state = 'paused'; showMenu('pause'); return; }
  if (a === 'mute') { toggleMute(); if (G.state === 'race') msg(muted ? 'SOUND OFF' : 'SOUND ON', 0.8); return; }
  if (G.state !== 'race') return;
  if (a === 'fire') { if (G.mode === 'combat') { combat.fire(G.player); return; } a = 'camera'; } // (Y is the camera outside Motor Murder)
  if (a === 'camera') { G.camMode = G.camMode === 'chase' ? 'bumper' : 'chase'; store.set('cam', G.camMode); msg(G.camMode === 'chase' ? 'CHASE CAM' : 'BUMPER CAM', 0.8); }
  if (a === 'reset' && !G.player.finished) G.player.respawn();
  if (a === 'hop') G.hop = true;
};

function toggleMute() { muted = !muted; store.set('muted', muted); audio.setMuted(muted); }
const circuits = () => (G.mode === 'combat' ? ROUTES.filter((r) => !r.open) : ROUTES); // (the last run is a run, not an arena)
const best = (rk, ck) => store.get(`best:${rk}:${ck}`);
const bar = (v) => `<span class="bar"><span style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></span></span>`;
const SCREENS = {
  title: () => ({
    head: `<h1 class="logo" aria-label="Suburban Turismo">${['SUBURBAN', 'TURISMO'].map((w, k) => `<span class="w w${k + 1}">${[...w].map((c, i) => `<span style="--i:${i + k * 8}">${c}</span>`).join('')}</span>`).join('')}</h1><p class="tag">Racing in the neighbourhood. Mind the hedges.</p>`,
    items: [
      { html: 'Race <small>3 laps against five of the neighbours</small>', go: () => { G.mode = 'race'; showMenu('circuit'); } },
      { html: 'Time Trial <small>you against the ghost: beat the pro, then yourself</small>', go: () => { G.mode = 'tt'; showMenu('circuit'); } },
      { html: 'Motor Murder <small>the death match: fireworks, frozen turkeys, chainsaws, truck nuts; last car running wins</small>', cls: 'murder', go: () => { G.mode = 'combat'; if (G.route.open) G.route = ROUTES[0]; showMenu('circuit'); } },
      { html: 'The Last Run <small>final level: every location, every cop in the county, finish at the mall</small>', cls: 'final', go: () => { G.mode = 'race'; G.route = ROUTES.find((r) => r.final); showMenu('car'); } },
      { html: `Time of day <small>◀ ${LIGHTS[light].name} ▶</small>`, cls: 'opt', go: () => { const ks = Object.keys(LIGHTS); light = ks[(ks.indexOf(light) + 1) % ks.length]; store.set('light', light); showMenu('title'); menu.focus = 4; paintFocus(); } },
      { html: `Season <small>◀ ${season === 'winter' ? 'Winter (snow)' : 'Autumn'} ▶</small>`, cls: 'opt', go: () => { store.set('season', season === 'winter' ? 'autumn' : 'winter'); const q = new URLSearchParams(location.search); q.delete('season'); location.search = q.toString(); } }, // (the town is repainted: reload)
      { html: `Camera <small>◀ ${G.camMode === 'chase' ? 'Chase' : 'Bumper'} ▶</small>`, cls: 'opt', go: () => { G.camMode = G.camMode === 'chase' ? 'bumper' : 'chase'; store.set('cam', G.camMode); showMenu('title'); menu.focus = 6; paintFocus(); } },
      { html: `Sound <small>◀ ${muted ? 'Off' : 'On'} ▶</small>`, cls: 'opt', go: () => { toggleMute(); showMenu('title'); menu.focus = 7; paintFocus(); } },
      ...(ART_TEST ? [{ html: 'Art test <small>the locations, cars and cast up close</small>', go: () => { location.href = 'viewer.html'; } }] : []),
    ],
    foot: '<p class="keys"><b>Keys</b> W/↑ gas · S/↓ brake, reverse · A D steer · brake + steer drifts · F fire · C camera · R back on track · Esc pause<br><b>Pad</b> RT / A gas · LT / B brake · stick steer · brake + steer drifts · Y fire (camera in races) · RB camera · Back reset · Start pause<br><b>Touch</b> drag the left half to steer · pedals on the right</p>',
  }),
  circuit: () => ({
    head: `<h2>${{ race: 'Race', tt: 'Time Trial', combat: 'Motor Murder' }[G.mode]} · ${G.mode === 'combat' ? 'Arena' : 'Circuit'}</h2>`,
    back: () => showMenu('title'),
    focus: Math.max(0, circuits().indexOf(G.route)),
    items: [...circuits().map((r, i) => { const b = best(r.key, G.car); return { html: `<b>${i + 1}</b> ${r.name} <small>${(routeLength(r) / 1000).toFixed(2)} km · ${G.mode === 'combat' ? 'six cars, 3 minutes' : r.open ? 'one run, start to finish' : '3 laps'}${G.mode === 'tt' && b ? ` · best ${fmt(b.t)}` : ''}</small>`, hover: () => { G.route = r; $('#menu .blurb') && ($('#menu .blurb').textContent = r.blurb); }, go: () => { G.route = r; showMenu('car'); } }; }),
      { html: '◀ Back', cls: 'back', go: () => showMenu('title') }],
    foot: `<p class="blurb">${G.route.blurb}</p>`,
  }),
  car: () => ({
    head: `<h2>${G.route.name} · Car</h2>`,
    back: () => showMenu('circuit'),
    focus: VEHICLE_ORDER.indexOf(G.car),
    items: [...VEHICLE_ORDER.map((k) => { const S = VEHICLES[k], H = handlingFor(k), b = G.mode === 'tt' ? best(G.route.key, k) : null; return { html: `${S.name} <small>${S.kind}${b ? ` · best ${fmt(b.t)}` : ''}</small><span class="stats">Speed ${bar(H.CRUISE / 24)} Pickup ${bar(H.ACCEL / 1.7)} Grip ${bar(Math.min(H.GRIP, 7) / 7)}</span>`, hover: () => { $('#menu .blurb') && ($('#menu .blurb').textContent = S.blurb); }, go: () => { G.car = k; store.set('car', k); go(); } }; }),
      { html: '◀ Back', cls: 'back', go: () => showMenu('circuit') }],
    foot: `<p class="blurb">${VEHICLES[G.car].blurb}</p>`,
  }),
  pause: () => ({
    head: '<h2>Paused</h2>', back: resume,
    items: [{ html: 'Resume', go: resume }, { html: 'Restart', go: () => go() }, { html: `Camera <small>◀ ${G.camMode === 'chase' ? 'Chase' : 'Bumper'} ▶</small>`, cls: 'opt', go: () => { G.camMode = G.camMode === 'chase' ? 'bumper' : 'chase'; store.set('cam', G.camMode); showMenu('pause'); menu.focus = 2; paintFocus(); } }, { html: 'Quit to menu', go: () => showMenu('title') }],
  }),
  results: () => {
    const P = G.player, st = standings();
    let head;
    if (G.mode === 'combat') { const cs = combat.standing(), me = cs.indexOf(P); head = `<h2>${me === 0 ? 'Last car standing!' : P.dead ? `Wrecked: ${ordinal(me + 1)} of ${cs.length}` : `Survived: ${ordinal(me + 1)} on health`}</h2><table>${cs.map((r, i) => `<tr class="${r === P ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${r.dead ? 'wrecked' : `${Math.ceil(r.hp)} hp`}</td><td>${r.kills} kill${r.kills === 1 ? '' : 's'}</td></tr>`).join('')}</table>`; }
    else if (G.mode === 'race') head = `<h2>${G.route.final ? (st.indexOf(P) === 0 ? 'You made it to the mall' : `Busted: ${st.indexOf(P)} cruiser${st.indexOf(P) > 1 ? 's' : ''} got there first`) : `${ordinal(st.indexOf(P) + 1)} place`}</h2><table>${st.map((r, i) => `<tr class="${r === P ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${r.chase ? 'Police cruiser' : VEHICLES[r.key].kind}</td><td>${r.finished ? fmt(r.finishT) : G.track.open ? `${Math.round(clamp(r.prog, 0, 1) * 100)}%` : `lap ${clamp(r.c, 1, G.track.laps)}`}</td></tr>`).join('')}</table>`;
    else head = `<h2>${G.newBest ? 'New best!' : 'Time trial'}</h2><table><tr class="me"><td>You</td><td>${fmt(P.finishT)}</td></tr><tr><td>Pro</td><td>${fmt(G.pro.t)}</td></tr>${G.best ? `<tr><td>Previous best</td><td>${fmt(G.best.t)}</td></tr>` : ''}</table><p class="note">${G.beatPro ? 'You beat the pro. From now on the ghost is your own best run.' : `The pro was ${(P.finishT - G.pro.t).toFixed(2)} s quicker. Beat that and the ghost becomes your own best run.`}</p><p class="note">Laps: ${P.laps.map(fmt).join(' · ')}</p>`;
    return { head, back: () => showMenu('title'), items: [{ html: G.mode === 'combat' ? 'Rematch' : 'Race again', go: () => go() }, { html: G.mode === 'combat' ? 'Another arena' : 'Another circuit', go: () => showMenu('circuit') }, { html: 'Main menu', go: () => showMenu('title') }] };
  },
};
function go() { if (G.mode === 'tt' && !proCache.has(`${G.route.key}:${G.car}`) && !store.get(`pro:${G.route.key}:${G.car}`)) { msg('Timing the pro…', 5); setTimeout(() => startRace(), 30); } else startRace(); }
function resume() { showMenu(null); G.state = G.paused || 'race'; }
function showResults() { if (G.state === 'results') return; G.state = 'results'; G.reversing = false; showMenu('results'); }

// ------------------------------------------------------------------ touch buttons, resize, start
controls.bindPedal($('#t-gas'), 'gas'); controls.bindPedal($('#t-brake'), 'brake');
controls.bindButton($('#t-cam'), 'camera'); controls.bindButton($('#t-fire'), 'fire'); controls.bindButton($('#t-reset'), 'reset'); controls.bindButton($('#t-pause'), 'pause');
const ART_TEST = !window.SINGLE_FILE; // (the single-file build has no viewer.html next to it)
function resize() { const w = innerWidth, h = innerHeight; R.resize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
addEventListener('resize', resize);
if (params.get('ps1') === '0') { PS1.jitter = 0; PS1.affine = 0; }
G.car = VEHICLE_ORDER.includes(params.get('car')) ? params.get('car') : (VEHICLE_ORDER.includes(store.get('car')) ? store.get('car') : 'sedan');
resize(); stage.applyLight(light); warmShaders();
const qRoute = ROUTES.find((r) => r.key === params.get('circuit'));
if (qRoute) G.route = qRoute;
if (['race', 'tt', 'combat'].includes(params.get('mode'))) { G.mode = params.get('mode'); showMenu('title'); startRace(); } else showMenu('title');
$('#loading')?.remove();
requestAnimationFrame(frame);

// For the test tool and the console.
window.GAME = { G, R, scene, cam, people, combat, startRace, tick, render, showMenu, standings, proGhost, props, get state() { return G.state; } };
