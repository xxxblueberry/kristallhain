// Helden-Skins: gemeinsame Schnittstelle, damit View sie austauschen kann.
// Der Assassine kommt als GLB aus Einzelteilen (ohne Skelett) und wird hier per Namen zu Gelenken gruppiert
// und per Code animiert.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heroGeo } from './models';

export interface HeroPose { t: number; dt: number; moving: boolean; airborne: boolean; vy: number }

export interface HeroSkin {
  readonly root: THREE.Group;
  animate(p: HeroPose): void;
  setFlash(v: number): void;
  dispose(): void;
}

export interface SkinDef { id: string; name: string; icon: string; desc: string }
export const SKINS: SkinDef[] = [
  { id: 'wanderer', name: 'Kristall-Wanderin', icon: '🧙', desc: 'Die Heldin aus dem Kristallhain' },
  { id: 'assassin', name: 'Schatten-Assassine', icon: '🗡️', desc: 'Lautlos, mit glühenden Augen' },
];

// Lambert mit Treffer-Blitz über ein Uniform (für einzelne Meshes statt Instanzen)
function flashUniformMaterial() {
  const uFlash = { value: 0 };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlash = uFlash;
    sh.fragmentShader = 'uniform float uFlash;\n' +
      sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.98, 0.96), uFlash);');
  };
  m.customProgramCacheKey = () => 'flashU';
  return { m, uFlash };
}

// ---------------- Kristall-Wanderin (Code-Figur) ----------------
export function createWanderer(): HeroSkin {
  const { m, uFlash } = flashUniformMaterial();
  const geo = heroGeo();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo, m));
  return {
    root,
    animate() {},
    setFlash(v) { uFlash.value = v; },
    dispose() { geo.dispose(); m.dispose(); },
  };
}

// ---------------- Schatten-Assassine (GLB) ----------------
type Part = 'torso' | 'hipL' | 'kneeL' | 'armL' | 'hipR' | 'kneeR' | 'armR';

// Gelenkpunkte im Modellraum (aus den Teile-Bounds abgelesen)
const PIVOTS: Record<Part, THREE.Vector3> = {
  torso: new THREE.Vector3(0, 0, 0),
  hipL: new THREE.Vector3(-0.12, 0.8, 0.01),
  kneeL: new THREE.Vector3(-0.12, 0.53, 0.02),
  armL: new THREE.Vector3(-0.19, 1.24, 0),
  hipR: new THREE.Vector3(0.12, 0.8, 0.01),
  kneeR: new THREE.Vector3(0.12, 0.53, 0.02),
  armR: new THREE.Vector3(0.19, 1.24, 0),
};

function classify(name: string): Part {
  const side = /_([LR])(_|$)/.exec(name)?.[1];
  if (!side) return 'torso';
  if (/^(Thigh|ThighArmour|KneeSilver|KneeCenter)/.test(name)) return side === 'L' ? 'hipL' : 'hipR';
  if (/^(Shin|Boot)/.test(name)) return side === 'L' ? 'kneeL' : 'kneeR';
  if (/^(UpperArm|Forearm|ArmRune|Hand|Fingers|Thumb)/.test(name)) return side === 'L' ? 'armL' : 'armR';
  return 'torso';
}

// Teile nach Gelenk zusammengefasst, relativ zum jeweiligen Gelenkpunkt
export type AssassinParts = Record<Part, THREE.BufferGeometry>;

export async function loadAssassin(url: string): Promise<AssassinParts> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const lists: Record<Part, THREE.BufferGeometry[]> = { torso: [], hipL: [], kneeL: [], armL: [], hipR: [], kneeR: [], armR: [] };
  const col = new THREE.Color();
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count;
    const rgb = new Float32Array(n * 3);
    const src = g.attributes.color as THREE.BufferAttribute | undefined;
    if (src) {
      for (let i = 0; i < n; i++) { rgb[i * 3] = src.getX(i); rgb[i * 3 + 1] = src.getY(i); rgb[i * 3 + 2] = src.getZ(i); }
    } else {
      // Teile ohne Vertex-Farben (die Kristalle): Materialfarbe übernehmen
      const mat = mesh.material as THREE.MeshStandardMaterial;
      col.copy(mat.color ?? new THREE.Color(1, 1, 1));
      for (let i = 0; i < n; i++) { rgb[i * 3] = col.r; rgb[i * 3 + 1] = col.g; rgb[i * 3 + 2] = col.b; }
    }
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', g.attributes.position);
    clean.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    const part = classify(mesh.name || mesh.parent?.name || '');
    const p = PIVOTS[part];
    clean.translate(-p.x, -p.y, -p.z);
    lists[part].push(clean);
  });
  const out = {} as AssassinParts;
  for (const k of Object.keys(lists) as Part[]) {
    const g = lists[k].length ? mergeGeometries(lists[k], false)! : new THREE.BufferGeometry();
    g.computeVertexNormals();
    out[k] = g;
  }
  return out;
}

export function createAssassin(parts: AssassinParts): HeroSkin {
  const { m, uFlash } = flashUniformMaterial();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(1.15); // Modell ist 1,88 m, Spielheld ~2,15 m
  const joint = (part: Part, parent: THREE.Object3D, rel: THREE.Vector3) => {
    const g = new THREE.Group();
    g.position.copy(rel);
    g.add(new THREE.Mesh(parts[part], m));
    parent.add(g);
    return g;
  };
  joint('torso', body, PIVOTS.torso);
  const hipL = joint('hipL', body, PIVOTS.hipL);
  const hipR = joint('hipR', body, PIVOTS.hipR);
  const kneeL = joint('kneeL', hipL, PIVOTS.kneeL.clone().sub(PIVOTS.hipL));
  const kneeR = joint('kneeR', hipR, PIVOTS.kneeR.clone().sub(PIVOTS.hipR));
  const armL = joint('armL', body, PIVOTS.armL);
  const armR = joint('armR', body, PIVOTS.armR);

  let phase = 0;
  let blend = 0; // 0 = stehen, 1 = laufen
  let air = 0;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return {
    root,
    animate(p) {
      const k = Math.min(1, p.dt * 10);
      blend = lerp(blend, p.moving && !p.airborne ? 1 : 0, k);
      air = lerp(air, p.airborne ? 1 : 0, Math.min(1, p.dt * 14));
      if (p.moving) phase += p.dt * 11;
      const s = Math.sin(phase), breathe = Math.sin(p.t * 2.2);

      // Beine: Laufzyklus, in der Luft angezogen
      const legL = -0.7 * s * blend, legR = 0.7 * s * blend;
      hipL.rotation.x = lerp(legL, -0.75, air);
      hipR.rotation.x = lerp(legR, -0.35, air);
      kneeL.rotation.x = lerp(0.1 + 1.0 * Math.max(0, -s) * blend, 1.2, air);
      kneeR.rotation.x = lerp(0.1 + 1.0 * Math.max(0, s) * blend, 0.7, air);

      // Arme: aus der T-Pose nach unten, gegengleich schwingen, im Sprung leicht nach oben
      const down = 1.25 - 0.03 * breathe;
      armL.rotation.z = lerp(down, 0.55, air);
      armR.rotation.z = lerp(-down, -0.55, air);
      armL.rotation.x = lerp(0.6 * s * blend, -0.4, air);
      armR.rotation.x = lerp(-0.6 * s * blend, -0.4, air);

      // Körper: beim Laufen nach vorn lehnen, im Stand atmen
      body.rotation.x = 0.14 * blend + 0.08 * air;
      body.position.y = 0.012 * breathe * (1 - blend);
    },
    setFlash(v) { uFlash.value = v; },
    dispose() { m.dispose(); },
  };
}
