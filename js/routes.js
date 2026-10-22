// The race circuits: closed racing lines laid over the town, not tied to its streets. A circuit takes the road
// where the road is fun and cuts across lawns, lots, woods and through shops where that is more fun. Each is a
// smooth closed curve through its waypoints [x, z], drawn as a see-through layer (the Routes tab shows them from
// overhead; T toggles the layer while driving). Trees and parked cars stay off the racing line (town.js asks
// onTrack), everything else on it is an obstacle on purpose.
import * as THREE from 'three';
import { basic, canvasTex } from './ps1.js';

export const TRACK_W = 9;
export const OPEN_START = 20; // (the sample an open run's start line is on: the grid fills the 40 m behind it)

export const ROUTES = [
  {
    key: 'pines', name: 'Whispering Pines GP', color: '#e8a020', laps: 3,
    blurb: 'Up the cul-de-sac on the asphalt, round the island tree, then back down across every front lawn on the west side (the HOA meter fills), over the parkway and round the duck pond loop in Founders Park.',
    pts: [[-88, -3], [-118, -3], [-126, -16], [-126, -60], [-121, -84], [-124, -103], [-138, -106], [-141, -92], [-141, -70], [-141, -40], [-144, -14], [-154, 6], [-166, 30], [-168, 58], [-160, 82], [-140, 100], [-112, 106], [-92, 90], [-110, 58], [-98, 40], [-84, 22], [-78, 4]],
  },
  {
    key: 'drivethru', name: 'Drive-Thru Derby', color: '#d83a2a', laps: 5,
    blurb: 'A short, tight one round McDaniel\'s: up the drive-thru lane past the menu board, a flick past Window 2, round the dumpster pen, down the far side of the lot and a blast along the parkway.',
    pts: [[-20, -24], [-20.5, -40], [-18, -49], [-6, -49], [6, -48], [16, -52], [24, -62], [21, -74], [6, -77], [-14, -75], [-34, -68], [-40, -52], [-40, -30], [-36, -10], [-28, -3], [0, -3], [20, -4], [22, -14], [10, -21]],
  },
  {
    key: 'blackfriday', name: 'Black Friday', color: '#3a7ad8', laps: 3,
    blurb: 'Through the west vestibule glass, the length of CityMart along the action alley between the checkouts and the soda towers, out through the east glass, then a lap of the parking field. (Phase 2 puts the glass back every lap.)',
    pts: [[90, -82], [90.5, -100], [98, -110.5], [120, -111], [140, -110.5], [149, -104], [150, -94], [154, -84], [166, -86], [188, -76], [192, -46], [184, -16], [140, -14], [100, -18], [62, -22], [50, -40], [52, -64], [64, -84], [80, -86]],
  },
  {
    key: 'mallcrawl', name: 'Mall Crawl', color: '#3ab06a', laps: 3,
    blurb: 'In off the parkway, through the plaza past the fountain and straight through Spenser\'s front window, out the loading door, along the service lane behind the shops, back in through Bed, Bath & Bewildered\'s back door and out its front, then the lot and the parkway.',
    pts: [[105, 6], [105, 30], [96, 46], [80, 54], [78, 64], [78, 84], [74, 97], [56, 98], [20, 98], [-6, 98], [-12, 88], [-12, 70], [-10, 58], [2, 50], [30, 48], [35, 30], [38, 6], [60, 3], [85, 3]],
  },
  {
    key: 'grandprix', name: 'Maple Parkway Grand Prix', color: '#b04ad8', laps: 2,
    blurb: 'The long one, a lap of the whole town: the parkway, the Promenade lot, CityMart (in one door, out the other), cut through the woods to McDaniel\'s, down the cul-de-sac and round the bulb, then Founders Park and home.',
    pts: [[-60, 3], [0, 3], [26, 5], [34, 20], [52, 30], [92, 30], [108, 18], [124, 4], [146, -10], [178, -36], [186, -70], [166, -84], [151, -88], [150, -102], [141, -110.5], [120, -111], [100, -110.5], [91, -102], [90, -90], [86, -82], [66, -76], [40, -60], [24, -74], [-2, -77], [-30, -72], [-52, -60], [-76, -38], [-100, -20], [-120, -16], [-126, -34], [-126, -60], [-121, -84], [-122, -104], [-138, -106], [-141, -88], [-141, -50], [-145, -14], [-156, 10], [-168, 50], [-150, 92], [-120, 108], [-94, 86], [-92, 52], [-86, 20], [-74, 4]],
  },
  {
    key: 'finale', name: 'The Last Run', color: '#e83a3a', laps: 1, open: true, final: true,
    blurb: 'The final level, one run across the whole town with every cop in the county behind you: out of the cul-de-sac, round the park, through the drive-thru, in one CityMart window and out the other, up the back of the Promenade and in through Sharper Imagery\'s loading door. The finish is on the other side of its front window.',
    pts: [[-126, -86], [-126, -70], [-126, -40], [-125, -14], [-117, 12], [-112, 38], [-110, 62], [-104, 88], [-114, 104], [-140, 104], [-160, 86], [-164, 60], [-158, 34], [-146, 12], [-128, 3], [-90, 3], [-50, 3], [-34, -4], [-21, -20], [-20.5, -40], [-18, -49], [-6, -49], [6, -48], [16, -52], [24, -62], [32, -72], [50, -78], [70, -86], [86, -84], [90.5, -100], [98, -110.5], [120, -111], [140, -110.5], [149, -104], [150, -94], [154, -84], [172, -66], [182, -40], [170, -18], [150, -2], [146, 16], [146, 50], [146, 82], [140, 97], [122, 98], [113, 90], [113, 76], [113, 62], [104, 54], [86, 51]],
  },
];

const curves = new Map();
export function routeCurve(r) {
  if (!curves.has(r.key)) curves.set(r.key, new THREE.CatmullRomCurve3(r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), !r.open, 'centripetal'));
  return curves.get(r.key);
}
// Evenly spaced samples along the line: [{ x, z, tx, tz }] (tx, tz the unit tangent), ~every `step` m.
export function routeSamples(r, step = 2) {
  const c = routeCurve(r), n = Math.max(16, Math.round(c.getLength() / step)), out = [];
  for (let i = 0; i < n; i++) { const t = i / (r.open ? n - 1 : n), p = c.getPointAt(t), d = c.getTangentAt(t); out.push({ x: p.x, z: p.z, tx: d.x, tz: d.z }); } // (an open run ends on its last point)
  return out;
}
export const routeLength = (r) => routeCurve(r).getLength();

// Is (x, z) on any circuit's racing line (within its half-width plus `pad`)? The town keeps trees and parked cars off it.
let grid = null;
export function onTrack(x, z, pad = 2) {
  if (!grid) { grid = new Map(); for (const r of ROUTES) for (const s of routeSamples(r, 1.5)) { const k = `${Math.floor(s.x / 10)},${Math.floor(s.z / 10)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); } }
  const R = TRACK_W / 2 + pad, gx = Math.floor(x / 10), gz = Math.floor(z / 10);
  for (let i = gx - 1; i <= gx + 1; i++) for (let k = gz - 1; k <= gz + 1; k++) for (const s of grid.get(`${i},${k}`) || []) if ((s.x - x) ** 2 + (s.z - z) ** 2 < R * R) return true;
  return false;
}

// The layer's paint: a see-through band with bold outlined chevrons pointing the way (tinted: the circuit's colour on
// the map; green or red under you, by which way you're going), and red-and-white kerbs at the edges (never tinted).
const bandTex = () => canvasTex(32, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(4, 0, w - 8, h);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(4, 0, 1, h); g.fillRect(w - 5, 0, 1, h); // (bright lane edges)
  const chev = (y0, grow) => { g.beginPath(); g.moveTo(6 - grow, y0 + 13 + grow); g.lineTo(16, y0 - grow); g.lineTo(26 + grow, y0 + 13 + grow); g.lineTo(26 + grow, y0 + 20 + grow); g.lineTo(16, y0 + 7); g.lineTo(6 - grow, y0 + 20 + grow); g.closePath(); g.fill(); };
  for (let k = 0; k < 2; k++) { const y0 = 6 + k * 32; g.fillStyle = 'rgba(10,10,14,0.85)'; chev(y0, 1); g.fillStyle = '#ffffff'; chev(y0, 0); }
}, { repeat: true });
const kerbTex = () => canvasTex(32, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) for (const x of [0, w - 4]) { g.fillStyle = '#ffffff'; g.fillRect(x, y, 4, 8); g.fillStyle = '#d01818'; g.fillRect(x, y + 8, 4, 8); }
}, { repeat: true });
const checkTex = () => canvasTex(16, 4, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x, y, 1, 1); } });
let BAND = null, KERB = null, CHECK = null;

// One circuit as a mesh group. `heightAt(x, z)` puts it on the ground (drive layer); without it the band floats
// at y and draws over everything (the overhead map, so the line shows through shop roofs).
export function buildRouteLayer(r, { heightAt = null, y = 0.6, opacity = 0.75 } = {}) {
  BAND ??= bandTex(); KERB ??= kerbTex(); CHECK ??= checkTex();
  const over = !heightAt, S = routeSamples(r, 2), n = S.length, hw = TRACK_W / 2;
  const pos = [], uv = [], idx = [];
  let v = 0;
  for (let i = 0; i <= (r.open ? n - 1 : n); i++) {
    const s = S[i % n], nx = -s.tz, nz = s.tx;
    if (i) { const p = S[(i - 1) % n]; v += Math.hypot(s.x - p.x, s.z - p.z) / 16; }
    for (const side of [-1, 1]) { const x = s.x + nx * hw * side, z = s.z + nz * hw * side; pos.push(x, over ? y : heightAt(x, z) + 0.07, z); uv.push(side < 0 ? 0 : 1, v); }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const opts = { transparent: true, opacity, depthWrite: false, depthTest: !over, side: THREE.DoubleSide, fog: !over, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const grp = new THREE.Group(), band = new THREE.Mesh(g, basic(new THREE.Color(r.color).getHex(), BAND, opts));
  grp.add(band, new THREE.Mesh(g, basic(0xffffff, KERB, { ...opts, opacity: Math.min(1, opacity + 0.25) })));
  grp.userData.band = band; grp.userData.kerb = grp.children[1];
  // the start/finish line (an open run has a start line part way in, past the grid, and a finish at the end)
  const lineAt = (s) => { const line = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, 2), basic(0xffffff, CHECK, { ...opts, opacity: 0.95 })); line.rotation.set(-Math.PI / 2, Math.atan2(s.tx, s.tz), 0, 'YXZ'); line.position.set(s.x, (over ? y : heightAt(s.x, s.z) + 0.07) + 0.01, s.z); grp.add(line); };
  const s = S[r.open ? OPEN_START : 0]; lineAt(s); if (r.open) lineAt(S[n - 3]);
  for (const m of grp.children) m.renderOrder = over ? 20 : 2;
  grp.userData.start = s;
  return grp;
}
