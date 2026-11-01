import { Rng } from './rng';

export const WORLD = 360; // spielbare Kantenlänge
export const HALF = WORLD / 2;
export const STEP_H = 1.8; // Höhe einer Terrassenstufe (Sprung schafft ~2,2)

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Höhenfeld: Mischung aus sanften Hügeln (Rampen) und harten Terrassen.
// Eine Maske entscheidet, wo Stufen entstehen; die Übergänge sind begehbare Rampen.
export class Terrain {
  private perm = new Uint8Array(512);
  private centerH = 0;

  constructor(seed: number) {
    const r = new Rng(seed * 7 + 3);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.centerH = this.raw(0, 0);
  }

  private hash(ix: number, iz: number): number {
    return this.perm[this.perm[ix & 255] + (iz & 255)] / 255;
  }

  noise(x: number, z: number): number {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = this.hash(ix, iz), b = this.hash(ix + 1, iz);
    const c = this.hash(ix, iz + 1), d = this.hash(ix + 1, iz + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  private raw(x: number, z: number): number {
    const n =
      0.5 * this.noise(x * 0.016, z * 0.016) +
      0.3 * this.noise(x * 0.032 + 17, z * 0.032 + 9) +
      0.2 * this.noise(x * 0.064 + 31, z * 0.064 + 77);
    // große, langsame Welle hebt ganze Regionen zu Hochebenen an
    const big = this.noise(x * 0.005 + 100, z * 0.005 + 100);
    const lv = Math.max(0, n - 0.22) * 11 + Math.max(0, big - 0.42) * 15;
    const fl = Math.floor(lv);
    const terr = fl + smooth(0.88, 1, lv - fl);
    const mask = smooth(0.4, 0.6, this.noise(x * 0.01 + 40, z * 0.01 + 40));
    return (lv * (1 - mask) + terr * mask) * STEP_H;
  }

  height(x: number, z: number): number {
    let h = this.raw(x, z);
    // flache Startlichtung in der Mitte
    const c = smooth(10, 24, Math.sqrt(x * x + z * z));
    h = h * c + this.centerH * (1 - c);
    // Bergwall am Kartenrand
    const e = Math.max(Math.abs(x), Math.abs(z));
    h += smooth(HALF - 12, HALF + 40, e) * 30;
    return h;
  }
}
