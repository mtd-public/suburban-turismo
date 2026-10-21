// Suburban Turismo — art test. One town, four ways to look at it:
//   Locations  a slow camera tour of each sample location
//   Garage     the five test vehicles on a turntable in the Promenade lot
//   Cast       each suburban character, framed where they live
//   Drive      take any of the five round the town (store-smash's controller, Driver-style chase cam and HUD)
// Plus a PS1 panel: resolution, vertex jitter, affine warp, dither, fog and the time of day, so the dose of
// "PS1" can be judged and tuned live.
import * as THREE from 'three';
import { PS1, PS1Renderer, basic } from './ps1.js';
import * as T from './tex.js';
import { FOLIAGE } from './geo.js';
import { buildTown, LOCATIONS } from './town.js';
import { buildVehicle, poseVehicle, VEHICLES, VEHICLE_ORDER } from './cars.js';
import { buildPerson, posePerson, CAST, CAST_ORDER } from './people.js';
import { createWorld, groundAt, platsNear, contains } from './world.js';
import { createBody, driveStep } from './drive.js';
import { HANDLING, DT } from './tuning.js';
import { Input } from './input.js';
import { Props } from './props.js';
import { wallAt } from './world.js';
import { clamp, damp, lerp } from './utils.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ renderer, scene, light
const canvas = $('#game');
const R = new PS1Renderer(canvas);
R.r.useLegacyLights = true; // (intensity 1 = full colour: the numbers below read like 1997's)
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(55, 1, 0.5, 450);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5), sun = new THREE.DirectionalLight(0xffffff, 1);
scene.add(hemi, sun, sun.target);
scene.fog = new THREE.Fog(0xcccccc, PS1.fogNear, PS1.fogFar);

export const LIGHTS = {
  autumn: { name: 'Autumn afternoon', sun: 0xffe0b4, si: 1.0, dir: [-0.55, 0.6, 0.5], sky: 0xc4d0e4, ground: 0x6e5c46, hi: 0.55, fog: 0xd6ccba, near: 1, zenith: '#5d82bc', horizon: '#c6cdd6', haze: '#ddd2c0', leaf: 0xf4ece0, cloud: '#ffffff' },
  golden: { name: 'Golden hour', sun: 0xffb46a, si: 1.15, dir: [-0.8, 0.28, 0.3], sky: 0xc8a894, ground: 0x4a3a30, hi: 0.5, fog: 0xe2b48c, near: 0.85, zenith: '#5a6ea6', horizon: '#e4ae84', haze: '#f2c494', leaf: 0xffd6a8, cloud: '#ffe0c0' },
  overcast: { name: 'Overcast (Driver)', sun: 0xdadee2, si: 0.45, dir: [-0.3, 0.8, 0.4], sky: 0xbcc0c8, ground: 0x6c6860, hi: 0.8, fog: 0xb6bac0, near: 0.6, zenith: '#8a929e', horizon: '#b4b8be', haze: '#bcc0c4', leaf: 0xbcbcbc, cloud: '#d8dade' },
  dusk: { name: 'Dusk, streetlights on', sun: 0x7a80b8, si: 0.3, dir: [0.4, 0.3, -0.6], sky: 0x46507a, ground: 0x1e1c24, hi: 0.5, fog: 0x2e3450, near: 0.55, zenith: '#141c3a', horizon: '#3e4670', haze: '#7a6070', leaf: 0x4a4a64, cloud: '#5a5a7a' },
};
let light = params.get('light') in LIGHTS ? params.get('light') : 'autumn';
const skyMat = basic(0xffffff, null, { fog: false, depthWrite: false, side: THREE.BackSide });
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2 + 0.25), skyMat);
skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);

// ------------------------------------------------------------------ the town, people, vehicles
const town = buildTown();
scene.add(town.group, town.pools);
function applyLight(k) {
  light = k; const L = LIGHTS[k];
  sun.color.setHex(L.sun); sun.intensity = L.si; sun.position.set(...L.dir).multiplyScalar(100);
  hemi.color.setHex(L.sky); hemi.groundColor.setHex(L.ground); hemi.intensity = L.hi;
  scene.fog.color.setHex(L.fog); scene.fog.near = PS1.fogNear * L.near; scene.fog.far = PS1.fogFar * L.near;
  skyMat.map = T.sky({ name: k, ...L }); skyMat.needsUpdate = true;
  town.pools.visible = k === 'dusk';
  for (const f of FOLIAGE) f.color.setHex(L.leaf);
  document.querySelectorAll('[data-light]').forEach((b) => b.classList.toggle('on', b.dataset.light === k));
}

const W = createWorld({ plats: [...town.plats, ...town.glass.map((g) => g.plat)], posts: [...town.posts] });
// things to hit: loose props, the CityMart glass, shelf stock
const props = new Props(scene, W);
for (const [k, x, z, ry] of town.dyn) props.spawn(k, x, z, ry ?? 0);
for (const g of town.glass) { scene.add(g.mesh); props.addGlass(g.mesh, g.plat); }
props.onEvent = (type) => { if (type === 'glass') { hud.damage = Math.min(1, hud.damage + 0.05); flash('SMASH!'); } };
let flashT = 0;
function flash(t) { const el = $('#flash'); if (!el) return; el.textContent = t; el.classList.add('on'); flashT = 0.9; }
const people = {};
for (const k of CAST_ORDER) {
  if (k === 'dale') continue; // (Dale rides his Segway)
  const s = town.spots[k]; if (!s) continue;
  const p = buildPerson(k); p.position.set(s.x, groundAt(W, s.x, s.z, 3).h, s.z); p.rotation.y = s.ry; scene.add(p);
  p.userData.spot = s; people[k] = p;
}
const dale = buildVehicle('segway'); { const s = town.spots.dale; dale.position.set(s.x, groundAt(W, s.x, s.z, 3).h, s.z); dale.rotation.y = s.ry; scene.add(dale); }

// The vehicle on show (garage) / being driven.
let vi = Math.max(0, VEHICLE_ORDER.indexOf(params.get('car') || 'minivan'));
let car = null;
const GARAGE = { x: 8, z: 51 };
const body = createBody(HANDLING.car, -60, 0, 3.5, Math.PI / 2);
function setVehicle(i) {
  vi = (i + VEHICLE_ORDER.length) % VEHICLE_ORDER.length;
  if (car) scene.remove(car);
  car = buildVehicle(VEHICLE_ORDER[vi]); scene.add(car);
  const S = VEHICLES[VEHICLE_ORDER[vi]];
  const base = HANDLING.car, len = S.len;
  body.H = { ...base, ...S.handling, CIRCLES: S.segway ? [[0, 0.45]] : [[len * 0.27, S.width / 2], [0, S.width / 2], [-len * 0.27, S.width / 2]], WALL_MARGIN: S.segway ? 0.4 : S.width / 2 };
}

// ------------------------------------------------------------------ smoke (tyre smoke sprites, pooled)
const smokeM = basic(0xffffff, T.smoke(), { transparent: true, depthWrite: false, opacity: 0.7 });
const puffs = Array.from({ length: 40 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke(), transparent: true, depthWrite: false })); s.visible = false; s.userData = { t: 0 }; scene.add(s); return s; });
let puffI = 0;
function puff(x, y, z) { const s = puffs[puffI++ % puffs.length]; s.position.set(x, y, z); s.visible = true; s.userData.t = 0; s.userData.v = 0.6 + Math.random() * 0.6; }
function tickPuffs(dt) { for (const s of puffs) if (s.visible) { const u = s.userData; u.t += dt; const k = u.t / 1.1; if (k >= 1) { s.visible = false; continue; } s.scale.setScalar(0.8 + k * 3); s.position.y += u.v * dt; s.material.opacity = 0.65 * (1 - k); } }
void smokeM;

// ------------------------------------------------------------------ modes
let mode = ['tour', 'garage', 'cast', 'drive'].includes(params.get('mode')) ? params.get('mode') : 'tour';
let li = clamp(+params.get('i') || 0, 0, LOCATIONS.length - 1), camI = +params.get('cam') || 0, ci = 0, modeT = 0;
if (mode === 'cast') ci = clamp(+params.get('i') || 0, 0, CAST_ORDER.length - 1);
if (mode === 'garage') vi = clamp(+params.get('i') || vi, 0, VEHICLE_ORDER.length - 1);
const hud = { damage: 0, complaints: 0 };
const input = new Input(canvas);

function setMode(m) {
  mode = m; modeT = 0;
  document.body.dataset.mode = m;
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === m));
  input.enabled = m === 'drive';
  if (m === 'garage' || m === 'drive') setVehicle(vi);
  else if (car) { scene.remove(car); car = null; }
  if (m !== 'drive') props.reset();
  if (m === 'drive') { Object.assign(body, { x: -60, y: 0, z: 3.5, heading: Math.PI / 2, vh: Math.PI / 2, speed: 0, vy: 0, grounded: true }); hud.damage = 0; hud.complaints = 0; camState.init = false; }
  caption();
}
function step(d) {
  if (mode === 'tour') { camI++; if (camI >= LOCATIONS[li].cams.length || d < 0) { li = (li + d + LOCATIONS.length) % LOCATIONS.length; camI = 0; } }
  else if (mode === 'garage' || mode === 'drive') setVehicle(vi + d);
  else if (mode === 'cast') ci = (ci + d + CAST_ORDER.length) % CAST_ORDER.length;
  modeT = 0; caption();
}
function warp() { Object.assign(body, { x: 90, y: 0, z: -40, heading: Math.PI, vh: Math.PI, speed: 0, vy: 0, grounded: true }); camState.init = false; }
function caption() {
  let title = '', sub = '', blurb = '';
  if (mode === 'tour') { const L = LOCATIONS[li]; title = L.name; sub = `Location ${li + 1} of ${LOCATIONS.length} · view ${camI + 1}/${L.cams.length}`; blurb = L.blurb; }
  else if (mode === 'garage' || mode === 'drive') { const S = VEHICLES[VEHICLE_ORDER[vi]]; title = S.name; sub = `${S.kind}${mode === 'drive' ? ' · driving' : ''}`; blurb = mode === 'drive' ? 'WASD / arrows or the stick to drive, Space to hop, ◀ ▶ to swap vehicles, G to jump to the CityMart lot, R to put everything back. The CityMart doors are glass.' : S.blurb; }
  else if (mode === 'cast') { const C = CAST[CAST_ORDER[ci]]; title = C.name; sub = C.title; blurb = C.blurb; }
  $('#cap-title').textContent = title; $('#cap-sub').textContent = sub; $('#cap-blurb').textContent = blurb;
}

// ------------------------------------------------------------------ cameras
const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
const tmp = new THREE.Vector3();
function cameraFor(dt) {
  const t = modeT;
  if (mode === 'tour') {
    const [p, l] = LOCATIONS[li].cams[camI % LOCATIONS[li].cams.length];
    const dx = l[0] - p[0], dz = l[2] - p[2], len = Math.hypot(dx, dz) || 1, drift = Math.sin(t * 0.12) * 4;
    cam.position.set(p[0] - dz / len * drift, p[1], p[2] + dx / len * drift); cam.lookAt(l[0], l[1], l[2]); cam.fov = 55;
  } else if (mode === 'garage') {
    const S = VEHICLES[VEHICLE_ORDER[vi]], r = S.segway ? 3.2 : S.len * 1.15 + 1.2, a = t * 0.35 + 0.8;
    car.position.set(GARAGE.x, 0, GARAGE.z); car.rotation.y = 0;
    cam.position.set(GARAGE.x + Math.sin(a) * r, S.segway ? 1.4 : 1.5, GARAGE.z + Math.cos(a) * r); cam.lookAt(GARAGE.x, S.segway ? 0.8 : 0.7, GARAGE.z); cam.fov = 50;
  } else if (mode === 'cast') {
    const k = CAST_ORDER[ci], s = k === 'dale' ? { x: dale.position.x, z: dale.position.z, ry: dale.rotation.y } : town.spots[k];
    const p = k === 'dale' ? dale : people[k], fy = p.position.y + (k === 'dale' ? 0.27 : 0);
    const a = s.ry + Math.sin(t * 0.3) * 0.35, r = 3.2;
    cam.position.set(p.position.x + Math.sin(a) * r, fy + 1.45, p.position.z + Math.cos(a) * r); cam.lookAt(p.position.x, fy + 1.05, p.position.z); cam.fov = 45;
  } else if (mode === 'drive') { // Driver's chase cam: low, close, lagging the heading a little
    const S = VEHICLES[VEHICLE_ORDER[vi]], back = S.segway ? 3.6 : 6.5, up = S.segway ? 2.0 : 2.3;
    const fx = Math.sin(body.heading), fz = Math.cos(body.heading);
    tmp.set(body.x - fx * back, body.y + up, body.z - fz * back);
    // pull in rather than sit inside a shelf or a wall (the store aisles are narrow)
    for (let k = 0.15; k <= 1.001; k += 0.05) {
      const x = body.x - fx * back * k, z = body.z - fz * back * k, y = body.y + 1.2 + (up - 1.2) * k;
      if (platsNear(W, x, z).some((p) => !p.ghost && contains(p, x, z, 0.4) && p.bot < y && p.top > y - 0.3)) { tmp.set(body.x - fx * back * (k - 0.05), body.y + 1.2 + (up - 1.2) * (k - 0.05), body.z - fz * back * (k - 0.05)); camState.pos.x = damp(camState.pos.x, tmp.x, 30, dt); camState.pos.z = damp(camState.pos.z, tmp.z, 30, dt); break; }
    }
    if (!camState.init) { camState.pos.copy(tmp); camState.init = true; }
    camState.pos.x = damp(camState.pos.x, tmp.x, 6, dt); camState.pos.z = damp(camState.pos.z, tmp.z, 6, dt); camState.pos.y = damp(camState.pos.y, tmp.y, 4, dt);
    cam.position.copy(camState.pos); cam.lookAt(body.x + fx * 4, body.y + 1.0, body.z + fz * 4); cam.fov = 60 + clamp(body.speed, 0, 25) * 0.4;
  }
  cam.updateProjectionMatrix();
}

// ------------------------------------------------------------------ the frame
const ev = [];
let acc = 0, last = performance.now(), time = 0;
function frame(now) {
  const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20)); last = now; // (template rule 2: clamp at both ends)
  tick(dt);
  R.render(scene, cam);
  requestAnimationFrame(frame);
}
function tick(dt) {
  time += dt; modeT += dt;
  for (const k in people) {
    const p = people[k]; posePerson(p, time);
    const w = p.userData.spot.walk;
    if (w) { // the mall walkers' lap
      const L = w[1][0] - w[0][0], u = ((time * 1.5 + (k === 'ron' ? 0 : 0)) % (2 * L)), fwd = u < L;
      p.position.x = fwd ? w[0][0] + u : w[1][0] - (u - L); p.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2;
      if (mode === 'cast' && CAST_ORDER[ci] === k) { p.position.x = p.userData.spot.x; p.rotation.y = p.userData.spot.ry; }
    }
  }
  posePerson(dale.userData.rider, time);
  if (mode === 'drive' && car) {
    const inp = input.read()[0], d = inp.dir;
    const ctl = d ? { turn: Math.abs(d.x) > 0.15 ? d.x : 0, throttle: d.y < -0.2 ? 1 : d.y > 0.3 ? -1 : (d.mag > 0.2 && !inp.keys ? 0.6 : 0), jump: inp.jump } : { turn: 0, throttle: 0, jump: inp.jump };
    acc += dt; ev.length = 0;
    props.collide(body, dt);
    while (acc >= DT) { driveStep(W, body, ctl, DT, ev); acc -= DT; }
    for (const e of ev) if (e.type === 'crash') { const fx = Math.sin(body.heading), fz = Math.cos(body.heading), L = VEHICLES[VEHICLE_ORDER[vi]].len / 2 + 0.6, hit = wallAt(W, body.x + fx * L, body.z + fz * L, body.y, 0.8, 0.4, 1.6); if (hit?.shelf) props.spill(body.x + fx * L, body.y, body.z + fz * L, fx, fz, e.v); }
    for (const e of ev) if (e.type === 'crash' || e.type === 'scrape') hud.damage = Math.min(1, hud.damage + (e.type === 'crash' ? 0.06 : 0.01) * (e.v / 10));
    car.position.set(body.x, body.y, body.z); car.rotation.y = body.heading; poseVehicle(car, body, dt);
    // drifting smoke, and the HOA meter (anything green under the wheels)
    if (body.grounded && Math.abs(body.slip || 0) > 0.18 && Math.abs(body.speed) > 7 && Math.random() < 0.6) { const S = VEHICLES[VEHICLE_ORDER[vi]]; puff(body.x - Math.sin(body.heading) * S.len * 0.3, body.y + 0.3, body.z - Math.cos(body.heading) * S.len * 0.3); }
    if (body.plat && body.plat.h === 0.15 && Math.abs(body.z) > 7 && Math.abs(body.z) < 9.6 && Math.abs(body.speed) > 2) hud.complaints = Math.min(1, hud.complaints + dt * 0.08);
    hud.damage = Math.max(0, hud.damage - dt * 0.002);
    drawHud();
  } else if (mode === 'garage' && car) { poseVehicle(car, { speed: 0, steer: 0 }, dt); }
  props.step(dt);
  tickPuffs(dt);
  if (flashT > 0 && (flashT -= dt) <= 0) $('#flash')?.classList.remove('on');
  cameraFor(dt);
  skyDome.position.copy(cam.position);
}

// ------------------------------------------------------------------ Driver-style HUD: serif bars + wire minimap
const mini = $('#minimap'), mg = mini.getContext('2d');
const ROADS = [[[-260, 0], [260, 0]], [[-130, 0], [-130, -80]], [[-130, -94, 15]], [[-26, 0], [-26, -18], [12, -18], [12, 0]], [[-120, 0], [-117, 20], [-120, 36], [-98, 36]], [[90, 0], [90, -80]], [[145, 0], [145, -80]], [[56, -24], [186, -24]], [[56, -42], [186, -42]], [[56, -60], [186, -60]], [[56, -78], [186, -78]], [[35, 0], [35, 48]], [[105, 0], [105, 48]], [[-18, 29], [134, 29]], [[-18, 48], [134, 48]]];
function drawHud() {
  $('#bar-dmg').style.width = `${hud.damage * 100}%`; $('#bar-hoa').style.width = `${hud.complaints * 100}%`;
  const w = mini.width, h = mini.height, sc = 0.9;
  mg.clearRect(0, 0, w, h); mg.fillStyle = 'rgba(200,200,205,0.55)'; mg.fillRect(0, 0, w, h);
  mg.save(); mg.translate(w / 2, h / 2); mg.rotate(body.heading + Math.PI); mg.scale(sc, sc); mg.translate(-body.x, -body.z);
  mg.strokeStyle = '#b02848'; mg.lineWidth = 3 / sc;
  for (const r of ROADS) { mg.beginPath(); if (r[0].length === 3) mg.arc(r[0][0], r[0][1], r[0][2], 0, 7); else r.forEach(([x, z], i) => (i ? mg.lineTo(x, z) : mg.moveTo(x, z))); mg.stroke(); }
  mg.restore();
  mg.fillStyle = '#111'; mg.beginPath(); mg.arc(w / 2, h / 2, 3, 0, 7); mg.fill();
  mg.strokeStyle = '#1a2a8a'; mg.lineWidth = 2; mg.strokeRect(1, 1, w - 2, h - 2);
  mg.fillStyle = '#e8e8e8'; mg.font = 'bold 10px Georgia, serif'; mg.fillText('N', w / 2 - 3 + Math.sin(-body.heading - Math.PI) * 30, h / 2 + 4 - Math.cos(-body.heading - Math.PI) * 30);
}

// ------------------------------------------------------------------ UI
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.tab)));
$('#prev').addEventListener('click', () => step(-1)); $('#next').addEventListener('click', () => step(1));
document.querySelectorAll('[data-light]').forEach((b) => b.addEventListener('click', () => applyLight(b.dataset.light)));
$('#btn-ps1').addEventListener('click', () => $('#panel').classList.toggle('open'));
const bindRange = (id, key, fmt = (v) => v) => { const el = $(id); el.value = PS1[key]; const out = el.nextElementSibling; const upd = () => { PS1[key] = +el.value; if (out) out.textContent = fmt(+el.value); if (key === 'lines') resize(); if (key.startsWith('fog')) applyLight(light); }; el.addEventListener('input', upd); upd(); };
bindRange('#r-lines', 'lines', (v) => `${v}p`); bindRange('#r-jitter', 'jitter', (v) => v.toFixed(2)); bindRange('#r-affine', 'affine', (v) => v.toFixed(2)); bindRange('#r-fogfar', 'fogFar', (v) => `${v} m`);
$('#c-dither').checked = !!PS1.dither; $('#c-dither').addEventListener('change', (e) => { PS1.dither = e.target.checked ? 1 : 0; });
$('#c-native').addEventListener('change', (e) => { R.native = e.target.checked; resize(); });
addEventListener('keydown', (e) => {
  if (e.code === 'BracketRight' || e.code === 'KeyN' || (mode !== 'drive' && e.code === 'ArrowRight')) step(1);
  if (e.code === 'BracketLeft' || e.code === 'KeyB' || (mode !== 'drive' && e.code === 'ArrowLeft')) step(-1);
  if (e.code === 'Digit1') setMode('tour'); if (e.code === 'Digit2') setMode('garage'); if (e.code === 'Digit3') setMode('cast'); if (e.code === 'Digit4') setMode('drive');
  if (e.code === 'KeyP') $('#panel').classList.toggle('open');
  if (e.code === 'KeyR' && mode === 'drive') props.reset();
  if (e.code === 'KeyG' && mode === 'drive') warp();
});
function resize() { const w = innerWidth, h = innerHeight; R.resize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
addEventListener('resize', resize);
if (params.get('ps1') === '0') { R.native = true; PS1.jitter = 0; PS1.affine = 0; PS1.dither = 0; $('#c-native').checked = true; }
if (params.get('ui') === '0') document.body.classList.add('noui');
resize(); applyLight(light); setMode(mode);
if (mode === 'tour') camI = Math.min(camI, LOCATIONS[li].cams.length - 1);
caption();
$('#loading')?.remove();
requestAnimationFrame(frame);

// For the screenshot tool and the console.
window.ART = { setMode, step, applyLight, tick, render: () => R.render(scene, cam), PS1, body, props, get mode() { return mode; }, warp, set: (m, i, c = 0) => { setMode(m); if (m === 'tour') { li = i; camI = c; } else if (m === 'cast') ci = i; else { setVehicle(i); } modeT = 2; caption(); }, scene };
