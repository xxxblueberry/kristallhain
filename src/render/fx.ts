// Effekte: Warnflächen, Partikel, Schadenszahlen, Ringe, Blitze – alles gepoolt und instanziert.
import * as THREE from 'three';
import type { Sim } from '../core/sim';
import { MAX_TELE } from '../core/data';
import { T_CIRCLE } from '../core/sim';

export function setM(a: Float32Array, o: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = s * sz; a[o + 9] = 0; a[o + 10] = c * sz; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

// ---------------- Warnflächen ----------------
// Dezent: dünner Rand, kaum Grundfläche, eine sanfte Füllwelle zeigt den Zeitpunkt
const teleVert = /* glsl */ `
  attribute float aProg; attribute float aAlpha;
  varying vec2 vUv; varying float vP; varying float vA;
  void main() {
    vUv = uv; vP = aProg; vA = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }`;
const circleFrag = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv; varying float vP; varying float vA;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float edge = smoothstep(0.92, 0.96, d) * (1.0 - smoothstep(0.985, 1.0, d));
    float inside = step(d, vP);
    float front = smoothstep(vP - 0.12, vP, d) * inside;
    float a = edge * 0.5 + 0.035 + inside * 0.08 + front * 0.16;
    gl_FragColor = vec4(uColor, a * vA);
  }`;
const lineFrag = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv; varying float vP; varying float vA;
  void main() {
    float ex = abs(vUv.x - 0.5) * 2.0;
    float edge = smoothstep(0.86, 0.94, ex);
    float inside = step(vUv.y, vP);
    float front = smoothstep(vP - 0.1, vP, vUv.y) * inside;
    float a = edge * 0.45 + 0.035 + inside * 0.07 + front * 0.15;
    gl_FragColor = vec4(uColor, a * vA);
  }`;

class Telegraphs {
  circles: THREE.InstancedMesh;
  lines: THREE.InstancedMesh;
  private uni = { uColor: { value: new THREE.Color(0xff5577) } };
  private cProg: THREE.InstancedBufferAttribute;
  private lProg: THREE.InstancedBufferAttribute;
  private cAlpha: THREE.InstancedBufferAttribute;
  private lAlpha: THREE.InstancedBufferAttribute;

  constructor(scene: THREE.Scene) {
    const mk = (geo: THREE.BufferGeometry, frag: string) => {
      const prog = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TELE), 1);
      prog.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aProg', prog);
      const alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TELE), 1);
      alpha.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAlpha', alpha);
      const mat = new THREE.ShaderMaterial({
        uniforms: this.uni, vertexShader: teleVert, fragmentShader: frag,
        transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      });
      const m = new THREE.InstancedMesh(geo, mat, MAX_TELE);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.renderOrder = 5;
      m.count = 0;
      scene.add(m);
      return { m, prog, alpha };
    };
    const cg = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const lg = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const c = mk(cg, circleFrag), l = mk(lg, lineFrag);
    this.circles = c.m; this.cProg = c.prog; this.cAlpha = c.alpha;
    this.lines = l.m; this.lProg = l.prog; this.lAlpha = l.alpha;
  }

  update(sim: Sim) {
    const ca = this.circles.instanceMatrix.array as Float32Array, la = this.lines.instanceMatrix.array as Float32Array;
    const cp = this.cProg.array as Float32Array, lp = this.lProg.array as Float32Array;
    const cA = this.cAlpha.array as Float32Array, lA = this.lAlpha.array as Float32Array;
    let nc = 0, nl = 0;
    for (let i = 0; i < MAX_TELE; i++) {
      if (!sim.tAlive[i]) continue;
      const p = Math.min(1, sim.ttime[i] / sim.tdur[i]);
      // sanft einblenden; reine Hinweise (Wolf-Sprung) nur angedeutet
      const a = Math.min(1, sim.ttime[i] / 0.15) * (sim.tdmg[i] > 0 ? 1 : 0.22);
      const y = sim.terrain.height(sim.tx[i], sim.tz[i]) + 0.12;
      if (sim.tKind[i] === T_CIRCLE) {
        const r = sim.tr[i];
        setM(ca, nc * 16, sim.tx[i], y, sim.tz[i], 0, r, 1, r);
        cA[nc] = a; cp[nc++] = p;
      } else {
        setM(la, nl * 16, sim.tx[i], y, sim.tz[i], sim.tang[i], sim.tr[i], 1, sim.tlen[i]);
        lA[nl] = a; lp[nl++] = p;
      }
    }
    this.circles.count = nc; this.lines.count = nl;
    this.circles.instanceMatrix.needsUpdate = true; this.lines.instanceMatrix.needsUpdate = true;
    this.cProg.needsUpdate = true; this.lProg.needsUpdate = true;
    this.cAlpha.needsUpdate = true; this.lAlpha.needsUpdate = true;
  }
}

// ---------------- Partikel ----------------
class Particles {
  mesh: THREE.InstancedMesh;
  private n = 0;
  private x: Float32Array; private y: Float32Array; private z: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private life: Float32Array; private max: Float32Array; private size: Float32Array; private rot: Float32Array;
  private col: Float32Array;

  constructor(scene: THREE.Scene, private cap: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1), new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.max = f(); this.size = f(); this.rot = f();
    this.col = new Float32Array(cap * 3);
  }

  spawn(x: number, y: number, z: number, count: number, color: THREE.Color, speed: number, size: number, life: number, up = 4) {
    for (let k = 0; k < count; k++) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.x[i] = x; this.y[i] = y; this.z[i] = z;
      this.vx[i] = Math.sin(a) * s; this.vz[i] = Math.cos(a) * s; this.vy[i] = up * (0.5 + Math.random());
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.rot[i] = Math.random() * 6;
      const v = 0.85 + Math.random() * 0.3;
      this.col[i * 3] = color.r * v; this.col[i * 3 + 1] = color.g * v; this.col[i * 3 + 2] = color.b * v;
    }
  }

  update(dt: number) {
    const a = this.mesh.instanceMatrix.array as Float32Array;
    const ca = this.mesh.instanceColor!.array as Float32Array;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // mit letztem tauschen (keine Löcher)
        const l = --this.n;
        this.x[i] = this.x[l]; this.y[i] = this.y[l]; this.z[i] = this.z[l];
        this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
        this.life[i] = this.life[l]; this.max[i] = this.max[l]; this.size[i] = this.size[l]; this.rot[i] = this.rot[l];
        this.col[i * 3] = this.col[l * 3]; this.col[i * 3 + 1] = this.col[l * 3 + 1]; this.col[i * 3 + 2] = this.col[l * 3 + 2];
        continue;
      }
      this.vy[i] -= 16 * dt;
      const drag = 1 - dt * 2;
      this.vx[i] *= drag; this.vz[i] *= drag;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      this.rot[i] += dt * 8;
      const s = this.size[i] * Math.min(1, (this.life[i] / this.max[i]) * 1.6);
      setM(a, i * 16, this.x[i], this.y[i], this.z[i], this.rot[i], s, s, s);
      ca[i * 3] = this.col[i * 3]; ca[i * 3 + 1] = this.col[i * 3 + 1]; ca[i * 3 + 2] = this.col[i * 3 + 2];
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

// ---------------- Schadenszahlen (Ziffern-Atlas, Billboards im Shader) ----------------
const MAX_NUM = 320, MAX_DIG = 1600;
const numVert = /* glsl */ `
  attribute vec3 iPos; attribute vec4 iData; attribute vec3 iColor;
  varying vec2 vUv; varying float vA; varying vec3 vC;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    mv.xy += (position.xy + vec2(iData.w, 0.0)) * iData.y;
    gl_Position = projectionMatrix * mv;
    vUv = vec2((iData.x + uv.x) / 10.0, uv.y);
    vA = iData.z; vC = iColor;
  }`;
const numFrag = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv; varying float vA; varying vec3 vC;
  void main() {
    vec4 t = texture2D(map, vUv);
    if (t.a < 0.05) discard;
    gl_FragColor = vec4(mix(vec3(0.22, 0.13, 0.3), vC, t.r), t.a * vA);
  }`;

class DamageNumbers {
  private geo: THREE.InstancedBufferGeometry;
  private iPos: THREE.InstancedBufferAttribute;
  private iData: THREE.InstancedBufferAttribute;
  private iColor: THREE.InstancedBufferAttribute;
  private x = new Float32Array(MAX_NUM); private y = new Float32Array(MAX_NUM); private z = new Float32Array(MAX_NUM);
  private val = new Int32Array(MAX_NUM); private life = new Float32Array(MAX_NUM); private kind = new Uint8Array(MAX_NUM);
  private head = 0;
  private colors = [new THREE.Color(0xffffff), new THREE.Color(0xffd23f), new THREE.Color(0xff5c7a), new THREE.Color(0x8ff0d8)];

  constructor(scene: THREE.Scene) {
    const cv = document.createElement('canvas');
    cv.width = 640; cv.height = 64;
    const ctx = cv.getContext('2d')!;
    ctx.font = '900 54px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 11; ctx.strokeStyle = '#000';
    for (let d = 0; d < 10; d++) {
      ctx.strokeText(String(d), d * 64 + 32, 35);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(d), d * 64 + 32, 35);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = plane.index;
    this.geo.setAttribute('position', plane.attributes.position);
    this.geo.setAttribute('uv', plane.attributes.uv);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DIG * 3), 3);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DIG * 4), 4);
    this.iColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DIG * 3), 3);
    for (const a of [this.iPos, this.iData, this.iColor]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.iPos);
    this.geo.setAttribute('iData', this.iData);
    this.geo.setAttribute('iColor', this.iColor);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } }, vertexShader: numVert, fragmentShader: numFrag,
      transparent: true, depthTest: false, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    scene.add(mesh);
  }

  // kind: 0 normal, 1 Krit, 2 Spieler-Schaden, 3 Heilung
  spawn(x: number, y: number, z: number, v: number, kind: number) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_NUM;
    this.x[i] = x + (Math.random() - 0.5) * 0.6; this.y[i] = y; this.z[i] = z + (Math.random() - 0.5) * 0.6;
    this.val[i] = Math.max(0, Math.round(v)); this.life[i] = kind === 1 ? 0.95 : 0.75; this.kind[i] = kind;
  }

  update(dt: number) {
    const P = this.iPos.array as Float32Array, D = this.iData.array as Float32Array, C = this.iColor.array as Float32Array;
    let n = 0;
    for (let i = 0; i < MAX_NUM; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.y[i] += dt * 1.8;
      const l = this.life[i];
      if (l <= 0) continue;
      const s = this.val[i].toString();
      const crit = this.kind[i] === 1;
      const age = (crit ? 0.95 : 0.75) - l;
      const pop = age < 0.1 ? 0.6 + age * 6 : 1 + Math.max(0, 0.15 - (age - 0.1)) ;
      const scale = (crit ? 1.15 : this.kind[i] === 2 ? 1.0 : 0.72) * pop;
      const alpha = Math.min(1, l / 0.25);
      const col = this.colors[this.kind[i]];
      for (let d = 0; d < s.length && n < MAX_DIG; d++, n++) {
        P[n * 3] = this.x[i]; P[n * 3 + 1] = this.y[i]; P[n * 3 + 2] = this.z[i];
        D[n * 4] = s.charCodeAt(d) - 48; D[n * 4 + 1] = scale; D[n * 4 + 2] = alpha; D[n * 4 + 3] = (d - (s.length - 1) / 2) * 0.62;
        C[n * 3] = col.r; C[n * 3 + 1] = col.g; C[n * 3 + 2] = col.b;
      }
    }
    this.geo.instanceCount = n;
    this.iPos.needsUpdate = true; this.iData.needsUpdate = true; this.iColor.needsUpdate = true;
  }
}

// ---------------- Ringe (Nova, Einschläge, Level-up) ----------------
class Rings {
  private pool: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; r0: number; r1: number }[] = [];
  constructor(scene: THREE.Scene) {
    const geo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.pool.push({ m, mat, t: 0, dur: 0, r0: 0, r1: 0 });
    }
  }
  spawn(x: number, y: number, z: number, r0: number, r1: number, color: number, dur: number) {
    const p = this.pool.find((q) => !q.m.visible) ?? this.pool[0];
    p.m.position.set(x, y + 0.2, z);
    p.mat.color.set(color);
    p.t = 0; p.dur = dur; p.r0 = r0; p.r1 = r1;
    p.m.visible = true;
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) { p.m.visible = false; continue; }
      const e = 1 - (1 - k) * (1 - k);
      const r = p.r0 + (p.r1 - p.r0) * e;
      p.m.scale.set(r, 1, r);
      p.mat.opacity = 0.85 * (1 - k);
    }
  }
}

// ---------------- Blitze ----------------
class Bolts {
  private mesh: THREE.InstancedMesh;
  private segs: { a: THREE.Vector3; b: THREE.Vector3; life: number }[] = [];
  private dummy = new THREE.Object3D();
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xd8f6ff }), 256);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  spawn(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    // zackig in 4 Stücke
    let px = x1, py = y1, pz = z1;
    for (let k = 1; k <= 4; k++) {
      const t = k / 4, j = k < 4 ? 0.6 : 0;
      const nx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * j, ny = y1 + (y2 - y1) * t + (Math.random() - 0.5) * j, nz = z1 + (z2 - z1) * t + (Math.random() - 0.5) * j;
      if (this.segs.length < 256) this.segs.push({ a: new THREE.Vector3(px, py, pz), b: new THREE.Vector3(nx, ny, nz), life: 0.16 });
      px = nx; py = ny; pz = nz;
    }
  }
  update(dt: number) {
    let n = 0;
    this.segs = this.segs.filter((s) => (s.life -= dt) > 0);
    for (const s of this.segs) {
      const len = s.a.distanceTo(s.b);
      this.dummy.position.copy(s.a).add(s.b).multiplyScalar(0.5);
      this.dummy.lookAt(s.b);
      const w = 0.07 + s.life * 0.5;
      this.dummy.scale.set(w, w, len);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n++, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- Katana-Hiebe (Sichelbogen) ----------------
class Slashes {
  private pool: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; r: number }[] = [];
  constructor(scene: THREE.Scene) {
    // Bogen um lokales +Z (±1,2 rad), flach auf dem Boden
    const geo = new THREE.RingGeometry(0.72, 1, 28, 1, -Math.PI / 2 - 1.2, 2.4).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffc8e6, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 7;
      scene.add(m);
      this.pool.push({ m, mat, t: 0, r: 1 });
    }
  }
  spawn(x: number, y: number, z: number, a: number, r: number) {
    const p = this.pool.find((q) => !q.m.visible) ?? this.pool[0];
    p.m.position.set(x, y, z);
    p.m.rotation.y = a;
    p.t = 0; p.r = r;
    p.m.visible = true;
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / 0.2;
      if (k >= 1) { p.m.visible = false; continue; }
      const s = p.r * (0.85 + 0.2 * k);
      p.m.scale.set(s, 1, s);
      p.mat.opacity = 0.55 * (1 - k) * (1 - k);
    }
  }
}

export class Fx {
  tele: Telegraphs;
  particles: Particles;
  numbers: DamageNumbers;
  rings: Rings;
  bolts: Bolts;
  slashes: Slashes;
  constructor(scene: THREE.Scene, lowQ: boolean) {
    this.tele = new Telegraphs(scene);
    this.particles = new Particles(scene, lowQ ? 1400 : 3000);
    this.numbers = new DamageNumbers(scene);
    this.rings = new Rings(scene);
    this.bolts = new Bolts(scene);
    this.slashes = new Slashes(scene);
  }
  update(dt: number) {
    this.particles.update(dt);
    this.numbers.update(dt);
    this.rings.update(dt);
    this.bolts.update(dt);
    this.slashes.update(dt);
  }
}
