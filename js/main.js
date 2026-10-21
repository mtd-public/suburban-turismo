// Suburban Turismo — art test. One town, four ways to look at it:
//   Locations  a slow camera tour of each sample location
//   Garage     the five test vehicles on a turntable in the Promenade lot
//   Cast       each suburban character, framed where they live
//   Drive      take any of the five round the town (store-smash's controller, Driver-style chase cam and HUD)
//   Routes     the race circuits from overhead, as a see-through layer over the town
// Plus a PS1 panel: resolution, vertex jitter, affine warp, dither, fog and the time of day, so the dose of
// "PS1" can be judged and tuned live.
import * as THREE from 'three';
import { PS1, PS1Renderer, basic } from './ps1.js';
import * as T from './tex.js';
import { FOLIAGE, TREES } from './geo.js';
import { LOCATIONS } from './town.js';
import { buildVehicle, poseVehicle, VEHICLES, VEHICLE_ORDER } from './cars.js';
import { buildPerson, posePerson, CAST, CAST_ORDER } from './people.js';
import { groundAt, platsNear, contains } from './world.js';
import { createStage, LIGHTS, handlingFor, buildMapExtras } from './stage.js';
import { createBody, driveStep } from './drive.js';
import { HANDLING, DT } from './tuning.js';
import { Input } from './input.js';
import { wallAt } from './world.js';
import { clamp, damp, lerp } from './utils.js';
import { ROUTES, buildRouteLayer, routeLength, routeSamples } from './routes.js';
import { Snowfall } from './fx.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ renderer, scene, light, town (js/stage.js)
T.setWinter(params.get('season') === 'winter'); // (?season=winter: the winter tileset, falling snow)
const canvas = $('#game');
const stage = createStage(canvas);
const { R, scene, cam, skyDome, town, W, props, people, dale } = stage;
const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 900); // the Routes map: straight down, north up
const snow = new Snowfall(scene); snow.on = T.WINTER;
const viewCam = () => (mode === 'map' ? ocam : cam);
let light = params.get('light') in LIGHTS ? params.get('light') : 'autumn';
function applyLight(k) {
  light = k; stage.applyLight(k);
  document.querySelectorAll('[data-light]').forEach((b) => b.classList.toggle('on', b.dataset.light === k));
}
props.onEvent = (type) => { if (type === 'glass') { hud.damage = Math.min(1, hud.damage + 0.05); flash('SMASH!'); } };
let flashT = 0;
function flash(t) { const el = $('#flash'); if (!el) return; el.textContent = t; el.classList.add('on'); flashT = 0.9; }
// the race circuits: an overhead layer for the map, a ground-hugging one while driving (T steps through them)
const mapLayers = ROUTES.map((r) => { const g = buildRouteLayer(r); g.visible = false; scene.add(g); return g; });
const driveLayer = new THREE.Group(); scene.add(driveLayer); driveLayer.visible = false;
for (const r of ROUTES) driveLayer.add(buildRouteLayer(r, { heightAt: (x, z) => groundAt(W, x, z, 0.5).h, opacity: 0.5 }));
let showTrack = 0, ri = 0; // (showTrack: 0 off, k the k-th circuit)
// for the map only: flat tree crowns, and grass to the edge of any framing (js/stage.js)
const mapExtras = buildMapExtras(scene);
const routeBox = (rs) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const r of rs) for (const s of routeSamples(r, 6)) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); } return { x0, x1, z0, z1 }; };
const labels = $('#maplabels');
// The vehicle on show (garage) / being driven.
let vi = Math.max(0, VEHICLE_ORDER.indexOf(params.get('car') || 'minivan'));
let car = null;
const GARAGE = { x: 8, z: 51 };
const body = createBody(HANDLING.car, -60, 0, 3.5, Math.PI / 2);
function setVehicle(i) {
  vi = (i + VEHICLE_ORDER.length) % VEHICLE_ORDER.length;
  if (car) scene.remove(car);
  car = buildVehicle(VEHICLE_ORDER[vi]); scene.add(car);
  body.H = handlingFor(VEHICLE_ORDER[vi]);
}

// ------------------------------------------------------------------ smoke (tyre smoke sprites, pooled)
const smokeM = basic(0xffffff, T.smoke(), { transparent: true, depthWrite: false, opacity: 0.7 });
const puffs = Array.from({ length: 40 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke(), transparent: true, depthWrite: false })); s.visible = false; s.userData = { t: 0 }; scene.add(s); return s; });
let puffI = 0;
function puff(x, y, z) { const s = puffs[puffI++ % puffs.length]; s.position.set(x, y, z); s.visible = true; s.userData.t = 0; s.userData.v = 0.6 + Math.random() * 0.6; }
function tickPuffs(dt) { for (const s of puffs) if (s.visible) { const u = s.userData; u.t += dt; const k = u.t / 1.1; if (k >= 1) { s.visible = false; continue; } s.scale.setScalar(0.8 + k * 3); s.position.y += u.v * dt; s.material.opacity = 0.65 * (1 - k); } }
void smokeM;

// ------------------------------------------------------------------ modes
let mode = ['tour', 'garage', 'cast', 'drive', 'map'].includes(params.get('mode')) ? params.get('mode') : 'tour';
let li = clamp(+params.get('i') || 0, 0, LOCATIONS.length - 1), camI = +params.get('cam') || 0, ci = 0, modeT = 0;
if (mode === 'cast') ci = clamp(+params.get('i') || 0, 0, CAST_ORDER.length - 1);
if (mode === 'garage') vi = clamp(+params.get('i') || vi, 0, VEHICLE_ORDER.length - 1);
if (mode === 'map') ri = clamp(+params.get('i') || 0, 0, ROUTES.length);
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
  // the map is drawn sharp, unfogged and skyless; everything goes back when you leave it
  if (m === 'map') { if (!R.mapSaved) R.mapSaved = { native: R.native }; R.native = true; scene.fog.near = 1e4; scene.fog.far = 2e4; }
  else if (R.mapSaved) { R.native = R.mapSaved.native; R.mapSaved = null; applyLight(light); }
  resize(); skyDome.visible = m !== 'map'; mapExtras.visible = m === 'map'; mapRoutes(); showDrive();
  if (m === 'drive') { Object.assign(body, { x: -60, y: 0, z: 3.5, heading: Math.PI / 2, vh: Math.PI / 2, speed: 0, vy: 0, grounded: true }); hud.damage = 0; hud.complaints = 0; camState.init = false; }
  caption();
}
function step(d) {
  if (mode === 'tour') { camI++; if (camI >= LOCATIONS[li].cams.length || d < 0) { li = (li + d + LOCATIONS.length) % LOCATIONS.length; camI = 0; } }
  else if (mode === 'garage' || mode === 'drive') setVehicle(vi + d);
  else if (mode === 'cast') ci = (ci + d + CAST_ORDER.length) % CAST_ORDER.length;
  else if (mode === 'map') { ri = (ri + d + ROUTES.length + 1) % (ROUTES.length + 1); mapRoutes(); }
  modeT = 0; caption();
}
function warp() { Object.assign(body, { x: 90, y: 0, z: -40, heading: Math.PI, vh: Math.PI, speed: 0, vy: 0, grounded: true }); camState.init = false; }
// which circuits the map shows (ri 0 is all of them), and their name tags at the start lines
function mapRoutes() {
  mapLayers.forEach((g, k) => { g.visible = mode === 'map' && (ri === 0 || ri === k + 1); });
  labels.innerHTML = mode !== 'map' ? '' : ROUTES.map((r, k) => (ri === 0 || ri === k + 1 ? `<div data-k="${k}" style="--c:${r.color}"><b>${k + 1}</b> ${r.name}<small>${(routeLength(r) / 1000).toFixed(2)} km</small></div>` : '')).join('');
}
function showDrive() { driveLayer.visible = mode === 'drive' && showTrack > 0; driveLayer.children.forEach((g, k) => { g.visible = k === showTrack - 1; }); }
function caption() {
  let title = '', sub = '', blurb = '';
  if (mode === 'tour') { const L = LOCATIONS[li]; title = L.name; sub = `Location ${li + 1} of ${LOCATIONS.length} · view ${camI + 1}/${L.cams.length}`; blurb = L.blurb; }
  else if (mode === 'garage' || mode === 'drive') { const S = VEHICLES[VEHICLE_ORDER[vi]]; title = S.name; sub = `${S.kind}${mode === 'drive' ? ' · driving' : ''}`; blurb = mode === 'drive' ? 'WASD / arrows or the stick to drive, Space to hop, ◀ ▶ to swap vehicles, G to jump to the CityMart lot, R to put everything back, T to lay each race circuit on the road in turn. The CityMart doors and four of the Promenade shop windows are glass.' : S.blurb; }
  else if (mode === 'cast') { const C = CAST[CAST_ORDER[ci]]; title = C.name; sub = C.title; blurb = C.blurb; }
  else if (mode === 'map') {
    if (!ri) { title = 'Race circuits'; sub = `${ROUTES.length} circuits · overhead`; blurb = 'Racing lines laid over the town, not its streets: they take the road where it is fun and cut across lawns, lots, woods and through the shops where that is more fun. ▶ to look at each one; in Drive, T lays each one on the road.'; }
    else { const r = ROUTES[ri - 1]; title = r.name; sub = `Circuit ${ri} of ${ROUTES.length} · ${(routeLength(r) / 1000).toFixed(2)} km · ${r.laps} laps`; blurb = r.blurb; }
  }
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
  } else if (mode === 'map') { // straight down over the circuit(s), framed above the caption
    const b = routeBox(ri ? [ROUTES[ri - 1]] : ROUTES), pad = 14, a = innerWidth / innerHeight;
    const w = b.x1 - b.x0 + pad * 2, d = b.z1 - b.z0 + pad * 2, capF = (innerHeight > 600 ? 150 : 190) / innerHeight, topF = 56 / innerHeight; // (room for the tabs and the caption)
    const half = Math.max(d / 2 / (1 - capF - topF), w / 2 / a);
    ocam.left = -half * a; ocam.right = half * a; ocam.top = half; ocam.bottom = -half;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2 + half * (capF - topF); // (centred in the space between them)
    ocam.position.set(cx, 400, cz); ocam.up.set(0, 0, -1); ocam.lookAt(cx, 0, cz); ocam.updateProjectionMatrix();
    const placed = [];
    for (const el of labels.children) { // pinned to the start line, nudged down when two starts are close
      const s = mapLayers[+el.dataset.k].userData.start, v = new THREE.Vector3(s.x, 0, s.z).project(ocam);
      let x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
      while (placed.some(([px, py]) => Math.abs(px - x) < 190 && Math.abs(py - y) < 24)) y += 26;
      placed.push([x, y]); el.style.left = `${x}px`; el.style.top = `${y}px`;
    }
    return;
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
  R.render(scene, viewCam());
  requestAnimationFrame(frame);
}
function tick(dt) {
  time += dt; modeT += dt; snow.step(dt, cam);
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
  if (e.code === 'KeyT' && mode === 'drive') { showTrack = (showTrack + 1) % (ROUTES.length + 1); showDrive(); flash(showTrack ? ROUTES[showTrack - 1].name : 'Circuits off'); }
  if (e.code === 'Digit5') setMode('map');
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
window.ART = { setMode, step, applyLight, tick, render: () => R.render(scene, viewCam()), PS1, body, props, get mode() { return mode; }, warp, set: (m, i, c = 0) => { setMode(m); if (m === 'tour') { li = i; camI = c; } else if (m === 'cast') ci = i; else if (m === 'map') { ri = i; mapRoutes(); } else { setVehicle(i); } modeT = 2; caption(); }, scene };
