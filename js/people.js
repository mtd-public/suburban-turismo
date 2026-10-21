// The suburban cast. Realistic proportions (about 7.5 heads tall, not chibi), 15 boxy parts on a simple joint
// tree — the way Metal Gear Solid, Driver and The Getaway built people — with the character in the textures:
// painted faces, clothes with seams, collars, name tags and quilting. The joke is the casting and the posing,
// not the rendering: Karen is a photo-real woman pointing at you while on the phone with your manager.
import * as THREE from 'three';
import { lam, canvasTex } from './ps1.js';
import { grain } from './tex.js';
import { blobShadow } from './geo.js';

const hexA = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const css = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const shade = (c, k) => css(hexA(c).map((v) => Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k)))));

const SKIN = { fair: 0xe2b49a, rosy: 0xdca48c, tan: 0xc08a68, brown: 0x8c5a3c, deep: 0x5e3a28, olive: 0xc8a07a };

// ------------------------------------------------------------------ cast
export const CAST = {
  karen: {
    name: 'Karen', title: 'Would Like To Speak To Your Manager',
    blurb: 'Inverted bob, sunglasses parked on her head, phone already dialling corporate. Hit her and she won\'t fall so much as file.',
    skin: SKIN.fair, hair: { color: 0xd8bc7a, style: 'bob' }, h: 0.97,
    top: { kind: 'vest', color: 0x6a7a6c, sleeve: 0xe8e2d6 }, bottom: { kind: 'pants', color: 0x1e1e22 }, shoes: 0xe8e8e8,
    face: { lips: 0xb04a52, brows: 0x8a6a3a, sunHead: true }, props: ['phone'], pose: 'karen',
  },
  mrJones: {
    name: 'Mr. Jones', title: 'Kept Up With',
    blurb: 'Salmon polo, boat shoes, a quarter-zip in the car for later. Has never once been seen near a Hybrid.',
    skin: SKIN.tan, hair: { color: 0x3a2a1e, style: 'short' }, h: 1.0,
    top: { kind: 'polo', color: 0xe08a78 }, bottom: { kind: 'shorts', color: 0xc8b48a }, shoes: 0x7a4e2e,
    face: { brows: 0x2a1e14, shades: true }, props: ['keys'], pose: 'crossed',
  },
  mrsJones: {
    name: 'Mrs. Jones', title: 'Also Kept Up With',
    blurb: 'Tennis whites at 2 p.m. on a Tuesday, an oat-milk latte the size of a paint can. Her HOA complaint about your mailbox is in draft.',
    skin: SKIN.tan, hair: { color: 0x6a4a2a, style: 'pony' }, h: 0.95,
    top: { kind: 'tee', color: 0xf0eeea, collar: true }, bottom: { kind: 'skirt', color: 0xf0eeea }, shoes: 0xf4f4f4,
    face: { lips: 0xa85058, brows: 0x4a3420, shades: true }, props: ['latte', 'visor'], pose: 'latte',
  },
  harold: {
    name: 'HOA Harold', title: 'President, Whispering Pines Estates HOA',
    blurb: 'Socks with sandals, a clipboard of violations and a tape measure for your grass. Your lawn is 3.2 inches. The limit is 3.',
    skin: SKIN.rosy, hair: { color: 0xc8c4bc, style: 'bald' }, h: 0.95,
    top: { kind: 'polo', color: 0xdcd2b0, tucked: true }, bottom: { kind: 'shorts', color: 0x7a7458 }, shoes: 0x5a4632, socks: 0xf2f2ee,
    face: { brows: 0xd0ccc4, glasses: true, mustache: 0xbab4aa, age: true }, props: ['clipboard', 'bucket'], pose: 'clipboard',
  },
  brenda: {
    name: 'Brenda', title: 'Soccer Mom, Team Snack Coordinator',
    blurb: 'Forty-ounce tumbler, folding chair, a voice that carries across four fields. Her minivan has a stick-figure family and opinions.',
    skin: SKIN.brown, hair: { color: 0x241812, style: 'pony' }, h: 0.96,
    top: { kind: 'zip', color: 0x2e4a7a, sleeve: 0x2e4a7a }, bottom: { kind: 'leggings', color: 0x222226 }, shoes: 0xd8d8dc,
    face: { lips: 0x8a4a48, brows: 0x1a1210 }, props: ['tumbler'], pose: 'cheer',
  },
  greg: {
    name: 'Grill Dad Greg', title: 'Cul-de-sac Pitmaster',
    blurb: 'Cargo shorts, new white sneakers, a spatula he has not put down since Memorial Day. Will tell you about his smoker.',
    skin: SKIN.fair, hair: { color: 0x5a3e26, style: 'short' }, h: 1.0, wide: 1.12,
    top: { kind: 'apron', color: 0x5a6a7a, apron: 0x8a2a24 }, bottom: { kind: 'shorts', color: 0x8a8060 }, shoes: 0xf2f2f2, socks: 0xf2f2f2,
    face: { brows: 0x3a2818, goatee: 0x5a3e26 }, props: ['spatula'], pose: 'grill',
  },
  bev: {
    name: 'Bev', title: 'Mall Walker (7:00 a.m. Division)',
    blurb: 'Matching velour tracksuit with Ron. Three laps of the Promenade before the stores open. Will not yield.',
    skin: SKIN.fair, hair: { color: 0xc4c0c8, style: 'perm' }, h: 0.92,
    top: { kind: 'track', color: 0x6a3a7a, sleeve: 0x6a3a7a }, bottom: { kind: 'pants', color: 0x6a3a7a }, shoes: 0xf0f0f0,
    face: { lips: 0xb05a6a, brows: 0x9a9098, glasses: true, age: true }, props: [], pose: 'walk',
  },
  ron: {
    name: 'Ron', title: 'Mall Walker (Bev\'s)',
    blurb: 'Pedometer on the waistband, visor on the head. Has views on the parking situation and will share them.',
    skin: SKIN.rosy, hair: { color: 0xd8d8d4, style: 'bald' }, h: 0.96,
    top: { kind: 'track', color: 0x6a3a7a, sleeve: 0x6a3a7a }, bottom: { kind: 'pants', color: 0x6a3a7a }, shoes: 0xf0f0f0,
    face: { brows: 0xd8d8d4, glasses: true, age: true }, props: ['visor'], pose: 'walk',
  },
  tyler: {
    name: 'Tyler', title: 'McDaniel\'s Crew Member, Window 2',
    blurb: 'Headset, visor, the thousand-yard stare of a sixteen-year-old in hour six. The ice cream machine is broken. It is always broken.',
    skin: SKIN.olive, hair: { color: 0x2a1c12, style: 'short' }, h: 0.98, slim: 0.9,
    top: { kind: 'uniform', color: 0xa82a22 }, bottom: { kind: 'pants', color: 0x1e1e22 }, shoes: 0x18181a,
    face: { brows: 0x2a1c12 }, props: ['visorRed', 'headset'], pose: 'slouch',
  },
  doris: {
    name: 'Doris', title: 'CityMart Greeter Since 1994',
    blurb: 'Blue vest, smiley-face pin, a wave for every car in the lot including the one about to hit her. Indestructible.',
    skin: SKIN.deep, hair: { color: 0x9a9a9a, style: 'perm' }, h: 0.93,
    top: { kind: 'greeter', color: 0xe6e2da, vest: 0x2a5aa8, sleeve: 0xe6e2da }, bottom: { kind: 'pants', color: 0x3a3a40 }, shoes: 0x18181a,
    face: { lips: 0x7a3a3a, brows: 0x6a6a6a, glasses: true, age: true }, props: [], pose: 'wave',
  },
  dale: {
    name: 'Officer Dale', title: 'Promenade Mall Security',
    blurb: 'Not a cop. Will tell you he is "basically a cop". Rides the Segway everywhere, including up the curb at you.',
    skin: SKIN.fair, hair: { color: 0x6a5038, style: 'short' }, h: 0.98, wide: 1.1,
    top: { kind: 'security', color: 0xb8c8d8 }, bottom: { kind: 'pants', color: 0x23252c }, shoes: 0x111113,
    face: { brows: 0x4a3828, mustache: 0x6a5038 }, props: ['cap'], pose: 'segway',
  },
};
export const CAST_ORDER = ['karen', 'mrJones', 'mrsJones', 'harold', 'brenda', 'greg', 'bev', 'ron', 'tyler', 'doris', 'dale'];

// ------------------------------------------------------------------ textures
const cache = new Map();
const tc = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

function fabric(color, seam = 0) {
  return tc(`fab${color}${seam}`, () => canvasTex(16, 16, (g, w, h) => {
    g.fillStyle = css(hexA(color)); g.fillRect(0, 0, w, h);
    if (seam) { g.fillStyle = shade(color, -0.3); g.fillRect(0, 0, 1, h); }
    grain(g, w, h, 16, 0.25, color & 255);
  }));
}
// The face: skin with edge shading, hairline per style, brows, eyes, nose shadow, mouth, extras.
function faceTex(C) {
  return tc(`face${C.name}`, () => canvasTex(32, 40, (g, w, h) => {
    const s = C.skin, F = C.face;
    g.fillStyle = css(hexA(s)); g.fillRect(0, 0, w, h);
    const sg = g.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, 'rgba(60,30,20,0.35)'); sg.addColorStop(0.25, 'rgba(0,0,0,0)'); sg.addColorStop(0.75, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(60,30,20,0.35)');
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,30,20,0.25)'; g.fillRect(4, 34, w - 8, 6); // under the jaw
    const hc = C.hair.color, st = C.hair.style;
    g.fillStyle = css(hexA(hc));
    if (st === 'bob') { g.fillRect(0, 0, w, 8); g.beginPath(); g.moveTo(0, 0); g.lineTo(14, 0); g.lineTo(4, 12); g.lineTo(0, 30); g.fill(); g.fillRect(0, 0, 4, 34); g.fillRect(w - 4, 0, 4, 30); g.fillStyle = shade(hc, 0.35); g.fillRect(6, 2, 10, 2); }
    else if (st === 'pony') { g.fillRect(0, 0, w, 7); g.fillRect(0, 0, 3, 16); g.fillRect(w - 3, 0, 3, 16); }
    else if (st === 'short') { g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 3, 13); g.fillRect(w - 3, 0, 3, 13); }
    else if (st === 'perm') { for (let i = 0; i < 26; i++) { g.beginPath(); g.arc((i * 7) % w, 2 + (i % 3) * 2, 3, 0, 7); g.fill(); } g.fillRect(0, 0, 3, 18); g.fillRect(w - 3, 0, 3, 18); }
    else if (st === 'bald') { g.fillStyle = shade(s, 0.15); g.fillRect(6, 0, w - 12, 4); g.fillStyle = css(hexA(hc)); g.fillRect(0, 8, 3, 10); g.fillRect(w - 3, 8, 3, 10); }
    // brows, eyes
    g.fillStyle = css(hexA(F.brows)); g.fillRect(7, 14, 6, 2); g.fillRect(19, 14, 6, 2);
    if (F.age) { g.fillStyle = 'rgba(80,40,30,0.3)'; g.fillRect(9, 10, 14, 1); g.fillRect(6, 23, 3, 1); g.fillRect(23, 23, 3, 1); }
    g.fillStyle = '#f0ece4'; g.fillRect(8, 18, 5, 2); g.fillRect(19, 18, 5, 2);
    g.fillStyle = '#2a2018'; g.fillRect(10, 18, 2, 2); g.fillRect(20, 18, 2, 2);
    g.fillStyle = 'rgba(60,30,20,0.3)'; g.fillRect(8, 20, 5, 1); g.fillRect(19, 20, 5, 1);
    if (F.shades) { g.fillStyle = '#121214'; g.fillRect(6, 16, 9, 5); g.fillRect(17, 16, 9, 5); g.fillRect(14, 17, 4, 1); g.fillStyle = 'rgba(200,210,230,0.5)'; g.fillRect(7, 17, 3, 1); g.fillRect(18, 17, 3, 1); }
    if (F.glasses) { g.strokeStyle = '#3a3030'; g.lineWidth = 1; g.strokeRect(7.5, 16.5, 7, 5); g.strokeRect(17.5, 16.5, 7, 5); g.fillStyle = '#3a3030'; g.fillRect(14, 18, 4, 1); }
    // nose and mouth
    g.fillStyle = 'rgba(70,35,25,0.4)'; g.fillRect(15, 20, 2, 7); g.fillRect(13, 27, 6, 1);
    g.fillStyle = 'rgba(255,240,230,0.25)'; g.fillRect(14, 20, 1, 6);
    if (F.mustache) { g.fillStyle = css(hexA(F.mustache)); g.fillRect(10, 28, 12, 3); }
    if (F.goatee) { g.fillStyle = css(hexA(F.goatee)); g.fillRect(12, 29, 8, 2); g.fillRect(13, 33, 6, 4); }
    g.fillStyle = F.lips ? css(hexA(F.lips)) : 'rgba(110,50,40,0.8)'; g.fillRect(11, 31, 10, 2);
    if (C.pose === 'karen') { g.fillStyle = 'rgba(60,30,20,0.5)'; g.fillRect(9, 13, 5, 1); g.fillRect(18, 13, 5, 1); g.fillStyle = css(hexA(F.lips)); g.fillRect(10, 31, 12, 1); } // brows down, mouth tight
    grain(g, w, h, 8, 0.08, C.name.length);
  }, { repeat: false }));
}
// Side and back of the head: skin with the hair painted down to wherever this style ends.
function headTex(C, side) {
  return tc(`head${C.name}${side}`, () => canvasTex(16, 20, (g, w, h) => {
    const st = C.hair.style, hc = C.hair.color;
    g.fillStyle = css(hexA(C.skin)); g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,30,20,0.2)'; g.fillRect(0, 0, w, h);
    const down = { bob: h, pony: 12, short: 8, perm: 11, bald: 0 }[st];
    g.fillStyle = css(hexA(hc)); g.fillRect(0, 0, w, down);
    if (st === 'bald') { g.fillRect(0, 7, w, 5); }
    if (side === 'side') { g.fillStyle = shade(C.skin, -0.25); g.fillRect(6, 9, 3, 5); } // ear
    for (let y = 0; y < down; y += 2) { g.fillStyle = shade(hc, y % 4 ? 0.12 : -0.15); g.fillRect(0, y, w, 1); } // strands
    if (st === 'bob' && side === 'back') { g.fillStyle = shade(hc, -0.3); g.fillRect(0, 0, w, 6); } // the stacked back
    grain(g, w, h, 10, 0.1, w + C.name.length);
  }, { repeat: false }));
}
function hairTex(C) { return tc(`hair${C.hair.color}`, () => canvasTex(16, 16, (g, w, h) => { const c = C.hair.color; g.fillStyle = css(hexA(c)); g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 2) { g.fillStyle = shade(c, x % 4 ? 0.15 : -0.2); g.fillRect(x, 0, 1, h); } grain(g, w, h, 14, 0.1, 3); })); }
// The shirt front: collars, plackets, quilting, name tags.
function topFrontTex(C) {
  const T = C.top;
  return tc(`top${C.name}`, () => canvasTex(32, 32, (g, w, h) => {
    const c = T.color;
    g.fillStyle = css(hexA(c)); g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); // side shading
    if (T.kind === 'polo') { g.fillStyle = shade(c, -0.15); g.beginPath(); g.moveTo(8, 0); g.lineTo(16, 6); g.lineTo(24, 0); g.fill(); g.fillStyle = shade(c, -0.25); g.fillRect(15, 3, 2, 9); g.fillStyle = '#eee'; g.fillRect(15, 6, 1, 1); g.fillRect(15, 9, 1, 1); if (T.tucked) { g.fillStyle = '#3a2a1a'; g.fillRect(0, h - 3, w, 3); g.fillStyle = '#b8a060'; g.fillRect(14, h - 3, 4, 3); } }
    if (T.kind === 'vest') { g.fillStyle = css(hexA(T.sleeve)); g.fillRect(12, 0, 8, 6); for (let y = 4; y < h; y += 5) { g.fillStyle = shade(c, -0.3); g.fillRect(0, y, w, 1); g.fillStyle = shade(c, 0.2); g.fillRect(0, y + 1, w, 1); } g.fillStyle = '#c8c8c8'; g.fillRect(15, 6, 2, h - 6); }
    if (T.kind === 'tee') { g.fillStyle = shade(c, -0.12); g.fillRect(10, 0, 12, 3); g.fillStyle = '#1e5a3a'; g.fillRect(20, 8, 3, 2); }
    if (T.kind === 'zip' || T.kind === 'track') { g.fillStyle = shade(c, -0.3); g.fillRect(15, 0, 2, T.kind === 'zip' ? 12 : h); g.fillStyle = '#d8d8d8'; g.fillRect(15, 0, 2, 2); if (T.kind === 'track') { g.fillStyle = '#e8e0d0'; g.fillRect(3, 0, 2, h); g.fillRect(w - 5, 0, 2, h); } else { g.fillStyle = '#e8e8e8'; g.fillRect(20, 8, 4, 2); } }
    if (T.kind === 'apron') { g.fillStyle = css(hexA(T.apron)); g.fillRect(6, 4, w - 12, h - 4); g.fillRect(8, 0, 2, 5); g.fillRect(w - 10, 0, 2, 5); g.fillStyle = '#eee'; g.font = 'bold 5px Arial'; g.textAlign = 'center'; g.fillText('KISS', 16, 13); g.fillText('THE', 16, 18); g.fillText('COOK', 16, 23); g.fillStyle = shade(T.apron, -0.3); g.fillRect(10, h - 7, 12, 1); }
    if (T.kind === 'uniform') { g.fillStyle = '#e8c840'; g.fillRect(0, 2, w, 2); g.fillStyle = '#f2f2ee'; g.fillRect(19, 9, 8, 4); g.fillStyle = '#222'; g.fillRect(20, 10, 6, 1); g.fillStyle = shade(c, -0.3); g.fillRect(14, 0, 4, 8); }
    if (T.kind === 'greeter') { g.fillStyle = css(hexA(T.vest)); g.fillRect(0, 0, 12, h); g.fillRect(20, 0, 12, h); g.fillStyle = '#f2d43a'; g.beginPath(); g.arc(25, 11, 3, 0, 7); g.fill(); g.fillStyle = '#222'; g.fillRect(24, 10, 1, 1); g.fillRect(26, 10, 1, 1); g.fillStyle = '#f2f2ee'; g.fillRect(3, 9, 7, 4); g.fillStyle = '#2a5aa8'; g.fillRect(4, 10, 5, 1); }
    if (T.kind === 'security') { g.fillStyle = '#1a1c24'; g.fillRect(15, 3, 3, 16); g.fillStyle = '#c8a840'; g.beginPath(); g.moveTo(8, 9); g.lineTo(11, 8); g.lineTo(11, 13); g.lineTo(9, 14); g.fill(); g.fillStyle = shade(c, -0.25); g.fillRect(4, 8, 7, 1); g.fillRect(21, 8, 7, 1); g.fillRect(0, h - 3, w, 3); g.fillStyle = '#1a1c24'; g.fillRect(0, h - 3, w, 3); }
    if (T.collar) { g.fillStyle = shade(c, -0.15); g.fillRect(10, 0, 12, 3); }
    grain(g, w, h, 12, 0.15, c & 1023);
  }, { repeat: false }));
}
function shinTex(C) {
  const B = C.bottom, bare = B.kind === 'shorts' || B.kind === 'skirt';
  return tc(`shin${C.name}`, () => canvasTex(8, 16, (g, w, h) => {
    g.fillStyle = css(hexA(bare ? C.skin : B.color)); g.fillRect(0, 0, w, h);
    if (bare && C.socks) { g.fillStyle = css(hexA(C.socks)); g.fillRect(0, h - 6, w, 6); }
    grain(g, w, h, 12, 0.2, 7);
  }, { repeat: false }));
}

// Tapered box: bottom w×d, top tw×td, height h, base at y=0 (or hanging down from y=0 when `down`).
function tbox(w, h, d, tw = w, td = d, down = false) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * tw / w); p.setZ(i, p.getZ(i) * td / d); }
  g.translate(0, h / 2, 0);
  if (down) { g.rotateX(Math.PI); g.rotateY(Math.PI); } // (the wide end at the joint)
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the rig
export function buildPerson(key) {
  const C = CAST[key];
  const root = new THREE.Group();
  const fig = new THREE.Group(); fig.scale.setScalar(C.h); root.add(fig);
  const W = C.wide ?? 1, S = C.slim ?? 1;
  const skin = lam(0xffffff, fabric(C.skin)), topM = lam(0xffffff, fabric(C.top.color, 1));
  const sleeveM = lam(0xffffff, fabric(C.top.sleeve ?? C.top.color));
  const botM = lam(0xffffff, fabric(C.bottom.color, 1)), shoeM = lam(0xffffff, fabric(C.shoes));
  const J = {};
  const part = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };

  // hips and legs
  J.hips = joint(fig, 0, 0.94, 0);
  part(tbox(0.34 * W, 0.18, 0.21 * W, 0.32 * W, 0.2 * W), botM, J.hips, 0, -0.1, 0);
  const shinM = lam(0xffffff, shinTex(C)), bare = C.bottom.kind === 'shorts' || C.bottom.kind === 'skirt';
  for (const s of [1, -1]) {
    const hip = joint(J.hips, s * 0.09 * W, -0.06, 0), knee = joint(hip, 0, -0.44, 0), ankle = joint(knee, 0, -0.42, 0);
    if (C.bottom.kind === 'shorts') { part(tbox(0.16 * W, 0.26, 0.17 * W, 0.14 * W, 0.16 * W, true), botM, hip); part(tbox(0.12 * S, 0.2, 0.13, 0.11, 0.12, true), skin, hip, 0, -0.24, 0); }
    else if (C.bottom.kind === 'skirt') part(tbox(0.13 * S, 0.44, 0.14, 0.11, 0.12, true), skin, hip);
    else part(tbox(0.15 * W * S, 0.44, 0.16 * W, 0.12 * S, 0.13, true), botM, hip);
    part(tbox(0.11 * S, 0.42, 0.12, 0.08, 0.09, true), bare ? shinM : (C.bottom.kind === 'leggings' ? botM : shinM), knee);
    part(new THREE.BoxGeometry(0.1, 0.08, 0.25), shoeM, ankle, 0, -0.03, 0.05);
    J[s > 0 ? 'lHip' : 'rHip'] = hip; J[s > 0 ? 'lKnee' : 'rKnee'] = knee;
  }
  if (C.bottom.kind === 'skirt') part(tbox(0.44, 0.3, 0.32, 0.34, 0.22, true), botM, J.hips, 0, -0.04, 0);

  // torso, head, arms
  J.spine = joint(J.hips, 0, 0.02, 0);
  const front = lam(0xffffff, topFrontTex(C));
  part(tbox(0.33 * W * S, 0.52, 0.21 * W, 0.42 * W * S, 0.23 * W), [topM, topM, topM, topM, front, topM], J.spine);
  if (C.top.kind === 'vest') part(tbox(0.36, 0.5, 0.24, 0.44, 0.26), [topM, topM, topM, topM, front, topM], J.spine, 0, 0.01, 0); // the puffer's bulk
  part(new THREE.BoxGeometry(0.09, 0.08, 0.09), skin, J.spine, 0, 0.55, 0);
  J.head = joint(J.spine, 0, 0.58, 0.01);
  const sideM = lam(0xffffff, headTex(C, 'side')), backM = lam(0xffffff, headTex(C, 'back')), hairM = lam(0xffffff, hairTex(C));
  part(tbox(0.18, 0.25, 0.21, 0.19, 0.22), [sideM, sideM, hairM, skin, lam(0xffffff, faceTex(C)), backM], J.head);
  hairShell(C, J.head, hairM, part);
  for (const s of [1, -1]) {
    const sh = joint(J.spine, s * 0.24 * W * S, 0.48, 0), el = joint(sh, 0, -0.3, 0), wr = joint(el, 0, -0.26, 0);
    el.rotation.order = 'YXZ'; // (bend first, then swing the forearm round the upper arm: crossed arms, a held clipboard)
    const longSleeve = ['vest', 'zip', 'track', 'greeter'].includes(C.top.kind);
    part(tbox(0.1 * W, 0.3, 0.1 * W, 0.11 * W, 0.11 * W, true), C.top.kind === 'vest' ? sleeveM : sleeveM, sh);
    part(tbox(0.08 * W, 0.26, 0.08 * W, 0.09 * W, 0.09 * W, true), longSleeve ? sleeveM : skin, el);
    part(new THREE.BoxGeometry(0.07, 0.1, 0.04), skin, wr, 0, -0.04, 0);
    J[s > 0 ? 'lSh' : 'rSh'] = sh; J[s > 0 ? 'lEl' : 'rEl'] = el; J[s > 0 ? 'lWr' : 'rWr'] = wr;
  }
  props(C, J, part);
  root.add(blobShadow(0.7, 0.7));
  root.userData = { key, C, J, fig, t0: Math.random() * 10 };
  posePerson(root, 0);
  return root;
}

function hairShell(C, head, hairM, part) {
  const st = C.hair.style;
  if (st === 'bob') { // the inverted bob: long at the front, stacked at the back, side-swept
    part(tbox(0.215, 0.22, 0.2, 0.2, 0.22), hairM, head, 0, 0.06, -0.025);
    part(new THREE.BoxGeometry(0.03, 0.2, 0.12), hairM, head, -0.105, 0.06, 0.06);
    part(new THREE.BoxGeometry(0.03, 0.17, 0.1), hairM, head, 0.105, 0.09, 0.06);
  } else if (st === 'pony') {
    part(tbox(0.2, 0.08, 0.23, 0.17, 0.2), hairM, head, 0, 0.2, -0.01);
    part(tbox(0.06, 0.2, 0.06, 0.04, 0.04, true), hairM, head, 0, 0.2, -0.13).rotation.x = 0.35;
  } else if (st === 'perm') part(tbox(0.22, 0.12, 0.25, 0.2, 0.22), hairM, head, 0, 0.17, -0.01);
  else if (st === 'short') part(tbox(0.195, 0.05, 0.225, 0.18, 0.21), hairM, head, 0, 0.23, -0.005);
}
function props(C, J, part) {
  const p = C.props, dark = lam(0x1a1a1c), white = lam(0xf2f2ee);
  if (p.includes('phone')) part(new THREE.BoxGeometry(0.03, 0.14, 0.07), dark, J.rWr, -0.03, -0.06, 0.02);
  if (C.face.sunHead) part(new THREE.BoxGeometry(0.2, 0.03, 0.05), dark, J.head, 0, 0.25, 0.06);
  if (p.includes('keys')) part(new THREE.BoxGeometry(0.03, 0.06, 0.02), lam(0xc8c8c8), J.rWr, 0, -0.1, 0);
  if (p.includes('latte')) { part(new THREE.CylinderGeometry(0.045, 0.035, 0.18, 6), white, J.rWr, 0, -0.06, 0.05); part(new THREE.CylinderGeometry(0.048, 0.048, 0.025, 6), lam(0x2a6a4a), J.rWr, 0, 0.04, 0.05); }
  if (p.includes('visor')) part(new THREE.BoxGeometry(0.22, 0.02, 0.12), white, J.head, 0, 0.2, 0.13);
  if (p.includes('visorRed')) { part(new THREE.BoxGeometry(0.21, 0.05, 0.23), lam(0xa82a22), J.head, 0, 0.19, 0); part(new THREE.BoxGeometry(0.21, 0.02, 0.1), lam(0xa82a22), J.head, 0, 0.17, 0.15); }
  if (p.includes('headset')) part(new THREE.BoxGeometry(0.015, 0.015, 0.12), dark, J.head, -0.1, 0.07, 0.07);
  if (p.includes('bucket')) { part(tbox(0.3, 0.02, 0.32, 0.3, 0.32), lam(0xc8bc98), J.head, 0, 0.2, 0); part(tbox(0.21, 0.1, 0.23, 0.18, 0.2), lam(0xc8bc98), J.head, 0, 0.2, 0); }
  if (p.includes('cap')) { part(tbox(0.21, 0.07, 0.23, 0.19, 0.21), lam(0x1e2230), J.head, 0, 0.2, 0); part(new THREE.BoxGeometry(0.2, 0.02, 0.1), lam(0x1e2230), J.head, 0, 0.2, 0.15); part(new THREE.BoxGeometry(0.05, 0.04, 0.01), lam(0xc8a840), J.head, 0, 0.24, 0.12); }
  if (p.includes('clipboard')) { part(new THREE.BoxGeometry(0.24, 0.32, 0.02), lam(0x8a6a3a), J.lWr, 0, -0.08, 0.06); part(new THREE.BoxGeometry(0.2, 0.26, 0.005), white, J.lWr, 0, -0.1, 0.072); }
  if (p.includes('tumbler')) part(new THREE.CylinderGeometry(0.05, 0.045, 0.28, 6), lam(0x3aa8a0), J.rWr, 0, -0.06, 0.04);
  if (p.includes('spatula')) { part(new THREE.BoxGeometry(0.02, 0.3, 0.02), dark, J.rWr, 0, -0.18, 0.02); part(new THREE.BoxGeometry(0.1, 0.12, 0.01), lam(0xb8b8b8), J.rWr, 0, -0.38, 0.02); }
}

// ------------------------------------------------------------------ poses
// Joint angles per pose, as a function of time. Arms hang down; rotation.x < 0 swings a limb forward.
export function posePerson(p, t) {
  const { J, C } = p.userData, T = t + p.userData.t0;
  const set = (j, x = 0, y = 0, z = 0) => j.rotation.set(x, y, z);
  const breathe = Math.sin(T * 1.6) * 0.015;
  for (const k of ['lSh', 'rSh', 'lEl', 'rEl', 'lHip', 'rHip', 'lKnee', 'rKnee', 'head', 'spine', 'hips', 'lWr', 'rWr']) set(J[k]);
  J.hips.position.y = 0.94;
  set(J.lSh, 0, 0, 0.08); set(J.rSh, 0, 0, -0.08); set(J.lEl, -0.15); set(J.rEl, -0.15);
  set(J.spine, breathe);
  switch (C.pose) {
    case 'karen': { // phone to the ear, the other hand jabbing at you
      const jab = Math.max(0, Math.sin(T * 3.2)) ** 4;
      set(J.rSh, -0.35, 0, -0.55); set(J.rEl, -2.5, 0, 0); set(J.rWr, 0, 0, 0.3);
      set(J.lSh, -1.35 - jab * 0.15, 0.25, 0.05); set(J.lEl, -0.1 + jab * 0.2);
      set(J.head, 0.05, -0.2, 0.12); set(J.hips, 0, 0, Math.sin(T * 0.7) * 0.03); set(J.lHip, 0, 0, 0.06); set(J.rKnee, 0.12);
      break;
    }
    case 'crossed': set(J.lSh, -0.45, 0, 0.2); set(J.rSh, -0.45, 0, -0.2); set(J.lEl, -1.75, -1.1, 0); set(J.rEl, -1.6, 1.1, 0); set(J.head, -0.12 + Math.sin(T * 0.5) * 0.03, Math.sin(T * 0.3) * 0.2); set(J.lHip, 0, 0, 0.08); set(J.rHip, 0, 0, -0.08); break;
    case 'latte': set(J.rSh, -0.4, 0, -0.1); set(J.rEl, -1.7); set(J.lSh, 0, 0, 0.55); set(J.lEl, -0.4, 0, 0); set(J.lWr, 0, 0, -0.3); set(J.head, -0.1, 0.3 + Math.sin(T * 0.4) * 0.15, 0.05); set(J.rKnee, 0.15); set(J.rHip, -0.08); break;
    case 'clipboard': { const look = Math.sin(T * 0.6) > 0.6 ? -0.05 : 0.45; set(J.lSh, -0.5, 0, 0.1); set(J.lEl, -1.3, -0.5, 0); set(J.rSh, -0.55, 0, -0.1); set(J.rEl, -1.2 + Math.sin(T * 8) * 0.08, 0.5, 0); set(J.head, look, 0.15); set(J.spine, 0.06 + breathe); break; }
    case 'cheer': { const pump = Math.max(0, Math.sin(T * 2.4)); set(J.lSh, -0.3 - pump * 2.6, 0, 0.2); set(J.lEl, -0.4); set(J.rSh, -0.3, 0, -0.15); set(J.rEl, -1.5); set(J.head, -0.15 * pump); break; }
    case 'grill': { const flip = Math.max(0, Math.sin(T * 2)) ** 3; set(J.rSh, -0.6 - flip * 0.5, 0, -0.1); set(J.rEl, -1.1 + flip * 0.9); set(J.lSh, 0, 0, 0.45); set(J.lEl, -0.6, 0, 0); set(J.head, 0.3, 0, 0); set(J.lHip, 0, 0, 0.1); set(J.rHip, 0, 0, -0.1); break; }
    case 'walk': { // the power-walk: elbows at 90°, arms pumping
      const w = T * 5.5, s = Math.sin(w);
      set(J.lHip, s * 0.5); set(J.rHip, -s * 0.5); set(J.lKnee, Math.max(0, -Math.cos(w)) * 0.7); set(J.rKnee, Math.max(0, Math.cos(w)) * 0.7);
      set(J.lSh, -s * 0.7, 0, 0.12); set(J.rSh, s * 0.7, 0, -0.12); set(J.lEl, -1.6); set(J.rEl, -1.6);
      J.hips.position.y = 0.94 - Math.abs(Math.cos(w)) * 0.02; set(J.spine, 0.06); break;
    }
    case 'slouch': set(J.spine, 0.18); set(J.head, 0.35, 0, 0.1); set(J.lSh, 0.1, 0, 0.05); set(J.rSh, 0.1, 0, -0.05); set(J.lHip, 0, 0, 0.05); set(J.rKnee, 0.2); set(J.rHip, -0.1); break;
    case 'wave': { const wv = Math.sin(T * 7); set(J.rSh, -0.4, 0, -2.3); set(J.rEl, 0, 0, -0.5 + wv * 0.35); set(J.lSh, -0.2, 0, 0.1); set(J.lEl, -0.8); set(J.head, -0.05, -0.1); break; }
    case 'segway': set(J.lSh, -0.55, 0, 0.1); set(J.rSh, -0.55, 0, -0.1); set(J.lEl, -0.75); set(J.rEl, -0.75); set(J.lHip, 0, 0, 0.12); set(J.rHip, 0, 0, -0.12); set(J.head, 0.02, 0, 0); break;
  }
}
