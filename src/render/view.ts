// Darstellung: liest den Sim-Zustand, zeichnet alles instanziert, Kamera & Spielgefühl.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  Sim, EV_HIT, EV_KILL, EV_XP, EV_HURT, EV_LEVEL, EV_BOOM, EV_JUMP, EV_LAND, EV_CHAIN, EV_NOVA, EV_GOLD, EV_CHEST,
  EV_HEAL, EV_SHIELD, EV_REVIVE, EV_SHOOT, EV_SLASH, EV_MAGNET, EV_BLINK, EV_BUFF, EV_POWER, EV_STRIDE, K_BUFF, P_SPEAR, P_SHARD, P_BULLET, B_METEOR, B_ENEMY, B_PLAYER, B_STAR,
} from '../core/sim';
import { ENEMIES, MAX_ENEMIES, MAX_PICK, MAX_PROJ, W_BLADES, W_PISTOL, W_KATANA, I_BUBBLE, BUFFS, RARITIES } from '../core/data';
import { bladeLayout } from '../core/weapons';
import * as M from './models';
import { World } from './world';
import { createWanderer, type HeroSkin } from './hero';
import { Fx, setM } from './fx';
import { terrainTex } from './world';

const ENEMY_CAP = [1400, 700, 400, 500, 300, 2, 2, 2, 2, 2, 2];
const MAX_BARS = 64;

// Lambert mit Treffer-Blitz pro Instanz (Attribut aFlash): >0 weiß aufblitzen, <0 goldener Elite-Glanz
function flashMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aFlash;\nvarying float vFlash;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFlash = aFlash;');
    sh.fragmentShader = 'varying float vFlash;\n' +
      sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        if (vFlash < 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.8, 0.3), -vFlash) + vec3(0.06, 0.04, 0.0);
        else gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.98, 0.96), clamp(vFlash, 0.0, 1.0));`);
  };
  m.customProgramCacheKey = () => 'flash';
  return m;
}

function inst(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, flash = false) {
  if (flash) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFlash', a);
  }
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.count = 0;
  return m;
}

const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function shadowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(70,40,90,0.42)');
  g.addColorStop(0.6, 'rgba(70,40,90,0.22)');
  g.addColorStop(1, 'rgba(70,40,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0.6;
  pitch = 0.95;
  pitchTarget = 0.95; // Spiel: steil von oben; Menü: flacher, damit man die Berge sieht
  private texUniform = { value: 0.9 };
  private backdrop: THREE.Mesh;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private hq = true;
  private pollen: THREE.Points;
  private pollenVel: Float32Array;
  dist = 20;
  zoom = 20; // Zielabstand, per Mausrad/Tasten/Schultertasten
  static readonly ZOOM_MIN = 13;
  static readonly ZOOM_MAX = 36;
  shakeOn = true;
  numbersOn = true;
  private trauma = 0;
  private time = 0;
  private camT = new THREE.Vector3();
  private lead = new THREE.Vector3();
  private sky: THREE.Mesh;
  private world: World | null = null;
  private fx: Fx;

  private enemyMesh: THREE.InstancedMesh[] = [];
  private enemyFlash: THREE.InstancedBufferAttribute[] = [];
  private enemyYaw = new Float32Array(MAX_ENEMIES);
  private counts = new Int32Array(ENEMIES.length);
  private heroRoot = new THREE.Group();
  private skin: HeroSkin;
  private heroYaw = 0;
  private heroSquash = 0;
  private proj: THREE.InstancedMesh[] = [];
  private blades: THREE.InstancedMesh;
  private orbs: THREE.InstancedMesh;
  private coins: THREE.InstancedMesh;
  private hearts: THREE.InstancedMesh;
  private magnets: THREE.InstancedMesh;
  private buffMeshes: THREE.InstancedMesh[];
  private katana: THREE.Mesh;
  private katanaT = 1; // 0..1 Fortschritt des Schwungs
  private barBg: THREE.InstancedMesh;
  private barFill: THREE.InstancedMesh;
  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private camRight = new THREE.Vector3();
  private pistol: THREE.Mesh;
  private pistolKick = 0;
  private bubble: THREE.Mesh;
  private shadows: THREE.InstancedMesh;
  private c = new THREE.Color();

  constructor(container: HTMLElement, private lowQ: boolean) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowQ, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowQ ? 1.5 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);
    // Dämmerung: violetter Dunst statt Pastell-Rosa
    this.scene.fog = new THREE.Fog(0x7a5c86, 50, 160);

    // Himmel: weicher Verlauf
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(350, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color(0x1e1838) }, bottom: { value: new THREE.Color(0x8a6488) } },
        vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float vY; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, vY)), 1.0); }',
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // Ferne Berge als Ring um die Kamera (freigestelltes Bild)
    terrainTex.maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const mtex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/mountains.png`);
    mtex.colorSpace = THREE.SRGBColorSpace;
    mtex.wrapS = THREE.RepeatWrapping;
    mtex.repeat.x = 4;
    this.backdrop = new THREE.Mesh(
      new THREE.CylinderGeometry(320, 320, 168, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: mtex, transparent: true, alphaTest: 0.02, side: THREE.BackSide, depthWrite: false, fog: false, color: 0x8a7aa8 }),
    );
    this.backdrop.renderOrder = -9;
    this.scene.add(this.backdrop);

    // kühles Himmelslicht + warmes, tief stehendes Abendlicht → stärkere Schattierung
    this.scene.add(new THREE.HemisphereLight(0xb8a8e8, 0x3a2c48, 1.35));
    const sun = new THREE.DirectionalLight(0xffc4a0, 2.4);
    sun.position.set(70, 32, 25);
    this.scene.add(sun);

    const flashMat = flashMaterial();
    const geos = [M.beetleGeo(), M.wolfGeo(), M.shamanGeo(), M.wispGeo(), M.golemGeo(), M.hydraGeo(), M.titanGeo(), M.kingGeo(), M.witchGeo(), M.queenGeo(), M.darkLordGeo()];
    geos.forEach((g, t) => {
      const m = inst(g, flashMat, ENEMY_CAP[t], true);
      this.enemyMesh.push(m);
      this.enemyFlash.push(g.getAttribute('aFlash') as THREE.InstancedBufferAttribute);
      this.scene.add(m);
    });
    this.skin = createWanderer();
    this.heroRoot.add(this.skin.root);
    this.scene.add(this.heroRoot);

    const plain = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const glow = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.35 });
    // Reihenfolge = P_SPEAR, P_SHARD, P_METEOR, P_BULLET, P_STAR
    this.proj = [inst(M.spearGeo(), plain, MAX_PROJ), inst(M.shardGeo(), glow, MAX_PROJ), inst(M.meteorGeo(), glow, 64), inst(M.bulletGeo(), glow, MAX_PROJ), inst(M.starGeo(), glow, 64)];
    this.blades = inst(M.bladeGeo(), glow, 16);
    this.orbs = inst(M.orbGeo(), glow, MAX_PICK);
    this.coins = inst(M.coinGeo(), glow, MAX_PICK);
    this.hearts = inst(M.heartGeo(), glow, 256);
    this.magnets = inst(M.magnetGeo(), glow, 64);
    this.buffMeshes = BUFFS.map((b) => inst(M.buffGeo(b.color), glow, 64));
    this.scene.add(...this.proj, this.blades, this.orbs, this.coins, this.hearts, this.magnets, ...this.buffMeshes);
    this.pistol = new THREE.Mesh(M.pistolGeo(), plain);
    this.pistol.visible = false;
    this.katana = new THREE.Mesh(M.katanaGeo(), glow);
    this.katana.visible = false;
    this.scene.add(this.katana);
    // HP-Leisten über Elites (Billboards)
    const barMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true });
    this.barBg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.2), barMat(0x3b2f5a), MAX_BARS);
    this.barFill = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.14).translate(0.5, 0, 0.001), barMat(0xffc94d), MAX_BARS);
    for (const b of [this.barBg, this.barFill]) { b.frustumCulled = false; b.renderOrder = 15; b.count = 0; this.scene.add(b); }
    this.bubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25, 2),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    this.bubble.visible = false;
    this.scene.add(this.pistol, this.bubble);

    this.shadows = inst(
      new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      MAX_ENEMIES + 1,
    );
    this.shadows.renderOrder = 1;
    this.scene.add(this.shadows);

    this.fx = new Fx(this.scene, lowQ);

    // Post-Processing (nur bei Grafik "hoch"): weiches Leuchten heller Dinge + sanfte Vignette
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.6, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float d = length((vUv - 0.5) * vec2(1.25, 1.0));
          c.rgb *= mix(1.0, 0.72, smoothstep(0.45, 0.95, d));
          c.rgb += vec3(0.025, 0.0, 0.03) * smoothstep(0.5, 1.0, d); // Hauch Lila am Rand
          gl_FragColor = c;
        }`,
    }));
    this.composer.addPass(new OutputPass());

    // Schwebende Pollen/Glitzer um den Helden
    const PN = lowQ ? 120 : 260;
    const pg = new THREE.BufferGeometry();
    const pp = new Float32Array(PN * 3);
    this.pollenVel = new Float32Array(PN * 3);
    for (let i = 0; i < PN; i++) {
      pp[i * 3] = (Math.random() - 0.5) * 50; pp[i * 3 + 1] = Math.random() * 12; pp[i * 3 + 2] = (Math.random() - 0.5) * 50;
      this.pollenVel[i * 3] = (Math.random() - 0.5) * 0.6; this.pollenVel[i * 3 + 1] = 0.15 + Math.random() * 0.35; this.pollenVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dctx = dot.getContext('2d')!;
    const grad = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,240,250,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    dctx.fillStyle = grad; dctx.fillRect(0, 0, 32, 32);
    this.pollen = new THREE.Points(pg, new THREE.PointsMaterial({
      size: 0.35, map: new THREE.CanvasTexture(dot), color: 0xfff0d8, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    }));
    this.pollen.frustumCulled = false;
    this.scene.add(this.pollen);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    // im Hochformat weiter herauszoomen, damit genug sichtbar bleibt
    this.camera.fov = w < h ? 70 : 50;
    this.camera.updateProjectionMatrix();
  }

  setTextures(on: boolean) { this.texUniform.value = on ? 0.9 : 0; }
  setQuality(high: boolean) { this.hq = high; }

  attach(sim: Sim) {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.world = new World(sim, this.lowQ, this.texUniform);
    this.scene.add(this.world.group);
    this.camT.set(sim.hx, sim.hy, sim.hz);
    this.trauma = 0;
  }

  // Bewegungseingabe relativ zur Kamera -> Welt
  toWorld(mx: number, my: number): [number, number] {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [c * mx - s * my, -s * mx - c * my];
  }

  setSkin(skin: HeroSkin) {
    this.heroRoot.remove(this.skin.root);
    this.skin.dispose();
    this.skin = skin;
    this.heroRoot.add(skin.root);
  }

  zoomBy(f: number) {
    this.zoom = Math.max(View.ZOOM_MIN, Math.min(View.ZOOM_MAX, this.zoom * f));
  }

  addTrauma(t: number) {
    if (this.shakeOn) this.trauma = Math.min(1, this.trauma + t);
  }

  // ---------- Ereignisse aus der Simulation ----------
  handleEvents(sim: Sim) {
    const v = sim.ev, P = this.fx.particles, c = this.c;
    let hits = 0;
    for (let k = 0; k < sim.evN; k++) {
      const o = k * EV_STRIDE, t = v[o];
      const x = v[o + 1], y = v[o + 2], z = v[o + 3];
      switch (t) {
        case EV_HIT:
          if (this.numbersOn && hits++ < 40) this.fx.numbers.spawn(x, y, z, v[o + 4], v[o + 5] ? 1 : 0);
          if (hits < 30) P.spawn(x, y - 0.5, z, 2, c.setHex(ENEMIES[v[o + 6]].color), 3, 0.1, 0.3, 3);
          break;
        case EV_KILL: {
          const def = ENEMIES[v[o + 4]], sc = v[o + 5];
          const big = def.boss || sc > 1;
          P.spawn(x, y + 0.5 * sc, z, big ? 60 : 8, c.setHex(def.color), big ? 12 : 5, big ? 0.4 : 0.16, big ? 1.2 : 0.5, big ? 9 : 5);
          if (big) { this.addTrauma(0.7); this.fx.rings.spawn(x, y, z, 1, def.boss ? 14 : 8, 0xffffff, 0.6); }
          break;
        }
        case EV_XP:
          P.spawn(x, y, z, 2, c.setHex(0x8ff0d8), 2, 0.08, 0.25, 2);
          break;
        case EV_GOLD:
          P.spawn(x, y, z, 3, c.setHex(0xffd56b), 2.5, 0.1, 0.3, 3);
          break;
        case EV_HURT:
          this.addTrauma(0.45);
          this.fx.numbers.spawn(x, y + 2.4, z, v[o + 4], 2);
          P.spawn(x, y + 1, z, 10, c.setHex(0xff5c7a), 5, 0.14, 0.5, 4);
          break;
        case EV_LEVEL:
          this.fx.rings.spawn(x, y, z, 0.5, 6, 0x8ff0d8, 0.7);
          P.spawn(x, y + 1, z, 30, c.setHex(0xfff0a0), 6, 0.14, 0.9, 7);
          break;
        case EV_BOOM: {
          const r = v[o + 4], kind = v[o + 5];
          const col = kind === B_METEOR ? 0xffa07a : kind === B_ENEMY ? 0xff9fb4 : kind === B_PLAYER ? 0xa8e6ff : kind === B_STAR ? 0xfff0a0 : 0xffffff;
          P.spawn(x, y + 0.3, z, Math.min(30, 4 + r * 3), c.setHex(col), r * 2, 0.2, 0.55, 6);
          this.fx.rings.spawn(x, y, z, r * 0.3, r, col, 0.35);
          this.addTrauma(kind === B_METEOR || kind === B_STAR ? 0.1 : kind === B_ENEMY ? Math.min(0.3, r * 0.025) : 0.2);
          break;
        }
        case EV_JUMP:
          this.heroSquash = 0.25;
          P.spawn(x, y + 0.1, z, 6, c.setHex(0xffffff), 3, 0.1, 0.3, 1);
          if (v[o + 4]) this.fx.rings.spawn(x, y + 0.3, z, 0.3, 1.6, 0xffffff, 0.3); // Doppelsprung
          break;
        case EV_SHOOT:
          if (v[o + 1] === W_PISTOL) {
            this.pistolKick = 1;
            P.spawn(v[o + 2], v[o + 3], v[o + 4], 3, c.setHex(0xfff3b0), 4, 0.08, 0.12, 1);
          }
          break;
        case EV_SLASH:
          this.fx.slashes.spawn(x, y, z, v[o + 4], v[o + 5]);
          this.katanaT = 0;
          this.addTrauma(0.04);
          break;
        case EV_MAGNET:
          this.fx.rings.spawn(x, y, z, 1, 30, 0xff4d6d, 0.7);
          this.fx.rings.spawn(x, y, z, 0.5, 18, 0xffffff, 0.5);
          P.spawn(x, y + 1, z, 30, c.setHex(0xff8fa8), 8, 0.15, 0.7, 5);
          break;
        case EV_BUFF: {
          const col = BUFFS[v[o + 4]].color;
          this.fx.rings.spawn(x, y, z, 0.5, 5, col, 0.5);
          P.spawn(x, y + 1, z, 24, c.setHex(col), 6, 0.15, 0.7, 6);
          break;
        }
        case EV_POWER: {
          const col = new THREE.Color(RARITIES[v[o + 4]].color).getHex();
          this.fx.rings.spawn(x, y, z, 3, 0.5, 0x7fe8ff, 0.6);
          this.fx.rings.spawn(x, y, z, 0.5, 8, col, 0.8);
          P.spawn(x, y + 1.5, z, 50, c.setHex(col), 7, 0.2, 1.1, 9);
          this.addTrauma(0.25);
          break;
        }
        case EV_BLINK:
          P.spawn(x, y, z, 30, c.setHex(0xc6a8ff), 7, 0.18, 0.6, 3);
          this.fx.rings.spawn(x, y - 2, z, 0.5, 4, 0xc6a8ff, 0.4);
          break;
        case EV_HEAL:
          this.fx.numbers.spawn(x, y + 2.4, z, v[o + 4], 3);
          P.spawn(x, y + 1, z, 8, c.setHex(0xff8fb0), 2, 0.12, 0.6, 4);
          break;
        case EV_SHIELD:
          this.fx.rings.spawn(x, y + 1, z, 1.2, 3, 0xbfe8ff, 0.4);
          P.spawn(x, y + 1, z, 16, c.setHex(0xbfe8ff), 5, 0.12, 0.5, 3);
          break;
        case EV_REVIVE:
          this.addTrauma(0.8);
          this.fx.rings.spawn(x, y, z, 1, 10, 0xffa040, 0.8);
          P.spawn(x, y + 1, z, 60, c.setHex(0xffb060), 10, 0.25, 1.2, 9);
          break;
        case EV_LAND:
          this.heroSquash = -0.3;
          P.spawn(x, y + 0.1, z, 8, c.setHex(0xe8f6e0), 4, 0.12, 0.35, 1);
          break;
        case EV_CHAIN:
          this.fx.bolts.spawn(x, y, z, v[o + 4], v[o + 5], v[o + 6]);
          break;
        case EV_NOVA:
          this.fx.rings.spawn(x, y, z, 1, v[o + 4], 0xbfefff, 0.45);
          this.fx.rings.spawn(x, y, z, 0.5, v[o + 4] * 0.8, 0xffffff, 0.35);
          break;
        case EV_CHEST:
          P.spawn(x, y + 1, z, 30, c.setHex(0xffe08a), 6, 0.16, 0.9, 8);
          this.fx.rings.spawn(x, y, z, 0.5, 4, 0xffe08a, 0.5);
          break;
      }
    }
  }

  // ---------- Bild ----------
  update(sim: Sim, alpha: number, dt: number) {
    this.time += dt;
    const T = sim.terrain;

    // Held (interpoliert)
    const hx = sim.phx + (sim.hx - sim.phx) * alpha;
    const hy = sim.phy + (sim.hy - sim.phy) * alpha;
    const hz = sim.phz + (sim.hz - sim.phz) * alpha;
    this.heroYaw = lerpAngle(this.heroYaw, Math.atan2(sim.fx, sim.fz), Math.min(1, dt * 14));
    this.heroSquash += (0 - this.heroSquash) * Math.min(1, dt * 10);
    const run = sim.moving && !sim.airborne ? Math.abs(Math.sin(this.time * 12)) * 0.12 : 0;
    const sq = 1 + this.heroSquash + (sim.airborne ? 0.08 : 0);
    this.heroRoot.position.set(hx, hy + run, hz);
    this.heroRoot.rotation.y = this.heroYaw;
    this.heroRoot.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.skin.animate({ t: this.time, dt, moving: sim.moving, airborne: sim.airborne, vy: sim.vy });
    this.skin.setFlash(sim.iframe > 0 && Math.sin(this.time * 40) > 0 ? 0.7 : 0);

    // Kamera: folgt schräg von hinten oben, leichter Vorlauf in Laufrichtung
    const k = Math.min(1, dt * 8);
    this.lead.lerp(new THREE.Vector3(sim.moving ? sim.fx * 2 : 0, 0, sim.moving ? sim.fz * 2 : 0), Math.min(1, dt * 2));
    this.camT.x += (hx + this.lead.x - this.camT.x) * k;
    this.camT.z += (hz + this.lead.z - this.camT.z) * k;
    this.camT.y += (hy - this.camT.y) * Math.min(1, dt * 4);
    this.dist += (this.zoom - this.dist) * Math.min(1, dt * 8);
    this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, dt * 4);
    const cp = Math.cos(this.pitch) * this.dist, sp = Math.sin(this.pitch) * this.dist;
    this.camera.position.set(this.camT.x + Math.sin(this.yaw) * cp, this.camT.y + sp, this.camT.z + Math.cos(this.yaw) * cp);
    this.camera.lookAt(this.camT.x, this.camT.y + 1.2, this.camT.z);
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.9;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }
    this.sky.position.copy(this.camera.position);
    // Bergfuß knapp unter Augenhöhe, Gipfel ragen über den Dunst
    this.backdrop.position.set(this.camera.position.x, this.camera.position.y + 22, this.camera.position.z);

    // Gegner + Schatten
    this.counts.fill(0);
    let nb = 0;
    const q = this.camera.quaternion.clone();
    this.camRight.set(1, 0, 0).applyQuaternion(q);
    const sh = this.shadows.instanceMatrix.array as Float32Array;
    let ns = 0;
    setM(sh, ns++ * 16, hx, T.height(hx, hz) + 0.04, hz, 0, 0.7, 1, 0.7);
    for (let i = 0; i < sim.eHigh; i++) {
      if (!sim.eAlive[i]) continue;
      const t = sim.eType[i], kk = this.counts[t];
      if (kk >= ENEMY_CAP[t]) continue;
      this.counts[t]++;
      const def = ENEMIES[t];
      const x = sim.epx[i] + (sim.ex[i] - sim.epx[i]) * alpha;
      const y = sim.epy[i] + (sim.ey[i] - sim.epy[i]) * alpha;
      const z = sim.epz[i] + (sim.ez[i] - sim.epz[i]) * alpha;
      this.enemyYaw[i] = lerpAngle(this.enemyYaw[i], Math.atan2(sim.edx[i], sim.edz[i]), Math.min(1, dt * 10));
      const sp0 = sim.espawn[i];
      const pop = sp0 < 1 ? 1 + 2.7 * Math.pow(sp0 - 1, 3) + 1.7 * Math.pow(sp0 - 1, 2) : 1; // back-out
      const sc = sim.escale[i] * Math.max(0.01, pop);
      const bob = Math.sin(this.time * (def.boss ? 4 : 11) + i * 1.7) * 0.07;
      // Ausholen: Wind-up streckt den Körper
      const wind = sim.eState[i] === 1 ? 0.15 : 0;
      setM(this.enemyMesh[t].instanceMatrix.array as Float32Array, kk * 16, x, y, z, this.enemyYaw[i], sc * (1 - bob * 0.5), sc * (1 + bob + wind), sc * (1 - bob * 0.5));
      // Bosse werden dauernd getroffen: nur leicht aufblitzen, sonst sieht man sie nur weiß
      const hit = Math.max(0, sim.eflash[i] * (def.boss ? 0.3 : 1), sim.efrz[i] > 0 ? 0.55 : 0);
      (this.enemyFlash[t].array as Float32Array)[kk] = hit > 0.02 || !sim.eElite[i] ? hit : -0.38 - 0.12 * Math.sin(this.time * 5 + i);
      if (sim.eElite[i] && nb < MAX_BARS) {
        const frac = Math.max(0, sim.ehp[i] / sim.emax[i]), w = 1.6 * sc;
        const by = y + def.tall * sc + 0.6;
        q.copy(this.camera.quaternion);
        this.tmpM.compose(this.tmpV.set(x, by, z), q, this.tmpS.set(w + 0.1, 1, 1));
        this.barBg.setMatrixAt(nb, this.tmpM);
        this.tmpM.compose(this.tmpV.set(x - this.camRight.x * w / 2, by - this.camRight.y * w / 2, z - this.camRight.z * w / 2), q, this.tmpS.set(w * frac, 1, 1));
        this.barFill.setMatrixAt(nb++, this.tmpM);
      }
      const gy = def.flying ? y - 1.8 : y;
      const sr = def.radius * sim.escale[i] * 1.1;
      setM(sh, ns++ * 16, x, gy + 0.05, z, 0, sr, 1, sr);
    }
    for (let t = 0; t < ENEMIES.length; t++) {
      const m = this.enemyMesh[t];
      m.count = this.counts[t];
      m.instanceMatrix.needsUpdate = true;
      this.enemyFlash[t].needsUpdate = true;
    }
    this.shadows.count = ns;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.barBg.count = nb; this.barFill.count = nb;
    this.barBg.instanceMatrix.needsUpdate = true; this.barFill.instanceMatrix.needsUpdate = true;

    // Projektile
    const pc = [0, 0, 0, 0, 0];
    const pa = this.proj.map((m) => m.instanceMatrix.array as Float32Array);
    for (let i = 0; i < sim.qHigh; i++) {
      if (!sim.qAlive[i]) continue;
      const kind = sim.qKind[i];
      const x = sim.qpx[i] + (sim.qx[i] - sim.qpx[i]) * alpha;
      const y = sim.qpy[i] + (sim.qy[i] - sim.qpy[i]) * alpha;
      const z = sim.qpz[i] + (sim.qz[i] - sim.qpz[i]) * alpha;
      const straight = kind === P_SPEAR || kind === P_SHARD || kind === P_BULLET;
      const yaw = straight ? Math.atan2(sim.qvx[i], sim.qvz[i]) : this.time * 3 + i;
      const s = straight ? 1 : sim.qr[i] / 3.5 + 0.3;
      if (straight || pc[kind] < 64) setM(pa[kind], pc[kind]++ * 16, x, y, z, yaw, s, s, s);
    }
    this.proj.forEach((m, k) => { m.count = pc[k]; m.instanceMatrix.needsUpdate = true; });

    // Wirbelklingen
    const bw = sim.weapons.find((w) => w.id === W_BLADES);
    if (bw) {
      const { count, radius } = bladeLayout(bw.level, sim.stats.area);
      const ba = this.blades.instanceMatrix.array as Float32Array;
      for (let k2 = 0; k2 < count; k2++) {
        const a = bw.angle + (k2 / count) * Math.PI * 2;
        setM(ba, k2 * 16, hx + Math.sin(a) * radius, hy + 0.9, hz + Math.cos(a) * radius, a + Math.PI / 2 + this.time * 10, 1.1, 1.1, 1.1);
      }
      this.blades.count = count;
      this.blades.instanceMatrix.needsUpdate = true;
    } else this.blades.count = 0;

    // XP-Kugeln & Gold
    const oa = this.orbs.instanceMatrix.array as Float32Array, ca = this.coins.instanceMatrix.array as Float32Array;
    const ha = this.hearts.instanceMatrix.array as Float32Array, ma = this.magnets.instanceMatrix.array as Float32Array;
    let no = 0, nc = 0, nh = 0, nm = 0;
    const nbf = [0, 0, 0];
    for (let i = 0; i < sim.kHigh; i++) {
      if (!sim.kAlive[i]) continue;
      const bobY = sim.kMag[i] ? 0 : Math.sin(this.time * 3 + i) * 0.15;
      const kind = sim.kKind[i];
      if (kind === 0) {
        const big = Math.min(2.2, 1 + Math.sqrt(sim.kval[i]) * 0.25);
        setM(oa, no++ * 16, sim.kx[i], sim.ky[i] + bobY, sim.kz[i], this.time * 2 + i, big, big, big);
      } else if (kind === 1) setM(ca, nc++ * 16, sim.kx[i], sim.ky[i] + bobY, sim.kz[i], this.time * 4 + i, 1, 1, 1);
      else if (kind === 2 && nh < 256) {
        const pulse = 1.5 + Math.sin(this.time * 6) * 0.12;
        setM(ha, nh++ * 16, sim.kx[i], sim.ky[i] + 0.3 + bobY, sim.kz[i], this.time * 2, pulse, pulse, pulse);
      } else if (kind === 3 && nm < 64) {
        const pulse = 1.8 + Math.sin(this.time * 8) * 0.2;
        setM(ma, nm++ * 16, sim.kx[i], sim.ky[i] + 0.5 + bobY, sim.kz[i], this.time * 3, pulse, pulse, pulse);
      } else if (kind >= K_BUFF) {
        const b = kind - K_BUFF;
        if (nbf[b] < 64) {
          const pulse = 1.6 + Math.sin(this.time * 7 + b) * 0.25;
          setM(this.buffMeshes[b].instanceMatrix.array as Float32Array, nbf[b]++ * 16, sim.kx[i], sim.ky[i] + 0.7 + bobY, sim.kz[i], this.time * 2.5, pulse, pulse, pulse);
        }
      }
    }
    this.buffMeshes.forEach((m, b) => { m.count = nbf[b]; m.instanceMatrix.needsUpdate = true; });
    this.orbs.count = no; this.coins.count = nc; this.hearts.count = nh; this.magnets.count = nm;
    this.orbs.instanceMatrix.needsUpdate = true; this.coins.instanceMatrix.needsUpdate = true;
    this.hearts.instanceMatrix.needsUpdate = true; this.magnets.instanceMatrix.needsUpdate = true;

    // Katana: ruht schräg an der Seite, schwingt bei jedem Hieb durch den Bogen
    const hasKatana = sim.weapons.some((w) => w.id === W_KATANA);
    this.katana.visible = hasKatana;
    if (hasKatana) {
      this.katanaT = Math.min(1, this.katanaT + dt / 0.16);
      const side = this.heroYaw - Math.PI / 2;
      if (this.katanaT < 1) {
        const e = 1 - Math.pow(1 - this.katanaT, 3);
        const a = sim.katanaSwing - 1.2 + 2.4 * e;
        this.katana.position.set(hx, hy + 1.1, hz);
        this.katana.rotation.set(0.1, a, 0, 'YXZ');
      } else {
        this.katana.position.set(hx + Math.sin(side) * 0.5, hy + 1.0 + run, hz + Math.cos(side) * 0.5);
        this.katana.rotation.set(-1.0, this.heroYaw + Math.PI, 0, 'YXZ');
      }
    }

    // Pistole in der Hand, zielt auf den Gegner
    const hasPistol = sim.weapons.some((w) => w.id === W_PISTOL);
    this.pistol.visible = hasPistol;
    if (hasPistol) {
      this.pistolKick = Math.max(0, this.pistolKick - dt * 10);
      const a = sim.pistolAim, side = this.heroYaw + Math.PI / 2;
      const back = this.pistolKick * 0.15;
      this.pistol.position.set(hx + Math.sin(side) * 0.45 - Math.sin(a) * back, hy + 1.05 + run, hz + Math.cos(side) * 0.45 - Math.cos(a) * back);
      this.pistol.rotation.set(-this.pistolKick * 0.4, a, 0, 'YXZ');
    }
    // Schutzblase sichtbar, solange sie bereit ist
    this.bubble.visible = (sim.items[I_BUBBLE] > 0 && sim.shieldT <= 0) || sim.buffT[2] > 0;
    if (this.bubble.visible) {
      this.bubble.position.set(hx, hy + 1, hz);
      this.bubble.scale.setScalar(1 + Math.sin(this.time * 3) * 0.04);
    }

    this.world?.update(this.time);
    this.fx.tele.update(sim);
    this.fx.update(dt);

    // Pollen treiben lassen und um den Helden herum "umklappen"
    const pa2 = this.pollen.geometry.attributes.position as THREE.BufferAttribute;
    const P2 = pa2.array as Float32Array, V = this.pollenVel;
    for (let i = 0; i < P2.length; i += 3) {
      P2[i] += (V[i] + Math.sin(this.time * 0.7 + i) * 0.25) * dt;
      P2[i + 1] += V[i + 1] * dt;
      P2[i + 2] += (V[i + 2] + Math.cos(this.time * 0.6 + i) * 0.25) * dt;
      const dx = P2[i] - this.camT.x, dz = P2[i + 2] - this.camT.z;
      if (dx > 25) P2[i] -= 50; else if (dx < -25) P2[i] += 50;
      if (dz > 25) P2[i + 2] -= 50; else if (dz < -25) P2[i + 2] += 50;
      if (P2[i + 1] > this.camT.y + 12 || P2[i + 1] < this.camT.y - 2) P2[i + 1] = this.camT.y + Math.random() * 2;
    }
    pa2.needsUpdate = true;

    if (this.hq) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
