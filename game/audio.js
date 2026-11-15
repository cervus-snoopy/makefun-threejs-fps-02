// audio.js — every sound is made, not played back: oscillators and filtered
// noise, synthesised in WebAudio at runtime. No audio files, no network,
// nothing to download while you play.

// Every burst is a recipe: the gunshot's filter shape, in data instead of
// branches. The "default" recipe is the fallback for an unknown kind.
const BURST_RECIPES = {
  longbow: { freq: 900, dur: 0.22, gain: 1.0, slideTo: 220 },
  hornet: { freq: 2400, dur: 0.07, gain: 0.7, slideTo: 700 },
  pistol: { freq: 1600, dur: 0.09, gain: 0.8, slideTo: 400 },
  default: { freq: 1500, dur: 0.11, gain: 0.9, slideTo: 300 },
  distant: { freq: 700, dur: 0.14, gain: 0.25, slideTo: 180 },
};

// Every chime is a note list: frequency, length, wave, loudness, delay.
const MELODIES = {
  kill: [
    { freq: 880, dur: 0.07, type: "square", gain: 0.2 },
    { freq: 1320, dur: 0.1, type: "square", gain: 0.2, delay: 0.07 },
  ],
  reload: [
    { freq: 500, dur: 0.05, type: "square", gain: 0.15 },
    { freq: 340, dur: 0.05, type: "square", gain: 0.15, delay: 0.35 },
    { freq: 620, dur: 0.06, type: "square", gain: 0.18, delay: 0.8 },
  ],
  roundWin: [
    { freq: 523, dur: 0.14, gain: 0.25 },
    { freq: 659, dur: 0.14, gain: 0.25, delay: 0.13 },
    { freq: 784, dur: 0.24, gain: 0.28, delay: 0.26 },
  ],
  roundLose: [
    { freq: 392, dur: 0.16, gain: 0.25 },
    { freq: 311, dur: 0.16, gain: 0.25, delay: 0.15 },
    { freq: 233, dur: 0.3, gain: 0.28, delay: 0.3 },
  ],
};

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return true;
  }

  // A buffer of white noise, the raw material for every gunshot and thud.
  _noise(duration) {
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // One filtered noise burst: the shape of a gunshot, a distant crack, a hit.
  _burst({ freq = 1800, dur = 0.12, type = "lowpass", gain = 0.9, slideTo = null }) {
    if (!this.ensure() || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise(dur + 0.05);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // One oscillator note: the shape of a beep, a chime, a hurt groan.
  _tone({ freq = 440, dur = 0.1, type = "sine", gain = 0.3, slideTo = null, delay = 0 }) {
    if (!this.ensure() || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Play a named melody from the table: one _tone call per note.
  _melody(name) {
    for (const note of MELODIES[name]) this._tone(note);
  }

  shot(kind) {
    this._burst(BURST_RECIPES[kind] ?? BURST_RECIPES.default);
  }

  distantShot() {
    this._burst(BURST_RECIPES.distant);
  }

  hit() {
    this._tone({ freq: 1250, dur: 0.05, type: "square", gain: 0.18 });
  }

  kill() {
    this._melody("kill");
  }

  hurt() {
    this._tone({ freq: 160, dur: 0.18, type: "sawtooth", gain: 0.3, slideTo: 90 });
  }

  reload() {
    this._melody("reload");
  }

  dryFire() {
    this._tone({ freq: 900, dur: 0.03, type: "square", gain: 0.12 });
  }

  roundWin() {
    this._melody("roundWin");
  }

  roundLose() {
    this._melody("roundLose");
  }

  buy() {
    this._tone({ freq: 980, dur: 0.06, type: "triangle", gain: 0.25 });
  }

  denied() {
    this._tone({ freq: 220, dur: 0.12, type: "square", gain: 0.2, slideTo: 160 });
  }
}

// r2 polish: audio re-authored (same sounds, same API; _noiseBuffer is now _noise).
