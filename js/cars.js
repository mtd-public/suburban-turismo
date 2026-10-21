// The test vehicles, built the way Gran Turismo and Driver built theirs: a few hundred polygons, and the detail
// in the textures. Each car is
//   * a lower body: the side profile (with real wheel-arch cut-outs) extruded across the car's width and
//     chamfered, side-painted with door shut lines, handles, trim, rocker shadow and road grime;
//   * a greenhouse: the cabin profile extruded narrower, pulled in at the top (tumblehome), side glass painted
//     on its flanks, windscreen / rear glass / roof coloured per face;
//   * decal planes for the faces that sell it: headlamps, grille, tail-lamps, number plates;
//   * 14-sided wheels with painted rims (hubcaps, alloys, aero covers) and a blob shadow.
// Rounding (so they read as 90s cars, not boxes): the profiles are smoothed (Catmull-Rom), every edge gets a
// rounded bevel, and the body is pinched in plan at the nose and tail, at the shoulders and under the sills.
// Coordinates: +z is the nose, y up, the ground at 0, the car centred on its wheelbase.
import * as THREE from 'three';
import { lam, basic, canvasTex } from './ps1.js';
import { grain, grimeBottom, grit } from './tex.js';
import { blobShadow } from './geo.js';
import { buildPerson } from './people.js';

const hexA = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const css = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const shade = (c, k) => css(hexA(c).map((v) => Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k)))));

// The bottom edge of a side profile, front to rear, with semicircular wheel arches cut into it.
function underline(zF, zR, yb, axles, R, cy) {
  const pts = [[zF, yb]];
  for (const za of axles) { // (front axle first)
    const s = Math.asin(Math.max(-1, Math.min(1, (yb - cy) / R)));
    for (let k = 0; k <= 7; k++) { const a = s + (Math.PI - 2 * s) * (k / 7); pts.push([za + R * Math.cos(a), cy + R * Math.sin(a)]); }
  }
  pts.push([zR, yb]);
  return pts;
}
// Where the profile's outline crosses height y: the frontmost (+z) or rearmost crossing.
function zAt(profile, y, front) {
  let best = front ? -Infinity : Infinity;
  for (let i = 0; i < profile.length; i++) {
    const [z0, y0] = profile[i], [z1, y1] = profile[(i + 1) % profile.length];
    if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
    const z = z0 + (z1 - z0) * (y - y0) / (y1 - y0);
    best = front ? Math.max(best, z) : Math.min(best, z);
  }
  return best;
}

// A polyline through the points, smoothed (centripetal Catmull-Rom) and resampled to n points.
function smoothLine(pts, n) {
  const c = new THREE.CatmullRomCurve3(pts.map(([z, y]) => new THREE.Vector3(z, y, 0)), false, 'centripetal');
  return c.getPoints(n - 1).map((v) => [v.x, v.y]);
}
const sstep = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
// How much narrower than full width the body is at (z, y): pinched at the nose and tail (rounded corners in plan),
// at the shoulders (the crown) and tucked under the sills.
function taper(S, z, y) {
  const zc = (S.zF + S.zR) / 2, half = (S.zF - S.zR) / 2, u = Math.abs(z - zc) / half;
  return (1 - 0.13 * sstep(0.62, 1.02, u) ** 1.5) * (1 - 0.07 * sstep(S.belt - 0.3, S.belt + 0.05, y)) * (1 - 0.06 * sstep(0.42, S.yb, y));
}

// Extrude a (z, y) profile across x, centred, exactly `width` wide; UVs: caps by (z, y) over the bbox, walls by (x, z).
// The bevel rounds every edge (3 segments) and is offset inward, so the outline (and the wheel arches) stay put.
function extrudeProfile(profile, width, bevel = 0.05, segs = 3) {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelOffset: -bevel * 0.8, bevelSegments: segs, curveSegments: 1 });
  g.rotateY(-Math.PI / 2); // shape x → +z (the nose), extrusion → −x
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  g.scale(width / (bb.max.x - bb.min.x), 1, 1);
  g.computeBoundingBox();
  const b = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
  const capEnd = g.groups[0].start + g.groups[0].count;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (i < capEnd) uv.setXY(i, (z - b.min.z) / (b.max.z - b.min.z), (y - b.min.y) / (b.max.y - b.min.y));
    else uv.setXY(i, (x - b.min.x) / (b.max.x - b.min.x), (z - b.min.z) / (b.max.z - b.min.z));
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ textures
// Paint in profile space: a 2D context transformed so (z, y) metres land on the canvas over the given bbox.
function profileCanvas(W, H, bb, paint) {
  return canvasTex(W, H, (g) => {
    g.save();
    g.translate(0, H); g.scale(W / (bb.z1 - bb.z0), -H / (bb.y1 - bb.y0)); g.translate(-bb.z0, -bb.y0);
    paint(g, (bb.z1 - bb.z0) / W); // (metres per pixel, for line widths)
    g.restore();
    grain(g, W, H, 10, 0.12, W + H);
  }, { repeat: false });
}
const bboxOf = (pts) => ({ z0: Math.min(...pts.map((p) => p[0])), z1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) });

function bodySideTex(S, prof) {
  const bb = bboxOf(prof);
  return profileCanvas(256, 64, bb, (g, mpp) => {
    const c = S.color;
    // paint: lighter shoulder (sky reflection), a bright crease, darker flank, darker rocker
    const gr = g.createLinearGradient(0, bb.y1, 0, bb.y0);
    gr.addColorStop(0, shade(c, 0.28)); gr.addColorStop(0.18, shade(c, 0.12)); gr.addColorStop(0.24, shade(c, 0.4));
    gr.addColorStop(0.3, shade(c, 0)); gr.addColorStop(0.75, shade(c, -0.22)); gr.addColorStop(1, shade(c, -0.45));
    g.fillStyle = gr; g.fillRect(bb.z0, bb.y0, bb.z1 - bb.z0, bb.y1 - bb.y0);
    // rocker / lower cladding
    g.fillStyle = S.cladding ? 'rgba(40,40,42,0.9)' : css([0, 0, 0], 0.2); g.fillRect(bb.z0, bb.y0, bb.z1 - bb.z0, 0.12);
    // body-side moulding (chrome on the luxury car, rubber elsewhere)
    if (S.moulding) { g.fillStyle = S.moulding; g.fillRect(bb.z0 + 0.1, S.mouldY, bb.z1 - bb.z0 - 0.2, 0.035); }
    // a police cruiser's white doors and gold star
    if (S.livery === 'police') { g.fillStyle = '#e6e4de'; g.fillRect(S.doors[0], 0.3, S.doors[S.doors.length - 1] - S.doors[0], S.belt - 0.33); g.fillStyle = '#d8b040'; g.beginPath(); g.arc((S.doors[0] + S.doors[1]) / 2, (S.belt + 0.3) / 2, 0.1, 0, Math.PI * 2); g.fill(); }
    // door shut lines and handles
    g.strokeStyle = 'rgba(10,10,12,0.75)'; g.lineWidth = mpp;
    for (const z of S.doors) { g.beginPath(); g.moveTo(z, 0.3); g.lineTo(z + 0.02, S.belt - 0.02); g.stroke(); }
    g.beginPath(); g.moveTo(S.doors[0], S.belt - 0.02); g.lineTo(S.doors[S.doors.length - 1], S.belt - 0.02); g.stroke();
    for (const z of S.handles) { g.fillStyle = S.chromeHandles ? '#d8d8d4' : shade(c, -0.35); g.fillRect(z, S.belt - 0.13, 0.16, 0.035); }
    if (S.slider) { g.fillStyle = 'rgba(15,15,18,0.8)'; g.fillRect(S.doors[1] - 0.05, S.belt - 0.06, S.doors[2] - S.doors[1] + 0.1, 0.02); } // sliding-door track
    // fuel door, side marker lamps
    g.strokeStyle = 'rgba(10,10,12,0.6)'; g.strokeRect(S.fuel, S.belt - 0.2, 0.14, 0.12);
    g.fillStyle = '#e09030'; g.fillRect(bb.z1 - 0.28, 0.6, 0.08, 0.04);
    g.fillStyle = '#b02020'; g.fillRect(bb.z0 + 0.18, 0.6, 0.08, 0.04);
    // dark wheel-well liners round each arch
    g.fillStyle = 'rgba(12,12,12,1)';
    for (const za of S.axles) { g.beginPath(); g.arc(za, S.wheelR, S.archR - 0.01, 0, Math.PI * 2); g.fill(); }
    // road grime kicked up behind each wheel
    for (const za of S.axles) {
      const gg = g.createLinearGradient(za, 0, za - 0.9, 0); gg.addColorStop(0, 'rgba(70,60,45,0.4)'); gg.addColorStop(1, 'rgba(70,60,45,0)');
      g.fillStyle = gg; g.fillRect(za - 0.9, bb.y0, 0.9, 0.35);
    }
    if (S.badge) { g.fillStyle = '#c8c8c8'; g.fillRect(bb.z0 + 0.35, S.belt - 0.28, 0.22, 0.03); }
  });
}
function cabinSideTex(S, cab) {
  const bb = bboxOf(cab);
  return profileCanvas(128, 32, bb, (g, mpp) => {
    // glass first: dark, sky reflection on the upper part, headrests showing through
    const gr = g.createLinearGradient(0, bb.y1, 0, bb.y0);
    gr.addColorStop(0, css([150, 165, 180])); gr.addColorStop(0.35, css([60, 70, 82])); gr.addColorStop(1, css([22, 24, 30]));
    g.fillStyle = gr; g.beginPath(); cab.forEach(([z, y], i) => (i ? g.lineTo(z, y) : g.moveTo(z, y))); g.closePath(); g.fill();
    g.fillStyle = 'rgba(10,10,14,0.6)';
    for (const z of S.headrests) { g.beginPath(); g.ellipse(z, S.belt + 0.3, 0.1, 0.12, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(bb.z0 + 0.6, bb.y1); g.lineTo(bb.z0 + 1.0, bb.y1); g.lineTo(bb.z0 + 0.6, bb.y0); g.lineTo(bb.z0 + 0.2, bb.y0); g.fill(); // a glare streak
    // pillars (body colour, or blacked-out)
    for (const [z0, z1, black] of S.pillars) { g.fillStyle = black ? '#141416' : shade(S.color, 0.05); g.fillRect(z0, bb.y0, z1 - z0, bb.y1 - bb.y0); }
    // frame: stroke the outline thick in body colour (the inset is the window surround), chrome trim on top
    g.lineJoin = 'round';
    g.strokeStyle = shade(S.color, 0.05); g.lineWidth = 0.12; g.beginPath(); cab.forEach(([z, y], i) => (i ? g.lineTo(z, y) : g.moveTo(z, y))); g.closePath(); g.stroke();
    g.strokeStyle = S.chromeTrim ? '#d0d0cc' : '#151517'; g.lineWidth = 0.025; g.beginPath(); cab.forEach(([z, y], i) => (i ? g.lineTo(z, y) : g.moveTo(z, y))); g.closePath(); g.stroke();
    g.fillStyle = shade(S.color, 0.05); g.fillRect(bb.z0, bb.y0, bb.z1 - bb.z0, 0.08); // belt (the body tucks under it)
    // mirrors' sail panel
    g.fillStyle = '#141416'; g.fillRect(S.mirrorZ - 0.1, bb.y0 + 0.05, 0.16, 0.12);
  });
}
// Top surfaces (hood, roof, deck): body colour with a sky-reflection band across and the hood / trunk shut lines.
function bodyTopTex(S, len) {
  return canvasTex(32, 64, (g, w, h) => {
    const c = S.color;
    g.fillStyle = shade(c, 0.08); g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x++) { const k = 1 - Math.abs(x / (w - 1) - 0.5) * 2; g.fillStyle = css([255, 255, 255], 0.12 * k); g.fillRect(x, 0, 1, h); } // crown highlight
    g.fillStyle = 'rgba(10,10,12,0.6)';
    const v = (z) => h - ((z - S.zR) / len) * h;
    g.fillRect(2, v(S.hoodZ), w - 4, 1); g.fillRect(2, v(S.deckZ), w - 4, 1);
    grain(g, w, h, 8, 0.1, 17);
  }, { repeat: false });
}

// Small textures for the decals.
const lampTex = (kind, color) => canvasTex(32, 16, (g, w, h) => {
  if (kind === 'head') {
    g.fillStyle = '#2a2c30'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#dfe4e6'; g.fillRect(2, 2, w / 2 - 3, h - 4); g.fillStyle = '#b8bec4'; g.fillRect(w / 2 + 1, 3, w / 2 - 6, h - 6);
    g.fillStyle = '#ffffff'; g.fillRect(5, 5, 4, 4); g.fillStyle = '#e8a030'; g.fillRect(w - 5, 3, 3, h - 6);
  } else if (kind === 'tail') {
    g.fillStyle = '#5a0c0c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c02020'; g.fillRect(1, 1, w - 2, h - 2); g.fillStyle = '#e04030'; g.fillRect(3, 3, w / 2, h / 2 - 2);
    g.fillStyle = '#d8d8d8'; g.fillRect(w - 9, 3, 6, h - 6); g.fillStyle = '#d07020'; g.fillRect(w - 9, h - 5, 6, 2);
  } else if (kind === 'grilleChrome') {
    g.fillStyle = '#c8c8c4'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c1c1e';
    for (let x = 3; x < w - 2; x += 3) g.fillRect(x, 2, 1, h - 4);
    g.fillStyle = '#e8e8e4'; g.fillRect(w / 2 - 2, h / 2 - 2, 4, 4);
  } else if (kind === 'grilleSlot') {
    g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#18181a'; g.fillRect(1, 3, w - 2, 3); g.fillRect(4, 9, w - 8, 4); g.fillStyle = '#b8b8b8'; g.fillRect(w / 2 - 2, 4, 4, 2);
  } else if (kind === 'grilleMesh') {
    g.fillStyle = '#121214'; g.fillRect(0, 0, w, h); g.fillStyle = '#2c2c30';
    for (let y = 1; y < h; y += 3) for (let x = (y % 2) * 2; x < w; x += 4) g.fillRect(x, y, 2, 1);
  } else if (kind === 'bumperDark') {
    g.fillStyle = '#2a2a2c'; g.fillRect(0, 0, w, h); grimeBottom(g, w, h, 0.6, 0.4);
  }
  grain(g, w, h, 10, 0.1, w * h);
}, { repeat: false });
const plateTex = (text) => canvasTex(48, 24, (g, w, h) => {
  g.fillStyle = '#e8e6dc'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a3a8a'; g.font = 'bold 5px Arial'; g.textAlign = 'center'; g.fillText('SUBURBIA', w / 2, 6);
  g.fillStyle = '#1a1a3a'; g.font = 'bold 10px Arial'; g.fillText(text, w / 2, 17, w - 4);
  g.strokeStyle = '#555'; g.strokeRect(0.5, 0.5, w - 1, h - 1); grain(g, w, h, 10, 0.1, 9);
}, { repeat: false });
const rimTex = (kind) => canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#18181a'; g.fillRect(0, 0, w, h); // tyre sidewall
  g.fillStyle = '#26262a'; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
  const R = kind === 'segway' ? 11 : 10;
  if (kind === 'hubcap') {
    g.fillStyle = '#b8bcc0'; g.beginPath(); g.arc(16, 16, R, 0, 7); g.fill();
    g.fillStyle = '#6a6e74'; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; g.fillRect(16 + Math.cos(a) * 7 - 1, 16 + Math.sin(a) * 7 - 1, 2, 2); }
    g.fillStyle = '#d8dcde'; g.beginPath(); g.arc(16, 16, 3, 0, 7); g.fill();
  } else if (kind === 'alloy') {
    g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(16, 16, R, 0, 7); g.fill();
    g.strokeStyle = '#d4d6d8'; g.lineWidth = 2.5;
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.moveTo(16, 16); g.lineTo(16 + Math.cos(a) * R, 16 + Math.sin(a) * R); g.stroke(); }
    g.strokeStyle = '#c8cacc'; g.lineWidth = 1.5; g.beginPath(); g.arc(16, 16, R - 0.5, 0, 7); g.stroke();
    g.fillStyle = '#e0e2e4'; g.beginPath(); g.arc(16, 16, 2.5, 0, 7); g.fill();
  } else if (kind === 'aero') {
    g.fillStyle = '#9aa0a6'; g.beginPath(); g.arc(16, 16, R, 0, 7); g.fill();
    g.fillStyle = '#5a5e64'; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.beginPath(); g.ellipse(16 + Math.cos(a) * 6, 16 + Math.sin(a) * 6, 2.5, 1, a + 1, 0, 7); g.fill(); }
  } else if (kind === 'steel') {
    g.fillStyle = '#3a3c40'; g.beginPath(); g.arc(16, 16, R, 0, 7); g.fill(); g.fillStyle = '#909498'; g.beginPath(); g.arc(16, 16, 3.5, 0, 7); g.fill();
  } else if (kind === 'segway') {
    g.fillStyle = '#4a4c50'; g.beginPath(); g.arc(16, 16, R, 0, 7); g.fill();
    g.fillStyle = '#c4c6c8'; g.beginPath(); g.arc(16, 16, 6, 0, 7); g.fill(); g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(16, 16, 2, 0, 7); g.fill();
  }
  grain(g, w, h, 8, 0.05, 5);
}, { repeat: false });
const treadTex = () => canvasTex(16, 16, (g, w, h) => { g.fillStyle = '#1c1c1e'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c0c0e'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2); grain(g, w, h, 10, 0.1, 3); });

const texCache = new Map();
const tc = (k, f) => { if (!texCache.has(k)) texCache.set(k, f()); return texCache.get(k); };

// ------------------------------------------------------------------ the five
// Specs: dimensions in metres. Profiles go rear → front along the top; the underside (with arches) is generated.
export const VEHICLES = {
  minivan: {
    name: 'The Odyssey of Errands', kind: 'Minivan', blurb: 'Sliding doors, a third row of crushed Goldfish, and the turning circle of a cruise ship. Built to idle in a pickup line for forty minutes.',
    color: 0xa6987e, len: 5.1, width: 1.98, wheelR: 0.35, archR: 0.41, axles: [1.52, -1.5], yb: 0.24, rim: 'hubcap', plate: 'SOCCRMOM',
    top: [[-2.52, 0.46], [-2.56, 0.74], [-2.5, 1.04], [1.0, 1.0], [1.7, 0.93], [2.38, 0.82], [2.52, 0.72], [2.56, 0.46], [2.48, 0.27]],
    cabin: [[-2.5, 0.96], [-2.44, 1.76], [-2.2, 1.82], [0.25, 1.82], [1.08, 1.02], [1.14, 0.96]],
    belt: 1.02, cabinW: 0.94, tumble: 0.1, doors: [0.98, 0.05, -1.05], handles: [0.15, -0.95], slider: true, fuel: -1.75,
    pillars: [[0.02, 0.12, true], [-1.08, -0.96, true], [-2.5, -2.28, false]], headrests: [0.35, -0.6, -1.7], mirrorZ: 0.95,
    hoodZ: 1.0, deckZ: -2.45, front: { lamps: 0.68, lampH: 0.16, grille: 'grilleSlot', grilleH: 0.14 }, rear: { lamps: 0.9, lampH: 0.36, lampW: 0.2 },
    roofRails: true, cladding: false, moulding: 'rgba(30,30,32,0.8)', mouldY: 0.52,
    handling: { CRUISE: 17, ACCEL: 1.0, GRIP: 4.5, YAW_MAX: 2.2, MASS: 5 },
  },
  sedan: {
    name: 'The Accordance', kind: 'Sedan', blurb: 'Hunter green, 140,000 miles, a "My Child Is An Honor Student" sticker. The default setting of the American driveway.',
    color: 0x3c5848, len: 4.8, width: 1.82, wheelR: 0.33, archR: 0.39, axles: [1.42, -1.36], yb: 0.24, rim: 'steel', plate: 'DADBOD',
    top: [[-2.38, 0.5], [-2.42, 0.78], [-2.34, 0.98], [-2.0, 1.03], [-1.3, 1.03], [0.82, 0.98], [1.6, 0.9], [2.2, 0.82], [2.38, 0.75], [2.43, 0.55], [2.38, 0.3]],
    cabin: [[-1.4, 0.96], [-1.3, 1.02], [-0.72, 1.42], [0.22, 1.46], [0.9, 1.0], [0.96, 0.96]],
    belt: 1.0, cabinW: 0.92, tumble: 0.13, doors: [0.86, -0.12, -1.18], handles: [0.0, -1.0], fuel: -1.75,
    pillars: [[-0.18, -0.08, true], [-1.4, -0.95, false]], headrests: [0.1, -0.85], mirrorZ: 0.8,
    hoodZ: 0.84, deckZ: -1.32, front: { lamps: 0.68, lampH: 0.13, grille: 'grilleChrome', grilleH: 0.12 }, rear: { lamps: 0.8, lampH: 0.15, lampW: 0.42 },
    moulding: 'rgba(25,25,28,0.85)', mouldY: 0.55, badge: true,
    handling: { CRUISE: 20, ACCEL: 1.25, GRIP: 5.5, YAW_MAX: 2.7, MASS: 4 },
  },
  hybrid: {
    name: 'The Pious', kind: 'Hybrid', blurb: 'A doorstop-shaped monument to fuel economy. Silent at low speed, which pedestrians will learn the hard way. Coexist sticker included.',
    color: 0xc9ccc8, len: 4.5, width: 1.74, wheelR: 0.31, archR: 0.37, axles: [1.35, -1.32], yb: 0.22, rim: 'aero', plate: 'SMUG 1',
    top: [[-2.22, 0.42], [-2.27, 0.64], [-2.25, 1.0], [0.75, 0.92], [1.6, 0.8], [2.18, 0.68], [2.27, 0.5], [2.2, 0.28]],
    cabin: [[-2.25, 0.94], [-2.22, 1.1], [-2.0, 1.16], [-0.45, 1.5], [-0.1, 1.5], [0.95, 0.94], [1.0, 0.9]],
    belt: 0.96, cabinW: 0.92, tumble: 0.15, doors: [0.78, -0.2, -1.2], handles: [-0.08, -1.05], fuel: -1.7,
    pillars: [[-0.26, -0.16, true], [-1.5, -1.3, true]], headrests: [0.0, -0.95], mirrorZ: 0.8,
    hoodZ: 0.76, deckZ: -2.0, front: { lamps: 0.6, lampH: 0.12, grille: 'grilleMesh', grilleH: 0.1, lampSweep: true }, rear: { lamps: 0.85, lampH: 0.12, lampW: 0.5, glassStrip: true },
    moulding: null, cladding: false, badge: true,
    handling: { CRUISE: 18, ACCEL: 1.6, GRIP: 5, YAW_MAX: 2.8, MASS: 3.5 },
  },
  luxury: {
    name: 'The Jones S-Klasse', kind: 'Luxury car', blurb: 'Leased, not owned. Parked across two spaces so nobody dings it. The grille is mostly there to be looked at by neighbours.',
    color: 0x1b1c22, len: 5.25, width: 1.9, wheelR: 0.35, archR: 0.4, axles: [1.66, -1.42], yb: 0.22, rim: 'alloy', plate: 'JONES 1',
    top: [[-2.6, 0.46], [-2.64, 0.76], [-2.56, 1.0], [-2.2, 1.05], [-1.45, 1.05], [0.6, 1.0], [1.8, 0.92], [2.5, 0.84], [2.6, 0.78], [2.64, 0.5], [2.56, 0.28]],
    cabin: [[-1.55, 0.97], [-1.45, 1.04], [-0.86, 1.43], [0.1, 1.46], [0.78, 1.0], [0.84, 0.97]],
    belt: 1.02, cabinW: 0.9, tumble: 0.14, doors: [0.7, -0.3, -1.35], handles: [-0.15, -1.2], fuel: -1.9,
    pillars: [[-0.36, -0.26, true], [-1.55, -1.1, false]], headrests: [-0.05, -1.0], mirrorZ: 0.68, chromeTrim: true, chromeHandles: true,
    hoodZ: 0.62, deckZ: -1.45, front: { lamps: 0.72, lampH: 0.14, grille: 'grilleChrome', grilleH: 0.28, grilleW: 0.62, ornament: true }, rear: { lamps: 0.82, lampH: 0.16, lampW: 0.45 },
    moulding: '#c8c8c4', mouldY: 0.48,
    handling: { CRUISE: 23, ACCEL: 1.35, GRIP: 5.2, YAW_MAX: 2.5, MASS: 4.5 },
  },
  segway: {
    name: 'Officer Dale\'s Segway', kind: 'Personal transporter', blurb: 'Top speed 12 mph. Commands the respect of no one. Mall Security\'s pride, and the only vehicle allowed inside the Promenade.',
    segway: true, len: 0.7, width: 0.64, wheelR: 0.24,
    handling: { CRUISE: 6, ACCEL: 2.2, GRIP: 30, YAW_MAX: 4, YAW_FULL: 0, YAW_LOW: 1, MASS: 1.2, TURN_SLOW: 0.6, KEY_YAW: 2.8 },
  },
};
export const VEHICLE_ORDER = ['minivan', 'sedan', 'hybrid', 'luxury', 'segway'];

// Build a car. opts.color overrides the paint (parked traffic), opts.plate the plate text.
export function buildVehicle(key, opts = {}) {
  const S0 = VEHICLES[key];
  if (S0.segway) return buildSegway(opts);
  const S = { ...S0, color: opts.color ?? S0.color, livery: opts.livery };
  S.top = smoothLine(S0.top, 28); S.cabin = [S0.cabin[0], ...smoothLine(S0.cabin.slice(0, -1), 18).slice(1), S0.cabin.at(-1)]; // (the cabin's last point closes it flat on the belt)
  const ck = `${key}${S.color}${S.livery || ''}`;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  // lower body
  const [fa, ra] = S.axles;
  const zF = S.top[S.top.length - 1][0], zR = S.top[0][0];
  S.zF = Math.max(...S.top.map((q) => q[0])); S.zR0 = Math.min(...S.top.map((q) => q[0]));
  const prof = [...S.top, ...underline(zF - 0.05, zR + 0.05, S.yb, [fa, ra], S.archR, S.wheelR)];
  S.zR = Math.min(...prof.map((p) => p[0])); const len = Math.max(...prof.map((p) => p[0])) - S.zR;
  const lower = extrudeProfile(prof, S.width, 0.1);
  const pinch = (g) => { const q = g.attributes.position; for (let i = 0; i < q.count; i++) q.setX(i, q.getX(i) * taper(S, q.getZ(i), q.getY(i))); g.computeVertexNormals(); };
  pinch(lower);
  // baked vertex shading: darker toward the sills (the PS1 had no AO, so artists painted it into the vertices)
  const col = new Float32Array(lower.attributes.position.count * 3);
  for (let i = 0; i < lower.attributes.position.count; i++) { const k = 0.72 + 0.28 * Math.min(1, Math.max(0, (lower.attributes.position.getY(i) - 0.2) / 0.8)); col.set([k, k, k], i * 3); }
  lower.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sideT = tc(`side${ck}`, () => bodySideTex(S, prof)), topT = tc(`top${ck}`, () => bodyTopTex(S, len));
  body.add(new THREE.Mesh(lower, [lam(0xffffff, sideT, { vertexColors: true }), lam(0xffffff, topT, { vertexColors: true })]));
  // greenhouse
  const cab = extrudeProfile(S.cabin, S.width * S.cabinW, 0.05, 2);
  const p = cab.attributes.position, yb = Math.min(...S.cabin.map((q) => q[1])), yt = Math.max(...S.cabin.map((q) => q[1]));
  for (let i = 0; i < p.count; i++) { const t = Math.max(0, (p.getY(i) - yb) / (yt - yb)); p.setX(i, p.getX(i) * (1 - S.tumble * t) * (1 - 0.06 * t * t) * (1 - 0.1 * sstep(0.55, 1, Math.abs(p.getZ(i) - (S.cabin[0][0] + S.cabin.at(-1)[0]) / 2) / ((S.cabin.at(-1)[0] - S.cabin[0][0]) / 2)))); } // (tumblehome, a rounded roof)
  cab.computeVertexNormals();
  // per-face colour on the walls: roof in body colour, windscreen / rear glass dark with a reflection gradient
  const nrm = cab.attributes.normal, cc = new Float32Array(p.count * 3), body3 = hexA(S.color).map((v) => v / 255);
  const capEnd = cab.groups[0].count;
  for (let i = 0; i < p.count; i += 3) {
    const ny = (nrm.getY(i) + nrm.getY(i + 1) + nrm.getY(i + 2)) / 3;
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      if (j < capEnd) { cc.set([1, 1, 1], j * 3); continue; }
      if (ny > 0.92) cc.set(body3.map((v) => Math.min(1, v * 1.15 + 0.04)), j * 3);
      else { const t = (p.getY(j) - yb) / (yt - yb); cc.set([0.1 + 0.4 * t, 0.12 + 0.44 * t, 0.15 + 0.5 * t], j * 3); }
    }
  }
  cab.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const cabT = tc(`cab${ck}`, () => cabinSideTex(S, S.cabin));
  body.add(new THREE.Mesh(cab, [lam(0xffffff, cabT, { vertexColors: true }), lam(0xffffff, null, { vertexColors: true })]));
  // front and rear faces
  const F = S.front, Rr = S.rear, hw = S.width / 2;
  const zFront = (y) => zAt(prof, y, true) + 0.065, zRear = (y) => zAt(prof, y, false) - 0.065;
  const dmat = (k, f) => lam(0xffffff, tc(k, f));
  const hl = dmat(`head`, () => lampTex('head'));
  // night: glows on the lamps, a pool of light thrown up the road, tail lamps that brighten when you brake
  const night = new THREE.Group(); night.visible = false; root.add(night);
  const glowM = (c, o = 1) => new THREE.SpriteMaterial({ map: tc('glow', glowTex), color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const tails = [];
  for (const s of [-1, 1]) {
    const w = F.lampSweep ? 0.46 : 0.36;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, F.lampH), hl);
    const xf = hw * taper(S, zFront(F.lamps) - 0.05, F.lamps);
    m.position.set(s * (xf - w / 2 - 0.05), F.lamps, zFront(F.lamps) - 0.02); m.rotation.y = s * 0.12; body.add(m);
    const hg = new THREE.Sprite(glowM(0xfff2d0)); hg.scale.set(1.3, 0.9, 1); hg.position.set(m.position.x, F.lamps, zFront(F.lamps) + 0.12); night.add(hg);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(Rr.lampW, Rr.lampH), dmat('tail', () => lampTex('tail')));
    const xr = hw * taper(S, zRear(Rr.lamps) + 0.05, Rr.lamps);
    t.position.set(s * (xr - Rr.lampW / 2 - 0.04), Rr.lamps, zRear(Rr.lamps) + 0.02); t.rotation.y = Math.PI - s * 0.12; body.add(t);
    const tg = new THREE.Sprite(glowM(0xff2a1a, 0.55)); tg.scale.set(0.8, 0.55, 1); tg.position.set(t.position.x, Rr.lamps, zRear(Rr.lamps) - 0.1); night.add(tg); tails.push(tg);
  }
  const gw = F.grilleW ?? (S.width * 0.86 - 1.0);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(gw, F.grilleH), F.grille === 'grilleSlot' ? dmat(`gs${S.color}`, () => lampTex('grilleSlot', shade(S.color, -0.1))) : dmat(F.grille, () => lampTex(F.grille)));
  gr.position.set(0, F.lamps - (F.grilleH > 0.2 ? 0.06 : 0), zFront(F.lamps) + 0.005); body.add(gr);
  const bump = new THREE.Mesh(new THREE.PlaneGeometry(S.width * 0.78, 0.16), dmat('bdark', () => lampTex('bumperDark')));
  bump.position.set(0, 0.36, zFront(0.36)); body.add(bump);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), lam(0xffffff, tc(`plate${opts.plate ?? S.plate}`, () => plateTex(opts.plate ?? S.plate))));
  plate.position.set(0, Rr.glassStrip ? 0.55 : 0.6, zRear(0.6) - 0.005); plate.rotation.y = Math.PI; body.add(plate);
  if (Rr.glassStrip) { const gs = new THREE.Mesh(new THREE.PlaneGeometry(S.width - 0.4, 0.16), lam(0x2a3038)); gs.position.set(0, 0.88, zRear(0.88) - 0.004); gs.rotation.y = Math.PI; body.add(gs); }
  if (F.ornament) { const o = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), lam(0xd8d8d4)); o.position.set(0, 0.9, zFront(0.86) - 0.12); body.add(o); }
  // mirrors
  const mm = lam(S.color, tc('grit', () => grit()));
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.1), mm); m.position.set(s * (hw * taper(S, S.mirrorZ, S.belt) + 0.06), S.belt + 0.08, S.mirrorZ); body.add(m); }
  if (S.roofRails) for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 2.2), lam(0x202022)); r.position.set(s * hw * S.cabinW * (1 - S.tumble) * 0.85, 1.84, -1.0); body.add(r); }
  // wheels
  const wheels = [];
  const tireM = lam(0xffffff, tc('tread', treadTex)), rimM = lam(0xffffff, tc(`rim${S.rim}`, () => rimTex(S.rim)));
  for (const za of S.axles) for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * (hw - 0.14), S.wheelR, za);
    const wg = new THREE.CylinderGeometry(S.wheelR, S.wheelR, 0.22, 14); wg.rotateZ(Math.PI / 2);
    const w = new THREE.Mesh(wg, [tireM, rimM, rimM]);
    pivot.add(w); root.add(pivot);
    wheels.push({ pivot, mesh: w, front: za > 0 });
  }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(S.width * 2.6, 14), basic(0xfff0c8, tc('beam', beamTex), { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.06, zF + 7.2); night.add(pool);
  const sh = blobShadow(S.width + 0.5, len + 0.6); root.add(sh);
  root.userData = { key, spec: S0, body, wheels, wheelR: S.wheelR, night, tails };
  if (S.livery === 'police') { // the light bar: red and blue halves that flash (flashLights), with a glow sprite each
    const ty = Math.max(...S.cabin.map((q) => q[1])), top = S.cabin.filter((q) => q[1] > ty - 0.05), tz = top.reduce((a, q) => a + q[0], 0) / top.length;
    const bar = new THREE.Group(); bar.position.set(0, ty, tz); body.add(bar);
    bar.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(S.width * 0.72, 0.06, 0.3), lam(0x1a1a1c)), {}));
    const lights = [];
    for (const [sx, c] of [[-1, 0xff2a1a], [1, 0x2a5aff]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(S.width * 0.3, 0.12, 0.26), basic(c)); m.position.set(sx * S.width * 0.19, 0.08, 0); bar.add(m);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tc('glow', glowTex), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(2.2, 2.2, 1); glow.position.copy(m.position); bar.add(glow);
      lights.push({ m, glow, on: basic(c), off: basic(new THREE.Color(c).multiplyScalar(0.25).getHex()) });
    }
    root.userData.lights = lights;
  }
  return root;
}

function buildSegway(opts) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const dark = lam(0x2a2c30, tc('grit', () => grit())), metal = lam(0x9ea2a8, tc('grit', () => grit()));
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.42), dark); deck.position.y = 0.2; body.add(deck);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.38), lam(0x111113)); mat.position.y = 0.26; body.add(mat);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.05), metal); stem.position.set(0, 0.74, 0.16); stem.rotation.x = -0.12; body.add(stem);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.05), dark); bar.position.set(0, 1.23, 0.22); body.add(bar);
  const fend = lam(0x7a1e1e, tc('grit', () => grit()));
  const wheels = [];
  const rimM = lam(0xffffff, tc('rimsegway', () => rimTex('segway'))), tireM = lam(0xffffff, tc('tread', treadTex));
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.34, 0.24, 0);
    const wg = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10); wg.rotateZ(Math.PI / 2);
    const w = new THREE.Mesh(wg, [tireM, rimM, rimM]); pivot.add(w); root.add(pivot);
    wheels.push({ pivot, mesh: w, front: false });
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.52), fend); f.position.set(s * 0.34, 0.5, 0); body.add(f);
  }
  const rider = buildPerson('dale'); rider.position.y = 0.27; body.add(rider);
  rider.userData.pose = 'segway';
  root.add(blobShadow(0.9, 0.9));
  root.userData = { key: 'segway', spec: VEHICLES.segway, body, wheels, wheelR: 0.24, rider };
  return root;
}

// The headlamp throw on the road: a cone, brightest near the car, fading up the road (additive).
function beamTex() { return canvasTex(32, 64, (g, w, h) => { for (let y = 0; y < h; y++) { const k = y / h, half = 4 + k * 12, a = Math.pow(1 - k, 1.6) * 0.9; const gr = g.createLinearGradient(16 - half, 0, 16 + half, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, y, w, 1); } }, { repeat: false }); } // (row 0 is the end by the bumper)
// Night lamps on or off; brake lights brighter while braking (k 0..1).
export function carLights(car, on, brake = 0) {
  const u = car.userData; if (!u.night) return;
  u.night.visible = on; if (on) for (const t of u.tails) { t.material.opacity = 0.45 + brake * 0.55; t.scale.set(0.8 + brake * 0.5, 0.55 + brake * 0.3, 1); }
}
// A soft round glow for the light bar (additive sprite).
function glowTex() { return canvasTex(32, 32, (g, w, h) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { repeat: false }); }
// Flash a cruiser's light bar: red, blue, red, blue, with a double blip (t: seconds, any clock).
export function flashLights(car, t) {
  const L = car.userData.lights; if (!L) return;
  const ph = (t * 3.2) % 1, a = ph < 0.5, blip = (ph * 8 | 0) % 2 === 0;
  L.forEach((l, k) => { const on = (k === 0 ? a : !a) && blip; l.m.material = on ? l.on : l.off; l.glow.visible = on; });
}

// Animate a vehicle from its body state: wheel spin, front-wheel steer, body roll and pitch (or the Segway lean).
export function poseVehicle(car, B, dt) {
  const u = car.userData;
  u.spin = (u.spin || 0) + (B.speed / u.wheelR) * dt;
  for (const w of u.wheels) { w.mesh.rotation.x = u.spin; if (w.front) w.pivot.rotation.y = Math.max(-0.5, Math.min(0.5, (B.steer || 0) * 0.25)); }
  u.acc = (u.acc || 0) * 0.9 + ((B.speed - (u.lastV ?? B.speed)) / Math.max(dt, 1e-4)) * 0.1; u.lastV = B.speed;
  if (u.key === 'segway') { u.body.rotation.x = Math.max(-0.25, Math.min(0.25, B.speed * 0.025 + u.acc * 0.03)); return; }
  u.body.rotation.z = Math.max(-0.07, Math.min(0.07, -(B.steer || 0) * B.speed * 0.006));
  u.body.rotation.x = Math.max(-0.04, Math.min(0.04, -u.acc * 0.006));
}
