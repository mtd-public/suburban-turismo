// Motor Murder: the silly mode, a death match. Car combat on any circuit (Twisted Metal in a cul-de-sac): the circuit's
// track is just the road network the CPU drives round between fights; pickups float along it, and the last car
// running wins (or the healthiest when the 3 minutes are up).
//
//   Fireworks box   4 rockets a volley, 3 volleys, a nudge of homing toward whoever's in front of you
//   Frozen turkey   lobbed up the road, bursts where it lands: big damage, cars thrown about
//   Vape cloud      dropped behind you: anyone driving through it can't see, wobbles, and coughs (damage)
//   Chainsaw        from Home Work (the hardware superstore): bolted to your bumper for 8 s, chews anything you touch
//   Truck nuts      comically large, dropped right behind you: a mine that goes off under whoever else drives over it
//   Casserole       the neighbour's: +35 health
//
// Every car has a health bar over it (and yours in the HUD).
//
// Fire with Y (pad), F (keys) or the FIRE button (touch). Ramming does damage too (the faster car hurts the other
// more), and so do walls taken at speed.
import * as THREE from 'three';
import { lam, basic, canvasTex } from './ps1.js';
import * as T from './tex.js';
import { cpuControl } from './race.js';
import { groundAt } from './world.js';
import { clamp, wrapAngle } from './utils.js';

export const COMBAT_TIME = 180, HP = 100;
export const WEAPONS = {
  fireworks: { name: 'Fireworks box', icon: '🎆', ammo: 3, color: 0xff3a3a },
  turkey: { name: 'Frozen turkey', icon: '🦃', ammo: 1, color: 0x9fdcff },
  vape: { name: 'Vape cloud', icon: '💨', ammo: 2, color: 0xc77dff },
  chainsaw: { name: 'Home Work chainsaw', icon: '🪚', ammo: 1, color: 0xff8a1a },
  nuts: { name: 'Truck nuts', icon: '🔴', ammo: 2, color: 0xe03030 },
  casserole: { name: 'Casserole', icon: '🥘', ammo: 0, color: 0x3ddc84 }, // (eaten on the spot)
};
const KINDS = ['fireworks', 'turkey', 'nuts', 'vape', 'chainsaw', 'casserole', 'fireworks', 'nuts', 'turkey', 'chainsaw', 'vape', 'casserole', 'fireworks', 'nuts'];
const SAW_T = 8;
const RESPAWN = 8, GRAV = 22;

const glow = () => canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }, { repeat: false });

// ---- the models (small, chunky, PS1)
function turkeyMesh() {
  const g = new THREE.Group(), skin = lam(0xe8d8c0), ice = basic(0xcfeeff, null, { transparent: true, opacity: 0.45 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), skin); body.scale.set(1, 0.72, 1.25); g.add(body);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.42, 6), skin); leg.rotation.x = -1.1; leg.position.set(s * 0.2, 0.12, 0.5); g.add(leg);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), lam(0xffffff)); knob.position.set(s * 0.2, 0.26, 0.68); g.add(knob);
  }
  const frost = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 5), ice); frost.scale.set(1, 0.78, 1.3); g.add(frost); // (still frozen solid)
  return g;
}
function fireworksMesh() {
  const g = new THREE.Group();
  const side = T.sign('KABOOM', { w: 64, h: 32, bg: '#c81e1e', fg: '#ffe040', font: 'bold 16px Arial, sans-serif', grime: 0.1 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), [lam(0xffffff, side), lam(0xffffff, side), lam(0xffd040), lam(0x8a1010), lam(0xffffff, side), lam(0xffffff, side)]); g.add(box);
  [0xff4040, 0x40a0ff, 0x40ff80, 0xffe040].forEach((c, i) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 5), lam(c)); t.position.set(-0.3 + i * 0.2, 0.4, (i % 2) * 0.16 - 0.08); g.add(t); });
  return g;
}
function vapeMesh() {
  const g = new THREE.Group();
  const dev = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.16), lam(0x7a3ad8)); g.add(dev);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), lam(0x1a1a22)); tip.position.y = 0.55; g.add(tip);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.18), basic(0x60ffe0)); led.position.y = -0.2; g.add(led);
  g.scale.setScalar(1.3); return g;
}
function casseroleMesh() {
  const g = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.26, 10), lam(0xf4f0e8)); g.add(dish);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 10), lam(0xe0902a)); top.position.y = 0.13; g.add(top);
  const foil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.3), lam(0xd8dce0)); foil.position.set(0.12, 0.17, 0); foil.rotation.y = 0.5; g.add(foil);
  return g;
}
// Home Work's own-brand chainsaw (orange, like everything they sell)
function chainsawMesh(mounted = false) {
  const g = new THREE.Group();
  const side = T.sign('HOME WORK', { w: 64, h: 32, bg: '#f26a10', fg: '#ffffff', font: 'bold 13px Arial, sans-serif', grime: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.8), [lam(0xffffff, side), lam(0xffffff, side), lam(0xf26a10), lam(0x2a2a2a), lam(0xf26a10), lam(0xf26a10)]); g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 4, 8, Math.PI), lam(0x1a1a1a)); handle.position.set(0, 0.3, -0.1); handle.rotation.y = Math.PI / 2; g.add(handle);
  const teeth = canvasTex(8, 32, (c) => { for (let i = 0; i < 32; i += 4) { c.fillStyle = '#d8dce0'; c.fillRect(0, i, 8, 2); c.fillStyle = '#5a5e64'; c.fillRect(0, i + 2, 8, 2); } });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 1.5), [lam(0xffffff, teeth), lam(0xffffff, teeth), lam(0x9aa0a6), lam(0x9aa0a6), lam(0x9aa0a6), lam(0x9aa0a6)]); bar.position.set(0, -0.05, 1.1); g.add(bar);
  g.userData.teeth = teeth;
  if (!mounted) g.scale.setScalar(1.2);
  return g;
}
// Truck nuts: the novelty hitch ornament, at a size no hitch could carry
function nutsMesh() {
  const g = new THREE.Group(), red = lam(0xd42a2a), chrome = lam(0xc8ccd2);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), red); b.scale.set(1, 1.15, 0.95); b.position.set(s * 0.5, 0, 0); g.add(b); }
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), red); sack.position.set(0, 0.5, 0); sack.scale.set(1.6, 0.8, 0.9); g.add(sack);
  const hitch = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.2), chrome); hitch.position.set(0, 0.95, -0.3); g.add(hitch);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), chrome); ball.position.set(0, 1.15, 0.2); g.add(ball);
  g.scale.setScalar(1.7);
  return g;
}
const MODELS = { nuts: nutsMesh, fireworks: fireworksMesh, turkey: turkeyMesh, vape: vapeMesh, chainsaw: () => chainsawMesh(), casserole: casseroleMesh };

export function createCombat(scene, W, fx) {
  const glowMap = glow(), smokeMap = T.smoke();
  const root = new THREE.Group(); scene.add(root); root.visible = false;
  // pooled sparks (additive dots) and cloud puffs
  const sparks = Array.from({ length: 220 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; s.userData = {}; root.add(s); return s; });
  let sparkI = 0;
  const spark = (x, y, z, vx, vy, vz, color, life = 0.7, size = 0.6, grav = 9) => { const s = sparks[sparkI++ % sparks.length]; s.position.set(x, y, z); s.material.color.setHex(color); s.visible = true; Object.assign(s.userData, { vx, vy, vz, t: 0, life, size, grav }); s.scale.setScalar(size); };
  const burst = (x, y, z, colors, n = 30, speed = 9, size = 0.7) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), v = speed * (0.5 + Math.random() * 0.5); spark(x, y, z, Math.cos(a) * r * v, Math.abs(u) * v + 2, Math.sin(a) * r * v, colors[i % colors.length], 0.5 + Math.random() * 0.5, size); } };
  // a health bar over every car: a little canvas, redrawn when the number changes
  function healthBar(r) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })); sprite.scale.set(3.2, 0.8, 1); sprite.renderOrder = 10;
    const b = { sprite, last: -1, draw(hp, hit) {
      const v = Math.ceil(hp); if (v === b.last && !hit) return; b.last = v;
      const g = cv.getContext('2d'); g.clearRect(0, 0, 128, 32);
      g.font = 'bold 11px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#2a1f45'; g.fillStyle = r === C.player ? '#ffd45e' : '#ffffff';
      g.strokeText(r.name, 64, 10); g.fillText(r.name, 64, 10);
      g.fillStyle = '#2a1f45'; g.fillRect(8, 15, 112, 14); g.fillStyle = '#efe9f7'; g.fillRect(11, 18, 106, 8);
      const k = clamp(hp / HP, 0, 1); g.fillStyle = hit ? '#ffffff' : k > 0.5 ? '#3ddc84' : k > 0.25 ? '#ffc53a' : '#ee4b5e'; g.fillRect(11, 18, Math.round(106 * k), 8);
      tex.needsUpdate = true;
    } };
    b.draw(HP); return b;
  }
  const clouds = []; // vape: { x, z, r, t, life, owner, puffs[] }

  const C = { root, racers: [], pickups: [], shots: [], clouds, t: 0, over: false, order: [] };

  C.start = (track, racers, player) => {
    C.clear(); root.visible = true;
    C.track = track; C.racers = racers; C.player = player; C.t = 0; C.over = false; C.order = [];
    for (const r of racers) {
      Object.assign(r, { hp: HP, dead: false, weapon: null, ammo: 0, kills: 0, cool: 0, hold: 0, hitT: 0, lastHit: null, smokeT: 0, sawT: 0 });
      r.bar = healthBar(r); root.add(r.bar.sprite);
      r.saw = chainsawMesh(true); r.saw.visible = false; r.saw.position.set(0, 0.75, (r.len || 4.6) / 2 + 0.1); r.mesh.add(r.saw);
    }
    // pickups: spread round the track, alternating sides of the line
    const n = 14;
    for (let k = 0; k < n; k++) {
      const i = Math.round(((k + 0.5) / n) * track.n), s = track.at(i), side = (k % 2 ? 1 : -1) * 2.2, kind = KINDS[k % KINDS.length];
      const m = MODELS[kind](); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: WEAPONS[kind].color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(2.6); m.add(halo);
      const x = s.x - s.tz * side, z = s.z + s.tx * side, y = groundAt(W, x, z, 1).h + 1.1;
      m.position.set(x, y, z); root.add(m);
      C.pickups.push({ kind, x, y, z, m, t: 0, phase: k });
    }
  };
  C.clear = () => {
    for (const p of C.pickups) root.remove(p.m);
    for (const r of C.racers) { if (r.bar) root.remove(r.bar.sprite); if (r.saw) r.mesh.remove(r.saw); }
    for (const s of C.shots) root.remove(s.m);
    for (const c of clouds) for (const p of c.puffs) root.remove(p);
    C.pickups = []; C.shots = []; clouds.length = 0;
    for (const s of sparks) s.visible = false;
    root.visible = false;
  };

  const alive = () => C.racers.filter((r) => !r.dead);
  const fwd = (B) => [Math.sin(B.heading), Math.cos(B.heading)];

  function hurt(r, dmg, by = null, kx = 0, kz = 0) {
    if (r.dead || C.over) return;
    r.hp -= dmg; r.hitT = 0.4; if (by && by !== r) r.lastHit = by;
    r.body.kx += kx; r.body.kz += kz;
    if (r === C.player) fx.shake?.(Math.min(1, dmg / 30));
    if (r.hp <= 0) wreck(r);
  }
  function wreck(r) {
    r.hp = 0; r.dead = true; r.sawT = 0; r.saw.visible = false; C.order.unshift(r); // (the order out: last out goes first in the results)
    if (r.lastHit && !r.lastHit.dead) r.lastHit.kills++;
    const B = r.body; burst(B.x, B.y + 1, B.z, [0xffa020, 0xff4010, 0xffe060], 50, 11, 1.1);
    B.vy = 6; B.grounded = false; B.speed *= 0.3;
    r.mesh.traverse((o) => { if (o.isMesh && !o.userData.burnt) { o.userData.burnt = true; const ms = Array.isArray(o.material) ? o.material : [o.material]; const nm = ms.map((x) => { const c = x.clone(); c.color?.multiplyScalar(0.22); return c; }); o.material = Array.isArray(o.material) ? nm : nm[0]; } });
    fx.onWreck?.(r);
    const left = alive();
    if (left.length <= 1 || r === C.player) { C.over = true; for (const a of left) C.order.unshift(a); }
  }

  // ---- weapons
  C.fire = (r) => {
    if (r.dead || !r.weapon || r.cool > 0 || C.over) return false;
    const B = r.body, [fxx, fzz] = fwd(B), y = B.y + 1.1;
    if (r.weapon === 'fireworks') {
      for (let k = 0; k < 4; k++) {
        const a = B.heading + (k - 1.5) * 0.07, m = new THREE.Group();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 5), lam([0xff4040, 0x40a0ff, 0x40ff80, 0xffe040][k])); tube.rotation.x = Math.PI / 2; m.add(tube);
        const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xffd080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); h.scale.setScalar(1.4); m.add(h);
        m.position.set(B.x + fxx * 2.4, y + k * 0.05, B.z + fzz * 2.4); root.add(m);
        C.shots.push({ kind: 'rocket', m, owner: r, h: a, v: 42 + Math.abs(B.speed), vy: 0.8 + k * 0.25, t: 0, life: 1.6, delay: k * 0.07, color: [0xff4040, 0x40a0ff, 0x40ff80, 0xffe040][k] });
      }
      r.cool = 0.9;
    } else if (r.weapon === 'turkey') {
      const m = turkeyMesh(); m.position.set(B.x + fxx * 2.2, y + 0.4, B.z + fzz * 2.2); root.add(m);
      const v = Math.max(0, B.speed) + 16;
      C.shots.push({ kind: 'turkey', m, owner: r, vx: fxx * v, vz: fzz * v, vy: 8.5, t: 0, life: 4, spin: 6 + Math.random() * 4 });
      r.cool = 0.6;
    } else if (r.weapon === 'nuts') { // dropped straight off the back; armed a moment later
      const m = nutsMesh(), x = B.x - fxx * ((r.len || 4.6) / 2 + 1.8), z = B.z - fzz * ((r.len || 4.6) / 2 + 1.8), gy = groundAt(W, x, z, B.y + 2).h;
      m.position.set(x, gy + 1.5, z); m.rotation.y = B.heading; root.add(m);
      C.shots.push({ kind: 'nuts', m, owner: r, t: 0, life: 25, gy, vy: 0 });
      r.cool = 0.6;
    } else if (r.weapon === 'chainsaw') {
      r.sawT = SAW_T; r.saw.visible = true; r.cool = 0.4;
    } else if (r.weapon === 'vape') {
      const x = B.x - fxx * 4, z = B.z - fzz * 4, c = { x, z, r: 8, t: 0, life: 9, owner: r, puffs: [] };
      const tints = [0xf3d9ff, 0xd9fff1, 0xffe0ef, 0xe6e0ff];
      for (let k = 0; k < 16; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, color: tints[k % 4], transparent: true, depthWrite: false, opacity: 0 }));
        const a = Math.random() * 6.28, d = Math.random() * c.r * 0.75; s.userData = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, s: 6 + Math.random() * 5, ph: Math.random() * 6 };
        s.position.set(s.userData.x, groundAt(W, s.userData.x, s.userData.z, B.y + 2).h + 1.6 + Math.random() * 1.5, s.userData.z); root.add(s); c.puffs.push(s);
      }
      clouds.push(c); burst(x, B.y + 1, z, [0xc77dff, 0x7dffe0], 14, 4, 0.8);
      r.cool = 0.8;
    }
    r.ammo--; if (r.ammo <= 0) { r.weapon = null; r.ammo = 0; }
    fx.onFire?.(r);
    return true;
  };

  function explode(x, y, z, owner, radius, dmg, push, colors) {
    burst(x, y, z, colors, 60, 13, 1.2);
    for (let i = 0; i < 6; i++) fx.puff(x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 3);
    for (const r of C.racers) {
      if (r.dead) continue; const B = r.body, dx = B.x - x, dz = B.z - z, d = Math.hypot(dx, dz);
      if (d > radius || Math.abs(B.y - y) > 4) continue;
      const k = 1 - d / radius, nx = dx / (d || 1), nz = dz / (d || 1);
      hurt(r, dmg * (0.4 + 0.6 * k) * (r === owner ? 0.25 : 1), owner, nx * push * k, nz * push * k); // (your own blast: a scratch)
      B.vy = Math.max(B.vy, 5 * k); B.grounded = false;
    }
    fx.boom?.(x, z);
  }

  // ---- the CPU: drive the circuit until someone's close, then go for them; fire when it's worth it
  C.cpu = (r, dt) => {
    const B = r.body, ctl = cpuControl(r, C.racers.filter((o) => !o.dead), C.t, dt);
    let tgt = null, best = Infinity;
    for (const o of C.racers) { if (o === r || o.dead) continue; const d = Math.hypot(o.body.x - B.x, o.body.z - B.z) * (o === C.player ? 0.95 : 1); if (d < best) { best = d; tgt = o; } }
    if (tgt && ctl.dir) {
      const OB = tgt.body, d = Math.hypot(OB.x - B.x, OB.z - B.z);
      if (d < 34) { const lead = clamp(d / 40, 0.1, 0.5), tx = OB.x + Math.sin(OB.vh) * OB.speed * lead, tz = OB.z + Math.cos(OB.vh) * OB.speed * lead, dd = Math.hypot(tx - B.x, tz - B.z) || 1; ctl.dir = { x: (tx - B.x) / dd, z: (tz - B.z) / dd, mag: 1 }; B.pace = r.skill; }
      if (r.weapon) {
        r.hold += dt;
        const ang = Math.abs(wrapAngle(Math.atan2(OB.x - B.x, OB.z - B.z) - B.heading));
        if (r.weapon === 'fireworks' && d < 45 && ang < 0.3) C.fire(r);
        else if (r.weapon === 'turkey' && d > 10 && d < 30 && ang < 0.25) C.fire(r);
        else if (r.weapon === 'nuts' && ((d < 16 && ang > 2.3) || r.hold > 5)) C.fire(r);
        else if (r.weapon === 'chainsaw' && d < 22 && ang < 0.5) C.fire(r);
        else if (r.weapon === 'vape' && ((d < 18 && ang > 2.4) || r.hold > 7)) C.fire(r);
        if (!r.weapon) r.hold = 0;
      }
    }
    // in someone's vape cloud: can't see a thing
    if (r.inCloud && ctl.dir) { const w = Math.sin(C.t * 5 + r.body.x) * 0.9; const c = Math.cos(w), s = Math.sin(w); ctl.dir = { x: ctl.dir.x * c - ctl.dir.z * s, z: ctl.dir.x * s + ctl.dir.z * c, mag: 1 }; }
    return ctl;
  };

  // ---- each fixed step (after the cars have moved)
  C.step = (dt) => {
    if (!root.visible) return;
    C.t += dt;
    for (const r of C.racers) {
      r.cool = Math.max(0, r.cool - dt); r.hitT = Math.max(0, r.hitT - dt);
      if (r.dead) continue;
      // pickups
      for (const p of C.pickups) if (p.t <= 0 && Math.abs(r.body.x - p.x) < 2.6 && Math.abs(r.body.z - p.z) < 2.6 && Math.abs(r.body.y + 1 - p.y) < 2.5) {
        p.t = RESPAWN; p.m.visible = false; burst(p.x, p.y, p.z, [WEAPONS[p.kind].color, 0xffffff], 16, 5, 0.6);
        if (p.kind === 'casserole') r.hp = Math.min(HP, r.hp + 35); else { r.weapon = p.kind; r.ammo = WEAPONS[p.kind].ammo; r.hold = 0; }
        fx.onPickup?.(r, p.kind);
      }
      // the chainsaw: anyone in front of the bumper gets chewed
      if (r.sawT > 0) {
        r.sawT -= dt; if (r.sawT <= 0) r.saw.visible = false;
        const B = r.body, [a, b] = fwd(B), L = (r.len || 4.6) / 2 + 1.4, px = B.x + a * L, pz = B.z + b * L;
        for (const o of C.racers) {
          if (o === r || o.dead) continue; const OB = o.body;
          if (Math.hypot(OB.x - px, OB.z - pz) < 2.4 && Math.abs(OB.y - B.y) < 1.5) { hurt(o, 30 * dt, r, a * 4 * dt, b * 4 * dt); OB.speed *= 1 - 1.5 * dt; if (Math.random() < 0.7) spark(px, B.y + 0.8, pz, (Math.random() - 0.5) * 8, 3 + Math.random() * 3, (Math.random() - 0.5) * 8, Math.random() < 0.5 ? 0xffe080 : 0xffffff, 0.35, 0.35); }
        }
      }
      // vape clouds
      r.inCloud = false;
      for (const c of clouds) if (c.t > 0.4 && Math.hypot(r.body.x - c.x, r.body.z - c.z) < c.r && (r !== c.owner || c.t > 2.5)) { r.inCloud = true; r.body.pace = Math.min(r.body.pace ?? 1, 0.7); hurt(r, 3 * dt, c.owner); if (Math.random() < dt * 2) fx.onCough?.(r); }
    }
    // ramming: the car closing faster does the damage
    const L = alive();
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], A = a.body, Bb = b.body, dx = Bb.x - A.x, dz = Bb.z - A.z, d = Math.hypot(dx, dz);
      if (d > 3.6 || d < 0.01 || Math.abs(A.y - Bb.y) > 1.5) continue;
      const nx = dx / d, nz = dz / d, va = A.speed * (Math.sin(A.vh) * nx + Math.cos(A.vh) * nz), vb = -Bb.speed * (Math.sin(Bb.vh) * nx + Math.cos(Bb.vh) * nz), closing = va + vb;
      if (closing < 5 || (a.ramT || 0) > C.t || (b.ramT || 0) > C.t) continue;
      a.ramT = b.ramT = C.t + 0.6;
      const ka = Math.max(0, va) / (Math.max(0, va) + Math.max(0, vb) || 1), dmg = closing * 0.7;
      hurt(b, dmg * (0.3 + 0.7 * ka), a, nx * closing * 0.5, nz * closing * 0.5); hurt(a, dmg * (0.3 + 0.7 * (1 - ka)), b, -nx * closing * 0.3, -nz * closing * 0.3);
      burst((A.x + Bb.x) / 2, A.y + 0.8, (A.z + Bb.z) / 2, [0xffe080, 0xffffff], 12, 6, 0.4);
    }
    // shots
    for (let i = C.shots.length - 1; i >= 0; i--) {
      const s = C.shots[i]; s.t += dt;
      let done = s.t > s.life, hitAt = null;
      if (s.kind === 'rocket') {
        if (s.t < s.delay) { s.m.visible = false; continue; } s.m.visible = true;
        // a little homing on whoever's ahead
        let tg = null, bd = 30; for (const r of C.racers) { if (r === s.owner || r.dead) continue; const dx = r.body.x - s.m.position.x, dz = r.body.z - s.m.position.z, d = Math.hypot(dx, dz), da = Math.abs(wrapAngle(Math.atan2(dx, dz) - s.h)); if (da < 0.6 && d < bd) { bd = d; tg = r; } }
        if (tg) s.h += clamp(wrapAngle(Math.atan2(tg.body.x - s.m.position.x, tg.body.z - s.m.position.z) - s.h), -2 * dt, 2 * dt);
        const p = s.m.position; p.x += Math.sin(s.h) * s.v * dt; p.z += Math.cos(s.h) * s.v * dt; p.y += s.vy * dt; s.vy -= 1.5 * dt;
        s.m.rotation.y = s.h; spark(p.x, p.y, p.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, Math.random() < 0.5 ? 0xffc040 : s.color, 0.35, 0.45, 2);
        const g = groundAt(W, p.x, p.z, p.y + 0.5);
        if (p.y < g.h + 0.1 || fx.wall(p.x, p.z, p.y)) done = true, hitAt = p;
        for (const r of C.racers) if (r !== s.owner && !r.dead && Math.hypot(r.body.x - p.x, r.body.z - p.z) < 2.1 && Math.abs(r.body.y + 0.8 - p.y) < 1.8) { hurt(r, 9, s.owner, Math.sin(s.h) * 5, Math.cos(s.h) * 5); r.body.speed *= 0.85; done = true; hitAt = p; break; }
        if (done) burst(p.x, p.y, p.z, [s.color, 0xffffff, 0xffe040], hitAt ? 26 : 8, 8, 0.6);
      } else if (s.kind === 'turkey') {
        const p = s.m.position; s.vy -= GRAV * dt; p.x += s.vx * dt; p.y += s.vy * dt; p.z += s.vz * dt; s.m.rotation.x += s.spin * dt; s.m.rotation.y += dt * 2;
        if (Math.random() < 0.5) spark(p.x, p.y, p.z, 0, 0.5, 0, 0xcfeeff, 0.4, 0.4, 0);
        const g = groundAt(W, p.x, p.z, p.y + 0.5);
        let hit = p.y < g.h + 0.3 || (s.t > 0.15 && fx.wall(p.x, p.z, p.y));
        for (const r of C.racers) if (r !== s.owner && !r.dead && Math.hypot(r.body.x - p.x, r.body.z - p.z) < 2.3 && Math.abs(r.body.y + 0.8 - p.y) < 1.8) hit = true;
        if (hit || done) { explode(p.x, Math.max(p.y, g.h + 0.5), p.z, s.owner, 9, 48, 16, [0xffa020, 0xcfeeff, 0xffffff, 0xff5020]); for (let k = 0; k < 18; k++) spark(p.x, p.y + 0.5, p.z, (Math.random() - 0.5) * 14, 4 + Math.random() * 6, (Math.random() - 0.5) * 14, 0xe0f6ff, 1, 0.5); done = true; }
      }
      else if (s.kind === 'nuts') {
        const p = s.m.position; if (p.y > s.gy + 1.0) { s.vy -= GRAV * dt; p.y = Math.max(s.gy + 1.0, p.y + s.vy * dt); if (p.y === s.gy + 1.0) s.vy = 0; } // (a thud onto the road)
        s.m.rotation.z = Math.sin(s.t * 6) * 0.12 * Math.max(0, 1 - s.t / 2);
        if (s.t > 0.8) for (const r of C.racers) if (!r.dead && r !== s.owner && Math.hypot(r.body.x - p.x, r.body.z - p.z) < 3.2 && Math.abs(r.body.y - s.gy) < 2) { explode(p.x, s.gy + 0.8, p.z, s.owner, 7.5, 42, 14, [0xff3030, 0xffa020, 0xffffff]); done = true; break; }
        if (done && s.t > s.life) burst(p.x, p.y, p.z, [0xff3030], 10, 3, 0.5);
      }
      if (done) { root.remove(s.m); C.shots.splice(i, 1); }
    }
  };

  // ---- each frame: visuals
  C.frame = (dt, time) => {
    if (!root.visible) return;
    for (const p of C.pickups) {
      if (p.t > 0 && (p.t -= dt) <= 0) { p.m.visible = true; burst(p.x, p.y, p.z, [WEAPONS[p.kind].color], 10, 3, 0.5); }
      p.m.rotation.y = time * 1.8 + p.phase; p.m.position.y = p.y + Math.sin(time * 2.4 + p.phase) * 0.18;
    }
    for (const s of sparks) if (s.visible) { const u = s.userData; u.t += dt; if (u.t >= u.life) { s.visible = false; continue; } u.vy -= u.grav * dt; s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt; const k = 1 - u.t / u.life; s.scale.setScalar(u.size * (0.4 + k)); s.material.opacity = k; }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i]; c.t += dt; const fade = Math.min(1, c.t / 0.6) * Math.min(1, (c.life - c.t) / 1.5);
      for (const p of c.puffs) { const u = p.userData; p.material.opacity = 0.82 * fade; p.scale.setScalar(u.s * (0.5 + Math.min(1, c.t / 1.2) * 0.5)); p.position.x = u.x + Math.sin(time * 0.7 + u.ph) * 0.8; p.position.z = u.z + Math.cos(time * 0.6 + u.ph) * 0.8; p.material.rotation = time * 0.2 + u.ph; }
      if (c.t >= c.life) { for (const p of c.puffs) root.remove(p); clouds.splice(i, 1); }
    }
    // damage: smoke from the bonnet below 40, fire when wrecked
    for (const r of C.racers) {
      const B = r.body;
      r.bar.sprite.position.set(B.x, B.y + (r.tall || 2.2) + 0.9, B.z); r.bar.sprite.visible = !r.dead && r !== C.player; r.bar.draw(r.hp, r.hitT > 0.3); // (yours is in the HUD)
      if (r.sawT > 0) { r.saw.userData.teeth.offset.y = (time * 9) % 1; r.saw.rotation.z = Math.sin(time * 60) * 0.03; }
      if (r.dead) { if (Math.random() < dt * 14) spark(B.x + (Math.random() - 0.5) * 1.5, B.y + 1.2, B.z + (Math.random() - 0.5) * 1.5, 0, 2.5, 0, Math.random() < 0.5 ? 0xff8020 : 0xffc040, 0.6, 0.9, -1); if (Math.random() < dt * 3) fx.puff(B.x, B.y + 1.6, B.z); continue; }
      if (r.hp < 40 && (r.smokeT -= dt) <= 0) { r.smokeT = 0.08 + r.hp / 300; const [a, b] = fwd(B); fx.puff(B.x + a * 1.6, B.y + 1.1, B.z + b * 1.6); }
    }
  };

  C.hurt = hurt;
  C.standing = () => [...alive().sort((a, b) => b.hp - a.hp).filter((r) => !C.order.includes(r)), ...C.order];
  C.alive = alive;
  return C;
}
