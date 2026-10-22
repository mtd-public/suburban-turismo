// Geometry helpers: textured boxes with world-scaled UVs, ground patches, decals, billboards, and the static
// merge that turns a whole town of little meshes into a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from './vendor/addons/BufferGeometryUtils.js';
import { lam, basic } from './ps1.js';
import * as T from './tex.js';

// Ground layers: vertex jitter breaks plain depth ordering between near-coplanar layers at grazing angles (the PS1
// itself had no z-buffer and drew them in order), so each layer above the base ground gets a depth-slope offset.
export const OFF1 = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
export const OFF2 = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 };

// A box whose UVs repeat every `tile` metres on each face (so a 40 m wall doesn't stretch one 64 px texture).
// mats: one material or six (+x, −x, +y, −y, +z, −z, three.js order). tile: number, null (0..1 per face) or
// a per-face array.
export function tbox(w, h, d, mats, tile = 2) {
  // long faces are split every ~4 m, like the ground, so the affine warp on a 26 m shelf or a 120 m wall stays a wobble
  const n = (v) => Math.max(1, Math.round(v / 4)), sw = n(w), sh = n(h), sd = n(d);
  const g = new THREE.BoxGeometry(w, h, d, sw, sh, sd);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const verts = [[sd, sh], [sd, sh], [sw, sd], [sw, sd], [sw, sh], [sw, sh]].map(([a, b]) => (a + 1) * (b + 1));
  for (let f = 0, i0 = 0; f < 6; i0 += verts[f++]) {
    const t = Array.isArray(tile) ? tile[f] : tile;
    if (!t) continue;
    for (let i = i0; i < i0 + verts[f]; i++) uv.setXY(i, uv.getX(i) * dims[f][0] / t, uv.getY(i) * dims[f][1] / t);
  }
  return new THREE.Mesh(g, mats);
}
// Shift a box so its base sits at y (boxes are built centred).
export function at(mesh, x, y, z, ry = 0) { mesh.position.set(x, y, z); mesh.rotation.y = ry; return mesh; }
export function baseBox(w, h, d, mats, tile, x, y, z, ry = 0) { const m = tbox(w, h, d, mats, tile); return at(m, x, y + h / 2, z, ry); }

// A flat patch on the ground (or any height), subdivided every ~4 m so affine warping stays a wobble, not a
// smear (exactly what PS1 racers did with their road meshes). UVs are world metres / tile.
export function patch(x0, z0, x1, z1, mat, tile = 4, y = 0, seg = 4) {
  const w = x1 - x0, d = z1 - z0;
  const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / seg)), Math.max(1, Math.round(d / seg)));
  g.rotateX(-Math.PI / 2);
  g.translate(x0 + w / 2, y, z0 + d / 2);
  worldUV(g, tile);
  return new THREE.Mesh(g, mat);
}
export function disc(x, z, r, mat, tile = 4, y = 0, segs = 20) {
  const g = new THREE.CircleGeometry(r, segs, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2); g.translate(x, y, z); worldUV(g, tile);
  return new THREE.Mesh(g, mat);
}
export function ring(x, z, r0, r1, mat, tile = 4, y = 0, segs = 24) {
  const g = new THREE.RingGeometry(r0, r1, segs, 1);
  g.rotateX(-Math.PI / 2); g.translate(x, y, z); worldUV(g, tile);
  return new THREE.Mesh(g, mat);
}
function worldUV(g, tile) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, -p.getZ(i) / tile);
}
// A painted line on the ground from (x0, z0) to (x1, z1), `wd` wide.
export function line(x0, z0, x1, z1, wd = 0.12, yellow = false, y = 0.02) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(wd, len);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 3);
  const m = new THREE.Mesh(g, lam(0xffffff, T.paint(yellow), { alphaTest: 0.5, ...OFF2 }));
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.rotation.y = Math.atan2(x1 - x0, z1 - z0);
  return m;
}
// A vertical decal (window, door, sign) facing +z before rotation.
export function decal(w, h, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  return m;
}
// Every crown material, so the time of day can tint them all.
export const FOLIAGE = new Set();
// The PS1 tree: a trunk and two crossed alpha-tested quads (plus a third, flat-ish one for volume from above).
// Every tree planted, so the overhead map can draw crowns (the crossed quads vanish edge-on from straight above).
export const TREES = [];
export function tree(x, z, s = 1, seed = 1, tone = [70, 96, 46]) {
  const g = new THREE.Group();
  TREES.push({ x, z, s, seed, tone });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 3 * s, 5), lam(0xffffff, T.bark()));
  trunk.position.y = 1.5 * s; g.add(trunk);
  // crowns are pre-lit and unlit (as the era did): a Lambert double-sided quad goes black on its back face
  const mat = basic(0xffffff, T.foliage(tone, seed), { alphaTest: 0.5, side: THREE.DoubleSide });
  FOLIAGE.add(mat);
  for (let k = 0; k < 3; k++) { // three quads at 60°: reads as a full crown from any side
    const q = new THREE.Mesh(new THREE.PlaneGeometry(5.6 * s, 5.6 * s), mat);
    q.position.y = 4.6 * s; q.rotation.y = k * Math.PI / 3 + seed; g.add(q);
  }
  g.position.set(x, 0, z);
  return g;
}
export function blobShadow(w, d, y = 0.03) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), basic(0xffffff, T.blob(), { transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y;
  return m;
}

// Merge every mesh under `root` into one mesh per material (world transforms baked). Static scenery only.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const parts = Array.isArray(o.material) && g.groups.length ? g.groups.map((gr) => [mats[gr.materialIndex], sub(g, gr.start, gr.count)]) : [[mats[0], g]];
    for (const [m, pg] of parts) {
      if (!m) continue;
      for (const k of Object.keys(pg.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) pg.deleteAttribute(k);
      if (!pg.attributes.uv) pg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pg.attributes.position.count * 2), 2));
      if (!pg.attributes.normal) pg.computeVertexNormals();
      if (m.vertexColors && !pg.attributes.color) pg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pg.attributes.position.count * 3).fill(1), 3));
      if (!m.vertexColors && pg.attributes.color) pg.deleteAttribute('color');
      pg.clearGroups();
      if (!byMat.has(m)) byMat.set(m, []);
      byMat.get(m).push(pg);
    }
  });
  const out = new THREE.Group();
  for (const [m, list] of byMat) {
    const g = mergeGeometries(list, false);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, m);
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return out;
}
// A prop's parts merged into one mesh per material, in the prop's own space: it still moves as one, in fewer draws.
export function mergeLocal(g) {
  const keep = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() };
  g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.set(1, 1, 1);
  const merged = mergeStatic(g);
  g.position.copy(keep.p); g.quaternion.copy(keep.q); g.scale.copy(keep.s);
  g.clear(); for (const m of [...merged.children]) g.add(m);
  return g;
}
function sub(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  return out;
}
