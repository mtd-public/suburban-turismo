// Things you can hit: loose props that get knocked flying, tumble and settle; shop glass that shatters; shelf
// stock that spills when you plough into a gondola. Cheap rigid bodies (a sphere per prop, gravity, bounce,
// spin, ground friction, wall bounces off the platform world) — the PS1 way: no solver, just believable arcs.
// Plus the soft stuff: bushes you plough flat in a spray of leaves, fire hydrants that blow a geyser when you
// clip them, and stray carts that wander the lots on their own.
import * as THREE from 'three';
import { lam, basic, canvasTex } from './ps1.js';
import * as T from './tex.js';
import { grain } from './tex.js';
import { groundAt, wallAt } from './world.js';
import { circles } from './drive.js';
import { mergeLocal } from './geo.js';

const GRAV = 24; // m/s² (the controller's gravity: everything falls the same)
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (r0, r1, h, mat, x = 0, y = 0, z = 0, n = 8) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, n), mat); m.position.set(x, y, z); return m; };

const cache = new Map();
const tc = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
// Retail boxes with printed faces (TVs, cereal, toys, paper towels): one texture per kind.
const productTex = (kind) => tc(`prod${kind}`, () => canvasTex(32, 32, (g, w, h) => {
  const P = { tv: ['#1a1a1c', '#3a7ac8', '#e8e8e8'], cereal: ['#d8a020', '#a82a22', '#f2f2ee'], toy: ['#e83a8a', '#3a5ad8', '#f2d040'], towel: ['#e8e8e4', '#3a8ac8', '#2a2a2a'], soda: ['#a81e1e', '#f2f2ee', '#1a1a1a'], candy: ['#e87a1a', '#4a2a6a', '#f2d040'] }[kind];
  g.fillStyle = P[0]; g.fillRect(0, 0, w, h);
  g.fillStyle = P[1]; g.fillRect(3, 6, w - 6, h - 14);
  if (kind === 'tv') { g.fillStyle = '#6ab0e8'; g.fillRect(6, 9, w - 12, h - 20); }
  g.fillStyle = P[2]; g.fillRect(3, h - 7, w - 6, 3); g.fillRect(5, 2, w - 10, 2);
  grain(g, w, h, 10, 0.1, kind.length);
}, { repeat: false }));

// ------------------------------------------------------------------ prop builders (pivot at the centre of mass)
const BUILD = {
  cart(R) { // CityMart cart: wire basket, blue handle, child seat, four casters
    const g = new THREE.Group(), wire = lam(0xffffff, T.chainlink(), { alphaTest: 0.5, side: THREE.DoubleSide }), metal = lam(0x9a9ea2, T.grit()), blue = lam(0x2a5aa8, T.grit());
    const bsk = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.9), wire); bsk.position.y = 0.12; g.add(bsk);
    g.add(box(0.56, 0.02, 0.9, metal, 0, -0.09, 0)); g.add(box(0.6, 0.04, 0.04, blue, 0, 0.42, -0.5)); g.add(box(0.04, 0.3, 0.04, metal, 0.27, 0.27, -0.48)); g.add(box(0.04, 0.3, 0.04, metal, -0.27, 0.27, -0.48));
    g.add(box(0.5, 0.03, 0.8, metal, 0, -0.42, 0.02)); for (const [x, z] of [[-0.22, 0.38], [0.22, 0.38], [-0.22, -0.34], [0.22, -0.34]]) g.add(cyl(0.05, 0.05, 0.04, lam(0x222222), x, -0.47, z, 6).rotateZ(Math.PI / 2));
    return { g, r: 0.5, h: 0.5, m: 0.6 };
  },
  bin(R) { const g = new THREE.Group(); g.add(cyl(0.3, 0.27, 0.95, lam(0x2a4a3a, T.grit()), 0, 0, 0, 8)); g.add(cyl(0.32, 0.32, 0.06, lam(0x1a2a22, T.grit()), 0, 0.48, 0, 8)); return { g, r: 0.35, h: 0.48, m: 0.8 }; },
  cone(R) { const g = new THREE.Group(), o = lam(0xe86a1a, T.grit()); g.add(cyl(0.02, 0.17, 0.62, o, 0, 0.02, 0, 6)); g.add(cyl(0.11, 0.13, 0.08, lam(0xf2f2ee), 0, 0.08, 0, 6)); g.add(box(0.4, 0.04, 0.4, o, 0, -0.3, 0)); return { g, r: 0.22, h: 0.32, m: 0.15 }; },
  pumpkin(R) { const s = 0.8 + R() * 0.6, sg = new THREE.SphereGeometry(0.22 * s, 8, 4); sg.scale(1, 0.75, 1); const g = new THREE.Group(); g.add(new THREE.Mesh(sg, lam(0xffffff, T.pumpkin()))); g.add(box(0.04, 0.08, 0.04, lam(0x3a5a2a), 0, 0.17 * s, 0)); return { g, r: 0.22 * s, h: 0.16 * s, m: 0.3 }; },
  leafbag(R) { const g = new THREE.Group(); g.add(cyl(0.28, 0.3, 0.8, lam(0xd87a20, T.grit()), 0, 0, 0, 6)); g.add(box(0.12, 0.1, 0.12, lam(0x1a1a1a), 0.1, 0.12, 0.27)); g.add(box(0.12, 0.1, 0.12, lam(0x1a1a1a), -0.1, 0.12, 0.27)); return { g, r: 0.32, h: 0.4, m: 0.3 }; },
  newsbox(R) { const g = new THREE.Group(); g.add(box(0.45, 1.0, 0.4, lam(0x2a4a8a, T.grit()))); g.add(box(0.36, 0.25, 0.02, lam(0xffffff, T.storefront([200, 196, 186])), 0, 0.22, 0.21)); return { g, r: 0.32, h: 0.5, m: 0.7 }; },
  boxes(R) { // a stack of three cartons
    const g = new THREE.Group(), k = ['tv', 'cereal', 'toy', 'towel', 'candy'][R() * 5 | 0], m = lam(0xffffff, productTex(k));
    for (let i = 0; i < 3; i++) g.add(box(0.5, 0.35, 0.4, m, (R() - 0.5) * 0.05, -0.35 + i * 0.35, (R() - 0.5) * 0.05).rotateY((R() - 0.5) * 0.3));
    return { g, r: 0.36, h: 0.52, m: 0.4 };
  },
  soda(R) { // a pallet tower of soda cases (the action-alley classic)
    const g = new THREE.Group(), m = lam(0xffffff, productTex('soda'));
    g.add(box(1.0, 0.14, 1.0, lam(0xffffff, T.fenceWood()), 0, -0.6, 0)); for (let i = 0; i < 4; i++) g.add(box(0.95, 0.28, 0.95, m, 0, -0.39 + i * 0.29, 0).rotateY(i * 0.05));
    return { g, r: 0.65, h: 0.67, m: 1.6 };
  },
  produce(R) { // a cardboard bin of watermelons (or fall pumpkins)
    const g = new THREE.Group(); g.add(box(1.0, 0.7, 1.0, lam(0xb8905a, T.grit(40)))); const pm = R() < 0.5 ? lam(0x2e5a2a, T.grit()) : lam(0xffffff, T.pumpkin());
    for (let i = 0; i < 5; i++) { const s = new THREE.SphereGeometry(0.2, 7, 4); s.scale(1, 0.8, 1.2); const q = new THREE.Mesh(s, pm); q.position.set((i % 3 - 1) * 0.28, 0.4, ((i / 3 | 0) - 0.5) * 0.36); g.add(q); }
    return { g, r: 0.6, h: 0.35, m: 1.0 };
  },
  mannequin(R) { const g = new THREE.Group(), w = lam(0xe8e4dc, T.grit()), c = lam([0x7a2a3a, 0x2a4a6a, 0xc8a86a][R() * 3 | 0], T.grit()); g.add(cyl(0.16, 0.13, 0.6, c, 0, 0.25, 0, 8)); g.add(cyl(0.11, 0.09, 0.75, c, 0, -0.42, 0, 6)); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), w).translateY(0.68)); g.add(cyl(0.2, 0.2, 0.03, lam(0x2a2a2a), 0, -0.82, 0, 8)); return { g, r: 0.25, h: 0.84, m: 0.4 }; },
  stray(R) { return BUILD.cart(R); }, // a cart nobody brought back: it drifts round the lot on the wind
  bush(R) { // a shrub: a lumpy clipped dome, autumn-tinged or still green
    const g = new THREE.Group(), s = 0.8 + R() * 0.5, tone = R() < 0.6 ? null : T.FALL[(R() * 4 | 0) + 1];
    const m = tone ? lam(new THREE.Color(`rgb(${tone.map((v) => Math.min(255, v + 40)).join(',')})`).getHex(), T.hedge()) : lam(0xffffff, T.hedge());
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 * s, 1), m); dome.scale.set(1.1, 0.72, 1); g.add(dome);
    for (let k = 0; k < 3; k++) { const q = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 * s, 0), m); q.position.set(Math.cos(k * 2.1) * 0.5 * s, 0.2 * s, Math.sin(k * 2.1) * 0.45 * s); g.add(q); }
    return { g, r: 0.8 * s, h: 0.5 * s, m: 0.5, soft: true };
  },
  hydrant(R) { // a squat red-and-white hydrant: it pops off its stand and the main lets go
    const g = new THREE.Group(), red = lam(0xb82a20, T.grit()), wh = lam(0xe8e4dc, T.grit());
    g.add(cyl(0.15, 0.17, 0.62, red, 0, 0, 0, 8)); g.add(cyl(0.18, 0.18, 0.06, wh, 0, -0.28, 0, 8)); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), wh).translateY(0.3));
    for (const s of [-1, 1]) g.add(cyl(0.06, 0.06, 0.14, wh, s * 0.17, 0.08, 0, 6).rotateZ(Math.PI / 2));
    g.add(cyl(0.08, 0.08, 0.1, wh, 0, 0.08, 0.17, 6).rotateX(Math.PI / 2));
    return { g, r: 0.25, h: 0.34, m: 1.4, hydrant: true };
  },
  item(R) { const k = ['tv', 'cereal', 'toy', 'towel', 'soda', 'candy'][R() * 6 | 0], s = 0.18 + R() * 0.16; const g = new THREE.Group(); g.add(box(s * 1.3, s, s * 0.8, lam(0xffffff, productTex(k)))); return { g, r: s * 0.6, h: s / 2, m: 0.1 }; },
};

// ------------------------------------------------------------------ the system
export class Props {
  constructor(scene, W, rnd = Math.random) {
    this.scene = scene; this.W = W; this.rnd = rnd; this.list = []; this.glass = []; this.fx = { hits: 0, smashed: 0, spills: 0 };
    this.shardM = basic(0xb8d4e0, null, { transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    this.shards = Array.from({ length: 90 }, () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.12, 0, -0.08, -0.06, 0, 0.09, -0.05, 0], 3)); const m = new THREE.Mesh(g, this.shardM); m.visible = false; m.userData = { v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 }; scene.add(m); return m; });
    this.shardI = 0;
    this.spillPool = Array.from({ length: 36 }, () => { const p = this.spawn('item', 0, -50, 0); p.mesh.visible = false; p.pooled = true; return p; });
    this.spillI = 0;
    // leaves off a flattened bush, and the hydrant geysers (water drops + a column)
    this.leafMs = T.FALL.slice(0, 5).map((c) => basic(new THREE.Color(`rgb(${c[0]},${c[1]},${c[2]})`).getHex(), null, { side: THREE.DoubleSide }));
    this.leafMs.push(basic(0x4a6a30, null, { side: THREE.DoubleSide }));
    const leafG = new THREE.PlaneGeometry(0.16, 0.12);
    this.leaves = Array.from({ length: 120 }, (_, i) => { const m = new THREE.Mesh(leafG, this.leafMs[i % this.leafMs.length]); m.visible = false; m.userData = { v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 }; scene.add(m); return m; });
    this.leafI = 0;
    this.dropM = basic(0xd8eaf2, null, { transparent: true, opacity: 0.7, depthWrite: false });
    const dropG = new THREE.PlaneGeometry(0.14, 0.22);
    this.drops = Array.from({ length: 160 }, () => { const m = new THREE.Mesh(dropG, this.dropM); m.visible = false; m.userData = { v: new THREE.Vector3(), t: 0 }; scene.add(m); return m; });
    this.dropI = 0;
    this.columnM = basic(0xcfe4ee, null, { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    this.geysers = [];
  }
  spawn(kind, x, z, ry = 0, y = null) {
    const { g, r, h, m } = BUILD[kind](this.rnd); mergeLocal(g); // (one draw per material, not per part)
    const gy = y ?? groundAt(this.W, x, z, 3).h;
    g.position.set(x, gy + h, z); g.rotation.y = ry; this.scene.add(g);
    const p = { kind, mesh: g, r, h, m, soft: kind === 'bush', hydrant: kind === 'hydrant', v: new THREE.Vector3(), w: new THREE.Vector3(), awake: false, home: { x, y: gy + h, z, ry } };
    if (kind === 'stray') { p.aimless = true; p.drift = this.rnd() * Math.PI * 2; p.dv = 0.25 + this.rnd() * 0.4; }
    this.list.push(p);
    return p;
  }
  // A pane of breakable glass: an axis-aligned box in the collision world that turns to shards.
  addGlass(mesh, plat) { this.glass.push({ mesh, plat, broken: false }); }

  // The vehicle body B (drive.js) against glass, props and shelves. Called every frame before the step.
  collide(B, dt) {
    const sp = Math.abs(B.speed), fx = Math.sin(B.vh ?? B.heading), fz = Math.cos(B.vh ?? B.heading);
    const cs = circles(B), nose = cs[0], reach = nose[2] + Math.max(0.3, sp * dt * 2);
    // glass: at speed, the pane in front of the nose shatters before the controller can call it a wall
    for (const G of this.glass) {
      if (G.broken) continue;
      const p = G.plat, nx = nose[0] + fx * reach * 0.6, nz = nose[1] + fz * reach * 0.6;
      if (Math.abs(nx - p.x) > p.w / 2 + nose[2] || Math.abs(nz - p.z) > p.d / 2 + nose[2]) continue;
      if (sp < 3.5) continue; // (a crawl just bumps it)
      G.broken = true; p.ghost = true; G.mesh.visible = false; this.fx.smashed++;
      B.speed *= 0.82;
      const n = 46; for (let i = 0; i < n; i++) this.shard(p.x + (this.rnd() - 0.5) * p.w, 0.3 + this.rnd() * 3.4, p.z + (this.rnd() - 0.5) * p.d, fx * sp * (0.4 + this.rnd() * 0.5), fz * sp * (0.4 + this.rnd() * 0.5));
      this.onEvent?.('glass', G);
    }
    // loose props: knocked along the hit, popped up, spun
    for (const P of this.list) {
      if (!P.mesh.visible) continue;
      const q = P.mesh.position;
      if (P.flat || Math.abs(q.x - B.x) > 6 || Math.abs(q.z - B.z) > 6) continue; // (a flattened bush is just leaves now)
      for (const [cx, cz, cr] of cs) {
        const dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz), min = cr + P.r;
        if (d >= min || q.y - P.h > B.y + 1.6 || d < 1e-4) continue;
        if (P.soft) { // a bush doesn't fly: it goes flat under you and throws its leaves
          if (sp < 1.5) continue;
          P.flat = true; P.mesh.scale.set(1.25, 0.28, 1.25); P.mesh.position.y = P.home.y - P.h * 0.62; P.mesh.rotation.z = (this.rnd() - 0.5) * 0.4;
          for (let i = 0; i < 22; i++) this.leaf(q.x, q.y + 0.3, q.z, fx * sp * 0.5, fz * sp * 0.5, 2 + sp * 0.2);
          B.speed *= 0.93; this.fx.hits++; this.onEvent?.('bush', P);
          break;
        }
        const nx = dx / d, nz = dz / d, push = min - d;
        q.x += nx * push; q.z += nz * push;
        if (P.hydrant && !P.burst && Math.abs(B.speed) > 2) { P.burst = true; this.geyser(P.home.x, P.home.y - P.h, P.home.z); this.onEvent?.('hydrant', P); }
        const vb = B.speed * (fx * nx + fz * nz), vp = P.v.x * nx + P.v.z * nz;
        if (vb - vp > 0.5) {
          const k = (vb - vp) * (1.4 + this.rnd() * 0.4);
          P.v.x += nx * k + fx * Math.abs(B.speed) * 0.35; P.v.z += nz * k + fz * Math.abs(B.speed) * 0.35;
          P.v.y = Math.max(P.v.y, 1.5 + Math.abs(vb) * (0.25 + this.rnd() * 0.2) / Math.sqrt(P.m));
          P.w.set((this.rnd() - 0.5) * 2, (this.rnd() - 0.5) * 2, (this.rnd() - 0.5) * 2).multiplyScalar(2 + Math.abs(vb) * 0.8 / Math.sqrt(P.m));
          P.awake = true; this.fx.hits++;
          B.speed *= Math.max(0.6, 1 - P.m / (B.H.MASS * 6));
          if (Math.abs(vb) > 4) this.onEvent?.('hit', P);
        }
      }
    }
  }
  // Crashing into a shelf at speed knocks stock off it (called from the controller's crash events).
  spill(x, y, z, fx, fz, speed) {
    const n = Math.min(10, 3 + (speed / 2) | 0);
    for (let i = 0; i < n; i++) {
      const P = this.spillPool[this.spillI++ % this.spillPool.length];
      P.mesh.visible = true; P.mesh.position.set(x + (this.rnd() - 0.5) * 2, y + 0.6 + this.rnd() * 1.4, z + (this.rnd() - 0.5) * 2);
      P.v.set(-fx * speed * 0.15 + (this.rnd() - 0.5) * 3, 1 + this.rnd() * 3, -fz * speed * 0.15 + (this.rnd() - 0.5) * 3);
      P.w.set(this.rnd() * 8 - 4, this.rnd() * 8 - 4, this.rnd() * 8 - 4); P.awake = true;
    }
    this.fx.spills++;
  }
  leaf(x, y, z, vx, vz, up) {
    const l = this.leaves[this.leafI++ % this.leaves.length], u = l.userData;
    l.visible = true; l.position.set(x + (this.rnd() - 0.5), y, z + (this.rnd() - 0.5));
    u.v.set(vx * this.rnd() + (this.rnd() - 0.5) * 4, up * (0.6 + this.rnd()), vz * this.rnd() + (this.rnd() - 0.5) * 4); u.w.set(this.rnd() * 12 - 6, this.rnd() * 12 - 6, this.rnd() * 12 - 6); u.t = 0;
  }
  geyser(x, y, z) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 1, 6, 1, true), this.columnM); col.position.set(x, y, z); this.scene.add(col);
    this.geysers.push({ x, y, z, t: 0, col, acc: 0 });
  }
  shard(x, y, z, vx, vz) {
    const s = this.shards[this.shardI++ % this.shards.length], u = s.userData;
    s.visible = true; s.position.set(x, y, z); s.rotation.set(this.rnd() * 6, this.rnd() * 6, this.rnd() * 6);
    u.v.set(vx + (this.rnd() - 0.5) * 4, 1 + this.rnd() * 4, vz + (this.rnd() - 0.5) * 4); u.w.set(this.rnd() * 20 - 10, this.rnd() * 20 - 10, 0); u.t = 0;
  }

  step(dt) {
    const W = this.W, e = new THREE.Euler(), qd = new THREE.Quaternion();
    for (const P of this.list) {
      if (!P.awake) continue;
      const q = P.mesh.position, v = P.v;
      v.y -= GRAV * dt;
      const nx = q.x + v.x * dt, nz = q.z + v.z * dt;
      // walls (shelves, buildings, kerbs too tall to ride): bounce off, losing most of the speed
      if (wallAt(W, nx, q.z, q.y - P.h, P.r * 0.8, 0.3, P.h * 2)) v.x *= -0.35; else q.x = nx;
      if (wallAt(W, q.x, nz, q.y - P.h, P.r * 0.8, 0.3, P.h * 2)) v.z *= -0.35; else q.z = nz;
      q.y += v.y * dt;
      const g = groundAt(W, q.x, q.z, q.y - P.h + 0.3), floor = (g ? g.h : 0) + P.h * (0.55 + 0.45 * upright(P.mesh));
      if (q.y < floor) {
        q.y = floor;
        if (v.y < -2) { v.y *= -0.32; P.w.multiplyScalar(0.6); } else v.y = 0;
        const f = Math.exp(-7 * dt); v.x *= f; v.z *= f; P.w.multiplyScalar(Math.exp(-6 * dt));
        // settle: tip over onto a side if it's leaning, otherwise stand
        if (Math.hypot(v.x, v.z) < 0.15 && Math.abs(v.y) < 0.2 && P.w.length() < 0.4) { P.awake = false; v.set(0, 0, 0); P.w.set(0, 0, 0); }
      }
      e.set(P.w.x * dt, P.w.y * dt, P.w.z * dt); qd.setFromEuler(e); P.mesh.quaternion.premultiply(qd);
      if (q.y < -20) { P.awake = false; P.mesh.visible = false; }
    }
    // stray carts: a slow wander that turns now and then and bounces off whatever it meets
    for (const P of this.list) {
      if (!P.aimless || P.awake || !P.mesh.visible) continue;
      const q = P.mesh.position;
      P.drift += (this.rnd() - 0.5) * 0.8 * dt;
      const nx = q.x + Math.sin(P.drift) * P.dv * dt, nz = q.z + Math.cos(P.drift) * P.dv * dt;
      if (wallAt(W, nx, nz, q.y - P.h, P.r, 0.3, P.h * 2) || Math.hypot(nx - P.home.x, nz - P.home.z) > 30) P.drift += Math.PI * (0.6 + this.rnd() * 0.8);
      else { q.x = nx; q.z = nz; const g = groundAt(W, q.x, q.z, q.y - P.h + 0.3); if (g) q.y = g.h + P.h; P.mesh.rotation.y = P.drift; }
    }
    for (const l of this.leaves) {
      if (!l.visible) continue;
      const u = l.userData; u.t += dt;
      if (l.position.y > 0.08) { u.v.y = Math.max(u.v.y - 9 * dt, -1.6); u.v.x *= Math.exp(-1.5 * dt); u.v.z *= Math.exp(-1.5 * dt); l.position.addScaledVector(u.v, dt); l.rotation.x += u.w.x * dt; l.rotation.y += u.w.y * dt; }
      else { l.position.y = 0.07; l.rotation.set(-Math.PI / 2, 0, l.rotation.z); }
      if (u.t > 14) l.visible = false;
    }
    for (const G of this.geysers) { // ~12 s of a burst main: a wobbling column and a rain of drops
      G.t += dt; const k = G.t < 10 ? 1 : Math.max(0, 1 - (G.t - 10) / 2), h = 5.5 * k * (0.9 + Math.sin(G.t * 9) * 0.1);
      G.col.visible = k > 0; G.col.scale.set(1 + Math.sin(G.t * 13) * 0.15, Math.max(0.01, h), 1); G.col.position.y = G.y + h / 2;
      for (G.acc += dt * 60 * k; G.acc >= 1; G.acc--) { const d = this.drops[this.dropI++ % this.drops.length], u = d.userData; d.visible = true; d.position.set(G.x, G.y + h * (0.7 + this.rnd() * 0.3), G.z); u.v.set((this.rnd() - 0.5) * 5, 1 + this.rnd() * 3, (this.rnd() - 0.5) * 5); u.t = 0; }
    }
    for (const d of this.drops) {
      if (!d.visible) continue;
      const u = d.userData; u.t += dt; u.v.y -= GRAV * dt; d.position.addScaledVector(u.v, dt);
      if (d.position.y < 0.05 || u.t > 2) d.visible = false;
    }
    for (const s of this.shards) {
      if (!s.visible) continue;
      const u = s.userData; u.t += dt;
      if (s.position.y > 0.2) { u.v.y -= GRAV * dt; s.position.addScaledVector(u.v, dt); s.rotation.x += u.w.x * dt; s.rotation.y += u.w.y * dt; }
      else { s.position.y = 0.17; s.rotation.set(-Math.PI / 2, 0, s.rotation.z); } // glints on the floor
      if (u.t > 8) s.visible = false;
    }
  }
  // Everything back where it started (for the tour cameras, and a "reset" key).
  reset() {
    for (const P of this.list) { if (P.pooled) { P.mesh.visible = false; P.awake = false; continue; } P.mesh.visible = true; P.mesh.position.set(P.home.x, P.home.y, P.home.z); P.mesh.rotation.set(0, P.home.ry, 0); P.v.set(0, 0, 0); P.w.set(0, 0, 0); P.awake = false; }
    for (const G of this.glass) { G.broken = false; G.plat.ghost = false; G.mesh.visible = true; }
    for (const s of this.shards) s.visible = false;
    for (const P of this.list) { P.flat = false; P.burst = false; P.mesh.scale.set(1, 1, 1); }
    for (const G of this.geysers) this.scene.remove(G.col);
    this.geysers.length = 0; for (const a of [this.leaves, this.drops]) for (const m of a) m.visible = false;
  }
}
// How upright a prop is (1 standing, 0 on its side): a fallen bin lies lower than a standing one.
const _up = new THREE.Vector3();
function upright(o) { _up.set(0, 1, 0).applyQuaternion(o.quaternion); return Math.abs(_up.y); }
