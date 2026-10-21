// Racing controls: keyboard, gamepad and touch, all read into one { steer, gas, brake } per frame, plus one-shot
// actions (camera, reset, pause) and menu navigation.
//
//   keys:  W / ↑ gas · S / ↓ brake, then reverse (with A / D at speed: a drift) · A D / ← → steer · Space hop · F fire · C camera ·
//          R back on the track · Esc / P pause.  Menus: arrows, Enter, Esc.
//   pad:   left stick (or d-pad) steers, RT or A gas, LT or B brake / reverse (brake while steering at speed:
//          a drift), Y fire (Motor Murder; the camera otherwise), RB camera, Back reset, Start pause, X hop.  Menus: stick / d-pad, A, B.
//   touch: drag anywhere on the left half to steer (the further from where you put your thumb down, the harder),
//          GAS and BRAKE pedals on the right, camera / reset / pause buttons along the top.
//
// Robustness (the template's input rules): a new touch always takes the wheel, listen for pointercancel and
// lostpointercapture, reset everything on blur / visibilitychange.
const STEER_R = 70, DEAD = 0.14;
const has = (set, list) => list.some((c) => set.has(c));

export class Controls {
  constructor(zone) {
    this.keys = new Set();
    this.wheel = null;                     // the steering touch: { id, x0, x }
    this.pedal = { gas: false, brake: false };
    this.padPrev = {};
    this.onAction = null;                  // (name) → 'camera' | 'reset' | 'pause' | 'hop' | 'fire'
    this.onMenu = null;                    // (dir) → 'up' | 'down' | 'left' | 'right' | 'ok' | 'back'
    this.usedTouch = false; this.usedPad = false;
    this.bind(zone);
  }
  bind(zone) {
    zone.style.touchAction = 'none';
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault(); this.touched();
      if (e.clientX > innerWidth * 0.5) return; // (the right half is the pedals)
      this.wheel = { id: e.pointerId, x0: e.clientX, x: e.clientX };
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events throw */ }
    }, { passive: false });
    zone.addEventListener('pointermove', (e) => { if (this.wheel?.id === e.pointerId) { this.wheel.x = e.clientX; const d = this.wheel.x - this.wheel.x0; if (Math.abs(d) > STEER_R) this.wheel.x0 = this.wheel.x - Math.sign(d) * STEER_R; } });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(t, (e) => { if (this.wheel?.id === e.pointerId) this.wheel = null; });
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const menu = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back' }[e.code];
      if (menu) this.onMenu?.(menu);
      const act = { KeyC: 'camera', KeyV: 'camera', KeyR: 'reset', Escape: 'pause', KeyP: 'pause', Space: 'hop', KeyF: 'fire', KeyE: 'fire' }[e.code];
      if (act) this.onAction?.(act);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }
  touched() { if (!this.usedTouch) { this.usedTouch = true; document.body.classList.add('touch'); } }
  reset() { this.keys.clear(); this.wheel = null; this.pedal.gas = this.pedal.brake = false; }

  // A held on-screen pedal ('gas' | 'brake'), or a one-shot button (an action name).
  bindPedal(el, which) {
    el.style.touchAction = 'none';
    const on = (e) => { e.preventDefault(); e.stopPropagation(); this.touched(); this.pedal[which] = true; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } };
    const off = () => { this.pedal[which] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', on);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, off);
  }
  bindButton(el, action) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.pointerType !== 'mouse') this.touched(); this.onAction?.(action); });
  }

  pad() { const ps = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : []; return ps[0] || null; }

  // Once per frame: { steer: -1..1 (+ right), gas: 0..1, brake: 0..1 }. Fires pad one-shots and menu moves.
  read() {
    const k = this.keys;
    let steer = (has(k, ['KeyD', 'ArrowRight']) ? 1 : 0) - (has(k, ['KeyA', 'ArrowLeft']) ? 1 : 0);
    let gas = has(k, ['KeyW', 'ArrowUp']) ? 1 : 0, brake = has(k, ['KeyS', 'ArrowDown']) ? 1 : 0;
    const gp = this.pad();
    if (gp) {
      const b = (i) => gp.buttons[i] ? (gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0)) : 0;
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > DEAD) { steer = Math.sign(ax) * (Math.abs(ax) - DEAD) / (1 - DEAD); this.usedPad = true; }
      if (b(14) > 0.5) steer = -1; if (b(15) > 0.5) steer = 1;
      gas = Math.max(gas, b(7), b(0)); brake = Math.max(brake, b(6), b(1));
      const now = { a: b(0) > 0.5, b: b(1) > 0.5, x: b(2) > 0.5, y: b(3) > 0.5, rb: b(5) > 0.5, back: b(8) > 0.5, start: b(9) > 0.5, up: b(12) > 0.5 || (gp.axes[1] || 0) < -0.6, down: b(13) > 0.5 || (gp.axes[1] || 0) > 0.6, left: b(14) > 0.5 || ax < -0.6, right: b(15) > 0.5 || ax > 0.6 }, was = this.padPrev;
      const edge = (n) => now[n] && !was[n];
      if (Object.values(now).some(Boolean)) this.usedPad = true;
      if (edge('y')) this.onAction?.('fire'); if (edge('rb')) this.onAction?.('camera'); if (edge('back')) this.onAction?.('reset'); if (edge('start')) this.onAction?.('pause'); if (edge('x')) this.onAction?.('hop');
      for (const d of ['up', 'down', 'left', 'right']) if (edge(d)) this.onMenu?.(d);
      if (edge('a')) this.onMenu?.('ok'); if (edge('b')) this.onMenu?.('back'); if (edge('start')) this.onMenu?.('ok');
      this.padPrev = now;
    }
    if (this.wheel) { const d = (this.wheel.x - this.wheel.x0) / STEER_R; steer = Math.abs(d) < 0.08 ? 0 : Math.max(-1, Math.min(1, d)); }
    if (this.pedal.gas) gas = 1; if (this.pedal.brake) brake = 1;
    return { steer, gas, brake };
  }
}
