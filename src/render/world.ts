// Statische Welt: Terrain-Mesh, Requisiten (instanziert), schwebende Kristalle, Schreine & Truhen.
import * as THREE from 'three';
import type { Sim } from '../core/sim';
import { WORLD, HALF, STEP_H } from '../core/terrain';
import { Rng } from '../core/rng';
import { treeGeo, rockGeo, flowerGeo, crystalGeo, shrineGeo, chestGeo } from './models';
// je Höhenstufe eine Wiesenfarbe; höhere Ebenen werden kühler (Mint/Türkis), Klippen bleiben lila
const GRASS = ['#bfe8c4', '#cdeccb', '#d9f0c8', '#e7f2c4', '#f3efca', '#e3efc0', '#cfeac2', '#bfe6c9', '#b3e0cf', '#aedbd6', '#b2d6de', '#bcd6e8', '#c8d8ee'].map((c) => new THREE.Color(c));
const CLIFF = [new THREE.Color('#b9a6dc'), new THREE.Color('#cfa9cc'), new THREE.Color('#b0a2d6')];
const SNOW = new THREE.Color('#f4eefc');

// ---------------- Boden-Texturen ----------------
// Einmal laden, für alle Läufe teilen. Mischung im Shader nach Höhe, Steilheit und Sand-Maske.
let textures: Record<string, THREE.Texture> | null = null;
function getTextures(maxAniso: number) {
  if (textures) return textures;
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}textures/`;
  textures = {};
  for (const n of ['grass', 'meadow_high', 'cliff', 'snow', 'path']) {
    const t = loader.load(`${base}${n}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    textures[n] = t;
  }
  return textures;
}
export const terrainTex = { maxAniso: 8 };

function terrainMaterial(uTex: { value: number }) {
  const t = getTextures(terrainTex.maxAniso);
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTex, tGrass: { value: t.grass }, tHigh: { value: t.meadow_high }, tCliff: { value: t.cliff },
      tSnow: { value: t.snow }, tSand: { value: t.path },
    });
    sh.vertexShader = 'attribute float aSand;\nvarying float vSand;\nvarying vec3 vWPos;\nvarying vec3 vWNor;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSand = aSand; vWPos = position; vWNor = normal;');
    sh.fragmentShader = `uniform float uTex; uniform sampler2D tGrass, tHigh, tCliff, tSnow, tSand;
      varying float vSand; varying vec3 vWPos; varying vec3 vWNor;
      // zwei Maßstäbe mischen, damit das Kachelmuster nicht auffällt
      vec3 tex2(sampler2D t, vec2 uv) { return mix(texture2D(t, uv).rgb, texture2D(t, uv * 0.29 + vec2(0.37, 0.71)).rgb, 0.35); }
      vec3 triCliff(vec3 p, vec3 n) {
        vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
        return tex2(tCliff, p.zy * 0.11) * w.x + tex2(tCliff, p.xz * 0.11) * w.y + tex2(tCliff, p.xy * 0.11) * w.z;
      }
      ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (uTex > 0.0) {
          vec3 n = normalize(vWNor);
          vec2 uv = vWPos.xz * 0.125;
          vec3 ground = tex2(tGrass, uv);
          ground = mix(ground, tex2(tHigh, uv * 0.9), smoothstep(8.0, 14.0, vWPos.y));
          ground = mix(ground, tex2(tSnow, uv), smoothstep(22.0, 27.0, vWPos.y));
          ground = mix(ground, tex2(tSand, uv * 1.2), vSand * 0.85);
          float cliff = smoothstep(0.82, 0.62, n.y);
          vec3 tc = mix(ground, triCliff(vWPos, n), cliff);
          // etwas Sättigung raus und aufhellen, damit es pastellig bleibt
          float l = dot(tc, vec3(0.299, 0.587, 0.114));
          tc = mix(tc, vec3(l), 0.18) * 1.06 + 0.02;
          diffuseColor.rgb = mix(diffuseColor.rgb, tc, uTex);
        }`);
  };
  m.customProgramCacheKey = () => 'terrainTex';
  return m;
}

export class World {
  readonly group = new THREE.Group();
  private crystals: THREE.InstancedMesh[] = [];
  private crystalData: Float32Array[] = [];
  private shrineTops: THREE.Mesh[] = [];
  private shrines: THREE.Mesh[] = [];
  private chests: THREE.Mesh[] = [];
  private usedMat = new THREE.MeshLambertMaterial({ color: 0x9a94a8, flatShading: true });
  private disposables: { dispose(): void }[] = [];

  constructor(private sim: Sim, lowQ: boolean, private texUniform: { value: number }) {
    this.buildTerrain(lowQ);
    this.buildProps(lowQ);
    this.buildInteractables();
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private buildTerrain(lowQ: boolean) {
    const T = this.sim.terrain;
    const size = WORLD + 140, segs = lowQ ? 150 : 230;
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, T.height(p.getX(i), p.getZ(i)));
    const ng = g.toNonIndexed();
    g.dispose();
    ng.computeVertexNormals();
    const pos = ng.attributes.position.array as Float32Array;
    const nor = ng.attributes.normal.array as Float32Array;
    const col = new Float32Array(pos.length);
    const c = new THREE.Color();
    for (let t = 0; t < pos.length / 9; t++) {
      const o = t * 9;
      const h = (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3;
      const ny = nor[o + 1];
      const jit = ((t * 2654435761) >>> 0) / 4294967296;
      if (h > 24) c.copy(SNOW);
      else if (ny < 0.8) c.copy(CLIFF[Math.floor(jit * 3)]);
      else c.copy(GRASS[Math.max(0, Math.min(GRASS.length - 1, Math.floor(h / STEP_H + 0.3)))]);
      c.multiplyScalar(0.96 + jit * 0.07);
      for (let v = 0; v < 3; v++) { col[o + v * 3] = c.r; col[o + v * 3 + 1] = c.g; col[o + v * 3 + 2] = c.b; }
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Sand-Plätze: Startlichtung und um die Schreine
    const sand = new Float32Array(pos.length / 3);
    const shrines = this.sim.interact.filter((o) => o.kind === 0);
    const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let v = 0; v < sand.length; v++) {
      const x = pos[v * 3], z = pos[v * 3 + 2];
      let s = 1 - sm(7, 13, Math.hypot(x, z));
      for (const o of shrines) s = Math.max(s, 1 - sm(3.5, 6.5, Math.hypot(x - o.x, z - o.z)));
      sand[v] = s;
    }
    ng.setAttribute('aSand', new THREE.BufferAttribute(sand, 1));
    const mesh = new THREE.Mesh(ng, this.track(terrainMaterial(this.texUniform)));
    this.track(ng);
    this.group.add(mesh);
  }

  private scatter(geo: THREE.BufferGeometry, mat: THREE.Material, n: number, rng: Rng, minS: number, maxS: number, avoidSteep = true) {
    const T = this.sim.terrain;
    const mesh = new THREE.InstancedMesh(this.track(geo), mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    let k = 0;
    for (let tries = 0; tries < n * 6 && k < n; tries++) {
      const x = rng.range(-HALF + 6, HALF - 6), z = rng.range(-HALF + 6, HALF - 6);
      if (x * x + z * z < 14 * 14) continue;
      const y = T.height(x, z);
      if (avoidSteep && (Math.abs(T.height(x + 1, z) - y) > 0.5 || Math.abs(T.height(x, z + 1) - y) > 0.5)) continue;
      if (this.sim.interact.some((o) => Math.abs(o.x - x) < 4 && Math.abs(o.z - z) < 4)) continue;
      const sc = rng.range(minS, maxS);
      q.setFromAxisAngle(v.set(0, 1, 0), rng.next() * Math.PI * 2);
      m.compose(v.set(x, y - 0.05, z), q, s.set(sc, sc, sc));
      mesh.setMatrixAt(k++, m);
    }
    mesh.count = k;
    this.group.add(mesh);
  }

  private buildProps(lowQ: boolean) {
    const rng = new Rng(9137);
    const mat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const f = lowQ ? 0.55 : 1;
    // Bäume & Felsen kommen aus der Simulation (dort mit Kollision)
    const geos = [treeGeo(0xffc2dc, 0xffd6e8), treeGeo(0xa8e6c8, 0xc4f0d8), rockGeo()];
    geos.forEach((g, kind) => {
      const list = this.sim.props.filter((p) => p.kind === kind);
      const mesh = new THREE.InstancedMesh(this.track(g), mat, Math.max(1, list.length));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, new THREE.Vector3(p.s, p.s, p.s)));
      });
      mesh.count = list.length;
      this.group.add(mesh);
    });
    for (const c of [0xffb8d8, 0xfff0a0, 0xc6b8ff, 0xffffff]) this.scatter(flowerGeo(c), mat, Math.floor(260 * f), rng, 0.8, 1.4);

    // Schwebende Kristalle (leuchtend, wippend)
    const T = this.sim.terrain;
    for (const color of [0xffb8e0, 0xa8e0ff, 0xd8c0ff]) {
      const n = lowQ ? 18 : 28;
      const mesh = new THREE.InstancedMesh(
        this.track(crystalGeo()),
        this.track(new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.55, flatShading: true, transparent: true, opacity: 0.92 })),
        n,
      );
      const data = new Float32Array(n * 5);
      for (let i = 0; i < n; i++) {
        const x = rng.range(-HALF + 10, HALF - 10), z = rng.range(-HALF + 10, HALF - 10);
        data[i * 5] = x; data[i * 5 + 1] = T.height(x, z) + rng.range(4, 11); data[i * 5 + 2] = z;
        data[i * 5 + 3] = rng.next() * 10; data[i * 5 + 4] = rng.range(0.8, 2.2);
      }
      this.crystals.push(mesh);
      this.crystalData.push(data);
      this.group.add(mesh);
    }
  }

  private buildInteractables() {
    const mat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const sg = this.track(shrineGeo()), cg = this.track(chestGeo());
    const topGeo = this.track(new THREE.OctahedronGeometry(0.6).scale(0.8, 1.4, 0.8));
    const topMat = this.track(new THREE.MeshLambertMaterial({ color: 0xc6a8ff, emissive: 0xc6a8ff, emissiveIntensity: 0.6, flatShading: true }));
    for (const it of this.sim.interact) {
      if (it.kind === 0) {
        const m = new THREE.Mesh(sg, mat);
        m.position.set(it.x, it.y, it.z);
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.set(it.x, it.y + 4, it.z);
        this.shrines.push(m);
        this.shrineTops.push(top);
        this.group.add(m, top);
      } else {
        const m = new THREE.Mesh(cg, mat);
        m.position.set(it.x, it.y, it.z);
        m.rotation.y = (it.x * 13.37) % (Math.PI * 2);
        this.chests.push(m);
        this.group.add(m);
      }
    }
  }

  update(time: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let c = 0; c < this.crystals.length; c++) {
      const mesh = this.crystals[c], d = this.crystalData[c];
      for (let i = 0; i < mesh.count; i++) {
        const o = i * 5, ph = d[o + 3], sc = d[o + 4];
        q.setFromAxisAngle(up, time * 0.4 + ph);
        m.compose(v.set(d[o], d[o + 1] + Math.sin(time * 0.9 + ph) * 0.6, d[o + 2]), q, s.set(sc, sc, sc));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    let si = 0, ci = 0;
    for (const it of this.sim.interact) {
      if (it.kind === 0) {
        const top = this.shrineTops[si], base = this.shrines[si++];
        top.visible = !it.used;
        top.rotation.y = time * 1.5;
        top.position.y = it.y + 4 + Math.sin(time * 2 + it.x) * 0.25;
        if (it.used && base.material !== this.usedMat) base.material = this.usedMat;
      } else {
        this.chests[ci++].visible = !it.used;
      }
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.usedMat.dispose();
  }
}
