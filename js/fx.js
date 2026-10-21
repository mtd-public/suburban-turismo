// Weather and wreckage, shared by the game and the art test.
//   Snowfall   a box of flakes that follows the camera (PS1 square points), drifting and swirling
//   Wreckage   what a crash throws off: chunks of body panel in the car's colour, black trim, lamp glass, a
//              bouncing hubcap now and then, and a shower of sparks; pooled, bouncing on the ground, fading
import * as THREE from 'three';
import { lam, basic, canvasTex } from './ps1.js';
import { groundAt } from './world.js';

const glowTex = () => canvasTex(16, 16, (g) => { const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 16); }, { repeat: false });

export class Snowfall {
  constructor(scene, n = 1600, box = [70, 34, 70]) {
    const pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * box[0]; pos[i * 3 + 1] = Math.random() * box[1]; pos[i * 3 + 2] = (Math.random() - 0.5) * box[2]; ph[i] = Math.random() * 6.28; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, fog: true }));
    this.points.frustumCulled = false; this.points.renderOrder = 2; scene.add(this.points);
    Object.assign(this, { n, box, ph, t: 0, visible: true });
  }
  set on(v) { this.points.visible = v; }
  set night(v) { this.points.material.color.setHex(v ? 0x8a96b4 : 0xffffff); }
  // Each frame: flakes fall and swirl in a box round the camera (wrapped, so there's always snow where you look).
  step(dt, cam, wind = [1.2, 0.4]) {
    if (!this.points.visible) return;
    this.t += dt;
    const p = this.points.geometry.attributes.position.array, [bx, by, bz] = this.box, cx = cam.position.x, cy = cam.position.y - by * 0.35, cz = cam.position.z;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3, w = this.ph[i];
      p[j] += (wind[0] + Math.sin(this.t * 0.9 + w) * 0.6) * dt; p[j + 1] -= (1.6 + (w % 1)) * dt; p[j + 2] += (wind[1] + Math.cos(this.t * 0.7 + w) * 0.6) * dt;
      // wrap round the camera
      p[j] = cx + ((((p[j] - cx) + bx / 2) % bx) + bx) % bx - bx / 2;
      p[j + 2] = cz + ((((p[j + 2] - cz) + bz / 2) % bz) + bz) % bz - bz / 2;
      if (p[j + 1] < cy) p[j + 1] += by; else if (p[j + 1] > cy + by) p[j + 1] -= by;
      const dx = p[j] - cam.position.x, dy = p[j + 1] - cam.position.y, dz = p[j + 2] - cam.position.z;
      if (dx * dx + dy * dy + dz * dz < 6) p[j + 1] += by * 0.5; // none right in front of the lens (they'd be big squares)
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class Wreckage {
  constructor(scene, W) {
    this.W = W;
    const box = new THREE.BoxGeometry(1, 1, 1), trim = lam(0x1a1a1c), glass = basic(0xc8dce8, null, { transparent: true, opacity: 0.8 });
    this.mats = new Map(); this.trim = trim; this.glass = glass;
    this.parts = Array.from({ length: 90 }, () => { const m = new THREE.Mesh(box, trim); m.visible = false; m.userData = { v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 }; scene.add(m); return m; });
    const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10); hub.rotateZ(Math.PI / 2);
    this.hubs = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(hub, lam(0xb8bcc0)); m.visible = false; m.userData = { v: new THREE.Vector3(), t: 0, roll: 0 }; scene.add(m); return m; });
    const gt = glowTex();
    this.sparks = Array.from({ length: 160 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xffd080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; s.userData = { v: new THREE.Vector3(), t: 0, life: 0.5 }; scene.add(s); return s; });
    this.pi = 0; this.hi = 0; this.si = 0;
  }
  paint(color) { if (!this.mats.has(color)) this.mats.set(color, lam(color)); return this.mats.get(color); }
  spark(x, y, z, vx, vy, vz, life = 0.45, color = 0xffd080, size = 0.35) {
    const s = this.sparks[this.si++ % this.sparks.length], u = s.userData;
    s.position.set(x, y, z); u.v.set(vx, vy, vz); u.t = 0; u.life = life; u.size = size; s.material.color.setHex(color); s.visible = true;
  }
  // A hit at (x, y, z), going (nx, nz) at speed v (m/s), on a car of `color`. k scales it (0.3 a scrape, 1 a smash).
  crash(x, y, z, nx, nz, v, color = 0x888888, k = 1) {
    const rnd = Math.random, n = Math.min(14, Math.round((3 + v * 0.5) * k));
    for (let i = 0; i < n; i++) {
      const m = this.parts[this.pi++ % this.parts.length], u = m.userData, kind = rnd();
      m.material = kind < 0.55 ? this.paint(color) : kind < 0.8 ? this.trim : this.glass;
      const s = kind < 0.8 ? 0.12 + rnd() * 0.32 : 0.06 + rnd() * 0.08;
      m.scale.set(s * (1 + rnd()), s * (0.15 + rnd() * 0.25), s * (0.6 + rnd()));
      m.position.set(x + (rnd() - 0.5) * 0.8, y + 0.4 + rnd() * 0.6, z + (rnd() - 0.5) * 0.8);
      const sp = v * (0.15 + rnd() * 0.35);
      u.v.set(-nx * sp * 0.3 + (rnd() - 0.5) * v * 0.4, 2 + rnd() * (3 + v * 0.25), -nz * sp * 0.3 + (rnd() - 0.5) * v * 0.4);
      u.w.set(rnd() * 16 - 8, rnd() * 16 - 8, rnd() * 16 - 8); u.t = 0; m.visible = true;
    }
    if (k > 0.6 && v > 9 && rnd() < 0.5) { // a hubcap off, rolling away
      const h = this.hubs[this.hi++ % this.hubs.length], u = h.userData;
      h.position.set(x, y + 0.3, z); u.v.set((rnd() - 0.5) * v * 0.6 - nx * 3, 2 + rnd() * 2, (rnd() - 0.5) * v * 0.6 - nz * 3); u.t = 0; u.roll = 0; h.visible = true;
    }
    for (let i = 0; i < Math.min(40, 8 + v * 2 * k); i++) this.spark(x, y + 0.5, z, (rnd() - 0.5) * 10 - nx * 3, 1 + rnd() * 5, (rnd() - 0.5) * 10 - nz * 3, 0.25 + rnd() * 0.4);
  }
  step(dt) {
    const W = this.W;
    for (const m of this.parts) if (m.visible) {
      const u = m.userData; u.t += dt;
      if (u.t > 5) { m.visible = false; continue; }
      u.v.y -= 22 * dt; m.position.addScaledVector(u.v, dt);
      const g = groundAt(W, m.position.x, m.position.z, Math.max(0, m.position.y + 0.5)).h + m.scale.y * 0.5;
      if (m.position.y < g) { m.position.y = g; if (u.v.y < -1) { u.v.y *= -0.3; u.v.x *= 0.6; u.v.z *= 0.6; u.w.multiplyScalar(0.5); } else { u.v.set(0, 0, 0); u.w.set(0, 0, 0); } }
      m.rotation.x += u.w.x * dt; m.rotation.y += u.w.y * dt; m.rotation.z += u.w.z * dt;
      if (u.t > 4) m.scale.multiplyScalar(1 - dt * 3);
    }
    for (const h of this.hubs) if (h.visible) { // rolls on its edge, wobbles, falls flat
      const u = h.userData; u.t += dt; if (u.t > 6) { h.visible = false; continue; }
      u.v.y -= 22 * dt; h.position.addScaledVector(u.v, dt);
      const g = groundAt(W, h.position.x, h.position.z, Math.max(0, h.position.y + 0.5)).h + 0.2;
      if (h.position.y < g) { h.position.y = g; u.v.y = Math.abs(u.v.y) > 2 ? -u.v.y * 0.35 : 0; u.v.x *= 1 - dt * 0.6; u.v.z *= 1 - dt * 0.6; }
      const sp = Math.hypot(u.v.x, u.v.z); u.roll += sp / 0.2 * dt;
      h.rotation.set(u.roll, Math.atan2(u.v.x, u.v.z) + Math.PI / 2, Math.max(0, 1 - sp / 4) * 1.5 * Math.min(1, u.t));
    }
    for (const s of this.sparks) if (s.visible) {
      const u = s.userData; u.t += dt; if (u.t > u.life) { s.visible = false; continue; }
      u.v.y -= 14 * dt; s.position.addScaledVector(u.v, dt); s.scale.setScalar((u.size || 0.35) * (1 - u.t / u.life));
    }
  }
}
