// Statische Welt: Terrain-Mesh, Requisiten (instanziert), schwebende Kristalle, Schreine & Truhen.
import * as THREE from 'three';
import type { Sim } from '../core/sim';
import { HALF, STEP_H, GRID_SIZE, GRID_SEGS } from '../core/terrain';
import { Rng } from '../core/rng';
import {
  treeGeo, rockGeo, flowerGeo, crystalGeo, shrineGeo, chestGeo, deadTreeGeo, pillarGeo, crystalClusterGeo, obeliskGeo, graveGeo, powerShrineGeo,
  wallGeo, floorGeo, brazierGeo, flameGeo, mushroomGeo, altarGeo,
} from './models';
import { POWER_TIME, ALTAR_TIME, PROP_BRAZIER } from '../core/sim';
// je Höhenstufe eine Wiesenfarbe; höhere Ebenen werden kühler (Mint/Türkis), Klippen bleiben lila
// gedämpfte Dämmerungs-Palette (dunkler, weniger verspielt)
const GRASS = ['#6f9a7c', '#76a080', '#7ea584', '#86a785', '#8ea585', '#84a487', '#7a9f8b', '#72998f', '#6c9394', '#6f8d9c', '#7a8aa2', '#8690aa', '#959bb4'].map((c) => new THREE.Color(c));
const CLIFF = [new THREE.Color('#5e4e7c'), new THREE.Color('#6e5274'), new THREE.Color('#584e78')];
const SNOW = new THREE.Color('#c8c4dc');
// Biom-Tönung: Totholz bräunlich-dunkel, Hain neutral, Kristallfeld kühl-violett
const TINT_DEAD = new THREE.Color(0.82, 0.74, 0.7), TINT_CRYSTAL = new THREE.Color(0.82, 0.84, 1.08);

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
    sh.vertexShader = 'attribute float aSand;\nattribute vec3 aTint;\nvarying float vSand;\nvarying vec3 vTint;\nvarying vec3 vWPos;\nvarying vec3 vWNor;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSand = aSand; vTint = aTint; vWPos = position; vWNor = normal;');
    sh.fragmentShader = `uniform float uTex; uniform sampler2D tGrass, tHigh, tCliff, tSnow, tSand;
      varying float vSand; varying vec3 vTint; varying vec3 vWPos; varying vec3 vWNor;
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
          // gedämpft und abgedunkelt (Dämmerungs-Stimmung), plus Biom-Tönung
          float l = dot(tc, vec3(0.299, 0.587, 0.114));
          tc = mix(tc, vec3(l), 0.3) * 0.78 * vTint;
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
  private power: { base: THREE.Mesh; ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; rune: THREE.Mesh }[] = [];
  private altars: { base: THREE.Mesh; orb: THREE.Mesh }[] = [];
  private flameMat!: THREE.MeshLambertMaterial;
  braziers: [number, number, number][] = []; // für Funken in der View
  private usedMat = new THREE.MeshLambertMaterial({ color: 0x9a94a8, flatShading: true });
  private disposables: { dispose(): void }[] = [];
  private windTime = { value: 0 };

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
    // exakt das Gitter der Simulation (Kollision = Optik)
    const g = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, GRID_SEGS, GRID_SEGS);
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
    const tint = new Float32Array(pos.length);
    const shrines = this.sim.interact.filter((o) => o.kind !== 1);
    const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const tc = new THREE.Color();
    for (let v = 0; v < sand.length; v++) {
      const x = pos[v * 3], z = pos[v * 3 + 2];
      let s = 1 - sm(7, 13, Math.hypot(x, z));
      for (const o of shrines) s = Math.max(s, 1 - sm(3.5, 6.5, Math.hypot(x - o.x, z - o.z)));
      sand[v] = s;
      const b = T.biome(x, z);
      tc.setRGB(1, 1, 1).lerp(TINT_DEAD, 1 - sm(0.3, 0.42, b)).lerp(TINT_CRYSTAL, sm(0.58, 0.7, b));
      tint[v * 3] = tc.r; tint[v * 3 + 1] = tc.g; tint[v * 3 + 2] = tc.b;
      col[v * 3] *= tc.r; col[v * 3 + 1] *= tc.g; col[v * 3 + 2] *= tc.b;
    }
    ng.setAttribute('aSand', new THREE.BufferAttribute(sand, 1));
    ng.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
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
    const treeMat = this.track(this.windMaterial(1.1, 0.06));
    const flowerMat = this.track(this.windMaterial(0.05, 0.35));
    const f = lowQ ? 0.55 : 1;
    // Bäume & Felsen kommen aus der Simulation (dort mit Kollision)
    // Reihenfolge = PROP_* in sim.ts
    const glowMat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x6a3aa8, emissiveIntensity: 0.9 }));
    const mushMat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1a5a66, emissiveIntensity: 0.8 }));
    const geos: (THREE.BufferGeometry | null)[] = [
      treeGeo(0xa86a8c, 0xbc84a2), treeGeo(0x4c8a80, 0x64a094), rockGeo(), deadTreeGeo(), pillarGeo(), crystalClusterGeo(),
      obeliskGeo(), graveGeo(), wallGeo(), null, floorGeo(), brazierGeo(), mushroomGeo(),
    ];
    const mats = [treeMat, treeMat, mat, treeMat, mat, glowMat, mat, mat, mat, mat, mat, mat, mushMat];
    // Flammen der Feuerschalen: eigenes leuchtendes Mesh, flackert über die Materialstärke
    const braziers = this.sim.props.filter((p) => p.kind === PROP_BRAZIER);
    this.flameMat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xff7a20, emissiveIntensity: 1.4 }));
    const flames = new THREE.InstancedMesh(this.track(flameGeo()), this.flameMat, Math.max(1, braziers.length));
    braziers.forEach((p, i) => flames.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    flames.count = braziers.length;
    this.group.add(flames);
    this.braziers = braziers.map((p) => [p.x, p.y + 1.9, p.z] as [number, number, number]);
    geos.forEach((g, kind) => {
      if (!g) return;
      const list = this.sim.props.filter((p) => p.kind === kind);
      const mesh = new THREE.InstancedMesh(this.track(g), mats[kind], Math.max(1, list.length));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, new THREE.Vector3(p.s, p.s, p.s)));
      });
      mesh.count = list.length;
      this.group.add(mesh);
    });
    for (const c of [0xd88aa8, 0xd8c070, 0x9a8ad8, 0xc8c0d8]) this.scatter(flowerGeo(c), flowerMat, Math.floor(220 * f), rng, 0.8, 1.4);

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

  // Wiegt Instanzen im Wind: oberhalb von `from` (lokale Höhe) wächst der Ausschlag mit der Höhe.
  // Phase hängt von der Instanz-Position ab, damit nicht alles im Gleichtakt schwingt.
  private windMaterial(from: number, amp: number) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const uTime = this.windTime;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        float hgt = max(0.0, position.y - ${from.toFixed(2)});
        float sway = sin(uTime * 1.5 + ip.x * 0.31 + ip.z * 0.17) * 0.7 + sin(uTime * 3.3 + ip.x) * 0.3;
        transformed.x += sway * hgt * ${amp.toFixed(3)};
        transformed.z += sway * hgt * ${(amp * 0.6).toFixed(3)};`);
    };
    m.customProgramCacheKey = () => `wind${from}_${amp}`;
    return m;
  }

  private buildInteractables() {
    const mat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const sg = this.track(shrineGeo()), cg = this.track(chestGeo());
    const topGeo = this.track(new THREE.OctahedronGeometry(0.6).scale(0.8, 1.4, 0.8));
    const topMat = this.track(new THREE.MeshLambertMaterial({ color: 0xc6a8ff, emissive: 0xc6a8ff, emissiveIntensity: 0.6, flatShading: true }));
    const pg = this.track(powerShrineGeo());
    const ringGeo = this.track(new THREE.RingGeometry(2.4, 2.9, 40).rotateX(-Math.PI / 2));
    const runeGeo = this.track(new THREE.OctahedronGeometry(0.45).scale(0.7, 1.5, 0.7));
    const runeMat = this.track(new THREE.MeshLambertMaterial({ color: 0x7fe8ff, emissive: 0x7fe8ff, emissiveIntensity: 0.9, flatShading: true }));
    const ag = this.track(altarGeo());
    const orbGeo = this.track(new THREE.IcosahedronGeometry(0.38, 1));
    const orbMat = this.track(new THREE.MeshLambertMaterial({ color: 0xff2a5a, emissive: 0xff1a4a, emissiveIntensity: 1.2, flatShading: true }));
    for (const it of this.sim.interact) {
      if (it.kind === 0) {
        const m = new THREE.Mesh(sg, mat);
        m.position.set(it.x, it.y, it.z);
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.set(it.x, it.y + 4, it.z);
        this.shrines.push(m);
        this.shrineTops.push(top);
        this.group.add(m, top);
      } else if (it.kind === 1) {
        const m = new THREE.Mesh(cg, mat);
        m.position.set(it.x, it.y, it.z);
        m.rotation.y = (it.x * 13.37) % (Math.PI * 2);
        this.chests.push(m);
        this.group.add(m);
      } else if (it.kind === 3) {
        // Beschwörungsaltar mit rot glühender Kugel
        const base = new THREE.Mesh(ag, mat);
        base.position.set(it.x, it.y, it.z);
        base.rotation.y = (it.z * 7.1) % (Math.PI * 2);
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.set(it.x, it.y + 2.1, it.z);
        this.altars.push({ base, orb });
        this.group.add(base, orb);
      } else {
        // Machtschrein: Steinkreis, Lade-Ring am Boden, schwebende Rune
        const base = new THREE.Mesh(pg, mat);
        base.position.set(it.x, it.y, it.z);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
        this.track(ringMat);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(it.x, it.y + 0.2, it.z);
        const rune = new THREE.Mesh(runeGeo, runeMat);
        rune.position.set(it.x, it.y + 2.6, it.z);
        this.power.push({ base, ring, ringMat, rune });
        this.group.add(base, ring, rune);
      }
    }
  }

  update(time: number) {
    this.windTime.value = time;
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
    if (this.flameMat) this.flameMat.emissiveIntensity = 1.3 + Math.sin(time * 13) * 0.15 + Math.sin(time * 7.3) * 0.15;
    let si = 0, ci = 0, pi = 0, ai = 0;
    for (const it of this.sim.interact) {
      if (it.kind === 3) {
        const a = this.altars[ai++];
        a.orb.visible = !it.used;
        if (it.used) { if (a.base.material !== this.usedMat) a.base.material = this.usedMat; continue; }
        const k = Math.min(1, it.hold / ALTAR_TIME);
        a.orb.position.y = it.y + 2.1 + Math.sin(time * 2.5 + it.x) * 0.15;
        a.orb.scale.setScalar(1 + k * 0.8 + Math.sin(time * 5) * 0.06);
        continue;
      }
      if (it.kind === 0) {
        const top = this.shrineTops[si], base = this.shrines[si++];
        top.visible = !it.used;
        top.rotation.y = time * 1.5;
        top.position.y = it.y + 4 + Math.sin(time * 2 + it.x) * 0.25;
        if (it.used && base.material !== this.usedMat) base.material = this.usedMat;
      } else if (it.kind === 1) {
        this.chests[ci++].visible = !it.used;
      } else {
        const p = this.power[pi++];
        p.rune.visible = p.ring.visible = !it.used;
        if (it.used) { if (p.base.material !== this.usedMat) p.base.material = this.usedMat; continue; }
        const k = Math.min(1, it.hold / POWER_TIME);
        p.rune.rotation.y = time * (1.2 + k * 8);
        p.rune.position.y = it.y + 2.6 + Math.sin(time * 2 + it.z) * 0.2 + k * 0.8;
        // Ring zieht sich beim Laden zusammen und wird heller
        const sc = 1 - k * 0.55;
        p.ring.scale.set(sc, 1, sc);
        p.ringMat.opacity = 0.35 + k * 0.6 + Math.sin(time * 4) * 0.08;
      }
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.usedMat.dispose();
  }
}
