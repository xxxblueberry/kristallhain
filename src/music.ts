// Adaptive Musik, komplett synthetisch (keine Dateien). Ebenen blenden je nach Spielintensität ein:
// Pad (immer) → Arpeggio → Bass → Kick → Hi-Hats → Snare. Bei Bossen wechselt die Harmonie nach Moll.
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Fmaj7 – Dm7 – Bbmaj7 – C7  /  Boss: Dm – Bb – C – A
const CALM = [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 58]];
const BOSS = [[50, 53, 57, 62], [46, 50, 53, 58], [48, 52, 55, 60], [45, 49, 52, 57]];
// Arpeggio-Muster (Index in den Akkord, -1 = Pause), 16 Sechzehntel
const ARP = [0, -1, 2, -1, 1, -1, 3, -1, 2, -1, 0, -1, 3, -1, 1, 2];

export interface MusicState { intensity: number; boss: boolean; muffled: boolean }

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private lp!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private next = 0;
  private step = 0;
  private bar = 0;
  private cur = 0; // geglättete Intensität
  private state: MusicState = { intensity: 0.15, boss: false, muffled: false };
  private volume = 0.6;

  start(ctx: AudioContext) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 18000;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume * 0.55;
    this.lp.connect(this.out).connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.next = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.out.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.1);
  }

  set(s: MusicState) {
    const changed = s.muffled !== this.state.muffled;
    this.state = s;
    if (!this.ctx || !changed) return;
    // Pause/Menüs: dumpf, wie durch eine Wand
    this.lp.frequency.setTargetAtTime(s.muffled ? 700 : 18000, this.ctx.currentTime, 0.15);
  }

  stop() {
    window.clearInterval(this.timer);
  }

  private schedule() {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') return;
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05; // nach Hänger nicht nachholen
    while (this.next < ctx.currentTime + 0.15) {
      this.cur += (this.state.intensity - this.cur) * 0.02;
      const bpm = 92 + 20 * this.cur + (this.state.boss ? 12 : 0);
      const s16 = 60 / bpm / 4;
      this.playStep(this.next, s16);
      this.next += s16;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private playStep(t: number, s16: number) {
    const prog = this.state.boss ? BOSS : CALM;
    const chord = prog[this.bar % 4];
    const c = this.cur, st = this.step;
    const lArp = smooth(0.15, 0.35, c), lBass = smooth(0.35, 0.5, c), lKick = smooth(0.5, 0.62, c);
    const lHat = smooth(0.6, 0.72, c), lSnare = this.state.boss ? 1 : smooth(0.78, 0.9, c);

    if (st === 0) for (const n of chord) this.pad(t, mtof(n), s16 * 16, 0.045);
    if (lArp > 0.01 && ARP[st] >= 0) {
      const n = chord[ARP[st]] + 12 + (st >= 8 && this.bar % 2 ? 12 : 0);
      this.pluck(t, mtof(n), 0.06 * lArp);
    }
    if (lBass > 0.01 && (st === 0 || st === 6 || st === 8 || st === 14)) this.bass(t, mtof(chord[0] - 12), s16 * 3, 0.16 * lBass);
    if (lKick > 0.01 && (st === 0 || st === 8 || (this.state.boss && (st === 4 || st === 12)))) this.kick(t, 0.45 * lKick);
    if (lHat > 0.01 && st % 2 === 1) this.hat(t, (st % 4 === 3 ? 0.05 : 0.03) * lHat);
    if (lSnare > 0.01 && (st === 4 || st === 12)) this.snare(t, 0.14 * lSnare);
  }

  private env(t: number, a: number, peak: number, d: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(this.lp);
    return g;
  }

  private pad(t: number, f: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 700 + this.cur * 1300;
    const g = this.env(t, 0.6, vol, dur);
    filt.connect(g);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(filt);
      o.start(t);
      o.stop(t + dur + 0.7);
    }
  }

  private pluck(t: number, f: number, vol: number) {
    const o = this.ctx!.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(this.env(t, 0.005, vol, 0.28));
    o.start(t);
    o.stop(t + 0.32);
  }

  private bass(t: number, f: number, dur: number, vol: number) {
    const o = this.ctx!.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(this.env(t, 0.01, vol, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number, vol: number) {
    const o = this.ctx!.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    o.connect(this.env(t, 0.003, vol, 0.2));
    o.start(t);
    o.stop(t + 0.25);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, vol: number, dur: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    s.connect(f).connect(this.env(t, 0.002, vol, dur));
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private hat(t: number, vol: number) { this.noiseHit(t, 'highpass', 7500, vol, 0.035); }
  private snare(t: number, vol: number) {
    this.noiseHit(t, 'bandpass', 1900, vol, 0.13);
    const o = this.ctx!.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    o.connect(this.env(t, 0.002, vol * 0.5, 0.08));
    o.start(t);
    o.stop(t + 0.12);
  }
}
