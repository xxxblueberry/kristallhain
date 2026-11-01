// Räumliches Raster (Spatial Hash) – jeder Tick neu aufgebaut, verkettete Listen in Int32Arrays.
export class Grid {
  readonly n: number;
  private readonly origin: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;

  constructor(size: number, private readonly cell: number, cap: number) {
    this.n = Math.ceil(size / cell);
    this.origin = size / 2;
    this.head = new Int32Array(this.n * this.n).fill(-1);
    this.next = new Int32Array(cap);
  }

  clear() {
    this.head.fill(-1);
  }

  private ci(v: number): number {
    const c = Math.floor((v + this.origin) / this.cell);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  insert(i: number, x: number, z: number) {
    const k = this.ci(z) * this.n + this.ci(x);
    this.next[i] = this.head[k];
    this.head[k] = i;
  }

  // schreibt Kandidaten in out, gibt Anzahl zurück (Abstand prüft der Aufrufer)
  query(x: number, z: number, r: number, out: Int32Array): number {
    const x0 = this.ci(x - r), x1 = this.ci(x + r);
    const z0 = this.ci(z - r), z1 = this.ci(z + r);
    let k = 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.head[cz * this.n + cx];
        while (i >= 0) {
          if (k < out.length) out[k++] = i;
          i = this.next[i];
        }
      }
    }
    return k;
  }
}
