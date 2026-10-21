// Touch / keyboard / gamepad input for one or two local players. Adapted from Dr. Mow's js/input.js (the
// template's floating stick) and its Versus controls:
//
//   * touch: a floating stick under your thumb — point where you want to go, as seen on screen; a light push
//     walks, a full push runs. One player: the left 55% of the screen is the stick, a tap on the right hops.
//     Two players: each pane is its player's stick zone, and a quick tap hops.
//   * keys: one player: WASD or the arrows point the way (8-way, screen directions), Space hops, Shift (or F / E)
//     SMASHES — a lunge that steals what you need from a rival's cart, or knocks their items loose.
//     Two players: P1 WASD + Space / left Shift (or F), P2 arrows + Enter / right Shift (or "/").
//     In the chase camera the same keys steer like a car: ←/→ turn, ↑ go, ↓ brake / back up.
//   * pads: pad 1 is P1, pad 2 is P2 — left stick or d-pad, A hops, B / X / RT smash, Y switches the camera,
//     Back opens the order board, Start pauses.
//   * slow-mo (hold): X (P2: ') / pad LB or LT / the SLO-MO button — spends the style meter your tricks fill.
//   * touch (one player): HOP, SMASH and SLO-MO buttons on the right.
//
// Robustness (docs/04 of the template): a new touch always takes the stick, listen for pointercancel and
// lostpointercapture, reset on blur / visibilitychange.
const KEYS1 = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], hop: ['Space'], smash: ['ShiftLeft', 'ShiftRight', 'KeyF', 'KeyE', 'KeyJ', 'KeyK'], slow: ['KeyX', 'KeyL'] };
const KEYS2P = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], hop: ['Space'], smash: ['ShiftLeft', 'KeyQ', 'KeyF', 'KeyE'], slow: ['KeyR', 'KeyX'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], hop: ['Enter', 'NumpadEnter'], smash: ['ShiftRight', 'Period', 'Numpad1', 'Slash', 'Numpad0', 'ControlRight'], slow: ['Quote', 'Numpad2'] },
];
const ACTIONS = ['hop', 'smash'];
const R = 62, DEAD = 8;

export class Input {
  constructor(el) {
    this.el = el;
    this.players = 1;
    this.keys = new Set();
    this.hop = [false, false]; this.smash = [false, false];
    this.sticks = [null, null];
    this.padPrev = [{}, {}];
    this.onKey = null;      // one-shot keys (pause, camera, mute)
    this.onPad = null;      // one-shot pad buttons
    this.paneAt = () => 0;  // (x, y) → player index, for 2-player touch
    this.enabled = false;
    this.bind();
  }

  bind() {
    const el = this.el;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      let i;
      if (this.players === 1) {
        if (e.clientX > innerWidth * 0.55) return; // (the right side has the HOP / SMASH / SLO-MO buttons)
        i = 0;
      } else i = this.paneAt(e.clientX, e.clientY);
      this.sticks[i] = { id: e.pointerId, bx: e.clientX, by: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), travel: 0 };
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events throw */ }
    }, { passive: false });
    el.addEventListener('pointermove', (e) => {
      const s = this.sticks.find((q) => q?.id === e.pointerId);
      if (!s) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) { this.lift(e); return; }
      s.travel = Math.max(s.travel, Math.hypot(e.clientX - s.bx, e.clientY - s.by));
      s.x = e.clientX; s.y = e.clientY;
      const dx = s.x - s.bx, dy = s.y - s.by, d = Math.hypot(dx, dy);
      if (d > R) { s.bx += (dx / d) * (d - R); s.by += (dy / d) * (d - R); } // (the base follows the thumb past the rim)
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => this.lift(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
      if (/^(Arrow|Space)/.test(e.code) && this.enabled) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const maps = this.players === 1 ? [KEYS1] : KEYS2P;
      maps.forEach((m, i) => { for (const a of ACTIONS) if (m[a].includes(e.code)) this[a][i] = true; });
      this.onKey?.(e.code, e);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }
  lift(e) {
    const i = this.sticks.findIndex((q) => q?.id === e.pointerId), s = this.sticks[i];
    if (!s) return;
    if (e.type === 'pointerup' && performance.now() - s.t < 220 && s.travel < 14) this.hop[i] = true; // a quick tap: hop
    this.sticks[i] = null;
  }
  reset() { this.keys.clear(); this.sticks = [null, null]; this.hop = [false, false]; this.smash = [false, false]; }

  // An on-screen button for player 1 (touch): fires on pointerdown, never reaches the canvas.
  bindButton(el, action) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.enabled && this[action]) this[action][0] = true; el.classList.add('down'); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, () => el.classList.remove('down'));
  }

  // The stick's screen direction: { x, y (down), mag } or null.
  stick(i) {
    const s = this.sticks[i];
    if (!s) return null;
    const dx = s.x - s.bx, dy = s.y - s.by, d = Math.hypot(dx, dy);
    if (d < DEAD) return null;
    const k = Math.min(1, (d - DEAD) / (R * 0.75 - DEAD));
    return { x: dx / d, y: dy / d, mag: k * k * (3 - 2 * k) };
  }

  pads() { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected).sort((a, b) => a.index - b.index); }

  // Call once per frame. For each player: { dir: screen {x, y, mag} | null, turn, throttle, jump }.
  read() {
    const pads = this.pads(), out = [];
    for (let i = 0; i < this.players; i++) {
      const K = this.players === 1 ? KEYS1 : KEYS2P[i], k = this.keys, has = (list) => list.some((c) => k.has(c));
      const kx = (has(K.right) ? 1 : 0) - (has(K.left) ? 1 : 0), ky = (has(K.down) ? 1 : 0) - (has(K.up) ? 1 : 0);
      let dir = null, jump = this.hop[i], smash = this.smash[i];
      this.hop[i] = this.smash[i] = false;
      if (kx || ky) { const d = Math.hypot(kx, ky); dir = { x: kx / d, y: ky / d, mag: 1 }; }
      const gp = this.players === 1 ? pads[0] : pads[i];
      if (gp) {
        const down = (b) => { const q = gp.buttons[b]; return !!q && (q.pressed || q.value > 0.5); };
        const now = { a: down(0), b: down(1) || down(7), x: down(2), y: down(3), back: down(8), start: down(9), slow: down(4) || down(6) }, was = this.padPrev[i];
        if (now.a && !was.a) jump = true;
        if ((now.b && !was.b) || (now.x && !was.x)) smash = true;
        for (const b of ['y', 'start', 'back']) if (now[b] && !was[b]) this.onPad?.(b, i);
        this.padPrev[i] = now;
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, m = Math.hypot(ax, ay);
        if (m > 0.2) dir = { x: ax / m, y: ay / m, mag: Math.min(1, (m - 0.2) / 0.75) };
        const dx = (down(15) ? 1 : 0) - (down(14) ? 1 : 0), dy = (down(13) ? 1 : 0) - (down(12) ? 1 : 0);
        if (dx || dy) { const d = Math.hypot(dx, dy); dir = { x: dx / d, y: dy / d, mag: 1 }; }
      }
      const st = this.stick(i);
      if (st) dir = st; // (touch wins)
      const slow = has(K.slow) || !!this.padPrev[i]?.slow || (i === 0 && !!this.slowBtn?.classList.contains('down'));
      out.push({ dir, keys: kx || ky ? { x: kx, y: ky } : null, jump, smash, slow, touch: !!st });
    }
    return out;
  }
}
