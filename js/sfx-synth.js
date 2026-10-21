// sfx-synth.js — the consolidated WebAudio synth every mtd-public game re-wrote.
// No sample files. Merges the best parts of:
//   gig-ambulance js/audio.js      (tone(), two-tone siren loop)
//   finger-skater js/audio.js      (noise bursts, speed-following roll loop, grind scrape loop, scheduled delays)
//   labyrinth-larry js/audio.js    (master gain + mute, shared noise buffer, drone, formant "scream")
//   sub-sinkers src/audio.js       (named SFX table, 40 ms per-name rate limit, attack/decay envelope)
//
// Rules learned the hard way:
//   * Create/resume the AudioContext inside a user gesture (Start button / first key / first pointerdown).
//     Browsers refuse to start audio otherwise. unlock() is idempotent — call it from every start path.
//   * Route everything through one master GainNode so mute is one ramp, not a hunt for live nodes.
//   * Ramp gains with exponentialRampToValueAtTime to 0.0001 (never to 0 — exponential ramps can't hit 0),
//     or setTargetAtTime for loops. Hard gain jumps click.
//   * Rate-limit identical sounds (a shotgun fires 5 missiles in one frame; 5 stacked tones = distortion).
//   * Loops (engine/roll/siren/drone) are started once and modulated every frame; don't start/stop per frame.
//
// Usage:
//   import { Sfx } from './sfx-synth.js';
//   const sfx = new Sfx();
//   startButton.onclick = () => { sfx.unlock(); ... };
//   sfx.play('coin'); sfx.play('boom');
//   sfx.setRoll(speed, grounded);          // per frame, if you use the roll loop
//   sfx.setMuted(true);
//   sfx.play('boom', { pan: -0.6, vol: 0.5 });   // a one-shot off to the left, half as loud
//   sfx.setNear('bee', 0.4, 0.8);          // per frame: a positional loop (0..1 loudness, -1..1 pan)
export class Sfx {
  constructor({ volume = 0.8 } = {}) {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
    this.rate = 1;
    this.volume = volume;
    this.last = {};
    this.loops = {};
    this.out = null; // (set by at(): where tone()/burst() connect instead of the fx bus)
    this.grainAcc = {};
    this.grainT = {};
  }

  unlock() {
    if (this.ctx) { // 'suspended' (never started) or iOS's 'interrupted' (a call, Siri, app switch)
      if (this.ctx.state !== 'running') { this.ctx.resume().catch(() => {}); this.kick(); }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS / iPadOS: game audio, so play even with the ring / silent switch on (Safari 16.4+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) { /* ignore */ }
    try { this.ctx = new AC(); } catch (_) { this.ctx = null; return; }
    const c = this.ctx;
    if (c.state !== 'running') c.resume().catch(() => {});
    this.kick();
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    // slow-mo "tape": a low-pass after everything (sfx and music) that closes in while time is slowed
    this.tape = c.createBiquadFilter(); this.tape.type = 'lowpass'; this.tape.frequency.value = 20000; this.tape.Q.value = 0.8;
    this.master.connect(this.tape).connect(c.destination);
    this.fx = c.createGain(); this.fx.gain.value = this.fxMuted ? 0 : 1; this.fx.connect(this.master); // sound effects (music goes straight to master)
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // A silent one-sample sound started inside the gesture: older iOS only opens audio output this way.
  kick() {
    try { const c = this.ctx, src = c.createBufferSource(); src.buffer = c.createBuffer(1, 1, 22050); src.connect(c.destination); src.start(0); } catch (_) { /* ignore */ }
  }

  // Resume on every real user gesture: a click the controller synthesised doesn't count as one, so audio
  // may still be waiting when the first tap / key / press arrives mid-game.
  autoUnlock() {
    const go = () => this.unlock();
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) window.addEventListener(ev, go, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); });
  }

  // Slow-mo: every sound plays pitched down and stretched (like tape slowing), muffled by the tape filter.
  setRate(k) {
    if (this.rate === k) return;
    this.rate = k;
    if (this.tape) this.tape.frequency.setTargetAtTime(k < 1 ? 1600 : 20000, this.ctx.currentTime, 0.12);
  }

  // Silence just the sound effects (music keeps playing).
  setFxMuted(m) {
    this.fxMuted = m;
    if (this.fx) this.fx.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- primitives
  /** Oscillator blip. slide = Hz to glide by over the duration. */
  tone(freq, dur, type = 'square', vol = 0.08, slide = 0, delay = 0) {
    const c = this.ctx;
    if (!c) return;
    const k = this.rate || 1; freq *= k; slide *= k; dur /= k; delay /= k; // (slow-mo: lower and longer)
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out || this.fx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Filtered noise burst (whoosh, crash, splash, crumble). f1 = filter sweep target. */
  burst(dur, freq, { q = 1, vol = 0.2, type = 'bandpass', f1 = freq, delay = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const k = this.rate || 1; dur /= k; freq *= k; f1 *= k; delay /= k;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    s.loop = true;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (f1 !== freq) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out || this.fx);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  /** Arpeggio — pickups, level clear, power-ups. */
  arp(freqs, step = 0.06, dur = 0.1, type = 'triangle', vol = 0.08) {
    freqs.forEach((f, i) => this.tone(f, dur, type, vol, 0, i * step));
  }

  /** A stereo panner (-1 left .. +1 right), or a plain gain where the browser has none (iOS 13 Safari). */
  panner(p = 0) {
    const c = this.ctx;
    if (c.createStereoPanner) { const n = c.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); return n; }
    return c.createGain();
  }

  /** Run fn with every tone()/burst() it makes routed through one pan + volume. */
  at(pan, vol, fn) {
    const c = this.ctx;
    if (!c) return;
    if (!pan && (vol == null || vol === 1)) { fn(this); return; }
    const g = c.createGain(); g.gain.value = vol ?? 1;
    const p = this.panner(pan || 0);
    g.connect(p).connect(this.out || this.fx);
    const prev = this.out; this.out = g;
    try { fn(this); } finally { this.out = prev; }
  }

  // ---------------------------------------------------------------- named sfx
  /** opts: { pan: -1..1, vol: 0..1 } to place it (positional hazards, the side you turn to). */
  play(name, opts) {
    if (!this.ctx || this.muted || this.fxMuted) return;
    const fn = SFX[name];
    if (!fn) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.04) return; // rate limit
    this.last[name] = now;
    if (opts) this.at(opts.pan, opts.vol, fn); else fn(this);
  }

  /** Random grains at about `rate` per second (call every frame): crackling leaves, snow crunch, fire pops. */
  grains(key, rate, fn) {
    const c = this.ctx;
    if (!c || this.muted || this.fxMuted) return;
    const now = c.currentTime, dt = Math.min(0.1, now - (this.grainT[key] ?? now));
    this.grainT[key] = now;
    if (rate <= 0) { this.grainAcc[key] = Math.random(); return; }
    let a = (this.grainAcc[key] ?? Math.random()) + rate * dt * (0.4 + Math.random() * 1.2);
    for (let n = 0; a >= 1 && n < 4; n++) { a -= 1; fn(this); }
    this.grainAcc[key] = Math.min(a, 1);
  }

  // ---------------------------------------------------------------- loops
  /** Rolling / engine bed: looped low-passed noise; call setRoll every frame. */
  setRoll(speed, grounded = true, { maxSpeed = 14, vol = 0.12 } = {}) {
    const c = this.ctx;
    if (!c) return;
    if (!this.loops.roll) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; s.loop = true;
      f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0;
      s.connect(f).connect(g).connect(this.fx); s.start();
      this.loops.roll = { f, g };
    }
    const k = grounded ? Math.min(1, speed / maxSpeed) : 0;
    this.loops.roll.g.gain.setTargetAtTime(k * vol, c.currentTime, 0.05);
    this.loops.roll.f.frequency.setTargetAtTime(200 + k * 700, c.currentTime, 0.08);
  }

  /** Small-engine putt-putt (Dr. Mow): a low saw whose loudness is chopped by a
   *  square LFO. level 0..1 = idle..full; 0 fades it out. Call every frame. */
  setEngine(level) {
    const c = this.ctx;
    if (!c) return;
    if (!this.loops.engine) {
      const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), chop = c.createGain();
      const lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 58;
      lp.type = 'lowpass'; lp.frequency.value = 420;
      lfo.type = 'square'; lfo.frequency.value = 13; lg.gain.value = 0.5;
      chop.gain.value = 0.5; lfo.connect(lg).connect(chop.gain);
      g.gain.value = 0;
      o.connect(lp).connect(chop).connect(g).connect(this.fx);
      o.start(); lfo.start();
      this.loops.engine = { o, lfo, g, lp };
    }
    const e = this.loops.engine, t = c.currentTime;
    e.g.gain.setTargetAtTime(level > 0 ? 0.05 + level * 0.05 : 0, t, 0.08);
    e.o.frequency.setTargetAtTime((52 + level * 26) * (this.rate || 1), t, 0.1);
    e.lfo.frequency.setTargetAtTime(11 + level * 9, t, 0.1);
    e.lp.frequency.setTargetAtTime(360 + level * 420, t, 0.1);
  }

  /** Looped noise through a filter into a gain (and a panner, if pan). Shared by the loops below. */
  noiseLoop(type, freq, q = 1, pan = false) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
    const p = pan ? this.panner(0) : null;
    s.connect(f).connect(g); if (p) g.connect(p).connect(this.fx); else g.connect(this.fx);
    s.start(0, Math.random() * 1.5); // (a random offset: two loops on the one buffer don't phase together)
    return { s, f, g, p };
  }

  /** The mower deck at work (Dr. Mow). cut 0..1 = how much is going under the blades this moment;
   *  surface 'grass' | 'leaves' | 'snow' | 'ice'; speed 0..1. Call every frame (0 fades it out).
   *   grass:  a spinning-blade whir plus the chattering rip of blades through turf, chopped at blade rate
   *   leaves: a dry shhh plus a scatter of tiny crackles (crisp leaves breaking up)
   *   snow:   the squeaky-crunch of snow packing under the tyres, in step with speed, plus a soft plough hiss */
  setMow(cut, surface = 'grass', speed = 1) {
    const c = this.ctx;
    if (!c) return;
    const k = this.rate || 1, t = c.currentTime;
    if (!this.loops.mow) {
      const whir = c.createOscillator(), wf = c.createBiquadFilter(), wg = c.createGain();
      whir.type = 'sawtooth'; whir.frequency.value = 118;
      wf.type = 'bandpass'; wf.frequency.value = 760; wf.Q.value = 1.6; wg.gain.value = 0;
      whir.connect(wf).connect(wg).connect(this.fx); whir.start();
      const rip = this.noiseLoop('bandpass', 2600, 1.1), chop = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      rip.g.disconnect(); rip.g.connect(chop).connect(this.fx); // blade chop: the rip's loudness pulses at blade rate
      lfo.type = 'triangle'; lfo.frequency.value = 26; lg.gain.value = 0.45; chop.gain.value = 0.55; lfo.connect(lg).connect(chop.gain); lfo.start();
      const hiss = this.noiseLoop('highpass', 2200, 0.7); // leaves: a dry shhh / snow: plough hiss (filter retuned per surface)
      this.loops.mow = { whir, wg, rip, lfo, hiss, cut: 0 };
    }
    const m = this.loops.mow, on = cut > 0.01 ? Math.min(1, cut) : 0;
    m.cut = on;
    const grass = surface === 'grass', leaves = surface === 'leaves', snow = surface === 'snow';
    m.wg.gain.setTargetAtTime(on * (grass ? 0.04 : 0.016), t, on ? 0.03 : 0.12);
    m.whir.frequency.setTargetAtTime((104 + 26 * speed - 10 * on) * k, t, 0.1); // (bogs down a touch under load)
    m.rip.g.gain.setTargetAtTime(grass ? on * 0.1 : 0, t, on ? 0.03 : 0.1);
    m.rip.f.frequency.setTargetAtTime((2200 + 900 * speed) * k, t, 0.1);
    m.lfo.frequency.setTargetAtTime((22 + 10 * speed) * k, t, 0.1);
    m.hiss.f.type = snow ? 'lowpass' : 'highpass';
    m.hiss.f.frequency.setTargetAtTime((snow ? 1300 : 2400) * k, t, 0.05);
    m.hiss.g.gain.setTargetAtTime(leaves ? on * 0.04 : snow ? on * 0.04 : 0, t, on ? 0.04 : 0.12);
    // grains: the texture the loops can't do
    this.grains('mow:grass', grass ? on * 9 * (0.5 + speed) : 0, (s) => s.burst(0.025 + Math.random() * 0.02, 1800 + Math.random() * 3500, { q: 4, vol: 0.025 + Math.random() * 0.025 }));
    this.grains('mow:leaves', leaves ? on * 28 * (0.4 + speed) : 0, leafCrackle);
    this.grains('mow:snow', snow ? (0.25 + on * 0.75) * 7.5 * speed : 0, snowCrunch);
  }

  /** Tyre scrub while turning, heard on the side you turn toward. turn -1..1 (+ = right),
   *  speed 0..1, surface as setMow. Fires a skid chirp the moment a hard turn starts. Call every frame. */
  setTurn(turn, speed = 1, surface = 'grass') {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime, k = this.rate || 1;
    if (!this.loops.turn) this.loops.turn = { ...this.noiseLoop('bandpass', 900, 1.4, true), hard: false };
    const L = this.loops.turn, a = Math.min(1, Math.abs(turn)), side = Math.sign(turn);
    const tone = { grass: [850, 1.3], leaves: [2600, 0.8], snow: [520, 0.9], ice: [5200, 2.5] }[surface] || [850, 1.3];
    L.f.frequency.setTargetAtTime(tone[0] * (0.8 + 0.4 * a) * k, t, 0.05);
    L.f.Q.value = tone[1];
    L.g.gain.setTargetAtTime(Math.pow(a, 1.5) * speed * 0.14, t, 0.04);
    if (L.p?.pan) L.p.pan.setTargetAtTime(side * (0.25 + 0.6 * a), t, 0.05);
    const hard = L.hard ? a > 0.45 : a > 0.7;
    if (hard && !L.hard && speed > 0.4) this.play(surface === 'snow' ? 'skidSnow' : surface === 'ice' ? 'skidIce' : surface === 'leaves' ? 'skidLeaves' : 'skid', { pan: side * 0.8 });
    L.hard = hard;
  }

  /** Positional hazard loops: key 'bee' | 'saw' | 'fire' | 'missile' | 'acid' | 'windmill'. k 0..1 loudness
   *  (closeness), pan -1..1 (where it is relative to the way you face). Call every frame while the level has them. */
  setNear(key, k, pan = 0) {
    const c = this.ctx;
    if (!c) return;
    let L = this.loops['near:' + key];
    if (!L) { if (k <= 0.001) return; L = this.loops['near:' + key] = NEAR[key](this); }
    const t = c.currentTime, r = this.rate || 1;
    L.g.gain.setTargetAtTime(Math.max(0, k) * L.vol, t, 0.08);
    if (L.p?.pan) L.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.08);
    if (L.tune) L.tune(r, k, t);
    if (L.grain) this.grains('near:' + key, k > 0.02 ? L.grain.rate * (0.3 + k) : 0, (s) => s.at(pan * 0.9, Math.min(1, 0.3 + k), L.grain.fn));
  }

  /** Fade every moving-mower and hazard loop (pause, results, menus). */
  hush() {
    this.setEngine(0); this.setRoll(0, false);
    if (!this.ctx) return;
    if (this.loops.mow) this.setMow(0);
    if (this.loops.turn) this.setTurn(0, 0);
    for (const key of Object.keys(this.loops)) if (key.startsWith('near:')) this.setNear(key.slice(5), 0);
  }

  /** Two-tone siren (gig-ambulance): square LFO wobbling a triangle oscillator. */
  setSiren(on) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.loops.siren) {
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = 760;
      lfo.type = 'square'; lfo.frequency.value = 1.6; lg.gain.value = 130;
      lfo.connect(lg).connect(o.frequency);
      g.gain.value = 0.025;
      o.connect(g).connect(this.fx);
      o.start(); lfo.start();
      this.loops.siren = { o, lfo, g };
    } else if (!on && this.loops.siren) {
      const { o, lfo, g } = this.loops.siren;
      g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      o.stop(c.currentTime + 0.3); lfo.stop(c.currentTime + 0.3);
      this.loops.siren = null;
    }
  }

  /** Metallic scrape (finger-skater grind): narrow band-passed noise. */
  setScrape(on) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.loops.scrape) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; s.loop = true;
      f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 6; g.gain.value = 0.12;
      s.connect(f).connect(g).connect(this.fx); s.start();
      this.loops.scrape = { s, g };
    } else if (!on && this.loops.scrape) {
      const { s, g } = this.loops.scrape;
      g.gain.setTargetAtTime(0, c.currentTime, 0.03);
      s.stop(c.currentTime + 0.2);
      this.loops.scrape = null;
    }
  }

  /** Ambient drone (labyrinth-larry): beating saws under a low-pass. Start once. */
  startDrone(freqs = [55, 55.7, 82.4], vol = 0.05) {
    const c = this.ctx;
    if (!c || this.loops.drone) return;
    const g = c.createGain(), lp = c.createBiquadFilter();
    g.gain.value = vol; lp.type = 'lowpass'; lp.frequency.value = 400;
    const oscs = freqs.map((fr) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(lp); o.start(); return o; });
    lp.connect(g).connect(this.fx);
    this.loops.drone = { g, oscs };
  }

  /** A human-ish yell (labyrinth-larry): pitch-bent saw through vowel formants + breath noise. */
  scream(intensity = 1) {
    const c = this.ctx;
    if (!c || this.muted) return 0;
    const t = c.currentTime, dur = 0.55 + Math.random() * 0.6;
    const base = 330 + Math.random() * 220;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 0.8, t);
    o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t + 0.12);
    o.frequency.exponentialRampToValueAtTime(base * 0.7, t + dur);
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.value = 6 + Math.random() * 4; vg.gain.value = base * 0.035;
    vib.connect(vg).connect(o.frequency);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.16 * intensity, t + 0.04);
    out.gain.setValueAtTime(0.16 * intensity, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const vowel = Math.random() < 0.5 ? [800, 1150, 2900] : [700, 1800, 2600]; // "AH" / "AE"
    vowel.forEach((fr, i) => {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 6;
      const g = c.createGain(); g.gain.value = [1.4, 0.8, 0.35][i];
      o.connect(bp).connect(g).connect(out);
    });
    const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = this.noise; n.loop = true;
    nf.type = 'bandpass'; nf.frequency.value = 1500; ng.gain.value = 0.25;
    n.connect(nf).connect(ng).connect(out);
    out.connect(this.fx);
    o.start(t); vib.start(t); n.start(t);
    o.stop(t + dur); vib.stop(t + dur); n.stop(t + dur);
    return dur;
  }
}

// Dr. Mow surface grains (random each time, so a run of them never sounds like a loop).
function leafCrackle(s) {
  const r = Math.random();
  if (r < 0.12) s.burst(0.06 + Math.random() * 0.05, 1100 + Math.random() * 900, { q: 1.5, vol: 0.07, f1: 600 }); // a bigger crunch
  else s.burst(0.008 + Math.random() * 0.02, 2600 + Math.random() * 5200, { q: 3 + Math.random() * 6, vol: 0.03 + Math.random() * 0.045 });
}
function snowCrunch(s) {
  const d = Math.random() * 0.02;
  s.burst(0.1 + Math.random() * 0.06, 950 + Math.random() * 300, { type: 'lowpass', q: 1.2, vol: 0.13, f1: 260, delay: d }); // the pack
  s.burst(0.05, 2100 + Math.random() * 900, { q: 5, vol: 0.05, f1: 1400, delay: d + 0.012 }); // its squeak
  if (Math.random() < 0.35) s.tone(900 + Math.random() * 500, 0.05, 'triangle', 0.012, -350, d + 0.02); // the cold "eek" of packed snow
}

// Builders for setNear(): each returns { g (gain), p (panner), vol (max), tune?(rate, k, t), grain?: { rate, fn } }.
const NEAR = {
  bee(s) { // a fat bumblebee buzz: two detuned saws with a wobble, through a nasal band-pass
    const c = s.ctx, g = c.createGain(), p = s.panner(0), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    g.gain.value = 0; f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 2.2;
    const os = [182, 188.5].map((fr) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); lg.connect(o.frequency); o.start(); return o; });
    lfo.frequency.value = 7.5; lg.gain.value = 9; lfo.connect(lg); lfo.start();
    f.connect(g).connect(p).connect(s.fx);
    return { g, p, vol: 0.09, tune: (r, k, t) => os.forEach((o, i) => o.frequency.setTargetAtTime((182 + i * 6.5 + 30 * k) * r, t, 0.1)) };
  },
  saw(s) { // a buzz-saw whine with a gritty hiss
    const c = s.ctx, g = c.createGain(), p = s.panner(0), f = c.createBiquadFilter(), wob = c.createOscillator(), wg = c.createGain(), am = c.createGain();
    g.gain.value = 0; f.type = 'bandpass'; f.frequency.value = 2300; f.Q.value = 2.5;
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 880; o2.type = 'square'; o2.frequency.value = 1327;
    o1.connect(f); o2.connect(f); o1.start(); o2.start();
    wob.frequency.value = 17; wg.gain.value = 0.35; am.gain.value = 0.65; wob.connect(wg).connect(am.gain); wob.start();
    f.connect(am).connect(g).connect(p).connect(s.fx);
    const h = s.ctx.createBufferSource(), hf = c.createBiquadFilter(), hg = c.createGain();
    h.buffer = s.noise; h.loop = true; hf.type = 'highpass'; hf.frequency.value = 4500; hg.gain.value = 0.5; h.connect(hf).connect(hg).connect(g); h.start();
    return { g, p, vol: 0.045, tune: (r, k, t) => { o1.frequency.setTargetAtTime(880 * r, t, 0.1); o2.frequency.setTargetAtTime(1327 * r, t, 0.1); } };
  },
  fire(s) { // a low roar with pops and crackles
    const L = s.noiseLoop('lowpass', 520, 0.8, true);
    return { ...L, vol: 0.09, grain: { rate: 11, fn: (x) => x.burst(0.01 + Math.random() * 0.03, 1500 + Math.random() * 4000, { q: 2, vol: 0.06 + Math.random() * 0.08 }) } };
  },
  missile(s) { // a rocket's rushing hiss and a rising whistle
    const c = s.ctx, L = s.noiseLoop('bandpass', 1400, 0.9, true), o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle'; o.frequency.value = 900; og.gain.value = 0.25; o.connect(og).connect(L.g); o.start();
    return { ...L, vol: 0.09, tune: (r, k, t) => o.frequency.setTargetAtTime((700 + 900 * k) * r, t, 0.1) };
  },
  acid(s) { // a toxic vat bubbling: blub blub
    const L = s.noiseLoop('lowpass', 300, 1, true);
    return { ...L, vol: 0.04, grain: { rate: 6, fn: (x) => x.tone(160 + Math.random() * 220, 0.07, 'sine', 0.09, 260 + Math.random() * 200) } };
  },
  windmill(s) { // the sails sweeping past: a whoosh pulsing in time with them
    const c = s.ctx, L = s.noiseLoop('bandpass', 480, 1.2, true), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    L.g.disconnect(); const out = c.createGain(); out.gain.value = 0; L.g.gain.value = 1; L.g.connect(am).connect(out).connect(L.p || s.fx);
    lfo.frequency.value = 2.2; lg.gain.value = 0.5; am.gain.value = 0.5; lfo.connect(lg).connect(am.gain); lfo.start();
    return { g: out, p: L.p, vol: 0.12 };
  },
};

// The shared sound vocabulary. Each entry is (sfx) => void. Add your own freely.
export const SFX = {
  // pickups / rewards (gig-ambulance, finger-skater, labyrinth-larry)
  coin: (s) => { s.tone(988, 0.07, 'square', 0.05); s.tone(1319, 0.12, 'square', 0.05, 0, 0.06); },
  power: (s) => s.arp([523, 659, 784, 1047], 0.055, 0.1, 'triangle', 0.08),
  bonus: (s) => s.arp([659, 784, 1047], 0.06, 0.12, 'square', 0.05),
  deliver: (s) => s.arp([523, 659, 784, 1047, 1319], 0.08, 0.16, 'square', 0.06),
  checkpoint: (s) => s.arp([392, 523, 784], 0.09, 0.25, 'sine', 0.1),
  clear: (s) => s.arp([392, 523, 659, 784, 1046], 0.1, 0.14, 'square', 0.05),
  charged: (s) => s.tone(1200, 0.06, 'triangle', 0.05),
  slowIn: (s) => { s.tone(660, 0.35, 'sine', 0.06, -420); s.tone(330, 0.4, 'triangle', 0.04, -200, 0.05); }, // pitch-down 'time bends' swoop
  slowOut: (s) => s.tone(300, 0.2, 'sine', 0.05, 500),
  tick: (s) => s.tone(1200, 0.05, 'square', 0.05),
  // weapons (sub-sinkers)
  shoot: (s) => { s.tone(520, 0.09, 'square', 0.06, -340); s.burst(0.12, 2000, { q: 2, vol: 0.05, f1: 400 }); },
  missile: (s) => s.burst(0.3, 400, { q: 3, vol: 0.09, f1: 3000 }),
  enemyShot: (s) => s.tone(900, 0.08, 'triangle', 0.05, -600),
  // impacts
  hit: (s) => { s.burst(0.25, 300, { q: 0.8, vol: 0.3 }); s.tone(160, 0.3, 'sawtooth', 0.1, -90); },
  bonk: (s) => s.tone(520, 0.08, 'triangle', 0.08, -300),
  bumper: (s) => { s.tone(880, 0.09, 'square', 0.06, 600); s.tone(1760, 0.06, 'triangle', 0.04, 0, 0.03); }, // pinball 'ding-pop'
  crash: (s) => { s.tone(110, 0.25, 'sawtooth', 0.12, -60); s.tone(70, 0.3, 'square', 0.08, -30); },
  boom: (s) => { s.burst(0.6, 1200, { type: 'lowpass', vol: 0.35, f1: 60 }); s.tone(90, 0.5, 'sine', 0.25, -60); },
  bigBoom: (s) => { s.burst(1.4, 900, { type: 'lowpass', vol: 0.5, f1: 40 }); s.tone(70, 1.2, 'sine', 0.4, -50); },
  clank: (s) => { s.tone(200, 0.25, 'square', 0.05, -80); s.tone(1600, 0.12, 'triangle', 0.04); s.burst(0.08, 2500, { q: 2, vol: 0.12 }); },
  splash: (s) => s.burst(0.35, 3000, { type: 'highpass', vol: 0.12, f1: 600 }),
  // a wet grape squish (Napa pack): a soft low thud, a gooey filter sweep down, and a little squirt on top
  creak: (s) => { s.tone(1900, 0.5, 'triangle', 0.03, -500); s.burst(0.4, 5200, { type: 'highpass', q: 3, vol: 0.05, f1: 2600 }); }, // an icicle working loose
  shatter: (s) => { s.burst(0.45, 7000, { type: 'highpass', q: 1.5, vol: 0.28, f1: 1800 }); [2637, 3136, 3951, 2349].forEach((f, i) => s.tone(f, 0.18, 'sine', 0.05, -400, i * 0.03)); s.tone(110, 0.2, 'sine', 0.2, -50); },
  freeze: (s) => { s.burst(0.5, 6000, { type: 'highpass', vol: 0.15, f1: 3000 }); s.arp([1568, 1319, 1047, 784], 0.05, 0.25, 'sine', 0.06); },
  crack: (s) => { s.burst(0.08, 4500, { q: 2, vol: 0.3, f1: 1200 }); s.tone(1400, 0.06, 'triangle', 0.05, -600); },
  spit: (s) => { s.burst(0.18, 900, { type: 'lowpass', q: 6, vol: 0.25, f1: 2200 }); s.tone(180, 0.15, 'sine', 0.1, 260); }, // the acid vat: a wet glorp
  sizzle: (s) => s.burst(0.35, 6500, { type: 'highpass', q: 0.7, vol: 0.12, f1: 4000 }),
  squish: (s) => { s.tone(220, 0.12, 'sine', 0.12, -150); s.burst(0.22, 1600, { type: 'lowpass', q: 4, vol: 0.28, f1: 180 }); s.burst(0.09, 3200, { q: 5, vol: 0.06, f1: 900, delay: 0.05 }); },
  pebble: (s) => { s.tone(340, 0.06, 'square', 0.05, -160); s.burst(0.07, 2400, { q: 3, vol: 0.1, f1: 1200 }); }, // a stone clacking under the deck
  crunch: (s) => { s.burst(0.18, 1800, { q: 1.5, vol: 0.22, f1: 500 }); s.burst(0.1, 4200, { q: 2, vol: 0.08, f1: 2000, delay: 0.04 }); s.tone(120, 0.1, 'square', 0.05, -50); }, // a pebble crushed to gravel
  squishBig: (s) => { s.tone(150, 0.2, 'sine', 0.16, -100); s.burst(0.35, 1100, { type: 'lowpass', q: 5, vol: 0.35, f1: 120 }); s.burst(0.14, 2600, { q: 4, vol: 0.08, f1: 700, delay: 0.07 }); s.tone(520, 0.1, 'triangle', 0.04, -300, 0.1); },
  // movement
  jump: (s) => s.tone(300, 0.25, 'triangle', 0.07, 500),
  ollie: (s) => { s.burst(0.08, 2200, { vol: 0.25 }); s.tone(300, 0.18, 'triangle', 0.06, 300); },
  land: (s) => { s.burst(0.12, 500, { vol: 0.3 }); s.tone(90, 0.1, 'square', 0.05, -30); },
  // states
  fail: (s) => s.tone(330, 0.4, 'sawtooth', 0.06, -200),
  hurt: (s) => { s.tone(240, 0.35, 'sawtooth', 0.12, -190); s.burst(0.3, 800, { type: 'lowpass', vol: 0.15, f1: 100 }); },
  gameOver: (s) => { s.burst(0.6, 250, { vol: 0.5 }); [392, 330, 262, 196].forEach((f, i) => s.tone(f, 0.22, 'sawtooth', 0.07, 0, i * 0.14)); },
  warn: (s) => [0, 0.3, 0.6].forEach((d) => { s.tone(880, 0.12, 'square', 0.05, 0, d); s.tone(660, 0.12, 'square', 0.05, 0, d + 0.15); }),
  sonar: (s) => s.tone(1320, 0.9, 'sine', 0.05, -20),
  portal: (s) => { s.tone(80, 1.6, 'sawtooth', 0.12, 400); s.arp([262, 311, 392, 466, 523], 0.12, 0.35, 'square', 0.05); },
  // Dr. Mow
  ready: (s) => s.tone(660, 0.12, 'square', 0.05),
  go: (s) => s.arp([523, 784, 1047], 0.05, 0.14, 'square', 0.06),
  gold: (s) => { s.arp([784, 988, 1175, 1568, 1976], 0.07, 0.2, 'triangle', 0.09); s.tone(2637, 0.5, 'sine', 0.03, 0, 0.35); },
  rank: (s) => s.arp([392, 494, 587, 784], 0.09, 0.22, 'square', 0.05),
  achieve: (s) => s.arp([880, 1109, 1319], 0.07, 0.16, 'triangle', 0.07),
  ui: (s) => s.tone(740, 0.05, 'triangle', 0.05),
  // Dr. Mow turning (setTurn plays these, panned to the side you turn toward)
  skid: (s) => { s.burst(0.22, 1300, { q: 1.4, vol: 0.13, f1: 520 }); s.tone(250, 0.14, 'triangle', 0.025, -70, 0.02); }, // tyres scrubbing turf + a steering creak
  skidLeaves: (s) => { s.burst(0.26, 3600, { q: 0.8, vol: 0.12, f1: 1500 }); for (let i = 0; i < 4; i++) leafCrackle(s); },
  skidSnow: (s) => { s.burst(0.28, 900, { type: 'lowpass', q: 1, vol: 0.18, f1: 250 }); snowCrunch(s); },
  skidIce: (s) => { s.burst(0.35, 6500, { q: 3, vol: 0.09, f1: 4200 }); s.tone(1900, 0.25, 'sine', 0.012, -300); },
  // landing on a pile instead of turf
  landSnow: (s) => { s.burst(0.22, 800, { type: 'lowpass', q: 1, vol: 0.32, f1: 160 }); snowCrunch(s); },
  landLeaves: (s) => { s.burst(0.2, 2400, { q: 0.8, vol: 0.14, f1: 900 }); for (let i = 0; i < 6; i++) leafCrackle(s); s.tone(90, 0.08, 'sine', 0.06, -30); },
  // Dr. Mow power-ups, each its own voice so you can tell them apart by ear
  gas: (s) => { [0, 0.075, 0.15].forEach((d, i) => s.tone(170 + i * 40, 0.07, 'sine', 0.14, 240, d)); [784, 1047, 1319].forEach((f, i) => s.tone(f, 0.14, 'triangle', 0.06, 0, 0.22 + i * 0.05)); }, // glug-glug-glug, ding
  boost: (s) => { s.burst(0.4, 500, { q: 1.6, vol: 0.14, f1: 4200 }); s.tone(260, 0.35, 'sawtooth', 0.035, 900); s.tone(1568, 0.18, 'triangle', 0.04, 0, 0.25); }, // whoosh up
  heart: (s) => { s.tone(72, 0.12, 'sine', 0.32, -22); s.tone(66, 0.14, 'sine', 0.26, -20, 0.17); [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.55, 'sine', 0.05, 0, 0.34 + i * 0.03)); s.tone(2093, 0.4, 'triangle', 0.02, 0, 0.5); }, // ba-dum, then a warm chord
  cloneUp: (s) => { [0, 0.11].forEach((d) => { s.tone(880, 0.08, 'square', 0.05, 0, d); s.tone(886, 0.08, 'square', 0.05, 0, d); }); [523, 659, 784, 1047].forEach((f, i) => { s.tone(f, 0.1, 'square', 0.045, 0, 0.26 + i * 0.06); s.tone(f * 2.004, 0.1, 'triangle', 0.03, 0, 0.26 + i * 0.06); }); s.tone(1047, 0.45, 'square', 0.04, 0, 0.52); s.tone(1052, 0.45, 'square', 0.04, 0, 0.52); }, // two blips (one ship, then its twin) and a doubled rising arpeggio: docked
  megaUp: (s) => { s.tone(70, 0.7, 'sawtooth', 0.09, 170); s.burst(0.7, 260, { type: 'lowpass', vol: 0.16, f1: 2200 }); [392, 523, 659, 784].forEach((f, i) => s.tone(f, 0.12, 'square', 0.05, 0, 0.18 + i * 0.07)); s.tone(1047, 0.6, 'square', 0.05, 0, 0.48); s.tone(1568, 0.6, 'triangle', 0.035, 0, 0.48); }, // the engine revs up to a fanfare
  crusherUp: (s) => { s.tone(330, 0.45, 'square', 0.05, -25); s.tone(1245, 0.35, 'triangle', 0.05); s.burst(0.09, 3200, { q: 2, vol: 0.14 }); s.tone(110, 0.16, 'square', 0.08, -40, 0.22); s.burst(0.14, 700, { type: 'lowpass', vol: 0.22, f1: 120, delay: 0.22 }); s.tone(82, 0.2, 'square', 0.08, -30, 0.38); s.burst(0.18, 600, { type: 'lowpass', vol: 0.26, f1: 90, delay: 0.38 }); }, // anvil clang, STOMP, STOMP
  clover: (s) => { [1047, 1175, 1319, 1568, 1760, 2093, 2349].forEach((f, i) => s.tone(f, 0.2, 'sine', 0.05, 0, i * 0.035)); s.tone(3136, 0.6, 'sine', 0.02, 0, 0.26); }, // a lucky shimmer
  puff: (s) => { s.burst(0.16, 4500, { type: 'highpass', q: 0.7, vol: 0.07, f1: 9000 }); s.tone(1568, 0.08, 'triangle', 0.045, 320); }, // a dandelion blown away
  clock: (s) => { s.tone(1500, 0.04, 'triangle', 0.07); s.tone(1050, 0.04, 'triangle', 0.07, 0, 0.11); s.arp([1319, 1760], 0.06, 0.16, 'sine', 0.06); }, // tick-tock + chime
  // Dr. Mow hazard hits (layered on the yelp), one per thing that hit you
  whack: (s) => { s.burst(0.08, 900, { q: 3, vol: 0.4, f1: 300 }); s.tone(180, 0.16, 'triangle', 0.12, -80); }, // a wooden thwack (windmill sail, cat paw)
  zap: (s) => { s.tone(1700, 0.28, 'sawtooth', 0.05, -1400); s.burst(0.22, 4200, { q: 6, vol: 0.13, f1: 700 }); s.tone(120, 0.25, 'square', 0.04); }, // a shock (ring mine)
  boing: (s) => { s.tone(170, 0.42, 'sine', 0.14, 330); s.tone(340, 0.3, 'triangle', 0.05, -190, 0.08); }, // a garden gnome's spring
  sting: (s) => { s.tone(1350, 0.16, 'sawtooth', 0.04, 700); s.burst(0.09, 6000, { q: 4, vol: 0.08 }); },
  burn: (s) => { s.burst(0.4, 450, { type: 'lowpass', vol: 0.28, f1: 2600 }); s.burst(0.55, 6200, { type: 'highpass', vol: 0.11, f1: 3000, delay: 0.05 }); }, // whoomph + sizzle
  sawHit: (s) => { s.tone(1250, 0.3, 'sawtooth', 0.06, -500); s.burst(0.3, 3600, { q: 5, vol: 0.16, f1: 1400 }); s.tone(2600, 0.1, 'square', 0.025, 0, 0.04); }, // ZZZT
  acidHit: (s) => { s.burst(0.15, 800, { type: 'lowpass', q: 5, vol: 0.2, f1: 2000 }); s.burst(0.6, 7000, { type: 'highpass', vol: 0.13, f1: 3500, delay: 0.06 }); },
  // Dr. Mow enemies
  rocket: (s) => { s.burst(0.9, 280, { q: 1.4, vol: 0.16, f1: 2600 }); s.tone(190, 0.75, 'sawtooth', 0.03, 650); }, // a homing missile leaving the launcher
  armBeep: (s) => [0, 0.12].forEach((d) => s.tone(2100, 0.06, 'square', 0.05, 0, d)),
  fizzle: (s) => { s.burst(0.45, 3000, { type: 'highpass', vol: 0.09, f1: 800 }); s.tone(620, 0.3, 'sine', 0.035, -420); },
  yowl: (s) => { s.burst(0.35, 5200, { type: 'highpass', q: 1.2, vol: 0.12, f1: 3000 }); s.tone(720, 0.5, 'sawtooth', 0.03, 900, 0.05); s.tone(1450, 0.42, 'square', 0.012, -500, 0.2); s.tone(1180, 0.35, 'sine', 0.025, 700, 0.08); }, // a black cat: a hiss, then a shrill rising screech
  rattle: (s) => { [0, 0.05, 0.09, 0.14, 0.2, 0.24, 0.3].forEach((d, i) => { s.tone(1100 + (i % 3) * 260, 0.035, 'square', 0.03, -400, d); s.burst(0.03, 3800, { q: 4, vol: 0.08, f1: 2400, delay: d }); }); }, // a skeleton: dry bones clacking
  cackle: (s) => { [0, 0.11, 0.22, 0.33, 0.44, 0.58].forEach((d, i) => { s.tone(760 - i * 45, 0.09, 'sawtooth', 0.025, -220, d); s.tone(1520 - i * 90, 0.07, 'square', 0.008, -300, d + 0.01); }); }, // the witch: heh-heh-heh-heh
  meow: (s) => { s.tone(500, 0.12, 'sawtooth', 0.035, 320); s.tone(820, 0.32, 'sawtooth', 0.03, -400, 0.1); s.tone(1000, 0.3, 'sine', 0.02, -450, 0.1); }, // mrrrOW
  swish: (s) => s.burst(0.18, 800, { q: 2, vol: 0.16, f1: 3600 }),
  charge: (s) => { s.tone(180, 0.7, 'sine', 0.07, 700); s.tone(186, 0.7, 'triangle', 0.04, 720); }, // the frog's glow winding up
  thwip: (s) => { s.tone(1200, 0.1, 'sine', 0.08, -900); s.burst(0.06, 2500, { q: 2, vol: 0.1 }); }, // a tongue lash
  slap: (s) => { s.burst(0.06, 2000, { q: 0.7, vol: 0.42, f1: 600 }); s.tone(150, 0.08, 'sine', 0.16, -60); },
  whistle: (s) => { s.tone(1700, 1.3, 'sine', 0.035, -1100); s.tone(1720, 1.3, 'triangle', 0.012, -1120, 0.02); }, // a cauldron falling: the long descending whistle
  clunk: (s) => { s.burst(0.22, 300, { type: 'lowpass', vol: 0.4, f1: 90 }); s.tone(150, 0.18, 'square', 0.06, -80); s.tone(310, 0.25, 'triangle', 0.03, -60, 0.03); }, // ...and lands: a heavy iron clunk
  thud: (s) => { s.burst(0.15, 420, { type: 'lowpass', vol: 0.32, f1: 120 }); s.tone(110, 0.1, 'sine', 0.12, -40); }, // into a hay bale
  crumble: (s) => [0, 0.07, 0.15, 0.24].forEach((d, i) => s.burst(0.14, 700 - i * 100, { type: 'lowpass', q: 1, vol: 0.18, f1: 140, delay: d })),
  beeSquash: (s) => { s.tone(420, 0.2, 'sawtooth', 0.04, -300); s.burst(0.08, 1200, { type: 'lowpass', q: 3, vol: 0.2, f1: 300 }); },
  honk: (s) => { s.tone(415, 0.18, 'square', 0.04); s.tone(349, 0.18, 'square', 0.04); },
};
