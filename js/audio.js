// Suburban Turismo's sound: all synthesized (js/sfx-synth.js, the shared mtd-public synth), no sample files.
//   * your engine: a four-pot with four gears. Two detuned saws at the firing rate plus a square an octave down,
//     through a low-pass that opens with the throttle, and a gulp of lost revs on every upshift;
//   * the tyres: a squeal (band-passed noise, a whistle on top) that follows how far you're sliding;
//   * the road: rumble that follows speed, rougher and louder off the track; wind at speed;
//   * other cars: the nearest rival's engine, panned; the nearest cruiser's siren (a wail), panned;
//   * one-shots: the shared library (crash, shatter, boom, skid…) plus a few of our own (below).
import { Sfx, SFX } from './sfx-synth.js';

const GEARS = [0, 0.24, 0.47, 0.72, 1.01]; // share of top speed where each gear runs out

// Our own one-shots, added to the shared table.
Object.assign(SFX, {
  metal: (s) => { s.burst(0.35, 1400, { q: 2, vol: 0.32, f1: 300 }); s.tone(95, 0.35, 'sawtooth', 0.14, -50); s.tone(1900, 0.18, 'square', 0.035, -900, 0.02); s.tone(2600, 0.22, 'triangle', 0.03, -400, 0.06); },
  bigCrash: (s) => { s.burst(0.7, 900, { type: 'lowpass', vol: 0.5, f1: 70 }); s.burst(0.45, 2400, { q: 1.2, vol: 0.28, f1: 500 }); s.tone(70, 0.5, 'sawtooth', 0.16, -40); [0.04, 0.11, 0.19, 0.3].forEach((d, i) => s.tone(1400 + i * 430, 0.14, 'square', 0.03, -700, d)); s.burst(0.5, 7000, { type: 'highpass', q: 1.2, vol: 0.12, f1: 2500, delay: 0.05 }); },
  scrape: (s) => { s.burst(0.3, 2600, { q: 3, vol: 0.12, f1: 1800 }); s.tone(2200, 0.25, 'sawtooth', 0.015, -300); },
  thud: (s) => { s.burst(0.18, 300, { type: 'lowpass', vol: 0.35, f1: 60 }); s.tone(80, 0.15, 'sine', 0.16, -30); },
  bush: (s) => { s.burst(0.35, 3200, { q: 0.7, vol: 0.16, f1: 900 }); [0.03, 0.08, 0.14].forEach((d) => s.burst(0.05, 5000, { q: 2, vol: 0.06, delay: d })); },
  hydrant: (s) => { s.tone(220, 0.2, 'square', 0.06, -120); s.burst(1.6, 2400, { type: 'highpass', vol: 0.16, f1: 900, delay: 0.05 }); },
  cart: (s) => { s.tone(1200, 0.12, 'square', 0.035, -500); s.burst(0.2, 3200, { q: 2, vol: 0.12 }); [0.05, 0.1, 0.16].forEach((d, i) => s.tone(1700 - i * 300, 0.06, 'triangle', 0.03, 0, d)); },
  shiftUp: (s) => s.burst(0.09, 500, { type: 'lowpass', vol: 0.07, f1: 200 }),
  launch: (s) => { s.burst(0.5, 600, { q: 1.6, vol: 0.14, f1: 3800 }); s.tone(400, 0.4, 'sawtooth', 0.02, 900); },
  pop: (s) => { s.burst(0.06, 2600, { q: 1.4, vol: 0.32 }); s.tone(160, 0.06, 'square', 0.05, -80); },
  crackle: (s) => [0, 0.04, 0.07, 0.12, 0.15, 0.21, 0.25, 0.3, 0.36].forEach((d) => s.burst(0.03, 3000 + Math.random() * 3000, { q: 2, vol: 0.12 + Math.random() * 0.12, delay: d + Math.random() * 0.02 })),
  mortar: (s) => { s.tone(140, 0.12, 'square', 0.1, -60); s.burst(0.25, 300, { type: 'lowpass', vol: 0.4, f1: 80 }); s.tone(1800, 1.0, 'sine', 0.03, -1300, 0.15); },
  candle: (s) => { s.burst(0.08, 900, { q: 2, vol: 0.26, f1: 400 }); s.tone(300, 0.1, 'triangle', 0.05, 400); },
  pickup: (s) => s.arp([660, 880, 1320], 0.05, 0.1, 'square', 0.05),
  heal: (s) => s.arp([523, 659, 784, 1047], 0.06, 0.14, 'triangle', 0.07),
  vape: (s) => { s.burst(1.2, 1800, { type: 'highpass', vol: 0.12, f1: 500 }); s.tone(120, 0.6, 'sine', 0.05, -40); },
  cough: (s) => { s.burst(0.12, 700, { q: 1.5, vol: 0.18, f1: 300 }); s.burst(0.1, 650, { q: 1.5, vol: 0.14, f1: 280, delay: 0.18 }); },
  wreck: (s) => { SFX.bigBoom(s); SFX.bigCrash(s); },
  beep: (s) => s.tone(660, 0.14, 'square', 0.06),
  beepGo: (s) => s.tone(1320, 0.4, 'square', 0.06),
});

export class CarAudio {
  constructor() { this.s = new Sfx({ volume: 0.75 }); this.s.autoUnlock(); this.gear = 1; this.on = false; }
  get ctx() { return this.s.ctx; }
  setMuted(m) { this.s.setMuted(m); }
  play(name, opts) { this.s.play(name, opts); }

  // An engine voice: two detuned saws + a sub square → low-pass → gain (→ pan).
  engineVoice(pan = false) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(), p = pan ? this.s.panner(0) : null;
    lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 2.2; g.gain.value = 0;
    const os = [['sawtooth', 1, 0], ['sawtooth', 1, 9], ['square', 0.5, 0]].map(([type, mul, det]) => { const o = c.createOscillator(); o.type = type; o.detune.value = det; o.connect(lp); o.start(); return { o, mul }; });
    const rasp = this.s.noiseLoop('bandpass', 900, 1.2); rasp.g.disconnect(); rasp.g.connect(lp); // (intake hiss under it)
    lp.connect(g); if (p) g.connect(p).connect(this.s.fx); else g.connect(this.s.fx);
    return { g, lp, os, rasp, p };
  }
  setVoice(v, rpm, load, vol) {
    const t = this.ctx.currentTime, f = (rpm / 60) * 2; // (a four-pot fires twice a turn)
    for (const { o, mul } of v.os) o.frequency.setTargetAtTime(f * mul, t, 0.03);
    v.lp.frequency.setTargetAtTime(260 + load * 1400 + rpm * 0.12, t, 0.05);
    v.g.gain.setTargetAtTime(vol, t, 0.06);
    v.rasp.g.gain.setTargetAtTime(vol * (0.3 + load * 0.9), t, 0.06);
  }

  // Per frame while driving. p: { speed, cruise, throttle (−1..1), slip, grounded, offroad, segway }; null = silence.
  drive(p) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    if (!this.L) {
      this.L = { eng: this.engineVoice(), squeal: this.s.noiseLoop('bandpass', 1900, 6), squealTone: null, road: this.s.noiseLoop('lowpass', 180, 0.8), wind: this.s.noiseLoop('bandpass', 700, 0.5) };
      const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = 1350; g.gain.value = 0; o.connect(g).connect(this.s.fx); o.start(); this.L.squealTone = { o, g };
      const w = c.createOscillator(), wg = c.createGain(); w.type = 'sine'; w.frequency.value = 300; wg.gain.value = 0; w.connect(wg).connect(this.s.fx); w.start(); this.L.whine = { o: w, g: wg }; // (the Segway's motor)
    }
    const L = this.L;
    if (!p) { for (const n of [L.eng.g, L.squeal.g, L.squealTone.g, L.road.g, L.wind.g, L.whine.g]) n.gain.setTargetAtTime(0, t, 0.1); for (const n of [L.eng.rasp.g]) n.gain.setTargetAtTime(0, t, 0.1); return; }
    const v = Math.min(1.05, Math.abs(p.speed) / p.cruise), load = Math.max(0, p.throttle);
    if (p.segway) {
      L.whine.o.frequency.setTargetAtTime(220 + v * 900, t, 0.05); L.whine.g.gain.setTargetAtTime(0.02 + v * 0.04, t, 0.08);
      this.setVoice(L.eng, 800, 0, 0);
    } else {
      L.whine.g.gain.setTargetAtTime(0, t, 0.1);
      // the gearbox: pick the gear, shift up with a gulp, hold revs in the air / reverse
      let g = 1; while (g < 4 && v > GEARS[g]) g++;
      if (p.speed < -0.5) g = 1;
      if (g > this.gear) { this.play('shiftUp'); this.shiftT = 0.12; }
      this.gear = g;
      const k = (v - GEARS[g - 1]) / (GEARS[g] - GEARS[g - 1]);
      let rpm = 900 + Math.max(0, Math.min(1, k)) * 4600 + load * (v < 0.05 ? 1800 : 500);
      if (!p.grounded) rpm += load * 1500;
      if (this.shiftT > 0) { this.shiftT -= 1 / 60; rpm *= 0.82; }
      this.setVoice(L.eng, rpm, load, 0.05 + load * 0.07 + v * 0.03);
    }
    const slide = p.grounded ? Math.max(0, Math.min(1, (Math.abs(p.slip) - 0.12) * 3)) * Math.min(1, Math.abs(p.speed) / 6) : 0;
    L.squeal.g.gain.setTargetAtTime(slide * (p.offroad ? 0.05 : 0.16), t, 0.05);
    L.squeal.f.frequency.setTargetAtTime(p.offroad ? 700 : 1700 + slide * 500, t, 0.08);
    L.squealTone.g.gain.setTargetAtTime(p.offroad ? 0 : slide * 0.035, t, 0.05);
    L.squealTone.o.frequency.setTargetAtTime(1250 + slide * 250 + Math.sin(t * 23) * 40, t, 0.02);
    L.road.g.gain.setTargetAtTime(p.grounded ? v * (p.offroad ? 0.32 : 0.12) : 0, t, 0.08);
    L.road.f.frequency.setTargetAtTime((p.offroad ? 420 : 160) + v * 260, t, 0.1);
    L.wind.g.gain.setTargetAtTime(Math.max(0, v - 0.4) * 0.09, t, 0.15);
  }

  // The nearest rival's engine (level 0..1 by distance, its share of top speed, pan −1..1).
  rival(level, v, pan) {
    const c = this.ctx; if (!c) return;
    if (!this.R) this.R = this.engineVoice(true);
    this.setVoice(this.R, 1000 + ((v * 4) % 1) * 4000, 0.6, level * 0.07);
    if (this.R.p.pan) this.R.p.pan.setTargetAtTime(pan, c.currentTime, 0.05);
  }

  // A cruiser's siren (the wail), level 0..1, pan −1..1.
  siren(level, pan) {
    const c = this.ctx; if (!c) return;
    if (!this.Sn) {
      const o = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), p = this.s.panner(0);
      o.type = 'square'; o2.type = 'sawtooth'; o.frequency.value = 900; o2.frequency.value = 905; lfo.frequency.value = 0.35; lg.gain.value = 380;
      lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; g.gain.value = 0;
      o.connect(lp); o2.connect(lp); lp.connect(g).connect(p).connect(this.s.fx); o.start(); o2.start(); lfo.start();
      this.Sn = { g, p };
    }
    this.Sn.g.gain.setTargetAtTime(level * 0.035, c.currentTime, 0.1);
    if (this.Sn.p.pan) this.Sn.p.pan.setTargetAtTime(pan, c.currentTime, 0.1);
  }

  // The chainsaw (yours, or the nearest one going), level 0..1.
  chainsaw(level, bite = 0) {
    const c = this.ctx; if (!c) return;
    if (!this.Cs) {
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), chop = c.createGain(), g = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 110; lfo.type = 'square'; lfo.frequency.value = 38; lg.gain.value = 0.4; chop.gain.value = 0.6;
      lp.type = 'lowpass'; lp.frequency.value = 2200; g.gain.value = 0;
      lfo.connect(lg).connect(chop.gain); o.connect(lp).connect(chop).connect(g).connect(this.s.fx); o.start(); lfo.start();
      this.Cs = { o, g, lfo };
    }
    const t = c.currentTime;
    this.Cs.g.gain.setTargetAtTime(level * (0.05 + bite * 0.05), t, 0.05);
    this.Cs.o.frequency.setTargetAtTime(110 + bite * 50 + level * 40, t, 0.05); this.Cs.lfo.frequency.setTargetAtTime(34 + bite * 20, t, 0.05);
  }

  // Everything off (menus, pause).
  hush() { this.drive(null); this.rival(0, 0, 0); this.siren(0, 0); this.chainsaw(0); }
}
