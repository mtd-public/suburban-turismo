import * as THREE from 'three';
// Every texture in the art test, painted in code at PS1 sizes (32–128 px, nearest-sampled).
//
// The look we're after is Driver / The Getaway / early Gran Turismo: textures that read as *photo-sourced* —
// desaturated, gritty, with the lighting and dirt baked in — on very simple geometry. So every painter starts
// from a noisy base (per-pixel grain + blotches), bakes a little ambient occlusion along the bottom, and adds
// grime. Nothing here is a flat colour fill: flat fills are what make low-poly look like a toy.
import { canvasTex } from './ps1.js';
import { mulberry32 } from './utils.js';

const memo = new Map();
const once = (key, make) => { if (!memo.has(key)) { const t = make(); winterize(key, t); memo.set(key, t); } return memo.get(key); };

// ---------------------------------------------------------------- winter
// The winter tileset: set before the town is built (the game reloads to change season). Each autumn texture is
// painted as usual, then a winter painter (by key) snows over it: lawns become snowfields with the odd blade
// poking through, roads go to grey slush with salt and tyre tracks, roofs and hedges get a cap, trees go bare
// (or stay evergreen under a dusting), leaf litter turns to drifts, the pond freezes, the treeline goes white.
export let WINTER = false;
export const setWinter = (on) => { WINTER = !!on; };
const SNOW = [232, 236, 244], SNOW_SH = [178, 190, 212];
function snowOver(g, w, h, amt, seed, keepAlpha = true) { // white drifts over what's there (amt 0..1 coverage)
  const rnd = mulberry32(seed), d = g.getImageData(0, 0, w, h), p = d.data;
  const cells = []; for (let i = 0; i < 10 + amt * 30; i++) cells.push([rnd() * w, rnd() * h, 3 + rnd() * w * 0.25]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let f = 0; for (const [cx, cy, r] of cells) { const dx = Math.min(Math.abs(x - cx), w - Math.abs(x - cx)), dy = Math.min(Math.abs(y - cy), h - Math.abs(y - cy)); f = Math.max(f, 1 - Math.hypot(dx, dy) / r); }
    const k = Math.min(1, f * 2.2 * amt + amt * 0.45 + (rnd() - 0.5) * 0.25), i = (y * w + x) * 4;
    if (k < 0.35 || (keepAlpha && p[i + 3] < 128)) continue;
    const c = mix(SNOW_SH, SNOW, Math.min(1, (k - 0.35) * 1.6)), n = (rnd() - 0.5) * 14;
    p[i] = c[0] + n; p[i + 1] = c[1] + n; p[i + 2] = c[2] + n;
  }
  g.putImageData(d, 0, 0);
}
const WINTER_FX = {
  grass: (g, w, h) => { // a snowfield: blue-shaded drifts, sparkle, a few dead blades through it
    g.fillStyle = css(SNOW); g.fillRect(0, 0, w, h); grain(g, w, h, 10, 0.25, 501);
    const rnd = mulberry32(502);
    for (let i = 0; i < 9; i++) { const gr = g.createRadialGradient(rnd() * w, rnd() * h, 1, rnd() * w, rnd() * h, 14); gr.addColorStop(0, css(SNOW_SH, 0.5)); gr.addColorStop(1, css(SNOW_SH, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    for (let i = 0; i < 46; i++) { g.fillStyle = css(rnd() < 0.5 ? [96, 92, 60] : [70, 76, 50], 0.8); g.fillRect(rnd() * w | 0, rnd() * h | 0, 1, 2); }
    for (let i = 0; i < 30; i++) { g.fillStyle = '#ffffff'; g.fillRect(rnd() * w | 0, rnd() * h | 0, 1, 1); }
  },
  asphalt: (g, w, h) => { // wet, darker, salt-whitened, slush in the joints, two tyre tracks of packed snow
    g.fillStyle = 'rgba(20,24,32,0.25)'; g.fillRect(0, 0, w, h);
    const rnd = mulberry32(511);
    for (let i = 0; i < 70; i++) { g.fillStyle = css([210, 214, 222], 0.35 + rnd() * 0.4); g.fillRect(rnd() * w | 0, rnd() * h | 0, 1 + (rnd() * 2 | 0), 1); }
    for (let i = 0; i < 6; i++) { g.fillStyle = css(mix(SNOW_SH, [120, 124, 130], 0.4), 0.55); g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 3 + rnd() * 6, 2 + rnd() * 3, rnd() * 3, 0, 7); g.fill(); }
  },
  concrete: (g, w, h) => snowOver(g, w, h, 0.55, 521),
  dirt: (g, w, h) => snowOver(g, w, h, 0.7, 531),
  mulch: (g, w, h) => snowOver(g, w, h, 0.85, 532),
  water: (g, w, h) => { // a frozen pond: pale ice, cracks, snow at the edges
    g.fillStyle = css([170, 196, 210]); g.fillRect(0, 0, w, h); grain(g, w, h, 10, 0.2, 541);
    const rnd = mulberry32(542); g.strokeStyle = 'rgba(240,250,255,0.7)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) { g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 16; y += (rnd() - 0.5) * 16; g.lineTo(x, y); } g.stroke(); }
    snowOver(g, w, h, 0.25, 543);
  },
  shingle: (g, w, h) => snowOver(g, w, h, 0.9, 551),
  metalroof: (g, w, h) => snowOver(g, w, h, 0.85, 552),
  hedge: (g, w, h) => snowOver(g, w, h, 0.5, 561),
  fence: (g, w, h) => { const rnd = mulberry32(565); for (let x = 0; x < w; x += 4) { g.fillStyle = css(SNOW); g.fillRect(x, 0, 3, 1 + (rnd() * 2 | 0)); } }, // (snow on each picket top)
  fol: (g, w, h, key) => { // bare: branches and snow along them; one tree in three is an evergreen under a dusting
    const seed = +key.split('|')[1] || 1, rnd = mulberry32(seed * 571);
    if (seed % 3 === 0) {
      g.clearRect(0, 0, w, h);
      for (let row = 0; row < 7; row++) { const y = 6 + row * 7.5, half = 4 + row * 3.6; g.fillStyle = css(mix([36, 62, 44], [20, 36, 26], rnd() * 0.5)); g.beginPath(); g.moveTo(32, y - 6); g.lineTo(32 - half, y + 6); g.lineTo(32 + half, y + 6); g.fill(); g.fillStyle = css(SNOW); g.beginPath(); g.moveTo(32, y - 6); g.lineTo(32 - half * 0.75, y + 3); g.lineTo(32 + half * 0.5, y + 1); g.fill(); }
      g.fillStyle = css([60, 44, 32]); g.fillRect(31, 58, 3, 6);
    } else {
      g.clearRect(0, 0, w, h);
      const branch = (x, y, a, len, wdt, depth) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.strokeStyle = css([62, 52, 44]); g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        if (wdt > 1.2) { g.strokeStyle = css(SNOW); g.lineWidth = Math.max(1, wdt * 0.5); g.beginPath(); g.moveTo(x, y - wdt * 0.5); g.lineTo(x2, y2 - wdt * 0.5); g.stroke(); }
        if (depth > 0) for (let k = 0; k < 2 + (rnd() < 0.4); k++) branch(x2, y2, a + (rnd() - 0.5) * 1.3, len * (0.62 + rnd() * 0.15), wdt * 0.65, depth - 1);
      };
      branch(32, 64, -Math.PI / 2, 18, 4, 4);
    }
    const d = g.getImageData(0, 0, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0; g.putImageData(d, 0, 0);
  },
  leaves: (g, w, h, key) => { // the leaf-litter decal becomes drifted snow and slush
    g.clearRect(0, 0, w, h); const rnd = mulberry32(581 + key.length);
    for (let i = 0; i < 26; i++) { g.fillStyle = css(mix(SNOW, SNOW_SH, rnd() * 0.6)); g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 7, 1 + rnd() * 4, rnd() * 3, 0, 7); g.fill(); }
    const d = g.getImageData(0, 0, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0; g.putImageData(d, 0, 0);
  },
  leafpile: (g, w, h) => { g.fillStyle = css(SNOW); g.fillRect(0, 0, w, h); grain(g, w, h, 12, 0.3, 591); snowOver(g, w, h, 0.2, 592); },
  treeline: (g, w, h) => { // a far bare wood, white and grey, alpha-cut along the top
    g.clearRect(0, 0, w, h); const rnd = mulberry32(601);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 260; i++) {
      const x = rnd() * w, r = 3 + rnd() * 5, top = h - (pass ? 14 : 22) - Math.sin(x * 0.03) * 4 - rnd() * 8;
      g.fillStyle = css(mix(rnd() < 0.3 ? [70, 84, 80] : [150, 150, 156], [214, 218, 228], pass ? 0.35 : 0.6));
      for (const dx of [0, w, -w]) { g.beginPath(); g.arc(x + dx, top + r, r, 0, 7); g.fill(); g.fillRect(x + dx - r, top + r, r * 2, h); }
    }
    g.fillStyle = css([200, 202, 210]); g.fillRect(301, 16, 3, 30); g.beginPath(); g.ellipse(302, 13, 8, 5, 0, 0, 7); g.fill();
    const d = g.getImageData(0, 0, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 128 ? 255 : 0; g.putImageData(d, 0, 0);
  },
};
function winterize(key, t) {
  if (!WINTER || !t?.image?.getContext) return;
  const k = Object.keys(WINTER_FX).find((p) => key.startsWith(p)); if (!k) return;
  const c = t.image, g = c.getContext('2d'); WINTER_FX[k](g, c.width, c.height, key); t.needsUpdate = true;
}

const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const css = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Per-pixel grain + low-frequency blotches over the whole canvas (multiplies what's there).
export function grain(g, w, h, amt = 18, blotch = 0.12, seed = 1) {
  const rnd = mulberry32(seed), d = g.getImageData(0, 0, w, h), p = d.data;
  // blotch field: a few soft random discs, cheap value-noise stand-in
  const bl = new Float32Array(w * h);
  for (let k = 0; k < 10; k++) {
    const cx = rnd() * w, cy = rnd() * h, r = (0.15 + rnd() * 0.35) * Math.max(w, h), s = (rnd() - 0.5) * 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // wrap-around distance so repeating textures tile without seams
      const dx = Math.min(Math.abs(x - cx), w - Math.abs(x - cx)), dy = Math.min(Math.abs(y - cy), h - Math.abs(y - cy));
      const f = Math.max(0, 1 - Math.hypot(dx, dy) / r);
      bl[y * w + x] += s * f * f;
    }
  }
  for (let i = 0; i < w * h; i++) {
    const n = (rnd() - 0.5) * amt, m = 1 + bl[i] * blotch;
    p[i * 4] = p[i * 4] * m + n; p[i * 4 + 1] = p[i * 4 + 1] * m + n; p[i * 4 + 2] = p[i * 4 + 2] * m + n;
  }
  g.putImageData(d, 0, 0);
}
// Darken toward the bottom edge (baked AO / rain grime where a wall meets the ground).
export function grimeBottom(g, w, h, frac = 0.3, a = 0.35) {
  const gr = g.createLinearGradient(0, h * (1 - frac), 0, h);
  gr.addColorStop(0, 'rgba(30,25,20,0)'); gr.addColorStop(1, `rgba(30,25,20,${a})`);
  g.fillStyle = gr; g.fillRect(0, h * (1 - frac), w, h * frac);
}
// Rain streaks running down from the top.
function streaks(g, w, h, n, a, seed) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, l = h * (0.2 + rnd() * 0.6);
    const gr = g.createLinearGradient(0, 0, 0, l);
    gr.addColorStop(0, `rgba(40,35,30,${a})`); gr.addColorStop(1, 'rgba(40,35,30,0)');
    g.fillStyle = gr; g.fillRect(x, 0, 1 + rnd() * 2, l);
  }
}

// ---------------------------------------------------------------- ground
export const asphalt = (tone = 0) => once(`asphalt${tone}`, () => canvasTex(64, 64, (g, w, h) => {
  const base = tone ? [92, 92, 90] : [74, 74, 76];
  g.fillStyle = css(base); g.fillRect(0, 0, w, h);
  grain(g, w, h, 34, 0.25, 11 + tone);
  const rnd = mulberry32(5 + tone);
  // aggregate speckle
  for (let i = 0; i < 140; i++) { g.fillStyle = css(rnd() < 0.5 ? [120, 118, 112] : [48, 48, 50], 0.7); g.fillRect(rnd() * w | 0, rnd() * h | 0, 1, 1); }
  // a crack and a tar-seal line
  g.strokeStyle = 'rgba(30,30,32,0.8)'; g.lineWidth = 1; g.beginPath();
  let x = rnd() * w, y = 0; g.moveTo(x, y);
  while (y < h) { x += (rnd() - 0.5) * 8; y += 3 + rnd() * 5; g.lineTo(x, y); }
  g.stroke();
  // oil stain
  g.fillStyle = 'rgba(30,28,30,0.25)'; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 9, 6, 0, 0, 7); g.fill();
}));

export const concrete = (joint = true) => once(`concrete${joint}`, () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([168, 165, 156]); g.fillRect(0, 0, w, h);
  grain(g, w, h, 22, 0.18, 21);
  if (joint) { g.fillStyle = 'rgba(70,66,60,0.55)'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); g.fillStyle = 'rgba(255,255,250,0.15)'; g.fillRect(0, 1, w, 1); }
  const rnd = mulberry32(3);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,56,50,0.18)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 4, 0, 7); g.fill(); } // gum and stains
}));

export const grass = (stripes = false, tone = 0) => once(`grass${stripes}${tone}`, () => canvasTex(64, 64, (g, w, h) => {
  const base = [[86, 104, 52], [98, 108, 58], [92, 108, 54]][tone];
  g.fillStyle = css(base); g.fillRect(0, 0, w, h);
  if (stripes) { g.fillStyle = 'rgba(200,220,150,0.10)'; g.fillRect(0, 0, w / 2, h); } // mowing stripes (hi, Dr. Mow)
  grain(g, w, h, 30, 0.35, 31 + tone);
  const rnd = mulberry32(7 + tone);
  for (let i = 0; i < 260; i++) { g.fillStyle = css(rnd() < 0.5 ? [120, 140, 70] : [44, 62, 34], 0.6); g.fillRect(rnd() * w | 0, rnd() * h | 0, 1, 2); }
  if (tone === 1) for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(150,130,80,0.35)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 5, 0, 7); g.fill(); } // park wear patches
}));

export const dirt = () => once('dirt', () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([118, 98, 74]); g.fillRect(0, 0, w, h); grain(g, w, h, 36, 0.3, 41);
}));
export const mulch = () => once('mulch', () => canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = css([92, 58, 38]); g.fillRect(0, 0, w, h); grain(g, w, h, 60, 0.3, 42);
}));
export const water = () => once('water', () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([66, 88, 92]); g.fillRect(0, 0, w, h); grain(g, w, h, 14, 0.2, 43);
  const rnd = mulberry32(44);
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(190,210,215,0.35)'; g.fillRect(rnd() * w | 0, rnd() * h | 0, 3 + rnd() * 6 | 0, 1); }
}));

// Worn road paint (white / yellow) with gaps where tyres have scrubbed it.
export const paint = (yellow = false) => once(`paint${yellow}`, () => canvasTex(16, 64, (g, w, h) => {
  g.fillStyle = yellow ? css([214, 176, 60]) : css([226, 224, 214]); g.fillRect(0, 0, w, h);
  grain(g, w, h, 30, 0.2, yellow ? 51 : 52);
  const d = g.getImageData(0, 0, w, h), rnd = mulberry32(53);
  for (let i = 3; i < d.data.length; i += 4) if (rnd() < 0.16) d.data[i] = 0;
  g.putImageData(d, 0, 0);
}));

// ---------------------------------------------------------------- walls
export const siding = (color) => once(`siding${color}`, () => canvasTex(64, 64, (g, w, h) => {
  const c = hex(color);
  g.fillStyle = css(c); g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) { // lap boards: a shadow line under each and a lit lip
    g.fillStyle = css(mix(c, [20, 20, 20], 0.45)); g.fillRect(0, y + 7, w, 1);
    g.fillStyle = css(mix(c, [255, 255, 255], 0.18)); g.fillRect(0, y, w, 1);
    g.fillStyle = css(mix(c, [0, 0, 0], 0.08)); g.fillRect(0, y + 5, w, 2);
  }
  grain(g, w, h, 12, 0.15, color & 255);
}));
export const brick = (color = 0x8a4a38) => once(`brick${color}`, () => canvasTex(64, 64, (g, w, h) => {
  const c = hex(color), rnd = mulberry32(color & 1023);
  g.fillStyle = css([150, 140, 126]); g.fillRect(0, 0, w, h); // mortar
  for (let row = 0; row < 16; row++) for (let k = -1; k < 5; k++) {
    const x = k * 16 + (row % 2) * 8, t = (rnd() - 0.5) * 0.25;
    g.fillStyle = css(mix(c, t > 0 ? [200, 160, 130] : [40, 25, 20], Math.abs(t)));
    g.fillRect(x, row * 4, 15, 3);
  }
  grain(g, w, h, 20, 0.2, 61);
}));
export const stucco = (color) => once(`stucco${color}`, () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css(hex(color)); g.fillRect(0, 0, w, h); grain(g, w, h, 26, 0.22, 71 + (color & 63));
  streaks(g, w, h, 6, 0.12, 72);
}));
// Big-box tilt-up concrete panels with reveals (CityMart's flank walls).
export const tiltup = () => once('tiltup', () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([186, 180, 166]); g.fillRect(0, 0, w, h); grain(g, w, h, 18, 0.2, 81);
  g.fillStyle = 'rgba(90,86,78,0.7)'; g.fillRect(0, 0, 1, h); g.fillRect(0, 22, w, 1);
  g.fillStyle = css([60, 82, 140]); g.fillRect(0, 4, w, 5); // the blue brand band
  streaks(g, w, h, 8, 0.18, 82); grimeBottom(g, w, h, 0.25, 0.4);
}));
export const shingles = (color = 0x4a4642) => once(`shingle${color}`, () => canvasTex(64, 64, (g, w, h) => {
  const c = hex(color), rnd = mulberry32(color & 511);
  g.fillStyle = css(c); g.fillRect(0, 0, w, h);
  for (let row = 0; row < 8; row++) {
    g.fillStyle = css(mix(c, [0, 0, 0], 0.5)); g.fillRect(0, row * 8 + 7, w, 1);
    for (let k = 0; k < 6; k++) {
      const x = k * 12 + (row % 2) * 6;
      g.fillStyle = css(mix(c, [0, 0, 0], 0.45)); g.fillRect(x, row * 8, 1, 7);
      g.fillStyle = css(mix(c, rnd() < 0.5 ? [255, 255, 255] : [0, 0, 0], rnd() * 0.15)); g.fillRect(x + 1, row * 8, 11, 6);
    }
  }
  grain(g, w, h, 24, 0.2, 91);
}));
export const metalRoof = () => once('metalroof', () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([150, 150, 146]); g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 6, 0, 1, h); }
  grain(g, w, h, 16, 0.3, 92);
}));

// ---------------------------------------------------------------- openings
// A house window: white trim, mullions, dark glass with a sky reflection, a curtain on one side.
export const houseWindow = (curtain = 0xd8cdb0) => once(`hwin${curtain}`, () => canvasTex(32, 48, (g, w, h) => {
  g.fillStyle = css([226, 224, 214]); g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 3, 0, h - 3);
  gr.addColorStop(0, css([120, 140, 160])); gr.addColorStop(0.45, css([50, 60, 70])); gr.addColorStop(1, css([26, 28, 32]));
  g.fillStyle = gr; g.fillRect(3, 3, w - 6, h - 6);
  g.fillStyle = css(hex(curtain), 0.85); g.fillRect(3, 3, 8, h - 6);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(14, 3); g.lineTo(22, 3); g.lineTo(8, h - 4); g.lineTo(3, h - 4); g.fill(); // glare
  g.fillStyle = css([226, 224, 214]); g.fillRect(w / 2 - 1, 3, 2, h - 6); g.fillRect(3, h / 2 - 1, w - 6, 2);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 2, w, 2);
  grain(g, w, h, 10, 0.1, 101);
}, { repeat: false }));
export const shutter = () => once('shutter', () => canvasTex(16, 48, (g, w, h) => {
  g.fillStyle = css([46, 58, 52]); g.fillRect(0, 0, w, h);
  for (let y = 2; y < h - 2; y += 3) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(2, y, w - 4, 1); }
  grain(g, w, h, 12, 0.1, 102);
}, { repeat: false }));
export const garageDoor = () => once('garage', () => canvasTex(64, 40, (g, w, h) => {
  g.fillStyle = css([222, 218, 206]); g.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(k * 16 + 2, r * 10 + 2, 13, 7);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(k * 16 + 2, r * 10 + 2, 13, 1);
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'; for (let r = 1; r < 4; r++) g.fillRect(0, r * 10, w, 1);
  grimeBottom(g, w, h, 0.3, 0.4); grain(g, w, h, 12, 0.15, 103);
}, { repeat: false }));
export const frontDoor = (color = 0x6a2a24) => once(`door${color}`, () => canvasTex(32, 64, (g, w, h) => {
  g.fillStyle = css([226, 224, 214]); g.fillRect(0, 0, w, h);
  const c = hex(color); g.fillStyle = css(c); g.fillRect(4, 4, w - 8, h - 4);
  g.fillStyle = css(mix(c, [0, 0, 0], 0.35));
  [[7, 8, 7, 18], [18, 8, 7, 18], [7, 32, 7, 24], [18, 32, 7, 24]].forEach(([x, y, a, b]) => g.fillRect(x, y, a, b));
  g.fillStyle = css([200, 170, 90]); g.fillRect(w - 10, 34, 3, 3); // brass knob
  g.fillStyle = 'rgba(160,190,210,0.7)'; g.fillRect(12, 0, 8, 3); // transom glint
  grain(g, w, h, 12, 0.1, 104);
}, { repeat: false }));
// Shop glass: aluminium mullions, a dim interior with shelves and a few lit shapes, reflection.
export const storefront = (tint = [40, 46, 52]) => once(`store${tint}`, () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css(tint); g.fillRect(0, 0, w, h);
  const rnd = mulberry32(tint[0] + 7);
  for (let y = 20; y < 60; y += 10) { g.fillStyle = 'rgba(200,190,170,0.25)'; g.fillRect(0, y, w, 2); for (let x = 0; x < w; x += 3) { g.fillStyle = css([90 + rnd() * 140, 80 + rnd() * 120, 70 + rnd() * 100], 0.5); g.fillRect(x, y - 4, 2, 4); } }
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(200,220,235,0.35)'); gr.addColorStop(0.5, 'rgba(200,220,235,0)'); gr.addColorStop(0.7, 'rgba(200,220,235,0.18)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = css([150, 150, 148]); g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 2, h); g.fillRect(w / 2 - 1, 0, 2, h); g.fillRect(0, h - 4, w, 4);
  grain(g, w, h, 12, 0.1, 111);
}));
// Office/upper-storey windows band for the mall's second floor.
export const upperWindows = () => once('upperwin', () => canvasTex(64, 32, (g, w, h) => {
  g.fillStyle = css([200, 186, 160]); g.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    const gr = g.createLinearGradient(0, 6, 0, 26); gr.addColorStop(0, css([130, 150, 165])); gr.addColorStop(1, css([40, 46, 52]));
    g.fillStyle = gr; g.fillRect(k * 32 + 6, 6, 20, 20);
    g.fillStyle = css([90, 86, 80]); g.fillRect(k * 32 + 6, 26, 20, 2);
  }
  streaks(g, w, h, 5, 0.15, 112); grain(g, w, h, 14, 0.15, 113);
}));

// ---------------------------------------------------------------- signs
// A sign face: text on a panel, rendered small and then nearest-scaled (the crunch is the point).
export function sign(text, { w = 128, h = 32, bg = '#1f3a8a', fg = '#ffffff', font = 'bold 22px Arial, Helvetica, sans-serif', border = null, sub = null, subFont = 'bold 8px Arial, sans-serif', grime = 0.25 } = {}) {
  return once(`sign${text}|${w}|${h}|${bg}|${fg}|${font}|${border}|${sub}`, () => canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 1, w - 8);
    if (sub) { g.font = subFont; g.fillText(sub, w / 2, h * 0.8, w - 8); }
    grain(g, w, h, 14, 0.12, text.length * 13);
    grimeBottom(g, w, h, 0.4, grime);
  }, { repeat: false }));
}
// The drive-thru menu board: rows of tiny burger photos and prices.
export const menuBoard = () => once('menu', () => canvasTex(64, 48, (g, w, h) => {
  g.fillStyle = css([30, 26, 24]); g.fillRect(0, 0, w, h);
  g.fillStyle = css([200, 40, 30]); g.fillRect(0, 0, w, 8);
  g.fillStyle = '#ffd34d'; g.font = 'bold 7px Arial'; g.textAlign = 'center'; g.fillText("McDANIEL'S", w / 2, 6);
  const rnd = mulberry32(121);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) {
    const x = 3 + k * 21, y = 11 + r * 9;
    g.fillStyle = css([170 + rnd() * 60, 110 + rnd() * 40, 50]); g.fillRect(x, y, 7, 6);
    g.fillStyle = css([150, 80, 40]); g.fillRect(x + 1, y + 2, 5, 2);
    g.fillStyle = '#eee'; g.fillRect(x + 9, y + 1, 8, 1); g.fillStyle = '#ffd34d'; g.fillRect(x + 9, y + 4, 5, 1);
  }
  grain(g, w, h, 10, 0.1, 122);
}, { repeat: false }));

// ---------------------------------------------------------------- nature
// Tree crown billboard: clusters of leafy blobs with hard alpha edges (the Driver / GT "cross-quad" tree).
export const foliage = (base = [70, 96, 46], seed = 1) => once(`fol${base}|${seed}`, () => canvasTex(64, 64, (g, w, h) => {
  const rnd = mulberry32(seed * 977);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 22, x = 32 + Math.cos(a) * r, y = 30 + Math.sin(a) * r * 0.9, s = 5 + rnd() * 6;
    const lit = (32 - y) / 40 + (x - 32) / 80; // lit from the upper right
    g.fillStyle = css(mix(base, lit > 0 ? [250, 230, 150] : [40, 30, 22], Math.min(0.45, Math.abs(lit) * 0.8 + rnd() * 0.12)));
    g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
  }
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < w * h; i++) {
    const n = (rnd() - 0.5) * 50; p[i * 4] += n; p[i * 4 + 1] += n; p[i * 4 + 2] += n * 0.6;
    if (p[i * 4 + 3] > 0 && rnd() < 0.1) p[i * 4 + 3] = 0; // see-through gaps in the crown
    p[i * 4 + 3] = p[i * 4 + 3] > 128 ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  g.fillStyle = 'rgba(70,52,36,1)'; g.fillRect(31, 46, 3, 18); // the trunk shows through the lower crown
}, { repeat: false }));
export const bark = () => once('bark', () => canvasTex(16, 32, (g, w, h) => {
  g.fillStyle = css([84, 70, 56]); g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(30,24,18,0.5)'; g.fillRect(x, 0, 1, h); }
  grain(g, w, h, 30, 0.2, 131);
}));
export const hedge = () => once('hedge', () => canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = css([58, 82, 40]); g.fillRect(0, 0, w, h);
  const rnd = mulberry32(141);
  for (let i = 0; i < 90; i++) { g.fillStyle = css(rnd() < 0.5 ? [100, 130, 60] : [30, 48, 24], 0.8); g.fillRect(rnd() * w | 0, rnd() * h | 0, 2, 2); }
  grain(g, w, h, 20, 0.2, 142);
}));

// ---------------------------------------------------------------- sky and fx
// Sky dome strip: a hazy gradient with painted cumulus near the horizon (u wraps round the dome).
export const sky = (preset) => once(`sky${preset.name}`, () => {
  const t = canvasTex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, preset.zenith); gr.addColorStop(0.72, preset.horizon); gr.addColorStop(0.8, preset.haze); gr.addColorStop(1, preset.haze);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rnd = mulberry32(151);
    for (let i = 0; i < 26; i++) { // cumulus banks: clusters of soft ellipses, flat-bottomed, thinning toward the horizon
      const x = rnd() * w, y = h * (0.25 + rnd() * 0.42), s = 6 + rnd() * 14, n = 4 + (rnd() * 6 | 0);
      for (let k = 0; k < n; k++) for (const dx of [0, w, -w]) {
        const cx = x + dx + (k - n / 2) * s * 0.9, cy = y - rnd() * s * 0.5, r = s * (0.6 + rnd() * 0.6);
        const cg = g.createRadialGradient(cx, cy, 0, cx, cy, r); cg.addColorStop(0, preset.cloud); cg.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 0.35 * (1 - (y / h - 0.25)); g.fillStyle = cg; g.beginPath(); g.ellipse(cx, cy, r * 1.6, r * 0.7, 0, 0, 7); g.fill();
      }
    }
    g.globalAlpha = 1;
  });
  t.magFilter = t.minFilter = THREE.LinearFilter; // (the sky is the one smooth thing: PS1 skies were gradients)
  return t;
});
export const smoke = () => once('smoke', () => canvasTex(32, 32, (g, w, h) => {
  const rnd = mulberry32(161);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(235,235,232,${0.25 + rnd() * 0.4})`; g.beginPath(); g.arc(8 + rnd() * 16, 8 + rnd() * 16, 3 + rnd() * 6, 0, 7); g.fill(); }
}, { repeat: false }));
// Soft dark blob under a car or a person (PS1 games had no real shadows: just this).
export const blob = () => once('blob', () => canvasTex(32, 32, (g, w, h) => {
  const gr = g.createRadialGradient(16, 16, 2, 16, 16, 16); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { repeat: false }));
// A pool of light on the ground under a lamp (additive decal — the dusk preset's street lighting).
export const lightPool = () => once('pool', () => canvasTex(32, 32, (g, w, h) => {
  const gr = g.createRadialGradient(16, 16, 1, 16, 16, 16); gr.addColorStop(0, 'rgba(255,200,120,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { repeat: false }));

// Generic fabric / plastic grit: multiplied by a material colour so clothes and props aren't flat fills.
export const grit = (amt = 28) => once(`grit${amt}`, () => canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h); grain(g, w, h, amt, 0.2, 171 + amt);
}));

// ---------------------------------------------------------------- autumn
export const FALL = [[218, 112, 32], [188, 58, 32], [230, 178, 48], [204, 138, 38], [138, 134, 44], [168, 40, 34], [98, 120, 50]];
// Fallen leaves scattered on a transparent ground decal (lawns, gutters, under every tree).
export const leaves = (seed = 1, density = 200) => once(`leaves${seed}${density}`, () => canvasTex(64, 64, (g, w, h) => {
  const rnd = mulberry32(seed * 313);
  for (let i = 0; i < density; i++) {
    const c = FALL[(rnd() * 6) | 0], x = rnd() * w, y = rnd() * h;
    g.fillStyle = css(mix(c, [40, 30, 20], rnd() * 0.35)); g.fillRect(x | 0, y | 0, 2 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0));
  }
  const d = g.getImageData(0, 0, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0; g.putImageData(d, 0, 0);
}));
// A raked pile: solid leaf litter.
export const leafPile = () => once('leafpile', () => canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = css([150, 82, 34]); g.fillRect(0, 0, w, h);
  const rnd = mulberry32(331);
  for (let i = 0; i < 220; i++) { const c = FALL[(rnd() * 6) | 0]; g.fillStyle = css(mix(c, [30, 20, 10], rnd() * 0.4)); g.fillRect(rnd() * w | 0, rnd() * h | 0, 2, 2); }
}));
// An open garage: the inside painted in (shelves, a fridge, bikes, boxes, a lawnmower) — the PS1 way to do depth.
export const garageInside = (seed = 1) => once(`garin${seed}`, () => canvasTex(64, 40, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, css([40, 38, 36])); gr.addColorStop(1, css([70, 66, 60]));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = css([90, 86, 80]); g.fillRect(6, h - 10, w - 12, 10); // the floor slab going back
  g.fillStyle = css([24, 22, 20]); g.fillRect(0, 0, w, 4); // the raised door
  const rnd = mulberry32(seed * 71);
  g.fillStyle = css([110, 90, 60]); g.fillRect(4, 10, 16, 2); g.fillRect(4, 18, 16, 2); // shelves
  for (let i = 0; i < 6; i++) { g.fillStyle = css([140 + rnd() * 80, 100 + rnd() * 60, 50 + rnd() * 40]); g.fillRect(5 + i * 2.5, 6 + (i % 2) * 8, 2, 4); }
  g.fillStyle = css([200, 198, 190]); g.fillRect(w - 14, 8, 9, 22); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(w - 14, 16, 9, 1); // the beer fridge
  g.strokeStyle = css([160, 40, 30]); g.lineWidth = 1; g.beginPath(); g.arc(28, 30, 4, 0, 7); g.arc(38, 30, 4, 0, 7); g.stroke(); // a bike
  g.fillStyle = css([170, 130, 80]); g.fillRect(44, 24, 7, 6); g.fillRect(45, 19, 6, 5); // boxes
  g.fillStyle = css([40, 110, 50]); g.fillRect(22, 32, 8, 4); // the mower
  grain(g, w, h, 10, 0.1, seed);
}, { repeat: false }));
export const fenceWood = () => once('fence', () => canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = css([150, 118, 84]); g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 4) { g.fillStyle = 'rgba(40,28,18,0.6)'; g.fillRect(x, 0, 1, h); g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(x + 1, 0, 1, h); }
  grain(g, w, h, 20, 0.2, 341); grimeBottom(g, w, h, 0.3, 0.3);
}));
export const chainlink = () => once('chain', () => canvasTex(16, 16, (g, w, h) => {
  g.strokeStyle = 'rgba(170,172,170,1)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(16, 16); g.moveTo(16, 0); g.lineTo(0, 16); g.moveTo(8, 0); g.lineTo(16, 8); g.moveTo(0, 8); g.lineTo(8, 16); g.moveTo(8, 0); g.lineTo(0, 8); g.moveTo(16, 8); g.lineTo(8, 16); g.stroke();
  const d = g.getImageData(0, 0, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 90 ? 255 : 0; g.putImageData(d, 0, 0);
}));
export const pumpkin = () => once('pumpkin', () => canvasTex(16, 16, (g, w, h) => {
  g.fillStyle = css([214, 112, 30]); g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 4) { g.fillStyle = 'rgba(120,50,10,0.5)'; g.fillRect(x, 0, 1, h); }
  grain(g, w, h, 14, 0.1, 351);
}));
// The distant ring: a hazy treeline of autumn colour with a few roofs and a water tower, alpha-cut along the top.
export const treeline = () => once('treeline', () => canvasTex(512, 64, (g, w, h) => {
  const rnd = mulberry32(361);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 260; i++) { // two ranks of crowns: the far rank paler
    const x = rnd() * w, r = 3 + rnd() * 5, top = h - (pass ? 14 : 22) - Math.sin(x * 0.03) * 4 - rnd() * 8;
    g.fillStyle = css(mix(FALL[(rnd() * 7) | 0], [158, 160, 168], pass ? 0.45 : 0.62));
    for (const dx of [0, w, -w]) { g.beginPath(); g.arc(x + dx, top + r, r, 0, 7); g.fill(); g.fillRect(x + dx - r, top + r, r * 2, h); }
  }
  g.fillStyle = css([152, 152, 158]); g.fillRect(301, 16, 3, 30); g.beginPath(); g.ellipse(302, 13, 8, 5, 0, 0, 7); g.fill(); // the water tower
  grain(g, w, h, 8, 0.05, 362);
  const d = g.getImageData(0, 0, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 128 ? 255 : 0; g.putImageData(d, 0, 0);
}));

// ---------------------------------------------------------------- inside CityMart
// Gondola shelving faces: four shelves of stock with price-tag strips. kind: grocery | gm | toys | paper.
export const shelfStock = (kind = 'grocery') => once(`stock${kind}`, () => canvasTex(64, 64, (g, w, h) => {
  const rnd = mulberry32(kind.length * 97);
  g.fillStyle = css([150, 152, 154]); g.fillRect(0, 0, w, h); // the pegboard back
  for (let s = 0; s < 4; s++) {
    const y0 = 2 + s * 15;
    let x = 0;
    while (x < w) { // facings: runs of the same product, then the next
      const pw = kind === 'paper' ? 10 : 3 + (rnd() * 4 | 0), run = 1 + (rnd() * 4 | 0), ph = 7 + (rnd() * 5 | 0);
      const c = kind === 'toys' ? [[230, 60, 130], [60, 90, 216], [242, 200, 60], [60, 180, 90]][rnd() * 4 | 0] : kind === 'paper' ? [[236, 236, 230], [210, 220, 236]][rnd() * 2 | 0] : kind === 'gm' ? [[200, 200, 196], [60, 60, 64], [190, 60, 50], [70, 110, 170]][rnd() * 4 | 0] : [[200, 60, 40], [230, 180, 50], [240, 236, 220], [60, 120, 60], [140, 70, 30], [40, 80, 160]][rnd() * 6 | 0];
      for (let k = 0; k < run && x < w; k++, x += pw) {
        g.fillStyle = css(c); g.fillRect(x, y0 + 12 - ph, pw - 1, ph);
        g.fillStyle = css(mix(c, [255, 255, 255], 0.45)); g.fillRect(x, y0 + 12 - ph + 2, pw - 1, 1);
      }
    }
    g.fillStyle = css([210, 212, 214]); g.fillRect(0, y0 + 12, w, 2); // the shelf lip
    g.fillStyle = css([242, 210, 60]); for (let x2 = 3; x2 < w; x2 += 11) g.fillRect(x2, y0 + 12, 4, 2); // price tags
  }
  grain(g, w, h, 10, 0.08, 401);
}));
// Reach-in freezer doors: aluminium frames, glass, lit shelves of cartons behind.
export const fridgeDoors = () => once('fridge', () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([190, 196, 200]); g.fillRect(0, 0, w, h);
  const rnd = mulberry32(411);
  for (let d = 0; d < 2; d++) {
    const x0 = 3 + d * 31;
    g.fillStyle = css([210, 230, 240]); g.fillRect(x0, 8, 27, 54);
    for (let s = 0; s < 5; s++) for (let x = x0 + 1; x < x0 + 26; x += 3) { g.fillStyle = css([[230, 230, 236], [200, 60, 50], [60, 100, 180], [240, 200, 80]][rnd() * 4 | 0]); g.fillRect(x, 10 + s * 10, 2, 7); }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x0 + 4, 8, 3, 54); g.fillStyle = css([150, 154, 158]); g.fillRect(x0 + 24, 30, 2, 12); // glare, handle
  }
  g.fillStyle = css([30, 60, 120]); g.fillRect(0, 0, w, 7); g.fillStyle = '#f2f2ee'; g.font = 'bold 6px Arial'; g.fillText('FROZEN', 20, 6);
  grain(g, w, h, 8, 0.06, 412);
}));
// Polished VCT floor tiles with the odd darker tile and scuffs.
export const storeFloor = () => once('sfloor', () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([208, 206, 198]); g.fillRect(0, 0, w, h);
  const rnd = mulberry32(421);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (rnd() < 0.15) { g.fillStyle = css([180, 182, 178]); g.fillRect(x * 16, y * 16, 16, 16); }
  g.fillStyle = 'rgba(120,118,110,0.5)'; for (let k = 0; k < 64; k += 16) { g.fillRect(k, 0, 1, h); g.fillRect(0, k, w, 1); }
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(10, 20, 30, 2); // the shine of the lights
  grain(g, w, h, 8, 0.1, 422);
}));
export const storeWall = () => once('swall', () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([226, 224, 216]); g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, y, w, 1); for (let x = (y / 8 % 2) * 8; x < w; x += 16) g.fillRect(x, y, 1, 8); } // painted block
  g.fillStyle = css([42, 90, 168]); g.fillRect(0, 50, w, 6); // the blue stripe at cart height
  grain(g, w, h, 8, 0.1, 431); grimeBottom(g, w, h, 0.15, 0.25);
}));
export const ceiling = () => once('ceil', () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = css([150, 150, 148]); g.fillRect(0, 0, w, h);
  g.fillStyle = css([164, 164, 160]); for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 2, h); // corrugated deck
  g.fillStyle = css([92, 92, 96]); g.fillRect(0, 30, w, 3); // a joist
  grain(g, w, h, 10, 0.1, 441);
}));
// The electronics wall: rows of TVs all showing the same bright picture.
export const tvWall = () => once('tvwall', () => canvasTex(64, 32, (g, w, h) => {
  g.fillStyle = css([30, 30, 34]); g.fillRect(0, 0, w, h);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
    const x = 2 + k * 16, y = 2 + r * 15;
    g.fillStyle = '#111'; g.fillRect(x, y, 14, 12);
    const gr = g.createLinearGradient(0, y + 1, 0, y + 11); gr.addColorStop(0, '#6ab8f0'); gr.addColorStop(0.6, '#58a04a'); gr.addColorStop(1, '#2a6a2a');
    g.fillStyle = gr; g.fillRect(x + 1, y + 1, 12, 9); g.fillStyle = '#f2f2ee'; g.fillRect(x + 8, y + 3, 3, 2);
  }
}, { repeat: true }));
export const checkout = () => once('checkout', () => canvasTex(32, 16, (g, w, h) => {
  g.fillStyle = css([220, 218, 210]); g.fillRect(0, 0, w, h); g.fillStyle = css([42, 90, 168]); g.fillRect(0, 0, w, 3); g.fillStyle = css([30, 30, 32]); g.fillRect(0, h - 2, w, 2);
  grain(g, w, h, 8, 0.1, 451);
}));
