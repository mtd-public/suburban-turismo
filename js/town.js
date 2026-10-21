// The art-test town: one stretch of Maple Parkway with a sample of every location along it.
//
//   north side (−z): Whispering Pines Ct. (autumn cul-de-sac) · McDaniel's (lot + drive-thru) · CityMart (lot + store)
//   south side (+z): Founders Park · The Promenade at Maple Creek (outdoor mall)
//
// Everything static goes into one group that is merged per material at the end (a few dozen draw calls for the
// whole town); the collision world is store-smash's platform model (js/world.js): boxes for buildings, kerbs and
// sidewalks, posts for trunks and poles.
import * as THREE from 'three';
import { lam, basic, canvasTex } from './ps1.js';
import * as T from './tex.js';
import { OFF1, OFF2, tbox, baseBox, patch, disc, ring, line, decal, tree, mergeStatic } from './geo.js';
import { buildVehicle } from './cars.js';
import { mulberry32 } from './utils.js';

const ROAD_HW = 7, KERB = 0.15;

export function buildTown() {
  const S = new THREE.Group(), plats = [], posts = [], spots = {}, lamps = [], dyn = [], glass = [];
  const rnd = mulberry32(2026);
  const add = (o) => { S.add(o); return o; };
  const solid = (x, z, w, d, h) => plats.push({ x, z, w, d, h, thick: h });
  const post = (x, z, r, h = 4) => posts.push({ x, z, r, y0: 0, y1: h });
  // A rotated solid: axis-aligned when it can be, otherwise a row of posts along it.
  const solidRot = (x, z, w, d, ry, h) => {
    const q = Math.round(ry / (Math.PI / 2));
    if (Math.abs(ry - q * Math.PI / 2) < 1e-3) { const sw = q % 2 ? d : w, sd = q % 2 ? w : d; solid(x, z, sw, sd, h); return; }
    const r = Math.min(w, d) / 2, n = Math.ceil(Math.max(w, d) / r), long = w > d, s = Math.sin(ry), c = Math.cos(ry);
    for (let i = 0; i <= n; i++) { const o = (i / n - 0.5) * (Math.max(w, d) - 2 * r); const lx = long ? o : 0, lz = long ? 0 : o; post(x + lx * c + lz * s, z - lx * s + lz * c, r, h); }
  };

  const M = {
    grass: lam(0xffffff, T.grass(false, 0)), lawn: lam(0xffffff, T.grass(true, 2), OFF1), park: lam(0xffffff, T.grass(false, 1), OFF1),
    asphalt: lam(0xffffff, T.asphalt(0), OFF1), lot: lam(0xffffff, T.asphalt(1), OFF1), concrete: lam(0xffffff, T.concrete(true)), slab: lam(0xffffff, T.concrete(false), OFF2),
    kerb: lam(0xd0ccc4, T.concrete(false)), dirt: lam(0xffffff, T.dirt(), OFF2), mulch: lam(0xffffff, T.mulch(), OFF2), water: lam(0xffffff, T.water(), OFF2),
    leaves: (s) => lam(0xffffff, T.leaves(s), { alphaTest: 0.5, ...OFF2 }), pile: lam(0xffffff, T.leafPile()), hedge: lam(0xffffff, T.hedge()),
    dark: lam(0x2a2c30, T.grit()), pole: lam(0x6a6e70, T.grit()), green: lam(0x2e4a36, T.grit()), wood: lam(0xffffff, T.fenceWood()),
    chain: lam(0xffffff, T.chainlink(), { alphaTest: 0.5, side: THREE.DoubleSide }), white: lam(0xe8e6e0, T.grit()), yellow: lam(0xd8b040, T.grit()),
  };

  // ------------------------------------------------------------ ground and the parkway
  add(patch(-320, -260, 320, 260, M.grass, 4, 0, 16));
  add(patch(-260, -ROAD_HW, 260, ROAD_HW, M.asphalt, 5, 0.03, 4));
  for (const z of [-0.12, 0.12]) add(line(-260, z, 260, z, 0.1, true, 0.05)); // double yellow
  for (let x = -258; x < 258; x += 9) for (const z of [-3.5, 3.5]) add(line(x, z, x + 3, z, 0.12, false, 0.05)); // lane dashes
  // kerb bands: grass verge + sidewalk, broken where a street or a driveway comes in
  const gaps = { '-1': [[-134.5, -125.5], [-30, -22], [8, 14], [85, 95], [140, 150]], '1': [[-120, -114], [30, 40], [100, 110]] };
  for (const side of [-1, 1]) {
    const cuts = gaps[side].sort((a, b) => a[0] - b[0]);
    let x0 = -260;
    for (const [a, b] of [...cuts, [260, 260]]) {
      if (b > x0 && a > x0) {
        const w = a - x0, cx = x0 + w / 2;
        add(baseBox(w, KERB, 2.6, [M.kerb, M.kerb, M.grass, M.kerb, M.kerb, M.kerb], [2, 2, 4, 2, 2, 2], cx, 0, side * (ROAD_HW + 1.3)));
        add(baseBox(w, KERB, 2.4, [M.kerb, M.kerb, M.concrete, M.kerb, M.kerb, M.kerb], [2, 2, 2.4, 2, 2, 2], cx, 0, side * (ROAD_HW + 3.8)));
        solid(cx, side * (ROAD_HW + 2.5), w, 5, KERB);
        // street trees in the verge and street lamps
        for (let x = x0 + 6; x < a - 4; x += 24) {
          add(tree(x, side * (ROAD_HW + 1.3), 0.9 + rnd() * 0.25, (rnd() * 6 | 0) + 1, T.FALL[rnd() * 7 | 0])); post(x, side * (ROAD_HW + 1.3), 0.3);
          add(leafScatter(x, side * (ROAD_HW + 1.3), 3.5, rnd));
        }
        for (let x = x0 + 18; x < a - 4; x += 36) streetLamp(x, side * (ROAD_HW + 0.5), side < 0 ? 0 : Math.PI);
      }
      x0 = Math.max(x0, b);
    }
  }
  // crosswalks and signals at the two big intersections
  for (const xc of [-130, 90]) {
    for (let z = -6; z <= 6; z += 1.2) { add(line(xc - 6.5, z, xc - 6.5, z + 0.6, 2.4, false, 0.05)); add(line(xc + 6.5, z, xc + 6.5, z + 0.6, 2.4, false, 0.05)); }
    signal(xc - 8, -ROAD_HW - 0.6, 0); signal(xc + 8, ROAD_HW + 0.6, Math.PI);
  }

  // ------------------------------------------------------------ helpers that need the scope
  function leafScatter(x, z, r, R = rnd) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), M.leaves((R() * 4 | 0) + 1));
    m.rotation.x = -Math.PI / 2; m.rotation.z = R() * 6; m.position.set(x, 0.17, z); return m;
  }
  function leafPile(x, z, s = 1) {
    const g = new THREE.SphereGeometry(0.9 * s, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.45, 1);
    const m = new THREE.Mesh(g, M.pile); m.position.set(x, 0.1, z); add(m); add(leafScatter(x, z, 1.8 * s));
  }
  function pumpkin(x, z, s = 1, y = 0) {
    const g = new THREE.SphereGeometry(0.22 * s, 8, 4); g.scale(1, 0.75, 1);
    const m = new THREE.Mesh(g, lam(0xffffff, T.pumpkin())); m.position.set(x, y + 0.16 * s, z); add(m);
    add(baseBox(0.04, 0.08, 0.04, M.green, null, x, y + 0.3 * s, z));
  }
  function streetLamp(x, z, ry) {
    const h = 8;
    add(baseBox(0.18, h, 0.18, M.pole, null, x, 0, z));
    const arm = baseBox(0.1, 0.1, 2.2, M.pole, null, 0, 0, 0); const g = new THREE.Group(); g.add(arm); arm.position.set(0, h - 0.1, 1.1);
    const head = baseBox(0.4, 0.18, 0.8, M.dark, null, 0, h - 0.3, 2.1); g.add(head);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.6), basic(0xffe0a8)); lens.rotation.x = Math.PI / 2; lens.position.set(0, h - 0.31, 2.1); g.add(lens);
    g.position.set(x, 0, z); g.rotation.y = ry; add(g);
    post(x, z, 0.15, h);
    const p = new THREE.Vector3(0, 0, 2.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); lamps.push([x + p.x, z + p.z, h]);
  }
  function signal(x, z, ry) {
    const g = new THREE.Group();
    g.add(baseBox(0.25, 6.2, 0.25, M.pole, null, 0, 0, 0));
    g.add(baseBox(0.15, 0.15, 7, M.pole, null, 0, 5.9, 3.5));
    for (const o of [2.5, 5.5]) {
      g.add(baseBox(0.38, 1.05, 0.3, M.yellow, null, 0, 4.9, o));
      [0xc02018, 0x403a10, 0x103a18].forEach((c, k) => { const l = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6), basic(k === 2 ? 0x30d060 : c)); l.position.set(0, 5.75 - k * 0.32, o); l.rotation.y = -Math.PI / 2; l.position.x = -0.16; g.add(l); });
    }
    const sgn = decal(1.4, 0.35, lam(0xffffff, T.sign('MAPLE PKWY', { w: 64, h: 16, bg: '#2a6a3a', font: 'bold 9px Arial' })), -0.09, 5.4, 1.2, -Math.PI / 2); g.add(sgn);
    g.position.set(x, 0, z); g.rotation.y = ry; add(g); post(x, z, 0.2, 6);
  }
  function lightPole(x, z, h = 10) {
    add(baseBox(0.35, 0.6, 0.35, M.slab, 1, x, 0, z)); add(baseBox(0.16, h, 0.16, M.pole, null, x, 0, z));
    for (const s of [-1, 1]) { add(baseBox(0.7, 0.2, 0.4, M.dark, null, x + s * 0.5, h - 0.1, z)); const l = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), basic(0xfff0c8)); l.rotation.x = Math.PI / 2; l.position.set(x + s * 0.5, h - 0.11, z); add(l); lamps.push([x + s * 0.5, z, h]); }
    post(x, z, 0.3, h);
  }
  function parkingRow(x0, z, n, dir, w = 2.8, len = 5.5) { // stall lines, dir = ±1 which way the stalls run from z
    for (let i = 0; i <= n; i++) add(line(x0 + i * w, z, x0 + i * w, z + dir * len, 0.12, false, 0.06));
  }
  const CAR_COLS = [0x8a1e1e, 0x2a3a5a, 0xb8b8b4, 0x1c1c20, 0xe4e2dc, 0x4a5a3a, 0x7a6a50, 0x5a6a7a];
  const CAR_KEYS = ['sedan', 'sedan', 'minivan', 'hybrid', 'luxury', 'sedan'];
  function parkedCar(x, z, ry, key = CAR_KEYS[rnd() * CAR_KEYS.length | 0], color = CAR_COLS[rnd() * CAR_COLS.length | 0]) {
    const c = buildVehicle(key, { color, plate: ['8KJ 221', 'WGN 4LF', 'BRB 909', 'MOM TAXI', 'LTE 2PTY'][rnd() * 5 | 0] });
    c.position.set(x, 0, z); c.rotation.y = ry; add(c);
    const s = c.userData.spec; solidRot(x, z, s.width, s.len, ry, 1.5);
  }
  function fillRow(x0, z, n, ry, w = 2.8, chance = 0.55, keep = () => true) { for (let i = 0; i < n; i++) if (rnd() < chance && keep(x0 + w * (i + 0.5))) parkedCar(x0 + w * (i + 0.5), z, ry + (rnd() - 0.5) * 0.06); }
  function bench(x, z, ry) {
    const g = new THREE.Group(); g.add(baseBox(1.6, 0.06, 0.45, M.wood, 1, 0, 0.42, 0)); g.add(baseBox(1.6, 0.4, 0.06, M.wood, 1, 0, 0.5, -0.22));
    for (const s of [-0.7, 0.7]) g.add(baseBox(0.06, 0.45, 0.4, M.dark, null, s, 0, 0)); g.position.set(x, 0, z); g.rotation.y = ry; add(g);
  }
  function bin(x, z) { dyn.push(['bin', x, z]); }
  function sign(x, z, ry, text, o = {}) { // a monument / pole sign face
    const w = o.w ?? 4, h = o.h ?? 1;
    const g = new THREE.Group();
    if (o.monument) g.add(baseBox(w + 0.6, h + 0.5, 0.6, lam(0xffffff, T.brick(0x7a5040)), 1, 0, 0, 0));
    else for (const s of [-1, 1]) g.add(baseBox(0.25, o.y ?? 6, 0.25, M.pole, null, s * w * 0.35, 0, 0));
    const face = decal(w, h, lam(0xffffff, T.sign(text, o.tex ?? {})), 0, (o.monument ? 0.25 : (o.y ?? 6)) + h / 2, o.monument ? 0.31 : 0.15, 0);
    g.add(face);
    if (!o.monument) { const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.15; g.add(back); g.add(baseBox(w + 0.2, h + 0.2, 0.25, M.dark, null, 0, o.y ?? 6, 0).translateY(-0.1)); }
    g.position.set(x, 0, z); g.rotation.y = ry; add(g);
    post(x, z, 0.4, 3);
    return g;
  }

  // ------------------------------------------------------------ 1. Whispering Pines Ct. (the autumn cul-de-sac)
  {
    const sx = -130, z0 = -ROAD_HW, z1 = -80, bz = -94, br = 15;
    add(patch(sx - 4.5, z1, sx + 4.5, z0, M.asphalt, 5, 0.03));
    add(disc(sx, bz, br, M.asphalt, 5, 0.031, 24));
    add(disc(sx, bz, 4.5, M.lawn, 4, 0.2, 12)); add(baseBox(0.01, 0.01, 0.01, M.grass, null, sx, 0, bz)); // the island
    solid(sx, bz, 7, 7, 0.2);
    add(tree(sx, bz, 1.2, 3, T.FALL[1])); post(sx, bz, 0.3); leafPile(sx + 2, bz + 1.5, 0.8);
    add(ring(sx, bz, br, br + 0.3, M.kerb, 2, 0.12, 24));
    for (const s of [-1, 1]) { // sidewalks down both sides
      add(baseBox(1.6, KERB, -z1 + z0 + 1, [M.kerb, M.kerb, M.concrete, M.kerb, M.kerb, M.kerb], [2, 2, 1.6, 2, 2, 2], sx + s * 5.4, 0, (z0 + z1) / 2 - 2));
      solid(sx + s * 5.4, (z0 + z1) / 2 - 2, 1.6, -z1 + z0 + 1, KERB);
    }
    sign(sx - 9, -14, Math.PI / 4, 'Whispering Pines', { monument: true, w: 4.2, h: 1.0, tex: { bg: '#3a3a30', fg: '#e8dcb0', font: 'italic bold 15px Georgia, serif', sub: 'ESTATES · EST. 1994', subFont: 'bold 6px Georgia, serif', w: 128, h: 32 } });
    for (let i = 0; i < 5; i++) dyn.push(['pumpkin', sx - 9 + (i - 2) * 0.6, -12.6]);
    for (const z of [-22, -36, -50, -64]) { dyn.push(['leafbag', sx - 4.0, z, rnd()]); dyn.push(['leafbag', sx - 4.0, z - 0.8, rnd()]); dyn.push(['bin', sx + 4.0, z + 3]); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; dyn.push(['pumpkin', sx + Math.cos(a) * 3.3, bz + Math.sin(a) * 3.3]); }
    // the houses: [x, z, facing point, palette, storeys, garage open?, extras]
    const H = [
      [-151, -30, 1, 0xc8b89a, 2, true, ['hoop']], [-151, -58, 1, 0x8a98a4, 1, false, ['piles']], [-109, -30, -1, 0xe0dccf, 2, false, ['jones']],
      [-109, -58, -1, 0x9aa48a, 1, true, ['grill']], [-130, -126, 0, 0xd8c88a, 2, true, ['piles']], [-153, -117, 2, 0xb0a090, 2, false, ['piles']], [-107, -117, 3, 0x8a6a5a, 1, true, []],
    ];
    H.forEach(([x, z, f, col, st, open, ex], i) => {
      const look = f === 1 ? [sx, z] : f === -1 ? [sx, z] : [sx, bz];
      const ry = Math.atan2(look[0] - x, look[1] - z);
      house(x, z, ry, col, st, open, ex, i);
    });
    spots.harold = { x: -137.5, z: -46, ry: Math.PI / 2 };
    spots.greg = { x: -120.6, z: -51.4, ry: -Math.PI / 2 };
    spots.mrJones = { x: -120, z: -33.4, ry: -Math.PI / 2 - 0.15 };
    spots.mrsJones = { x: -120.3, z: -31.9, ry: -Math.PI / 2 - 0.45 };
  }
  function house(x, z, ry, col, storeys, open, extras, seed) {
    const g = new THREE.Group(), R = mulberry32(seed * 97 + 5);
    const W = 11, D = 9, h = storeys === 2 ? 5.6 : 3.0;
    const brickLower = storeys === 2 && seed % 2 === 0;
    const wall = lam(0xffffff, T.siding(col)), roofM = lam(0xffffff, T.shingles([0x4a4642, 0x5a4a3e, 0x3e4448][seed % 3])), trim = lam(0xe8e6de, T.grit());
    // lot: lawn (raised a hair), driveway, walk, leaves
    const lot = new THREE.Group(); g.add(lot);
    lot.add(patch(-W / 2 - 6, -D / 2 - 4, W / 2 + 3, D / 2 + 10, M.lawn, 4, 0.04));
    lot.add(patch(W / 2 - 0.2 - 6.6, D / 2 + 1.5, W / 2 - 0.2, D / 2 + 12.5, M.slab, 3, 0.07)); // the driveway (under the garage wing)
    lot.add(patch(-2.4, D / 2 + 1, -1.2, D / 2 + 10, M.slab, 1.2, 0.07));
    const body = baseBox(W, h, D, [wall, wall, wall, wall, brickLower ? lam(0xffffff, T.brick(0x8a4a38)) : wall, wall], [2, 2, 2, 2, brickLower ? 2.8 : 2, 2], -1.5, 0, 0);
    g.add(body);
    if (brickLower) g.add(baseBox(W + 0.06, 0.12, D + 0.06, trim, null, -1.5, 2.8, 0));
    g.add(gable(W + 0.8, D + 1.0, storeys === 2 ? 2.4 : 2.0, wall, roofM, -1.5, h, 0));
    // garage wing
    const gw = 6.6, gh = 2.9;
    g.add(baseBox(gw, gh, D - 1, wall, 2, W / 2 - 0.2 - gw / 2 + 3.3, 0, 1.5));
    const gwx = W / 2 - 0.2 - gw / 2 + 3.3;
    const gr = gable(gw + 0.6, D, 1.4, wall, roofM, gwx, gh, 1.5); gr.rotation.y = 0; g.add(gr);
    g.add(decal(5.0, 2.3, open ? lam(0xffffff, T.garageInside(seed + 1)) : lam(0xffffff, T.garageDoor()), gwx, 1.17, 1.5 + (D - 1) / 2 + 0.02));
    g.add(baseBox(5.3, 0.12, 0.05, trim, null, gwx, 2.33, 1.5 + (D - 1) / 2 + 0.02));
    if (open) { // a light on inside and stuff spilling out
      g.add(baseBox(0.7, 1.0, 0.7, lam(0x2a5a2a, T.grit()), null, gwx + 2.0, 0, D / 2 + 1.6));
      g.add(baseBox(0.7, 1.0, 0.7, lam(0x2a3a7a, T.grit()), null, gwx + 1.2, 0, D / 2 + 1.6));
    }
    // windows, door, shutters, porch
    const winM = lam(0xffffff, T.houseWindow([0xd8cdb0, 0xb8c8c0, 0xe0c0a0][seed % 3])), shut = lam(0xffffff, T.shutter());
    const fz = D / 2 + 0.03;
    for (const wx of [-5.0, 1.6]) for (let s = 0; s < storeys; s++) {
      const wy = 1.6 + s * 2.7;
      g.add(decal(1.1, 1.5, winM, wx, wy, fz));
      if (seed % 2 === 0) { g.add(decal(0.4, 1.5, shut, wx - 0.8, wy, fz)); g.add(decal(0.4, 1.5, shut, wx + 0.8, wy, fz)); }
    }
    if (storeys === 2) g.add(decal(1.1, 1.5, winM, -1.7, 4.3, fz));
    g.add(decal(1.0, 2.1, lam(0xffffff, T.frontDoor([0x6a2a24, 0x2a3a5a, 0x2a4a34][seed % 3])), -1.8, 1.25, fz));
    g.add(baseBox(2.6, 0.2, 1.4, M.slab, 1, -1.8, 0, D / 2 + 0.7)); g.add(baseBox(2.0, 0.2, 0.5, M.slab, 1, -1.8, 0, D / 2 + 1.6));
    g.add(baseBox(2.8, 0.15, 1.6, trim, null, -1.8, 2.5, D / 2 + 0.75));
    for (const s of [-1, 1]) g.add(baseBox(0.14, 2.3, 0.14, trim, null, -1.8 + s * 1.25, 0.2, D / 2 + 1.4));
    // the porch display: pumpkins, a mum, a hay bale
    for (const [px, ps] of [[-3.0, 1], [-3.4, 0.7], [-0.6, 0.9]]) { const p = new THREE.Vector3(px, 0, D / 2 + 1.7); g.add(pump(p.x, p.z, ps, 0.2)); }
    g.add(baseBox(0.9, 0.5, 0.5, lam(0xc8a860, T.grit(40)), null, -3.6, 0.2, D / 2 + 0.6));
    // shrubs under the windows, a chimney, gutter
    for (const wx of [-5.0, 1.6]) g.add(baseBox(2.2, 0.8, 0.8, M.hedge, 1, wx, 0, D / 2 + 0.5));
    g.add(baseBox(1.2, h + 3.2, 1.0, lam(0xffffff, T.brick(0x7a4636)), 1.6, -6.4, 0, -1));
    g.add(baseBox(W + 0.8, 0.12, 0.12, trim, null, -1.5, h - 0.05, D / 2 + 0.55));
    // mailbox at the kerb, bins on the drive
    g.add(baseBox(0.1, 1.0, 0.1, M.wood, null, -4.5, 0, D / 2 + 9.5)); g.add(baseBox(0.25, 0.25, 0.5, M.dark, null, -4.5, 1.0, D / 2 + 9.5));
    g.add(baseBox(0.6, 1.05, 0.7, lam(0x2a4a7a, T.grit()), null, W / 2 + 2.6, 0.07, D / 2 + 11)); g.add(baseBox(0.6, 1.05, 0.7, lam(0x3a3c40, T.grit()), null, W / 2 + 2.6, 0.07, D / 2 + 10.2));
    // yard tree, leaves
    const tcol = T.FALL[(seed * 3) % 7];
    g.add(tree(-6.5, D / 2 + 7, 1.15 + R() * 0.3, (seed % 6) + 1, tcol));
    for (let k = 0; k < 5; k++) { const lp = leafScatterLocal(-6 + R() * 12, D / 2 + 3 + R() * 9, 2 + R() * 2, R); g.add(lp); }
    if (extras.includes('piles')) { g.add(pileLocal(-4.5, D / 2 + 9, 1)); g.add(pileLocal(-2.8, D / 2 + 10.5, 0.7)); g.add(baseBox(0.05, 1.5, 0.05, M.wood, null, -3.6, 0, D / 2 + 9.8)); g.add(baseBox(0.6, 0.9, 0.4, lam(0xd87a20, T.grit()), null, -5.8, 0.04, D / 2 + 10.4)); }
    if (extras.includes('hoop')) { g.add(baseBox(0.12, 3.2, 0.12, M.pole, null, W / 2 + 3.2, 0, D / 2 + 9.5)); g.add(baseBox(1.2, 0.8, 0.05, M.white, null, W / 2 + 3.2, 3.0, D / 2 + 9.4)); }
    if (extras.includes('grill')) { g.add(baseBox(0.9, 0.9, 0.6, M.dark, null, W / 2 + 1.5, 0.07, D / 2 + 8.4)); g.add(baseBox(0.9, 0.3, 0.6, lam(0x1a1a1c), null, W / 2 + 1.5, 0.97, D / 2 + 8.4)); }
    // the back fence
    g.add(baseBox(W + 9.6, 1.8, 0.1, M.wood, 2, 0.3, 0, -D / 2 - 4)); for (const s of [-1, 1]) g.add(baseBox(0.1, 1.8, 6, M.wood, 2, 0.3 + s * (W / 2 + 4.8), 0, -D / 2 - 1));
    g.position.set(x, 0, z); g.rotation.y = ry; add(g);
    solidRot(x + Math.cos(ry) * -1.5, z - Math.sin(ry) * -1.5, W + 6.6, D, ry, h);
    // a car on the drive
    const dp = new THREE.Vector3(gwx, 0, D / 2 + 6).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    if (extras.includes('jones')) parkedCar(x + dp.x, z + dp.z, ry + Math.PI, 'luxury', 0x1b1c22);
    else if (seed % 3 !== 2 && !extras.includes('grill')) parkedCar(x + dp.x, z + dp.z, ry + Math.PI, seed % 2 ? 'minivan' : 'sedan');
  }
  function pump(x, z, s, y) { const gg = new THREE.Group(); const sg = new THREE.SphereGeometry(0.22 * s, 8, 4); sg.scale(1, 0.75, 1); const m = new THREE.Mesh(sg, lam(0xffffff, T.pumpkin())); m.position.set(x, y + 0.16 * s, z); gg.add(m); return gg; }
  function leafScatterLocal(x, z, r, R) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), M.leaves((R() * 4 | 0) + 1)); m.rotation.x = -Math.PI / 2; m.rotation.z = R() * 6; m.position.set(x, 0.08, z); return m; }
  function pileLocal(x, z, s) { const gg = new THREE.Group(); const sg = new THREE.SphereGeometry(0.9 * s, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); sg.scale(1, 0.45, 1); const m = new THREE.Mesh(sg, M.pile); m.position.set(x, 0.04, z); gg.add(m); return gg; }
  // A gable roof (ridge along x), base at y, walls' texture on the gable ends.
  function gable(w, d, rise, wallM, roofM, x, y, z) {
    const sh = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
    g.rotateY(Math.PI / 2); g.translate(-w / 2, 0, 0);
    const p = g.attributes.position, uv = g.attributes.uv, capEnd = g.groups[0].count;
    for (let i = 0; i < p.count; i++) {
      if (i < capEnd) uv.setXY(i, p.getZ(i) / 2, p.getY(i) / 2);
      else uv.setXY(i, p.getX(i) / 2, (Math.abs(p.getZ(i)) + p.getY(i)) / 1.6);
    }
    const m = new THREE.Mesh(g, [wallM, roofM]); m.position.set(x, y, z);
    return m;
  }

  // ------------------------------------------------------------ 2. Founders Park
  {
    const cx = -125;
    add(patch(-182, ROAD_HW + 5, -68, 118, M.park, 4, 0.02));
    // parking at the entrance
    add(patch(-121, ROAD_HW + 5, -113, 28, M.lot, 5, 0.04)); add(patch(-140, 28, -96, 44, M.lot, 5, 0.04));
    parkingRow(-139, 28, 15, 1, 2.8, 5); fillRow(-139, 30.5, 15, Math.PI, 2.8, 0.45);
    // the path loop and the pond
    add(ring(cx, 78, 26, 28, M.dirt, 3, 0.05, 28));
    add(disc(cx, 78, 11, M.water, 6, 0.06, 18)); add(ring(cx, 78, 11, 12.2, lam(0x8a8478, T.concrete(false)), 2, 0.1, 18));
    solid(cx, 78, 20, 20, 0.0); // (the pond is drivable for now: phase 2 makes it a splash)
    // gazebo
    const gz = new THREE.Group();
    gz.add(baseBox(6.5, 0.4, 6.5, M.slab, 2, 0, 0, 0));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; gz.add(baseBox(0.18, 2.8, 0.18, M.white, null, Math.cos(a) * 2.9, 0.4, Math.sin(a) * 2.9)); }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.0, 1.8, 8), lam(0xffffff, T.shingles(0x5a3a32))); cone.position.y = 4.1; cone.rotation.y = Math.PI / 8; gz.add(cone);
    gz.position.set(-98, 0, 64); add(gz); post(-98, 64, 3.2, 4);
    // playground: posts, deck, slide, swings, on mulch
    add(disc(-152, 56, 9, M.mulch, 2, 0.05, 14));
    const pg = new THREE.Group(), red = lam(0xb83a2a, T.grit()), blue = lam(0x2a5a9a, T.grit()), ylw = lam(0xd8b03a, T.grit());
    for (const [px, pz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) pg.add(baseBox(0.18, 3.2, 0.18, blue, null, px, 0, pz));
    pg.add(baseBox(3.4, 0.15, 3.4, ylw, null, 0, 1.5, 0));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), red); roof.position.y = 3.8; roof.rotation.y = Math.PI / 4; pg.add(roof);
    const slide = baseBox(0.8, 0.08, 3.6, ylw, null, 0, 0, 0); slide.position.set(0, 0.85, 3.3); slide.rotation.x = 0.42; pg.add(slide);
    pg.add(baseBox(0.12, 2.6, 0.12, red, null, 4.5, 0, -1.2)); pg.add(baseBox(0.12, 2.6, 0.12, red, null, 8.5, 0, -1.2)); pg.add(baseBox(4.2, 0.12, 0.12, red, null, 6.5, 2.55, -1.2));
    for (const sx2 of [5.6, 7.4]) { pg.add(baseBox(0.03, 2.0, 0.03, M.pole, null, sx2, 0.55, -1.2)); pg.add(baseBox(0.6, 0.06, 0.25, M.dark, null, sx2, 0.5, -1.2)); }
    pg.position.set(-154, 0, 56); add(pg); post(-154, 56, 2.2, 3); post(-147.5, 54.8, 0.4, 3);
    // soccer field (Brenda's)
    add(patch(-178, 92, -140, 116, lam(0xffffff, T.grass(true, 2), OFF2), 4, 0.03));
    for (const [a, b, c, d] of [[-178, 92, -140, 92], [-178, 116, -140, 116], [-178, 92, -178, 116], [-140, 92, -140, 116], [-159, 92, -159, 116]]) add(line(a, b, c, d, 0.12, false, 0.06));
    for (const gx of [-177.5, -140.5]) { add(baseBox(0.1, 2.2, 0.1, M.white, null, gx, 0, 101)); add(baseBox(0.1, 2.2, 0.1, M.white, null, gx, 0, 107)); add(baseBox(0.1, 0.1, 6, M.white, null, gx, 2.15, 104)); }
    // trees, benches, bins, a park sign
    for (let i = 0; i < 46; i++) {
      const x = -180 + rnd() * 110, z = 14 + rnd() * 100;
      if (Math.hypot(x - cx, z - 78) < 30 && Math.hypot(x - cx, z - 78) > 13 && rnd() < 0.6) continue;
      if (x < -138 && z > 88) continue; if (Math.hypot(x + 152, z - 56) < 11) continue; if (x > -142 && x < -94 && z < 46) continue;
      add(tree(x, z, 1.0 + rnd() * 0.5, (rnd() * 6 | 0) + 1, T.FALL[rnd() * 7 | 0])); post(x, z, 0.3);
      add(leafScatter(x, z, 3 + rnd() * 2));
    }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.3; bench(cx + Math.cos(a) * 29.5, 78 + Math.sin(a) * 29.5, -a - Math.PI / 2); }
    bin(-110, 52); bin(-140, 98);
    sign(-104, 14, 0, 'FOUNDERS PARK', { monument: true, w: 4, h: 0.9, tex: { bg: '#3a4a2a', fg: '#e8e0c0', font: 'bold 16px Georgia, serif', w: 128, h: 32 } });
    spots.brenda = { x: -152, z: 90, ry: Math.PI - 0.3 };
  }

  // ------------------------------------------------------------ 3. McDaniel's
  {
    const bx = -9, bz = -40, bw = 17, bd = 11.5, bh = 4.4;
    add(patch(-40, -72, 22, -ROAD_HW - 5, M.lot, 5, 0.04));
    add(patch(-30, -ROAD_HW - 5, -22, -ROAD_HW, M.lot, 5, 0.04)); add(patch(8, -ROAD_HW - 5, 14, -ROAD_HW, M.lot, 5, 0.04));
    const brickM = lam(0xffffff, T.brick(0x9a5a3a)), red = lam(0xffffff, T.stucco(0xa82a22)), cream = lam(0xffffff, T.stucco(0xe0d4b4));
    add(baseBox(bw, bh, bd, brickM, 2.4, bx, 0, bz)); solid(bx, bz, bw, bd, bh);
    // the red mansard band and the yellow trim
    const mans = new THREE.Mesh(new THREE.CylinderGeometry(Math.hypot(bw, bd) / 2 * 0.62, Math.hypot(bw, bd) / 2 * 0.74, 1.6, 4, 1), red);
    mans.rotation.y = Math.PI / 4; mans.scale.set(bw / Math.hypot(bw, bd) * 1.42, 1, bd / Math.hypot(bw, bd) * 1.42); mans.position.set(bx, bh + 0.5, bz); add(mans);
    add(baseBox(bw + 0.4, 0.25, bd + 0.4, M.yellow, null, bx, bh - 0.2, bz));
    // windows all round the front and the east side, the door, the sign on the band
    const glass = lam(0xffffff, T.storefront([46, 40, 34]));
    add(decal(bw - 5, 2.4, glass, bx - 1, 1.5, bz + bd / 2 + 0.03)); add(decal(6, 2.4, glass, bx + bw / 2 + 0.03, 1.5, bz + 1, Math.PI / 2));
    add(decal(1.6, 2.3, lam(0xffffff, T.storefront([30, 30, 30])), bx + 6.4, 1.15, bz + bd / 2 + 0.03));
    add(decal(7, 1.3, lam(0xffffff, T.sign("McDaniel's", { w: 128, h: 24, bg: '#a82a22', fg: '#f6d04a', font: 'italic bold 20px Georgia, serif' })), bx - 1, bh + 0.6, bz + bd / 2 + 1.2));
    // drive-thru: a lane round the west side and the back, the menu board, the speaker, the window
    add(patch(bx - bw / 2 - 5, bz - bd / 2 - 5, bx - bw / 2 - 0.5, bz + bd / 2 + 4, M.asphalt, 5, 0.05));
    add(patch(bx - bw / 2 - 5, bz - bd / 2 - 5, bx + bw / 2 + 4, bz - bd / 2 - 0.5, M.asphalt, 5, 0.05));
    for (let z = bz - bd / 2 - 4; z < bz + bd / 2 + 3; z += 2) add(line(bx - bw / 2 - 5.2, z, bx - bw / 2 - 5.2, z + 1, 0.12, true, 0.07)); // the lane's kerb paint
    add(baseBox(0.6, 0.15, bd + 8, M.kerb, 2, bx - bw / 2 - 5.6, 0, bz - 0.5)); solid(bx - bw / 2 - 5.6, bz - 0.5, 0.6, bd + 8, 0.15);
    const mb = new THREE.Group(); mb.add(baseBox(0.2, 1.2, 0.2, M.dark, null, 0, 0, 0)); mb.add(baseBox(2.6, 1.9, 0.3, M.dark, null, 0, 1.0, 0));
    mb.add(decal(2.4, 1.7, lam(0xffffff, T.menuBoard()), 0, 1.95, 0.16)); mb.add(baseBox(2.8, 0.3, 0.5, red, 1, 0, 2.9, 0));
    mb.position.set(bx - bw / 2 - 7.2, 0, bz - 4); mb.rotation.y = Math.PI / 2; add(mb); post(bx - bw / 2 - 7.2, bz - 4, 0.6, 3);
    add(baseBox(0.35, 1.3, 0.35, red, 1, bx - bw / 2 - 6.2, 0, bz - 7.5)); add(decal(0.25, 0.25, M.dark, bx - bw / 2 - 6.02, 1.0, bz - 7.5, Math.PI / 2));
    add(decal(1.4, 1.2, lam(0xffffff, T.storefront([60, 54, 40])), bx - 2, 1.6, bz - bd / 2 - 0.03, Math.PI));
    add(baseBox(2.4, 0.2, 1.4, M.yellow, null, bx - 2, 2.6, bz - bd / 2 - 0.7)); // the window's awning
    add(baseBox(0.4, 0.5, 0.5, M.white, null, bx - 2, 1.0, bz - bd / 2 - 0.25)); // the hand-off ledge
    // the pole sign out front (the tall one you see from the parkway), with a burger, not arches
    const ps = sign(16, -14, 0, "McDaniel's", { y: 9, w: 4.2, h: 2.2, tex: { w: 64, h: 32, bg: '#a82a22', fg: '#f6d04a', font: 'italic bold 13px Georgia, serif', sub: 'BILLIONS SERVED · SOME LEFT', subFont: 'bold 4px Arial', border: '#f6d04a' } });
    const burger = new THREE.Group();
    [[0xc8883a, 0.5, 0.9], [0x5a3020, 0.18, 1.0], [0x4a8a3a, 0.08, 1.05], [0xc8883a, 0.3, 0.95]].reduce((y, [c, h, r]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), lam(c, T.grit())); m.position.y = y + h / 2; burger.add(m); return y + h; }, 11.4);
    burger.position.set(16, 0, -14); add(burger);
    // lot: stalls along the front, a few cars, the dumpster pen, light poles, planters
    parkingRow(-27, bz + bd / 2 + 4, 14, 1, 2.8, 5.2); fillRow(-27, bz + bd / 2 + 6.6, 14, Math.PI, 2.8, 0.5);
    parkingRow(8, -60, 4, 1, 2.8, 5.2); fillRow(8, -57.4, 4, 0, 2.8, 0.7);
    add(baseBox(4, 1.8, 3, lam(0xffffff, T.brick(0x9a5a3a)), 2, 14, 0, -66)); solid(14, -66, 4, 3, 1.8);
    lightPole(-34, -22); lightPole(14, -30); lightPole(-34, -62);
    add(baseBox(10, 0.4, 2.2, M.kerb, 2, -23, 0, -14)); add(patch(-27.8, -14.9, -18.2, -13.1, M.mulch, 2, 0.41)); for (let i = 0; i < 3; i++) add(tree(-27 + i * 4, -14, 0.8, i + 2, T.FALL[(i * 2) % 7]));
    solid(-23, -14, 10, 2.2, 0.4);
    spots.tyler = { x: bx - 3.6, z: bz - bd / 2 - 1.0, ry: Math.PI };
    spots.karen = { x: bx - bw / 2 - 3.4, z: bz + bd / 2 + 1.2, ry: Math.PI + 0.6 };
  }

  // ------------------------------------------------------------ 4. The Promenade at Maple Creek (outdoor mall)
  {
    add(patch(-22, ROAD_HW + 5, 142, 62, M.lot, 5, 0.04));
    for (const [a, b] of [[30, 40], [100, 110]]) add(patch(a, ROAD_HW, b, ROAD_HW + 5, M.lot, 5, 0.04));
    for (const z of [20, 38]) { parkingRow(-18, z, 16, 1, 2.8, 5.2); parkingRow(-18, z, 16, -1, 2.8, 5.2); parkingRow(66, z, 24, 1, 2.8, 5.2); parkingRow(66, z, 24, -1, 2.8, 5.2); fillRow(-18, z + 2.6, 16, 0, 2.8, 0.5); fillRow(-18, z - 2.6, 16, Math.PI, 2.8, 0.4); fillRow(66, z + 2.6, 24, 0, 2.8, 0.4); fillRow(66, z - 2.6, 24, Math.PI, 2.8, 0.5); }
    for (const x of [-10, 30, 75, 120]) lightPole(x, 29);
    // the storefront row: a sidewalk with a colonnade, two storeys, shops with awnings and signs
    add(baseBox(164, KERB, 12, [M.kerb, M.kerb, lam(0xffffff, T.concrete(true)), M.kerb, M.kerb, M.kerb], [2, 2, 2.5, 2, 2, 2], 60, 0, 68)); solid(60, 68, 164, 12, KERB);
    const shops = [
      ['Bed, Bath & Bewildered', '#1e3a7a', '#ffffff', 0xd8ccb0], ['Sunglass Shack', '#1a1a1a', '#e8c040', 0xc8b8a0], ['The Gap Year', '#16285a', '#ffffff', 0xd0c4b0],
      ['Pottery Barnyard', '#3a2a1e', '#e8dcc0', 0xb8a890], ['Aberdeen & Finch', '#2a2a2a', '#d8d0c0', 0xcbbda4], ['Spenser\'s Gifts', '#5a1a5a', '#f0d040', 0xc0b0a0],
      ['Bath & Bodyworks-ish', '#e8e4dc', '#2a3a6a', 0xd4c8b8], ['Sharper Imagery', '#1a1a1a', '#c8c8c8', 0xb8b0a4], ['Cinnamon Swirl', '#7a3a1a', '#f6e0b0', 0xd8c4a4],
    ];
    const sw = 18, sx0 = 60 - (shops.length * sw) / 2 + sw / 2, fz = 74, sh = 8.5;
    shops.forEach(([name, bg, fg, wallc], i) => {
      const x = sx0 + i * sw, wall = lam(0xffffff, T.stucco(wallc)), h = sh + (i % 3 === 1 ? 2 : 0);
      add(baseBox(sw, h, 16, wall, 3, x, KERB, fz + 8)); solid(x, fz + 8, sw, 16, h);
      add(baseBox(sw + 0.1, 0.5, 0.4, lam(0xffffff, T.stucco(0xe8e0d0)), 2, x, h - 0.2 + KERB, fz + 0.1)); // cornice
      add(decal(sw - 2, 3.4, lam(0xffffff, T.storefront([36 + i * 3, 40, 46])), x, 2.0, fz - 0.02, Math.PI));
      add(decal(sw - 2, 2.6, lam(0xffffff, T.upperWindows()), x, 7.0, fz - 0.02, Math.PI));
      add(decal(sw - 4, 1.2, lam(0xffffff, T.sign(name, { w: 128, h: 20, bg, fg, font: `bold ${name.length > 16 ? 11 : 14}px ${i % 2 ? 'Georgia, serif' : 'Arial, sans-serif'}` })), x, 5.1, fz - 0.05, Math.PI));
      // an awning on every other shop
      if (i % 2 === 0) { const aw = baseBox(sw - 3, 0.1, 1.8, lam([0x7a2a24, 0x2a4a3a, 0x3a3a5a][i % 3], T.grit()), null, x, 3.5, fz - 0.9); aw.rotation.x = -0.25; add(aw); }
    });
    // the colonnade and the street furniture
    for (let x = -18; x <= 138; x += 9) { add(baseBox(0.45, 3.6, 0.45, lam(0xffffff, T.stucco(0xe0d8c8)), 1, x, KERB, 64)); post(x, 64, 0.35, 4); }
    add(baseBox(164, 0.4, 3.2, lam(0xffffff, T.stucco(0xe0d8c8)), 2, 60, 3.75, 65.6));
    add(baseBox(164, 0.2, 3.6, lam(0xffffff, T.shingles(0x6a3a2a)), 2, 60, 4.15, 65.6));
    for (let x = -10; x < 135; x += 18) { add(tree(x + 4.5, 67, 0.85, (x & 5) + 1, T.FALL[(x & 7) % 7])); post(x + 4.5, 67, 0.3); add(baseBox(1.4, 0.5, 1.4, lam(0xffffff, T.brick(0x8a5a44)), 1, x + 4.5, KERB, 67)); bench(x + 9, 68, Math.PI); }
    // the fountain plaza in front of the middle
    add(disc(60, 56, 6, lam(0xffffff, T.concrete(true)), 2, 0.12, 16)); solid(60, 56, 12, 12, 0.6);
    add(ring(60, 56, 4.2, 4.8, lam(0xffffff, T.concrete(false)), 1, 0.6, 16)); add(disc(60, 56, 4.2, M.water, 3, 0.45, 16));
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.5, 0.5, 10), lam(0xffffff, T.concrete(false))); tier.position.set(60, 1.6, 56); add(tier);
    add(baseBox(0.4, 1.6, 0.4, lam(0xffffff, T.concrete(false)), 1, 60, 0, 56));
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 6, 1, true), basic(0xd8e8ec, null, { transparent: true, opacity: 0.6 })); plume.position.set(60, 2.6, 56); add(plume);
    sign(-14, 13, 0, 'THE PROMENADE', { y: 4.5, w: 5, h: 1.6, tex: { w: 128, h: 40, bg: '#2a2a28', fg: '#e8dcc0', font: 'bold 16px Georgia, serif', sub: 'AT MAPLE CREEK', subFont: 'bold 9px Georgia, serif' } });
    spots.bev = { x: 40, z: 65.5, ry: Math.PI / 2, walk: [[-14, 65.5], [134, 65.5]] };
    spots.ron = { x: 38.6, z: 66.6, ry: Math.PI / 2, walk: [[-15.4, 66.6], [132.6, 66.6]] };
    spots.dale = { x: 52, z: 60.5, ry: -Math.PI / 2 };
  }

  // ------------------------------------------------------------ 5. CityMart
  {
    const x0 = 50, x1 = 192, sz0 = -96, sz1 = -156;
    add(patch(x0, sz0 + 2, x1, -ROAD_HW - 5, M.lot, 5, 0.04));
    for (const [a, b] of [[85, 95], [140, 150]]) add(patch(a, -ROAD_HW - 5, b, -ROAD_HW, M.lot, 5, 0.04));
    // the parking field: four double rows, islands with trees at the ends, light poles, cart corrals
    for (const z of [-24, -42, -60, -78]) {
      parkingRow(56, z, 46, 1, 2.8, 5.2); parkingRow(56, z, 46, -1, 2.8, 5.2);
      const clear = (x) => Math.abs(x - 90) > 4 && Math.abs(x - 145) > 4; // nobody parks in front of the doors: a straight run from the road to the glass
      fillRow(56, z + 2.6, 46, 0, 2.8, z > -50 ? 0.12 : 0.3, clear); fillRow(56, z - 2.6, 46, Math.PI, 2.8, z > -50 ? 0.12 : 0.28, clear);
      for (const ix of [54, 187]) { add(baseBox(3, 0.2, 10, M.kerb, 2, ix, 0, z)); add(patch(ix - 1.4, z - 4.9, ix + 1.4, z + 4.9, M.mulch, 2, 0.21)); add(tree(ix, z, 0.9, (ix + z) & 5 + 1, T.FALL[((ix - z) & 7) % 7])); solid(ix, z, 3, 10, 0.2); }
      for (const lx of [112, 130, 170]) lightPole(lx, z, 11);
      for (const cx of [100, 150]) { const cc = new THREE.Group(); for (const s of [-1, 1]) cc.add(baseBox(0.06, 1.0, 5, M.pole, null, s * 0.7, 0, 0)); cc.add(baseBox(1.5, 0.06, 5, M.pole, null, 0, 1.0, 0)); cc.add(baseBox(1.5, 0.9, 0.06, lam(0xffffff, T.sign('CARTS', { w: 32, h: 16, bg: '#2a5aa8', font: 'bold 8px Arial' })), [null, null, null, null, 1, 1].map((v) => v), 0, 0.05, 2.5)); cc.position.set(cx, 0, z + 1.4); add(cc); solid(cx, z + 1.4, 1.5, 5, 1); }
    }
    // the store: a hollow tilt-up box you can drive into (through the vestibule glass), Super-centre layout inside
    const sw = 120, sx = 120, sh = 10, sdep = sz0 - sz1, zc = (sz0 + sz1) / 2;
    const tilt = lam(0xffffff, T.tiltup()), inW = lam(0xd2cec6, T.storeWall());
    const wall = (w, d, x, z, inner, y0 = 0, h = sh) => { const f = [tilt, tilt, M.slab, M.slab, tilt, tilt]; f[inner] = inW; add(baseBox(w, h, d, f, [8, 8, 2, 2, 8, 8].map((t, i) => (i === inner ? 4 : t)), x, y0, z)); if (y0 < 2) solid(x, z, w, d, h + y0); };
    wall(sw, 0.6, sx, sz1 + 0.3, 4); wall(0.6, sdep, sx - sw / 2 + 0.3, zc, 0); wall(0.6, sdep, sx + sw / 2 - 0.3, zc, 1);
    const doors = [[sx - 35, sx - 25], [sx + 25, sx + 35]];
    for (const [a, b] of [[sx - sw / 2, doors[0][0]], [doors[0][1], doors[1][0]], [doors[1][1], sx + sw / 2]]) wall(b - a, 0.6, (a + b) / 2, sz0 - 0.3, 5);
    for (const [a, b] of doors) wall(b - a, 0.6, (a + b) / 2, sz0 - 0.3, 5, 4, sh - 4);
    add(baseBox(sw, 0.4, sdep, [tilt, tilt, M.slab, basic(0xe0e0dc, T.ceiling()), tilt, tilt], [8, 8, 8, 6, 8, 8], sx, sh - 0.4, zc)); // roof deck
    add(baseBox(sw + 0.4, 1.0, 0.6, lam(0x2a5aa8, T.grit()), null, sx, sh, sz0 + 0.1));
    add(baseBox(sw, KERB, 6, [M.kerb, M.kerb, M.concrete, M.kerb, M.kerb, M.kerb], [2, 2, 3, 2, 2, 2], sx, 0, sz0 + 3)); solid(sx, sz0 + 3, sw, 6, KERB);
    add(baseBox(sw - 1.2, KERB, sdep - 1.2, [M.kerb, M.kerb, lam(0xc4c0b6, T.storeFloor()), M.kerb, M.kerb, M.kerb], [2, 2, 4, 2, 2, 2], sx, 0, zc)); solid(sx, zc, sw - 1.2, sdep - 1.2, KERB);
    const strip = basic(0xf4f6f2);
    for (let z = sz0 - 4; z > sz1 + 2; z -= 8) for (let x = sx - sw / 2 + 5; x < sx + sw / 2 - 4; x += 6) add(baseBox(3.6, 0.06, 0.35, strip, null, x, sh - 0.7, z)); // fluorescent fixtures
    // the vestibules: side walls, roof, a fascia with the department sign, and the glass you can drive through
    for (const [a, b] of doors) {
      const vx = (a + b) / 2, st = lam(0xffffff, T.stucco(0xd8d0c0));
      for (const s of [-1, 1]) { add(baseBox(0.3, 7, 6, st, 3, vx + s * 7.15, 0, sz0 + 3)); solid(vx + s * 7.15, sz0 + 3, 0.3, 6, 7); }
      add(baseBox(14.6, 0.4, 6, [st, st, M.slab, basic(0xe0e0dc, T.ceiling()), st, st], 3, vx, 6.6, sz0 + 3));
      add(baseBox(14.6, 2.6, 0.3, st, 3, vx, 4.0, sz0 + 5.85));
      add(decal(9, 1.0, lam(0xffffff, T.sign(vx < sx ? 'GROCERY · PHARMACY' : 'HOME · GARDEN · AUTO', { w: 128, h: 16, bg: '#2a5aa8', font: 'bold 9px Arial' })), vx, 5.6, sz0 + 6.02));
      const pane = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 0.1), lam(0xffffff, T.storefront([60, 70, 80]), { transparent: true, opacity: 0.8 }));
      pane.position.set(vx, 2.0 + KERB, sz0 + 5.85); glass.push({ mesh: pane, plat: { x: vx, z: sz0 + 5.85, w: 14, d: 0.4, h: 4.2, thick: 4.2 } });
    }
    // checkouts along the front, with gaps at both entrances
    const coM = lam(0xffffff, T.checkout()), dark = M.dark;
    let lane = 1;
    for (let x = sx - 54; x <= sx + 54; x += 6) {
      if (doors.some(([a, b]) => x > a - 3 && x < b + 3)) continue;
      add(baseBox(0.9, 0.95, 4, coM, 1, x, KERB, sz0 - 10)); solid(x, sz0 - 10, 0.9, 4, 1.1);
      add(baseBox(0.5, 0.35, 0.5, dark, null, x, KERB + 0.95, sz0 - 8.6));
      add(baseBox(0.08, 2.4, 0.08, M.pole, null, x - 0.3, KERB + 0.95, sz0 - 11.7));
      add(decal(0.5, 0.5, lam(0xffffff, T.sign(String(lane++), { w: 16, h: 16, bg: '#2a5aa8', font: 'bold 11px Arial', grime: 0 })), x - 0.3, KERB + 3.4, sz0 - 11.66));
    }
    // grocery (west): reach-in freezers on the west and back walls, aisles of gondolas, produce up front
    const fr = lam(0xffffff, T.fridgeDoors());
    add(baseBox(1.0, 2.5, 46, [fr, M.kerb, M.slab, M.slab, M.kerb, M.kerb], [2.6, 1, 1, 1, 1, 1], sx - sw / 2 + 1.1, KERB, zc - 6)); solid(sx - sw / 2 + 1.1, zc - 6, 1.0, 46, 2.6);
    add(baseBox(54, 2.5, 1.0, [M.kerb, M.kerb, M.slab, M.slab, fr, M.kerb], [1, 1, 1, 1, 2.6, 1], sx - 31, KERB, sz1 + 1.1)); solid(sx - 31, sz1 + 1.1, 54, 1.0, 2.6);
    const gondola = (x, z, len, kind) => {
      const sm = lam(0xffffff, T.shelfStock(kind));
      add(baseBox(1.3, 2.1, len, [sm, sm, M.slab, M.slab, sm, sm], [2, 2, 1, 1, 1.3, 1.3], x, KERB, z));
      solid(x, z, 1.3, len, 2.25); plats[plats.length - 1].shelf = true;
    };
    for (let i = 0; i < 6; i++) gondola(sx - 34 + i * 6, zc - 8, 26, i % 3 === 2 ? 'paper' : 'grocery');
    // general merchandise (east): toy and home aisles, the TV wall, apparel racks, pharmacy at the back
    for (let i = 0; i < 5; i++) gondola(sx + 30 + i * 6, zc + 2, 22, i < 2 ? 'toys' : 'gm');
    add(baseBox(52, 2.8, 0.8, [M.kerb, M.kerb, M.slab, M.slab, lam(0xffffff, T.tvWall()), M.kerb], [1, 1, 1, 1, 4, 1], sx + 32, KERB, sz1 + 1.0)); solid(sx + 32, sz1 + 1.0, 52, 0.8, 2.9);
    for (let i = 0; i < 9; i++) { const x = sx + 6 + (i % 3) * 5, z = zc + 14 - (i / 3 | 0) * 5; add(baseBox(0.08, 1.5, 0.08, M.pole, null, x, KERB, z)); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.0, 8, 1, true), lam([0x7a2a3a, 0x2a4a6a, 0xc8a86a, 0x4a6a4a][i % 4], T.grit(40), { side: THREE.DoubleSide })); r.position.set(x, KERB + 0.9, z); add(r); post(x, z, 0.8, 1.5); }
    add(baseBox(12, 1.1, 1.0, [coM, coM, M.slab, M.slab, coM, coM], 2, sx, KERB, sz1 + 5)); solid(sx, sz1 + 5, 12, 1.0, 1.25);
    add(baseBox(12, 4, 0.4, inW, 4, sx, KERB, sz1 + 1.3));
    // hanging department signs
    const hang = (text, x, z, ry = 0) => { const g = new THREE.Group(); const m = lam(0xffffff, T.sign(text, { w: 64, h: 16, bg: '#2a5aa8', font: 'bold 10px Arial', grime: 0 })); g.add(baseBox(4.2, 1.0, 0.1, lam(0x2a5aa8), null, 0, 0, 0)); g.add(decal(4, 0.9, m, 0, 0.5, 0.06)); g.add(decal(4, 0.9, m, 0, 0.5, -0.06, Math.PI)); g.add(baseBox(0.03, sh - 7.5, 0.03, M.pole, null, -1.5, 1, 0)); g.add(baseBox(0.03, sh - 7.5, 0.03, M.pole, null, 1.5, 1, 0)); g.position.set(x, 6.2, z); g.rotation.y = ry; add(g); };
    hang('GROCERY', sx - 19, zc - 8); hang('PRODUCE', sx - 48, sz0 - 18); hang('FROZEN', sx - 55, zc - 6, Math.PI / 2); hang('TOYS', sx + 36, zc + 2); hang('HOME', sx + 48, zc + 2);
    hang('ELECTRONICS', sx + 32, sz1 + 6); hang('APPAREL', sx + 11, zc + 18); hang('PHARMACY', sx, sz1 + 7); hang('FALL HARVEST', sx, sz0 - 15);
    // what you can knock over inside
    for (const x of [sx - 22, sx - 10, sx + 8, sx + 20]) dyn.push(['soda', x, sz0 - 15.5]);
    for (let i = 0; i < 8; i++) dyn.push(['produce', sx - 54 + (i % 4) * 3.2, sz0 - 18 - (i / 4 | 0) * 3.2]);
    for (let i = 0; i < 6; i++) dyn.push(['produce', sx - 4 + (i % 3) * 3, sz0 - 18 - (i / 3 | 0) * 2.6]); // the seasonal pumpkin bins
    for (let i = 0; i < 6; i++) dyn.push(['mannequin', sx + 4 + i * 2.6, zc + 19.5, rnd() * 6]);
    for (let i = 0; i < 10; i++) dyn.push(['cart', sx - 50 + rnd() * 100, sz0 - 13.5 - rnd() * 3, rnd() * 6]);
    for (let i = 0; i < 6; i++) dyn.push(['boxes', sx - 34 + i * 6, zc - 22.6, rnd()]);
    for (let i = 0; i < 5; i++) dyn.push(['boxes', sx + 30 + i * 6, zc - 10.6, rnd()]);
    // outside: loose carts in the lot, cones on the fire lane, news boxes and bins by the doors
    for (let i = 0; i < 16; i++) dyn.push(['cart', 60 + rnd() * 125, -16 - rnd() * 70, rnd() * 6]);
    dyn.push(['cart', 90.6, -58, 1.2], ['cart', 89.4, -72, 2.6], ['cone', 91, -84], ['cone', 89, -85]); // strays in the door aisle
    for (let i = 0; i < 6; i++) dyn.push(['cone', sx - 50 + i * 20, sz0 + 9]);
    for (const [a, b] of doors) { dyn.push(['newsbox', a - 2.5, sz0 + 4.5]); dyn.push(['bin', b + 2.5, sz0 + 4.5]); dyn.push(['cart', b + 4.5, sz0 + 3.5, 0.2]); dyn.push(['cart', b + 5.2, sz0 + 3.5, 0.1]); }
    add(decal(28, 5, lam(0xffffff, T.sign('CityMart', { w: 128, h: 24, bg: '#d8d2c4', fg: '#1e4aa0', font: 'bold 22px Arial, sans-serif', grime: 0.3 })), sx, 6.4, sz0 + 0.03));
    const star = new THREE.Mesh(new THREE.CircleGeometry(2.2, 8), basic(0xf2c230)); star.position.set(sx + 16, 7.2, sz0 + 0.06); add(star);
    add(decal(16, 1.2, lam(0xffffff, T.sign('SAVE MORE · THINK LESS', { w: 128, h: 12, bg: '#d8d2c4', fg: '#2a2a2a', font: 'bold 9px Arial' })), sx, 3.4, sz0 + 0.04));
    // garden centre: chain-link on the east end with pallets of mulch
    const gx = sx + sw / 2 + 9;
    for (const [px, pz, w, ry] of [[gx + 9, (sz0 + sz1) / 2 + 10, 40, 0], [gx, sz0 + 0.5 - 10, 18, Math.PI / 2]]) { const f = decal(w, 3.5, M.chain, px, 1.75, pz, ry + Math.PI / 2); f.material = M.chain; add(f); }
    add(baseBox(18, 0.2, 40, M.slab, 3, gx, 0, (sz0 + sz1) / 2 + 10)); solid(gx + 9, (sz0 + sz1) / 2 + 10, 0.3, 40, 3.5); solid(gx, sz0 - 9.5, 18, 0.3, 3.5);
    for (let k = 0; k < 6; k++) { add(baseBox(1.2, 0.15, 1.0, M.wood, 1, gx - 4 + (k % 3) * 2.4, 0.2, sz0 - 22 - (k / 3 | 0) * 3)); add(baseBox(1.1, 0.7, 0.9, lam(0x5a3a22, T.grit(40)), null, gx - 4 + (k % 3) * 2.4, 0.35, sz0 - 22 - (k / 3 | 0) * 3)); }
    // the propane cage and the movie kiosk by the doors
    add(baseBox(2.4, 1.8, 1.0, M.chain, 1, sx - 44, KERB, sz0 + 5.4)); for (let k = 0; k < 6; k++) add(baseBox(0.3, 0.6, 0.3, lam(0xd8d8d8, T.grit()), null, sx - 45 + k * 0.4, KERB, sz0 + 5.4));
    add(baseBox(1.6, 2.2, 0.8, lam(0xa82020, T.grit()), null, sx - 15, KERB, sz0 + 5.4)); add(decal(1.4, 0.4, lam(0xffffff, T.sign('BLOCKBOX', { w: 32, h: 8, bg: '#a82020', fg: '#fff', font: 'bold 6px Arial' })), sx - 15, 2.1, sz0 + 5.82));
    // the pole sign by the parkway
    sign(68, -14, 0, 'CityMart', { y: 10, w: 7, h: 2.4, tex: { w: 96, h: 32, bg: '#1e4aa0', fg: '#ffffff', font: 'bold 20px Arial', sub: 'OPEN 24 HOURS · PHARMACY', subFont: 'bold 6px Arial' } });
    spots.doris = { x: sx - 35.5, z: sz0 + 7.4, ry: 0.3 }; // beside the door, not in it
  }

  // ------------------------------------------------------------ woods: autumn tree stands in the gaps between places
  const clear = [[-262, -12, 262, 12], [-140, -84, -120, -12], [-150, -112, -110, -76], [-182, 12, -68, 118], [-42, -74, 24, -12], [-24, 12, 144, 94], [48, -162, 196, -12], [-168, -140, -92, -16]];
  const woods = (x0, z0, x1, z1, n) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (clear.some(([a, b, c, d]) => x > a - 2 && x < c + 2 && z > b - 2 && z < d + 2)) continue;
      add(tree(x, z, 1.0 + rnd() * 0.6, (rnd() * 6 | 0) + 1, T.FALL[rnd() * 7 | 0])); post(x, z, 0.3);
      if (rnd() < 0.5) add(leafScatter(x, z, 3 + rnd() * 2));
    }
  };
  woods(-250, -200, 250, -14, 420); woods(-250, 14, 250, 200, 300);
  // the cul-de-sac's own canopy: a ring of big trees behind the houses
  for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2, r = 44 + rnd() * 14; const x = -130 + Math.cos(a) * r * 0.75, z = -80 + Math.sin(a) * r; if (z > -14) continue; add(tree(x, z, 1.3 + rnd() * 0.5, (rnd() * 6 | 0) + 1, T.FALL[rnd() * 6 | 0])); post(x, z, 0.3); }

  // ------------------------------------------------------------ the horizon: a painted treeline ring
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(330, 330, 40, 32, 1, true), basic(0xffffff, T.treeline(), { alphaTest: 0.5, side: THREE.BackSide, fog: false }));
  tl.material.map.repeat.set(3, 1); tl.position.y = 14; add(tl);

  // the dusk preset's light pools under every lamp (additive decals, a PS1 standby)
  const pools = new THREE.Group();
  const poolM = basic(0xffffff, T.lightPool(), { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, z] of lamps) { const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), poolM); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.24, z); pools.add(m); }

  const merged = mergeStatic(S);
  return { group: merged, pools, plats, posts, spots, dyn, glass };
}

// Named camera stops for the location tour: [label, blurb, camera position, look-at].
export const LOCATIONS = [
  { key: 'culdesac', name: 'Whispering Pines Ct.', blurb: 'The cul-de-sac in October. Raked piles, pumpkins on every porch, one garage open on a beer fridge and a bike nobody rides. HOA Harold is measuring a lawn.', cams: [[[-130, 9, -10], [-130, 1, -60]], [[-124, 3.2, -74], [-140, 2, -40]], [[-130, 18, -70], [-130, 0, -110]]] },
  { key: 'park', name: 'Founders Park', blurb: 'Duck pond, gazebo, the playground with the slide that burns in July, and the U9 soccer field where Brenda lives every Saturday.', cams: [[[-100, 7, 40], [-130, 1, 80]], [[-130, 5, 62], [-150, 1, 100]], [[-90, 12, 20], [-125, 0, 70]]] },
  { key: 'mcdaniels', name: "McDaniel's", blurb: 'Brick, a red mansard band, a burger on a pole. The drive-thru lane wraps round the back past the menu board to Window 2, where the ice cream machine is broken.', cams: [[[8, 4, -6], [-10, 3, -40]], [[-36, 3, -32], [-12, 2, -48]], [[-20, 2.2, -56], [-12, 2, -40]]] },
  { key: 'promenade', name: 'The Promenade at Maple Creek', blurb: 'The outdoor mall: a colonnade, awnings, a fountain nobody throws money into anymore, and the 7 a.m. mall walkers who will not yield.', cams: [[[60, 5, 36], [60, 3, 70]], [[0, 2.5, 58], [70, 3, 66]], [[110, 9, 30], [50, 2, 66]]] },
  { key: 'citymart', name: 'CityMart', blurb: 'A box the size of a county, a lot the size of a smaller county. Cart corrals, 11 m light poles, a garden centre behind chain-link and Doris at the door.', cams: [[[120, 6, -30], [120, 4, -96]], [[60, 4, -50], [120, 3, -90]], [[170, 14, -18], [110, 0, -80]]] },
  { key: 'citymart-in', name: 'CityMart (inside)', blurb: 'Drive through the vestibule glass and you are in a Super-centre: checkouts, an action alley of soda towers and pumpkin bins, grocery aisles, reach-in freezers, a TV wall. Everything loose goes flying; shelves shed their stock.', cams: [[[90, 2.4, -101], [92, 1.6, -130]], [[150, 6.5, -100], [130, 1, -140]], [[66, 2.2, -112], [80, 1.2, -132]]] },
  { key: 'parkway', name: 'Maple Parkway', blurb: 'The road that ties it together: four lanes, a double yellow, autumn street trees and a signal at every place you might want to turn.', cams: [[[-60, 2, 4], [40, 2, -2]], [[-150, 6, 12], [-110, 1, -8]]] },
];
