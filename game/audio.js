// audio.js — procedural WebAudio sound effects. Every sound is synthesised
// from oscillators and filtered noise at runtime: no audio files, no network.

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

  _noiseBuffer(duration) {
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _burst({ freq = 1800, dur = 0.12, type = "lowpass", gain = 0.9, slideTo = null }) {
    if (!this.ensure() || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.05);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

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
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind) {
    if (kind === "longbow") this._burst({ freq: 900, dur: 0.22, gain: 1.0, slideTo: 220 });
    else if (kind === "hornet") this._burst({ freq: 2400, dur: 0.07, gain: 0.7, slideTo: 700 });
    else if (kind === "pistol") this._burst({ freq: 1600, dur: 0.09, gain: 0.8, slideTo: 400 });
    else this._burst({ freq: 1500, dur: 0.11, gain: 0.9, slideTo: 300 });
  }

  distantShot() {
    this._burst({ freq: 700, dur: 0.14, gain: 0.25, slideTo: 180 });
  }

  hit() { this._tone({ freq: 1250, dur: 0.05, type: "square", gain: 0.18 }); }
  kill() {
    this._tone({ freq: 880, dur: 0.07, type: "square", gain: 0.2 });
    this._tone({ freq: 1320, dur: 0.1, type: "square", gain: 0.2, delay: 0.07 });
  }
  hurt() { this._tone({ freq: 160, dur: 0.18, type: "sawtooth", gain: 0.3, slideTo: 90 }); }
  reload() {
    this._tone({ freq: 500, dur: 0.05, type: "square", gain: 0.15 });
    this._tone({ freq: 340, dur: 0.05, type: "square", gain: 0.15, delay: 0.35 });
    this._tone({ freq: 620, dur: 0.06, type: "square", gain: 0.18, delay: 0.8 });
  }
  dryFire() { this._tone({ freq: 900, dur: 0.03, type: "square", gain: 0.12 }); }
  roundWin() {
    this._tone({ freq: 523, dur: 0.14, gain: 0.25 });
    this._tone({ freq: 659, dur: 0.14, gain: 0.25, delay: 0.13 });
    this._tone({ freq: 784, dur: 0.24, gain: 0.28, delay: 0.26 });
  }
  roundLose() {
    this._tone({ freq: 392, dur: 0.16, gain: 0.25 });
    this._tone({ freq: 311, dur: 0.16, gain: 0.25, delay: 0.15 });
    this._tone({ freq: 233, dur: 0.3, gain: 0.28, delay: 0.3 });
  }
  buy() { this._tone({ freq: 980, dur: 0.06, type: "triangle", gain: 0.25 }); }
  denied() { this._tone({ freq: 220, dur: 0.12, type: "square", gain: 0.2, slideTo: 160 }); }
}
