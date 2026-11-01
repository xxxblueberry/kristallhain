import { Rng } from './rng';

export const WORLD = 360; // spielbare Kantenlänge
export const HALF = WORLD / 2;
export const STEP_H = 1.8; // Höhe einer Terrassenstufe (Sprung schafft ~2,2)

// Höhengitter: Spiel UND Grafik nutzen exakt dieselben Dreiecke,
// sonst steht man optisch im Hang oder schwebt darüber.
export const GRID_SIZE = WORLD + 140;
export const GRID_SEGS = 200;
const CELL = GRID_SIZE / GRID_SEGS;
const GH = GRID_SIZE / 2;
const N = GRID_SEGS + 1;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Höhenfeld: sanfte Hügel (Rampen), Terrassen (springbar) und große Abbrüche
// (zu hoch zum Springen – dort fällt man runter und muss über Hänge wieder hoch).
export class Terrain {
  private perm = new Uint8Array(512);
  private centerH = 0;
  private grid = new Float32Array(N * N);

  constructor(seed: number) {
    const r = new Rng(seed * 7 + 3);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.centerH = this.raw(0, 0);
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) this.grid[iz * N + ix] = this.analytic(-GH + ix * CELL, -GH + iz * CELL);
    }
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

  // Biom-Wert 0..1: < 0,38 Totholz, > 0,62 Kristallfeld, dazwischen Hain
  biome(x: number, z: number): number {
    return this.noise(x * 0.006 + 500, z * 0.006 + 500);
  }

  private raw(x: number, z: number): number {
    const n =
      0.5 * this.noise(x * 0.016, z * 0.016) +
      0.3 * this.noise(x * 0.032 + 17, z * 0.032 + 9) +
      0.2 * this.noise(x * 0.064 + 31, z * 0.064 + 77);
    const big = this.noise(x * 0.005 + 100, z * 0.005 + 100);
    const lv = Math.max(0, n - 0.22) * 11 + Math.max(0, big - 0.42) * 15;
    const fl = Math.floor(lv);
    const terr = fl + smooth(0.88, 1, lv - fl);
    // große Abbrüche: in manchen Regionen springt das Gelände gleich 3 Stufen
    const l3 = lv / 3, f3 = Math.floor(l3);
    const cliff = (f3 + smooth(0.97, 1, l3 - f3)) * 3;
    const mask = smooth(0.4, 0.6, this.noise(x * 0.01 + 40, z * 0.01 + 40));
    const bigMask = smooth(0.52, 0.58, this.noise(x * 0.007 + 200, z * 0.007 + 300));
    const base = lv * (1 - mask) + terr * mask;
    return (base * (1 - bigMask) + cliff * bigMask) * STEP_H;
  }

  private analytic(x: number, z: number): number {
    let h = this.raw(x, z);
    // flache Startlichtung in der Mitte
    const c = smooth(10, 24, Math.sqrt(x * x + z * z));
    h = h * c + this.centerH * (1 - c);
    // Bergwall am Kartenrand
    const e = Math.max(Math.abs(x), Math.abs(z));
    h += smooth(HALF - 12, HALF + 40, e) * 30;
    return h;
  }

  // Höhe auf den Gitter-Dreiecken (gleiche Aufteilung wie THREE.PlaneGeometry)
  height(x: number, z: number): number {
    let u = (x + GH) / CELL, v = (z + GH) / CELL;
    u = u < 0 ? 0 : u > GRID_SEGS - 1e-4 ? GRID_SEGS - 1e-4 : u;
    v = v < 0 ? 0 : v > GRID_SEGS - 1e-4 ? GRID_SEGS - 1e-4 : v;
    const ix = Math.floor(u), iz = Math.floor(v), fu = u - ix, fv = v - iz;
    const g = this.grid, o = iz * N + ix;
    const a = g[o], b = g[o + N], c = g[o + N + 1], d = g[o + 1];
    if (fu + fv <= 1) return a + (d - a) * fu + (b - a) * fv;
    return c + (b - c) * (1 - fu) + (d - c) * (1 - fv);
  }
}
