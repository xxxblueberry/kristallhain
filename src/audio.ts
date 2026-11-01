// Platzhalter-Sounds, rein synthetisch über Web Audio (keine Dateien).
import { EV_HIT, EV_KILL, EV_XP, EV_HURT, EV_LEVEL, EV_BOOM, EV_SHOOT, EV_JUMP, EV_LAND, EV_CHAIN, EV_NOVA, EV_GOLD, EV_CHEST, EV_HEAL, EV_SHIELD, EV_REVIVE, EV_SLASH, EV_MAGNET, EV_BLINK, EV_BUFF, EV_POWER, EV_FLAME, EV_BLOODSLASH, EV_ALTAR, EV_STRIDE, type Sim } from './core/sim';
import { W_DEMON, W_METEOR, W_PISTOL } from './core/data';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private xpCombo = 0;
  private xpComboT = 0;
  volume = 0.7;

  // iOS: AudioContext erst nach Nutzereingabe
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get context(): AudioContext | null { return this.ctx; }

  // Herzschlag bei wenig HP
  heartbeat() {
    if (!this.ctx || !this.ok('beat', 0.5)) return;
    this.tone('sine', 70, 45, 0.12, 0.22);
    this.tone('sine', 65, 42, 0.12, 0.16, 0.16);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private ok(key: string, gap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime, l = this.last.get(key) ?? -1;
    if (now - l < gap) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass') {
    const c = this.ctx!, t = c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t);
    s.stop(t + dur);
  }

  ui() { if (this.ok('ui', 0.04)) this.tone('sine', 660, 880, 0.06, 0.12); }
  deny() { if (this.ok('deny', 0.1)) this.tone('square', 180, 120, 0.12, 0.06); }

  handleEvents(sim: Sim, dt: number) {
    if (!this.ctx) return;
    this.xpComboT -= dt;
    if (this.xpComboT <= 0) this.xpCombo = 0;
    const v = sim.ev;
    for (let k = 0; k < sim.evN; k++) {
      const o = k * EV_STRIDE;
      switch (v[o]) {
        case EV_HIT: if (this.ok('hit', 0.035)) this.tone('square', 380 + Math.random() * 160, 220, 0.045, v[o + 5] ? 0.07 : 0.04); break;
        case EV_KILL: if (this.ok('kill', 0.03)) this.tone('triangle', 520 + Math.random() * 120, 160, 0.09, 0.09); break;
        case EV_XP:
          if (this.ok('xp', 0.03)) {
            this.tone('sine', 700 + Math.min(20, this.xpCombo) * 35, 900 + Math.min(20, this.xpCombo) * 35, 0.06, 0.06);
            this.xpCombo++; this.xpComboT = 0.5;
          }
          break;
        case EV_GOLD: if (this.ok('gold', 0.05)) { this.tone('sine', 1200, 1200, 0.05, 0.06); this.tone('sine', 1600, 1600, 0.08, 0.05, 0.05); } break;
        case EV_HURT: this.tone('sawtooth', 220, 70, 0.22, 0.14); this.burst(0.15, 0.12, 900); break;
        case EV_LEVEL: [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.11, i * 0.07)); break;
        case EV_BOOM: if (this.ok('boom', 0.06)) { this.burst(0.35, 0.18, 500); this.tone('sine', 120, 40, 0.3, 0.16); } break;
        case EV_SHOOT:
          if (v[o + 1] === W_METEOR) { if (this.ok('met', 0.1)) this.burst(0.5, 0.05, 1500, 'bandpass'); }
          else if (v[o + 1] === W_DEMON) { if (this.ok('demon', 0.2)) { this.tone('sawtooth', 110, 220, 0.35, 0.06); this.tone('sine', 330, 160, 0.4, 0.05); } }
          else if (v[o + 1] === W_PISTOL) { if (this.ok('pistol', 0.05)) { this.tone('square', 900, 200, 0.06, 0.05); this.burst(0.06, 0.07, 2500, 'bandpass'); } }
          else if (this.ok('shoot', 0.09)) this.burst(0.07, 0.05, 3000, 'highpass');
          break;
        case EV_JUMP: this.tone('sine', 320, 640, 0.12, 0.08); break;
        case EV_LAND: this.burst(0.08, 0.08, 400); break;
        case EV_CHAIN: if (this.ok('chain', 0.08)) { this.tone('square', 1800, 600, 0.08, 0.04); this.burst(0.1, 0.05, 4000, 'highpass'); } break;
        case EV_NOVA: this.tone('sine', 900, 300, 0.3, 0.08); this.burst(0.3, 0.06, 6000, 'highpass'); break;
        case EV_CHEST: [784, 988, 1175, 1568].forEach((f, i) => this.tone('sine', f, f, 0.18, 0.09, i * 0.06)); break;
        case EV_SLASH: if (this.ok('slash', 0.06)) { this.burst(0.12, 0.09, 5000, 'highpass'); this.tone('sine', 1600, 500, 0.1, 0.04); } break;
        case EV_MAGNET: [660, 880, 1320].forEach((f, i) => this.tone('sine', f, f * 1.5, 0.3, 0.08, i * 0.05)); break;
        case EV_BLINK: if (this.ok('blink', 0.2)) { this.tone('triangle', 300, 1400, 0.25, 0.08); this.burst(0.2, 0.05, 3000, 'bandpass'); } break;
        case EV_FLAME: if (this.ok('flame', 0.12)) this.burst(0.18, 0.05, 900, 'lowpass'); break;
        case EV_BLOODSLASH: this.burst(0.3, 0.14, 700, 'lowpass'); this.tone('sawtooth', 160, 60, 0.25, 0.1); break;
        case EV_ALTAR: [196, 185, 147, 110].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.35, 0.08, i * 0.12)); this.burst(0.6, 0.1, 400); break;
        case EV_BUFF: [440, 660, 880].forEach((f, i) => this.tone('sawtooth', f, f * 1.02, 0.18, 0.05, i * 0.04)); this.burst(0.25, 0.06, 4000, 'highpass'); break;
        case EV_POWER: [262, 392, 523, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.1, i * 0.08)); break;
        case EV_HEAL: if (this.ok('heal', 0.1)) { this.tone('sine', 520, 780, 0.15, 0.08); this.tone('sine', 780, 1040, 0.15, 0.06, 0.08); } break;
        case EV_SHIELD: this.tone('sine', 1400, 700, 0.25, 0.1); this.burst(0.2, 0.06, 5000, 'highpass'); break;
        case EV_REVIVE: [392, 523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.12, i * 0.09)); break;
      }
    }
  }
}
