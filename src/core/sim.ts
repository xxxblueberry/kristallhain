// Spielsimulation – reines TypeScript ohne Rendering. Alle Massendaten liegen in typisierten Arrays (SoA),
// damit tausende Gegner, Projektile und Kugeln ohne Garbage-Collection laufen.
import { Rng } from './rng';
import { Terrain, HALF, WORLD } from './terrain';
import { Grid } from './grid';
import {
  ENEMIES, PASSIVES, ITEMS, RARITIES, MAX_ENEMIES, MAX_PROJ, MAX_PICK, MAX_TELE, BOSSES, FINAL_BOSS, ELITE, W_RELICS,
  E_BEETLE, E_WOLF, E_SHAMAN, E_WISP, E_GOLEM, E_HYDRA, E_TITAN, E_KING, E_WITCH, E_QUEEN, E_DARK, W_SPEAR, baseStats, type Stats,
  I_THORNS, I_POPBERRY, I_VAMPIRE, I_FROST, I_SOULJAR, I_BUBBLE, I_THUNDERBOOTS, I_BIGHEART, I_PHOENIX, I_STARFALL,
  I_STORMRING, I_BLOODCRYSTAL, I_HUNTER, I_MIDAS, I_SKULL, BUFFS,
} from './data';
import { updateWeapons, newWeapon, type WeaponState } from './weapons';
import { genOffers, applyOffer, offerValid, offerInfo, type Offer } from './upgrades';

// Ereignisse für Rendering/Audio: [typ, a, b, c, d, e, f, g]
export const EV_HIT = 1, EV_KILL = 2, EV_XP = 3, EV_HURT = 4, EV_LEVEL = 5, EV_BOOM = 6, EV_SHOOT = 7,
  EV_JUMP = 8, EV_LAND = 9, EV_CHAIN = 10, EV_NOVA = 11, EV_GOLD = 12, EV_CHEST = 13, EV_HEAL = 14, EV_SHIELD = 15, EV_REVIVE = 16,
  EV_MAGNET = 17, EV_SLASH = 18, EV_BLINK = 19, EV_BUFF = 20, EV_POWER = 21;
export const EV_STRIDE = 8;
const MAX_EV = 6000;

// BOOM-Arten (für Farbe/Wackeln)
export const B_DEATH = 0, B_ENEMY = 1, B_METEOR = 2, B_PLAYER = 3, B_STAR = 4;

export const P_SPEAR = 0, P_SHARD = 1, P_METEOR = 2, P_BULLET = 3, P_STAR = 4;
export const T_CIRCLE = 0, T_LINE = 1;
export const SHRINE_TIME = 0.5;
export const K_XP = 0, K_GOLD = 1, K_HEART = 2, K_MAGNET = 3, K_BUFF = 4; // K_BUFF + 0..2 = Powerups
export const POWER_TIME = 2.5; // so lange im Machtschrein stehen
export { W_RELICS };

// Schwierigkeit über die Zeit (t in Sekunden)
const hpScale = (t: number) => 1 + (t / 60) * 0.45 + Math.pow(t / 60, 2) * 0.045;
const dmgScale = (t: number) => 1 + (t / 60) * 0.12;
const speedScale = (t: number) => 1 + Math.min(0.3, t / 2400);

export const PROP_TREE_PINK = 0, PROP_TREE_MINT = 1, PROP_ROCK = 2, PROP_DEADTREE = 3, PROP_PILLAR = 4,
  PROP_CRYSTAL = 5, PROP_OBELISK = 6, PROP_GRAVE = 7;
export const PROP_KINDS = 8;
export interface Prop { kind: number; x: number; y: number; z: number; s: number; rot: number; r: number; h: number }

export type Mode = 'run' | 'levelup' | 'shop' | 'chest' | 'dead' | 'won';
// kind: 0 Händler-Schrein, 1 Truhe, 2 Machtschrein (dauerhafter Werte-Bonus)
export interface Interactable { kind: 0 | 1 | 2; x: number; y: number; z: number; used: boolean; hold: number }

const TAU = Math.PI * 2;
const LIM = HALF - 3;
const clampW = (v: number) => (v < -LIM ? -LIM : v > LIM ? LIM : v);
const xpFor = (l: number) => Math.floor(5 + (l - 1) * 4.5 + Math.pow(l - 1, 1.7) * 0.6);

export class Sim {
  readonly rng: Rng;
  readonly terrain: Terrain;
  readonly grid = new Grid(WORLD + 40, 4, MAX_ENEMIES);
  time = 0;
  mode: Mode = 'run';
  hitStop = 0;
  private winT = 0;

  // ---- Held ----
  hx = 0; hy = 0; hz = 0; phx = 0; phy = 0; phz = 0;
  vy = 0; airborne = false; coyote = 0; jumpBuf = 0; jumpsLeft = 0; jumped = false; fallTop = 0;
  fx = 0; fz = 1; moving = false;
  hp = 100; iframe = 0;
  level = 1; xp = 0; xpNext = xpFor(1); pendingLevels = 0;
  gold = 0; kills = 0; private goldAcc = 0;
  stats: Stats = baseStats();
  weapons: WeaponState[] = [];
  passives = new Uint8Array(PASSIVES.length); // Anzahl je Fähigkeit
  passiveList: { id: number; r: number }[] = []; // mit Seltenheit
  items = new Uint8Array(ITEMS.length);
  private bonusHp = 0;
  shieldT = 0; // 0 = Schutzblase bereit
  buffT = new Float32Array(BUFFS.length); // Restzeit je Powerup
  private bloodAcc = 0;
  private starT = 3;
  pistolAim = 0;
  weaponDamage = new Float64Array(16);
  katanaSwing = 0; // Richtung des letzten Katana-Hiebs (für Rendering)
  inX = 0; inZ = 0; // Bewegungseingabe in Weltkoordinaten

  // ---- Gegner ----
  eAlive = new Uint8Array(MAX_ENEMIES);
  eType = new Uint8Array(MAX_ENEMIES);
  eState = new Uint8Array(MAX_ENEMIES);
  ex = new Float32Array(MAX_ENEMIES); ey = new Float32Array(MAX_ENEMIES); ez = new Float32Array(MAX_ENEMIES);
  epx = new Float32Array(MAX_ENEMIES); epy = new Float32Array(MAX_ENEMIES); epz = new Float32Array(MAX_ENEMIES);
  edx = new Float32Array(MAX_ENEMIES); edz = new Float32Array(MAX_ENEMIES);
  ehp = new Float32Array(MAX_ENEMIES); emax = new Float32Array(MAX_ENEMIES);
  eflash = new Float32Array(MAX_ENEMIES); espawn = new Float32Array(MAX_ENEMIES);
  etimer = new Float32Array(MAX_ENEMIES); ecd = new Float32Array(MAX_ENEMIES); ecd2 = new Float32Array(MAX_ENEMIES);
  escale = new Float32Array(MAX_ENEMIES);
  ekx = new Float32Array(MAX_ENEMIES); ekz = new Float32Array(MAX_ENEMIES);
  eslow = new Float32Array(MAX_ENEMIES); efrz = new Float32Array(MAX_ENEMIES); eblade = new Float32Array(MAX_ENEMIES);
  eaux = new Float32Array(MAX_ENEMIES); eaux2 = new Float32Array(MAX_ENEMIES);
  eElite = new Uint8Array(MAX_ENEMIES); edmg = new Float32Array(MAX_ENEMIES);
  eHigh = 0; eCount = 0;
  bossIdx = -1;

  // ---- Projektile ----
  qAlive = new Uint8Array(MAX_PROJ); qKind = new Uint8Array(MAX_PROJ); qW = new Uint8Array(MAX_PROJ);
  qx = new Float32Array(MAX_PROJ); qy = new Float32Array(MAX_PROJ); qz = new Float32Array(MAX_PROJ);
  qpx = new Float32Array(MAX_PROJ); qpy = new Float32Array(MAX_PROJ); qpz = new Float32Array(MAX_PROJ);
  qvx = new Float32Array(MAX_PROJ); qvy = new Float32Array(MAX_PROJ); qvz = new Float32Array(MAX_PROJ);
  qlife = new Float32Array(MAX_PROJ); qdmg = new Float32Array(MAX_PROJ); qr = new Float32Array(MAX_PROJ);
  qpierce = new Int16Array(MAX_PROJ); qbounce = new Int16Array(MAX_PROJ);
  qhits = new Int32Array(MAX_PROJ * 8); qhitN = new Uint8Array(MAX_PROJ);
  qHigh = 0;

  // ---- Pickups (0 XP, 1 Gold, 2 Herz) ----
  kAlive = new Uint8Array(MAX_PICK); kKind = new Uint8Array(MAX_PICK); kMag = new Uint8Array(MAX_PICK);
  kx = new Float32Array(MAX_PICK); ky = new Float32Array(MAX_PICK); kz = new Float32Array(MAX_PICK);
  kval = new Float32Array(MAX_PICK); kspd = new Float32Array(MAX_PICK);
  kHigh = 0; kCount = 0;

  // ---- Warnflächen (Telegraphs) ----
  tAlive = new Uint8Array(MAX_TELE); tKind = new Uint8Array(MAX_TELE);
  tx = new Float32Array(MAX_TELE); tz = new Float32Array(MAX_TELE);
  tr = new Float32Array(MAX_TELE); tlen = new Float32Array(MAX_TELE); tang = new Float32Array(MAX_TELE);
  ttime = new Float32Array(MAX_TELE); tdur = new Float32Array(MAX_TELE); tdmg = new Float32Array(MAX_TELE);

  // ---- Welt & Meta ----
  props: Prop[] = [];
  private propGrid: Grid;
  interact: Interactable[] = [];
  chestCost = 10;
  interactProgress = 0; interactLabel = '';
  banner = ''; bannerT = 0; toast = ''; toastT = 0;
  offers: Offer[] = []; shopOffers: Offer[] = []; chestOffers: Offer[] = []; rerollCost = 5;
  chestTitle = '';
  ev = new Float32Array(MAX_EV * EV_STRIDE); evN = 0;

  // Puffer für Rasterabfragen (getrennt, da teils verschachtelt)
  readonly qA = new Int32Array(MAX_ENEMIES);
  readonly qB = new Int32Array(MAX_ENEMIES);
  readonly qC = new Int32Array(MAX_ENEMIES);
  private readonly qD = new Int32Array(MAX_ENEMIES);
  private readonly qN = new Int32Array(MAX_ENEMIES);
  private readonly dN = new Float32Array(MAX_ENEMIES);
  private readonly qP = new Int32Array(256);
  private cx = 0; private cz = 0;
  private pendingBooms: number[] = [];
  private pendingZaps: number[] = [];

  private spawnAcc = 0;
  private nextSwarm = 95;
  private bossIdxNext = 0;
  private nextElite = ELITE.start;

  constructor(seed: number, public maxAlive = 1100) {
    this.rng = new Rng(seed);
    this.terrain = new Terrain(seed);
    this.hy = this.phy = this.terrain.height(0, 0);
    this.placeInteractables();
    this.propGrid = new Grid(WORLD + 40, 8, 2000);
    this.placeProps(seed);
    this.weapons.push(newWeapon(W_SPEAR));
  }

  r(): number { return this.rng.next(); }

  emit(t: number, a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0) {
    if (this.evN >= MAX_EV) return;
    const o = this.evN++ * EV_STRIDE, v = this.ev;
    v[o] = t; v[o + 1] = a; v[o + 2] = b; v[o + 3] = c; v[o + 4] = d; v[o + 5] = e; v[o + 6] = f; v[o + 7] = g;
  }

  setBanner(text: string) { this.banner = text; this.bannerT = 3; }

  recalcStats() {
    const oldMax = this.stats.maxHp;
    const s = baseStats();
    for (const p of this.passiveList) PASSIVES[p.id].apply(s, RARITIES[p.r].mult);
    for (let i = 0; i < ITEMS.length; i++) for (let k = 0; k < this.items[i]; k++) ITEMS[i].apply?.(s);
    s.maxHp += this.bonusHp;
    this.stats = s;
    if (s.maxHp > oldMax) this.hp += s.maxHp - oldMax;
    this.hp = Math.min(this.hp, s.maxHp);
  }

  addItem(id: number) {
    this.items[id]++;
    this.recalcStats();
    if (id === I_BIGHEART) this.heal(50);
  }

  heal(v: number) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + v);
    if (this.hp - before >= 0.5) this.emit(EV_HEAL, this.hx, this.hy, this.hz, this.hp - before);
  }

  // ================= Hauptschritt =================
  step(dt: number) {
    if (this.mode !== 'run') return;
    this.time += dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.toastT > 0) this.toastT -= dt;
    this.updateHero(dt);
    this.buildGrid();
    this.director(dt);
    this.updateEnemies(dt);
    updateWeapons(this, dt);
    this.updateRelics(dt);
    this.updateProjectiles(dt);
    this.updateTele(dt);
    this.flushBooms();
    this.updatePickups(dt);
    this.updateInteract(dt);
    if (this.winT > 0) {
      this.winT -= dt;
      if (this.winT <= 0) this.mode = 'won';
      return;
    }
    if (this.mode === 'run' && this.pendingLevels > 0) {
      this.mode = 'levelup';
      this.offers = genOffers(this, 'level', 3);
    }
  }

  // ================= Held =================
  private canEnter(x: number, z: number, dist: number): boolean {
    const g = this.terrain.height(x, z);
    if (this.airborne) return g <= this.hy + 0.15;
    return g <= this.hy + 0.02 + dist * 0.6; // steiler als ~31° = Wand (Terrassen nur per Sprung)
  }

  // schiebt einen Kreis aus Bäumen/Felsen heraus; Ergebnis in cx/cz
  private collideProps(x: number, z: number, feet: number, r: number) {
    const n = this.propGrid.query(x, z, r + 2.5, this.qP);
    for (let k = 0; k < n; k++) {
      const p = this.props[this.qP[k]];
      if (feet - p.y > p.h) continue; // drübergesprungen
      const dx = x - p.x, dz = z - p.z, rr = p.r + r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.001;
      x = p.x + (dx / d) * rr; z = p.z + (dz / d) * rr;
    }
    this.cx = x; this.cz = z;
  }

  private updateHero(dt: number) {
    const s = this.stats;
    this.phx = this.hx; this.phy = this.hy; this.phz = this.hz;
    if (this.iframe > 0) this.iframe -= dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    for (let b = 0; b < this.buffT.length; b++) if (this.buffT[b] > 0) this.buffT[b] -= dt;
    if (s.regen > 0) this.hp = Math.min(s.maxHp, this.hp + s.regen * dt);

    let mx = this.inX, mz = this.inZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    this.moving = ml > 0.1;
    if (this.moving) { const l = Math.hypot(mx, mz); this.fx = mx / l; this.fz = mz / l; }
    const sp = 7.5 * s.speed * (this.airborne ? s.airSpeed : 1) * (this.buffT[1] > 0 ? 1.45 : 1) * dt;
    const nx = clampW(this.hx + mx * sp), nz = clampW(this.hz + mz * sp);
    if (this.canEnter(nx, this.hz, Math.abs(nx - this.hx))) this.hx = nx;
    if (this.canEnter(this.hx, nz, Math.abs(nz - this.hz))) this.hz = nz;
    this.collideProps(this.hx, this.hz, this.hy, 0.45);
    if (this.canEnter(this.cx, this.cz, 0.3)) { this.hx = this.cx; this.hz = this.cz; }

    const g = this.terrain.height(this.hx, this.hz);
    if (!this.airborne) { this.coyote = 0.1; this.jumpsLeft = s.extraJumps; } else this.coyote -= dt;
    if (this.jumpBuf > 0) this.jumpBuf -= dt;
    if (this.jumpBuf > 0) {
      const v0 = 11 * Math.sqrt(s.jump);
      if (this.coyote > 0) {
        this.vy = v0; this.airborne = true; this.coyote = 0; this.jumpBuf = 0; this.jumped = true;
        this.emit(EV_JUMP, this.hx, this.hy, this.hz, 0);
      } else if (this.airborne && this.jumpsLeft > 0) {
        this.jumpsLeft--;
        this.vy = v0 * 0.92; this.jumpBuf = 0; this.jumped = true;
        this.emit(EV_JUMP, this.hx, this.hy, this.hz, 1);
      }
    }
    if (this.airborne) {
      this.vy -= 28 * dt;
      this.hy += this.vy * dt;
      if (this.hy > this.fallTop) this.fallTop = this.hy;
      if (this.hy <= g) {
        // Fallschaden ab ~4,5 m Sturzhöhe – tut weh, tötet aber nie
        const drop = this.fallTop - g;
        if (drop > 4.5 && this.mode === 'run') {
          const dmg = Math.round((drop - 4.5) * 3.5 + 3);
          this.hp = Math.max(1, this.hp - dmg);
          this.emit(EV_HURT, this.hx, g, this.hz, dmg);
          this.hitStop = Math.max(this.hitStop, 0.05);
        }
        if (this.vy < -4) {
          this.emit(EV_LAND, this.hx, g, this.hz, -this.vy);
          const n = this.items[I_THUNDERBOOTS];
          if (n && this.jumped) {
            this.aoe(this.hx, this.hz, 4.5, 35 * n * s.dmg, 8, W_RELICS);
            this.emit(EV_BOOM, this.hx, g, this.hz, 4.5, B_PLAYER);
          }
        }
        this.hy = g; this.vy = 0; this.airborne = false; this.jumped = false;
      }
    } else if (g < this.hy - 0.5 || this.hy - g > 0.05 + Math.hypot(this.hx - this.phx, this.hz - this.phz) * 1.1) {
      // Kante oder steiler Abhang: nicht runterrutschen, sondern fallen
      this.airborne = true; this.vy = 0; this.fallTop = this.hy;
    } else this.hy = g;
    if (!this.airborne) this.fallTop = this.hy;
  }

  hurt(dmg: number) {
    if (this.iframe > 0 || this.mode !== 'run' || this.winT > 0 || this.buffT[2] > 0) return;
    const nb = this.items[I_BUBBLE];
    if (nb && this.shieldT <= 0) {
      this.shieldT = 12 - 2 * (nb - 1);
      this.iframe = 0.5;
      this.emit(EV_SHIELD, this.hx, this.hy, this.hz);
      return;
    }
    const real = dmg * (10 / (10 + this.stats.armor));
    this.hp -= real;
    this.iframe = 0.45;
    this.hitStop = Math.max(this.hitStop, 0.06);
    this.emit(EV_HURT, this.hx, this.hy, this.hz, real);
    const nt = this.items[I_THORNS];
    if (nt) {
      this.aoe(this.hx, this.hz, 5, 30 * nt * this.stats.dmg, 10, W_RELICS);
      this.emit(EV_BOOM, this.hx, this.hy, this.hz, 5, B_PLAYER);
    }
    if (this.hp <= 0) {
      if (this.items[I_PHOENIX] > 0) {
        this.items[I_PHOENIX]--;
        this.hp = this.stats.maxHp * 0.5;
        this.iframe = 2.5;
        this.aoe(this.hx, this.hz, 9, 200 * this.stats.dmg, 20, W_RELICS);
        this.emit(EV_REVIVE, this.hx, this.hy, this.hz);
        this.setBanner('Phönixfeder – wiederbelebt!');
      } else {
        this.hp = 0;
        this.mode = 'dead';
      }
    }
  }

  // Flächenschaden um einen Punkt (eigener Abfragepuffer)
  aoe(x: number, z: number, R: number, dmg: number, kb: number, w: number) {
    const q = this.qD, n = this.grid.query(x, z, R + 4, q);
    for (let k = 0; k < n; k++) {
      const j = q[k];
      if (!this.eAlive[j]) continue;
      const rr = R + ENEMIES[this.eType[j]].radius * this.escale[j];
      const dx = this.ex[j] - x, dz = this.ez[j] - z;
      if (dx * dx + dz * dz < rr * rr) this.damageEnemy(j, dmg, x, z, kb, w);
    }
  }

  private flushBooms() {
    let guard = 0;
    while (this.pendingBooms.length && guard++ < 40) {
      const [x, z, dmg] = this.pendingBooms.splice(0, 3);
      this.aoe(x, z, 3.2, dmg, 6, W_RELICS);
      this.emit(EV_BOOM, x, this.terrain.height(x, z), z, 3.2, B_METEOR);
    }
    this.pendingBooms.length = 0;
    // Sturmring: Krit-Blitze zum nächsten Gegner
    for (let k = 0; k + 3 < this.pendingZaps.length && k < 160; k += 4) {
      const [x, y, z, dmg] = this.pendingZaps.slice(k, k + 4);
      const m = this.nearest(x, z, 7, 2, this.qC);
      const j = m > 1 ? this.qC[1] : -1; // [0] ist meist der getroffene Gegner selbst
      if (j < 0) continue;
      this.emit(EV_CHAIN, x, y, z, this.ex[j], this.ey[j] + 1, this.ez[j]);
      this.damageEnemy(j, dmg, x, z, 2, W_RELICS);
    }
    this.pendingZaps.length = 0;
  }

  private updateRelics(dt: number) {
    const n = this.items[I_STARFALL];
    if (!n) return;
    this.starT -= dt;
    if (this.starT > 0) return;
    this.starT = 5;
    const m = this.nearest(this.hx, this.hz, 22, 30, this.qC);
    if (!m) { this.starT = 0.5; return; }
    for (let k = 0; k < 5; k++) {
      const j = this.qC[Math.floor(this.r() * m)];
      const tx = this.ex[j], tz = this.ez[j], g = this.terrain.height(tx, tz);
      this.spawnProj(P_STAR, tx + 3, g + 24, tz + 1, -3 / 0.62, -28, -1 / 0.62, 5, 50 * n * this.stats.dmg, 0, 0, W_RELICS, 2.6);
    }
  }

  // ================= Welt aufbauen =================
  private placeInteractables() {
    const T = this.terrain;
    const put = (kind: 0 | 1 | 2, minD: number, maxD: number) => {
      for (let tries = 0; tries < 60; tries++) {
        const a = this.r() * TAU, d = minD + this.r() * (maxD - minD);
        const x = Math.sin(a) * d, z = Math.cos(a) * d;
        if (Math.abs(x) > LIM - 8 || Math.abs(z) > LIM - 8) continue;
        if (this.interact.some((o) => Math.hypot(o.x - x, o.z - z) < (kind === 1 ? 10 : 26))) continue;
        const y = T.height(x, z);
        if (Math.abs(T.height(x + 1.5, z) - y) > 0.35 || Math.abs(T.height(x, z + 1.5) - y) > 0.35) continue;
        this.interact.push({ kind, x, y, z, used: false, hold: 0 });
        return;
      }
    };
    put(0, 22, 30); put(1, 12, 18); put(1, 14, 22); put(2, 26, 40);
    for (let i = 0; i < 9; i++) put(0, 45, LIM);
    for (let i = 0; i < 13; i++) put(2, 40, LIM);
    for (let i = 0; i < 34; i++) put(1, 28, LIM);
  }

  private placeProps(seed: number) {
    const rng = new Rng(seed + 101), T = this.terrain;
    // Kollisionsradius r und Höhe h (drüberspringbar, wenn niedrig) je Art, bezogen auf Skalierung 1
    const SHAPE: Record<number, [number, number]> = {
      [PROP_TREE_PINK]: [0.55, 99], [PROP_TREE_MINT]: [0.55, 99], [PROP_ROCK]: [1.0, 0.9], [PROP_DEADTREE]: [0.45, 99],
      [PROP_PILLAR]: [0.75, 99], [PROP_CRYSTAL]: [1.1, 99], [PROP_OBELISK]: [0.9, 99], [PROP_GRAVE]: [0.45, 1.0],
    };
    // biome: [min, max] des Biom-Werts, in dem die Art vorkommt
    const add = (kind: number, count: number, minS: number, maxS: number, bMin = 0, bMax = 1) => {
      let k = 0;
      for (let tries = 0; tries < count * 10 && k < count; tries++) {
        const x = rng.range(-HALF + 6, HALF - 6), z = rng.range(-HALF + 6, HALF - 6);
        if (x * x + z * z < 14 * 14) continue;
        const b = T.biome(x, z);
        if (b < bMin || b > bMax) continue;
        const y = T.height(x, z);
        if (Math.abs(T.height(x + 1, z) - y) > 0.5 || Math.abs(T.height(x, z + 1) - y) > 0.5) continue;
        if (this.interact.some((o) => Math.abs(o.x - x) < 5 && Math.abs(o.z - z) < 5)) continue;
        const s = rng.range(minS, maxS);
        const [r, h] = SHAPE[kind];
        this.propGrid.insert(this.props.length, x, z);
        this.props.push({ kind, x, y, z, s, rot: rng.next() * TAU, r: r * s, h: h * s });
        k++;
      }
    };
    // Hain (Mitte des Biom-Bereichs): Bäume; Totholz (niedrig): kahle Bäume & Gräber; Kristallfeld (hoch): Kristalle & Obelisken
    add(PROP_TREE_PINK, 110, 0.8, 1.5, 0.3, 0.7);
    add(PROP_TREE_MINT, 110, 0.8, 1.6, 0.3, 0.7);
    add(PROP_DEADTREE, 120, 0.9, 1.6, 0, 0.42);
    add(PROP_GRAVE, 70, 0.8, 1.2, 0, 0.4);
    add(PROP_CRYSTAL, 80, 0.8, 1.8, 0.58, 1);
    add(PROP_OBELISK, 22, 1, 1.4, 0.6, 1);
    add(PROP_PILLAR, 70, 0.8, 1.3); // Ruinen überall verstreut
    add(PROP_ROCK, 150, 0.5, 1.8);
  }

  // ================= Spawns =================
  spawnEnemy(type: number, x = NaN, z = NaN, elite = false): number {
    let i = -1;
    for (let k = 0; k < MAX_ENEMIES; k++) if (!this.eAlive[k]) { i = k; break; }
    if (i < 0) return -1;
    if (Number.isNaN(x)) {
      const a = this.r() * TAU, d = 34 + this.r() * 10;
      x = this.hx + Math.sin(a) * d; z = this.hz + Math.cos(a) * d;
    }
    x = clampW(x); z = clampW(z);
    const d = ENEMIES[type];
    const t = this.time;
    const tScale = d.boss ? 1 : hpScale(t);
    const scale = elite ? (type === E_GOLEM ? 1.9 : ELITE.scale) : 1;
    const hpMul = elite ? ELITE.hp : 1;
    this.eElite[i] = elite ? 1 : 0;
    this.edmg[i] = d.dmg * (d.boss ? 1 : dmgScale(t)) * (elite ? ELITE.dmg : 1);
    this.eAlive[i] = 1; this.eType[i] = type; this.eState[i] = 0;
    this.ex[i] = this.epx[i] = x; this.ez[i] = this.epz[i] = z;
    this.ey[i] = this.epy[i] = this.terrain.height(x, z) + (d.flying ? 1.8 : 0);
    this.edx[i] = 0; this.edz[i] = 1;
    this.ehp[i] = this.emax[i] = d.hp * tScale * hpMul;
    this.escale[i] = scale; this.eflash[i] = 0; this.espawn[i] = 0;
    this.etimer[i] = 0; this.ecd[i] = 1 + this.r() * 2; this.ecd2[i] = 6;
    this.ekx[i] = this.ekz[i] = 0; this.eslow[i] = 0; this.efrz[i] = 0; this.eblade[i] = 0; this.eaux[i] = 0; this.eaux2[i] = 0;
    if (i >= this.eHigh) this.eHigh = i + 1;
    this.eCount++;
    if (d.boss) this.bossIdx = i;
    return i;
  }

  private pickType(): number {
    const t = this.time;
    const w0 = 10, w1 = t >= 50 ? 4 + t / 120 : 0, w2 = t >= 110 ? 3 : 0, w3 = t >= 170 ? 3 : 0, w4 = t >= 230 ? 1.2 + t / 400 : 0;
    let p = this.r() * (w0 + w1 + w2 + w3 + w4);
    if ((p -= w0) < 0) return E_BEETLE;
    if ((p -= w1) < 0) return E_WOLF;
    if ((p -= w2) < 0) return E_SHAMAN;
    if ((p -= w3) < 0) return E_WISP;
    return E_GOLEM;
  }

  private director(dt: number) {
    const t = this.time;
    const nb = BOSSES[this.bossIdxNext];
    if (nb && t >= nb.t) {
      this.bossIdxNext++;
      this.spawnEnemy(nb.type);
      this.setBanner(nb.text);
    }
    if (t >= this.nextElite) {
      // Elites werden mit der Zeit häufiger; Typ aus den bereits freigeschalteten
      // nie mehrere auf einmal nachholen (z. B. nach Zeitsprung)
      this.nextElite = Math.max(this.nextElite, t) + Math.max(ELITE.minEvery, ELITE.every - t / 30);
      const type = this.pickType();
      this.spawnEnemy(type, NaN, NaN, true);
      if (this.bannerT <= 0) this.setBanner(`Elite: ${ENEMIES[type].name}!`);
    }
    if (t >= this.nextSwarm) {
      this.nextSwarm = Math.max(this.nextSwarm, t) + 100;
      const type = t > 400 ? E_WOLF : E_BEETLE;
      const n = Math.floor(30 + t / 8);
      const a0 = this.r() * TAU;
      for (let k = 0; k < n; k++) {
        const a = a0 + (this.r() - 0.5) * 1.2, d = 30 + this.r() * 8;
        this.spawnEnemy(type, this.hx + Math.sin(a) * d, this.hz + Math.cos(a) * d);
      }
      this.setBanner('Ein Schwarm kommt!');
    }
    const rate = (1.4 + t * 0.06) * (this.bossIdx >= 0 ? 0.5 : 1);
    this.spawnAcc += dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.eCount < this.maxAlive) this.spawnEnemy(this.pickType());
    }
  }

  // ================= Gegner =================
  private buildGrid() {
    this.grid.clear();
    for (let i = 0; i < this.eHigh; i++) if (this.eAlive[i]) this.grid.insert(i, this.ex[i], this.ez[i]);
  }

  addTele(kind: number, x: number, z: number, r: number, len: number, ang: number, dur: number, dmg: number) {
    for (let i = 0; i < MAX_TELE; i++) {
      if (this.tAlive[i]) continue;
      this.tAlive[i] = 1; this.tKind[i] = kind;
      this.tx[i] = x; this.tz[i] = z; this.tr[i] = r; this.tlen[i] = len; this.tang[i] = ang;
      this.ttime[i] = 0; this.tdur[i] = dur; this.tdmg[i] = dmg;
      return;
    }
  }

  private updateEnemies(dt: number) {
    const hx = this.hx, hz = this.hz, T = this.terrain, q = this.qA;
    for (let i = 0; i < this.eHigh; i++) {
      if (!this.eAlive[i]) continue;
      const t = this.eType[i], d = ENEMIES[t], sc = this.escale[i];
      this.epx[i] = this.ex[i]; this.epy[i] = this.ey[i]; this.epz[i] = this.ez[i];
      if (this.eflash[i] > 0) this.eflash[i] -= dt * 7;
      if (this.eblade[i] > 0) this.eblade[i] -= dt;
      if (this.espawn[i] < 1) this.espawn[i] = Math.min(1, this.espawn[i] + dt * 3);

      let dx = hx - this.ex[i], dz = hz - this.ez[i];
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist, nz = dz / dist;

      // zu weit weg: vor den Helden versetzen statt verschwenden
      if (!d.boss && dist > 80) {
        const a = Math.atan2(this.fx, this.fz) + (this.r() - 0.5) * 1.8, r = 36 + this.r() * 6;
        this.ex[i] = this.epx[i] = clampW(hx + Math.sin(a) * r);
        this.ez[i] = this.epz[i] = clampW(hz + Math.cos(a) * r);
        this.ey[i] = this.epy[i] = T.height(this.ex[i], this.ez[i]) + (d.flying ? 1.8 : 0);
        continue;
      }

      let slow = 1;
      if (this.eslow[i] > 0) { this.eslow[i] -= dt; slow = 0.45; }
      let mvx = nx, mvz = nz, spd = d.speed * slow * (d.boss ? 1 : speedScale(this.time)) * (this.eElite[i] ? 1.1 : 1);
      const edmg = this.edmg[i];
      const frozen = this.efrz[i] > 0;

      if (frozen) {
        this.efrz[i] -= dt;
        spd = 0;
      } else {
        this.ecd[i] -= dt; this.ecd2[i] -= dt; this.etimer[i] -= dt;
        switch (t) {
          case E_WOLF: {
            const st = this.eState[i];
            if (st === 0 && dist < 11 && this.ecd[i] <= 0) {
              this.eState[i] = 1; this.etimer[i] = 0.65; this.eaux[i] = nx; this.eaux2[i] = nz;
              this.addTele(T_LINE, this.ex[i], this.ez[i], 0.9, 11, Math.atan2(nx, nz), 0.65, 0);
            }
            if (st === 1) {
              spd = 0; mvx = this.eaux[i]; mvz = this.eaux2[i];
              if (this.etimer[i] <= 0) { this.eState[i] = 2; this.etimer[i] = 0.5; }
            } else if (st === 2) {
              mvx = this.eaux[i]; mvz = this.eaux2[i]; spd = 22;
              if (this.etimer[i] <= 0) { this.eState[i] = 0; this.ecd[i] = 3 + this.r() * 2; }
            }
            break;
          }
          case E_SHAMAN: {
            if (dist < 9) { mvx = -nx; mvz = -nz; }
            else if (dist < 14) { mvx = nz; mvz = -nx; spd *= 0.35; }
            if (this.etimer[i] > 0) spd = 0;
            if (this.ecd[i] <= 0 && dist < 22) {
              const px = hx + (this.moving ? this.fx * 2.2 : 0), pz = hz + (this.moving ? this.fz * 2.2 : 0);
              this.addTele(T_CIRCLE, px, pz, 2.6, 0, 0, 1.2, edmg * 1.5);
              this.ecd[i] = 4.5 + this.r() * 2; this.etimer[i] = 0.5;
            }
            break;
          }
          case E_WISP: {
            if (this.eState[i] === 0 && dist < 3.2) {
              this.eState[i] = 1; this.etimer[i] = 0.9;
              this.addTele(T_CIRCLE, this.ex[i], this.ez[i], 3, 0, 0, 0.9, edmg * 2.8);
            }
            if (this.eState[i] === 1) {
              spd = 0;
              if (this.etimer[i] <= 0) {
                this.emit(EV_BOOM, this.ex[i], this.ey[i], this.ez[i], 3, B_ENEMY);
                this.killEnemy(i, false);
                continue;
              }
            }
            break;
          }
          case E_GOLEM: {
            if (this.eState[i] === 0 && dist < 5.5 * sc && this.ecd[i] <= 0) {
              this.eState[i] = 1; this.etimer[i] = 1;
              this.addTele(T_CIRCLE, this.ex[i], this.ez[i], 5.5 * sc, 0, 0, 1, edmg * 1.3);
            }
            if (this.eState[i] === 1) {
              spd = 0;
              if (this.etimer[i] <= 0) { this.eState[i] = 0; this.ecd[i] = 4; }
            }
            break;
          }
          case E_HYDRA: {
            if (dist < 11) spd *= 0.3;
            const enraged = this.ehp[i] < this.emax[i] * 0.5;
            if (this.ecd[i] <= 0) {
              const a0 = Math.atan2(nx, nz);
              const spread = enraged ? [-0.7, -0.35, 0, 0.35, 0.7] : [-0.4, 0, 0.4];
              for (const o of spread) this.addTele(T_LINE, this.ex[i], this.ez[i], 2.4, 34, a0 + o, 1.25, 22);
              this.ecd[i] = enraged ? 3 : 4.2;
              this.etimer[i] = 1.2;
            }
            if (this.etimer[i] > 0) spd = 0;
            if (this.ecd2[i] <= 0) {
              this.ecd2[i] = 9;
              for (let k = 0; k < 8; k++) {
                const a = (k / 8) * TAU;
                this.spawnEnemy(E_BEETLE, this.ex[i] + Math.sin(a) * 5, this.ez[i] + Math.cos(a) * 5);
              }
            }
            break;
          }
          case E_TITAN: {
            const enraged = this.ehp[i] < this.emax[i] * 0.5;
            if (this.ecd[i] <= 0) {
              if (this.eaux[i] % 2 === 0) {
                this.addTele(T_CIRCLE, this.ex[i], this.ez[i], 10, 0, 0, 1.4, 30);
                this.etimer[i] = 1.4;
              } else {
                const n = enraged ? 9 : 6;
                this.addTele(T_CIRCLE, hx, hz, 3, 0, 0, 1.2, 18);
                for (let k = 1; k < n; k++) {
                  const a = this.r() * TAU, r = 2.5 + this.r() * 7;
                  this.addTele(T_CIRCLE, hx + Math.sin(a) * r, hz + Math.cos(a) * r, 3, 0, 0, 1.2 + k * 0.12, 18);
                }
              }
              this.eaux[i]++;
              this.ecd[i] = enraged ? 2.6 : 3.4;
            }
            if (this.etimer[i] > 0) spd = 0;
            break;
          }
          case E_KING: {
            // Ansturm: Linie anzeigen, kurz ausholen, dann durchrennen; ruft Käfer
            const st = this.eState[i], enraged = this.ehp[i] < this.emax[i] * 0.5;
            if (st === 0 && this.ecd[i] <= 0 && dist < 20) {
              this.eState[i] = 1; this.etimer[i] = 0.9; this.eaux[i] = nx; this.eaux2[i] = nz;
              this.addTele(T_LINE, this.ex[i], this.ez[i], 3.2, 20, Math.atan2(nx, nz), 0.9, edmg * 1.5);
            }
            if (st === 1) {
              spd = 0; mvx = this.eaux[i]; mvz = this.eaux2[i];
              if (this.etimer[i] <= 0) { this.eState[i] = 2; this.etimer[i] = 0.75; }
            } else if (st === 2) {
              mvx = this.eaux[i]; mvz = this.eaux2[i]; spd = 26;
              if (this.etimer[i] <= 0) { this.eState[i] = 0; this.ecd[i] = enraged ? 2.2 : 3.6; }
            }
            if (this.ecd2[i] <= 0) {
              this.ecd2[i] = enraged ? 5 : 7;
              for (let k = 0; k < 6; k++) {
                const a = (k / 6) * TAU;
                this.spawnEnemy(E_BEETLE, this.ex[i] + Math.sin(a) * 4, this.ez[i] + Math.cos(a) * 4);
              }
            }
            break;
          }
          case E_WITCH: {
            // Hält Abstand, Sternenring um den Helden, teleportiert sich, ruft Irrlichter
            const enraged = this.ehp[i] < this.emax[i] * 0.5;
            if (dist < 10) { mvx = -nx; mvz = -nz; } else if (dist < 15) { mvx = nz; mvz = -nx; spd *= 0.6; }
            if (this.etimer[i] > 0) spd = 0;
            if (this.ecd[i] <= 0) {
              const n = enraged ? 10 : 8, R = 6.5, a0 = this.r() * TAU;
              for (let k = 0; k < n; k++) {
                const a = a0 + (k / n) * TAU;
                this.addTele(T_CIRCLE, hx + Math.sin(a) * R, hz + Math.cos(a) * R, 2.4, 0, 0, 1.4, edmg);
              }
              this.addTele(T_CIRCLE, hx, hz, 2.4, 0, 0, 1.7, edmg); // Mitte zuletzt: Lücke im Ring suchen
              this.ecd[i] = enraged ? 3.2 : 4.4;
              this.etimer[i] = 0.8;
            }
            if (this.ecd2[i] <= 0) {
              this.ecd2[i] = enraged ? 5.5 : 8;
              this.emit(EV_BLINK, this.ex[i], this.ey[i], this.ez[i]);
              const a = this.r() * TAU;
              this.ex[i] = this.epx[i] = clampW(hx + Math.sin(a) * 13);
              this.ez[i] = this.epz[i] = clampW(hz + Math.cos(a) * 13);
              this.emit(EV_BLINK, this.ex[i], T.height(this.ex[i], this.ez[i]) + 2.5, this.ez[i]);
              for (let k = 0; k < (enraged ? 6 : 4); k++) {
                const b = this.r() * TAU;
                this.spawnEnemy(E_WISP, this.ex[i] + Math.sin(b) * 3, this.ez[i] + Math.cos(b) * 3);
              }
            }
            break;
          }
          case E_QUEEN: {
            // Sternförmige Netzlinien um sich (rotierend), ruft Käfer; wütend zusätzlich Kreise am Helden
            const enraged = this.ehp[i] < this.emax[i] * 0.5;
            if (dist < 8) spd *= 0.4;
            if (this.etimer[i] > 0) spd = 0;
            if (this.ecd[i] <= 0) {
              const n = enraged ? 8 : 6;
              this.eaux[i] += 0.4;
              for (let k = 0; k < n; k++) this.addTele(T_LINE, this.ex[i], this.ez[i], 2, 17, this.eaux[i] + (k / n) * TAU, 1.2, edmg);
              if (enraged) for (let k = 0; k < 3; k++) {
                const a = this.r() * TAU, r = this.r() * 5;
                this.addTele(T_CIRCLE, hx + Math.sin(a) * r, hz + Math.cos(a) * r, 2.6, 0, 0, 1.3, edmg);
              }
              this.ecd[i] = enraged ? 3.2 : 4.4;
              this.etimer[i] = 1;
            }
            if (this.ecd2[i] <= 0) {
              this.ecd2[i] = 7;
              for (let k = 0; k < 6; k++) {
                const a = (k / 6) * TAU;
                this.spawnEnemy(E_BEETLE, this.ex[i] + Math.sin(a) * 4, this.ez[i] + Math.cos(a) * 4);
              }
            }
            break;
          }
          case E_DARK: {
            // Endboss in 3 Phasen. eState 3 = Sprungangriff (landet auf eaux/eaux2)
            const frac = this.ehp[i] / this.emax[i];
            const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
            if (this.eState[i] === 3) {
              spd = 0;
              if (this.etimer[i] <= 0) {
                this.ex[i] = this.epx[i] = clampW(this.eaux[i]);
                this.ez[i] = this.epz[i] = clampW(this.eaux2[i]);
                this.emit(EV_BOOM, this.ex[i], T.height(this.ex[i], this.ez[i]), this.ez[i], 5, B_DEATH);
                this.eState[i] = 0;
              }
              break;
            }
            if (this.etimer[i] > 0) spd = 0;
            if (this.ecd[i] <= 0) {
              const pick = (this.ecd2[i] = (this.ecd2[i] + 1) % 3);
              if (pick === 0) {
                // Klingenstern: 8 (später 12) Linien
                const n = phase === 1 ? 8 : 12, a0 = this.r() * TAU;
                for (let k = 0; k < n; k++) this.addTele(T_LINE, this.ex[i], this.ez[i], 2.4, 24, a0 + (k / n) * TAU, 1.2, edmg);
                this.etimer[i] = 1.2;
              } else if (pick === 1) {
                // Sprungangriff auf die Position des Helden
                this.addTele(T_CIRCLE, hx, hz, 4.8, 0, 0, 1.1, edmg * 1.3);
                this.eState[i] = 3; this.etimer[i] = 1.1; this.eaux[i] = hx; this.eaux2[i] = hz;
                this.emit(EV_BLINK, this.ex[i], this.ey[i] + 2, this.ez[i]);
              } else if (phase >= 3) {
                // Schockwellen: drei wachsende Kreise nacheinander – rauslaufen oder im Takt springen
                for (let k = 0; k < 3; k++) this.addTele(T_CIRCLE, this.ex[i], this.ez[i], 5 + k * 4.5, 0, 0, 1.0 + k * 0.45, edmg);
                this.etimer[i] = 1.2;
              } else {
                // Schattenregen um den Helden
                for (let k = 0; k < (phase === 1 ? 5 : 8); k++) {
                  const a = this.r() * TAU, r = k === 0 ? 0 : 2 + this.r() * 7;
                  this.addTele(T_CIRCLE, hx + Math.sin(a) * r, hz + Math.cos(a) * r, 2.8, 0, 0, 1.2 + k * 0.1, edmg * 0.8);
                }
              }
              this.ecd[i] = phase === 1 ? 3.4 : phase === 2 ? 2.8 : 2.1;
            }
            // ab Phase 2 ruft er regelmäßig Elites
            if (phase >= 2 && this.time % 14 < dt) this.spawnEnemy(this.pickType(), this.ex[i] + 5, this.ez[i], true);
            break;
          }
        }
      }

      // Bewegung + Rückstoß
      const vx = mvx * spd + this.ekx[i], vz = mvz * spd + this.ekz[i];
      const damp = Math.max(0, 1 - dt * 8);
      this.ekx[i] *= damp; this.ekz[i] *= damp;
      let nxp = this.ex[i] + vx * dt, nzp = this.ez[i] + vz * dt;
      if (!d.flying) {
        const g0 = this.ey[i], g1 = T.height(nxp, nzp);
        const stepLen = Math.hypot(vx, vz) * dt;
        if (g1 - g0 > stepLen * 1.0 + 0.02) { // Klippe: nur langsam hochklettern
          nxp = this.ex[i] + vx * dt * 0.3; nzp = this.ez[i] + vz * dt * 0.3;
        }
      }
      if (spd > 0.01 || this.eState[i] === 1) { this.edx[i] = mvx; this.edz[i] = mvz; }

      // Abstoßung von Nachbarn
      const r = d.radius * sc;
      const n = this.grid.query(nxp, nzp, r + 1.6, q);
      let checks = 0;
      for (let k = 0; k < n && checks < 10; k++) {
        const j = q[k];
        if (j === i || !this.eAlive[j]) continue;
        checks++;
        const rj = ENEMIES[this.eType[j]].radius * this.escale[j];
        const rr = r + rj;
        const ddx = nxp - this.ex[j], ddz = nzp - this.ez[j];
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const dd = Math.sqrt(d2);
          const push = ((rr - dd) / dd) * 0.5 * (rj / (r + rj)) * 2;
          nxp += ddx * push * 0.5; nzp += ddz * push * 0.5;
        }
      }
      // Bäume & Felsen (Bosse walzen durch)
      if (!d.flying && !d.boss) {
        this.collideProps(nxp, nzp, this.ey[i], r * 0.8);
        nxp = this.cx; nzp = this.cz;
      }
      this.ex[i] = clampW(nxp); this.ez[i] = clampW(nzp);
      const g = T.height(this.ex[i], this.ez[i]);
      this.ey[i] = d.flying ? g + 1.8 + Math.sin(this.time * 3 + i) * 0.3 : g;

      // Berührungsschaden (über Bodengegner kann man drüberspringen)
      dx = hx - this.ex[i]; dz = hz - this.ez[i];
      if (!frozen && this.iframe <= 0 && dx * dx + dz * dz < (r + 0.5) * (r + 0.5)) {
        const over = !d.flying && this.hy - g > 1.0;
        const charging = (t === E_WOLF || t === E_KING) && this.eState[i] === 2;
        if (!over) this.hurt(edmg * (charging ? 1.6 : 1));
      }
    }
  }

  damageEnemy(i: number, base: number, sx: number, sz: number, kb: number, w: number) {
    if (!this.eAlive[i]) return;
    let dmg = base, crit = 0;
    if (this.buffT[0] > 0) dmg *= 2; // Powerup "Raserei"
    const big = this.eElite[i] || ENEMIES[this.eType[i]].boss;
    if (big && this.items[I_HUNTER]) dmg *= 1 + 0.4 * this.items[I_HUNTER];
    if (this.items[I_SKULL]) dmg *= 1 + Math.min(0.5, (this.kills / 100) * 0.02);
    if (this.r() < this.stats.crit) {
      dmg *= this.stats.critDmg; crit = 1;
      const nz = this.items[I_STORMRING];
      if (nz && w !== W_RELICS && this.r() < 0.3 && this.pendingZaps.length < 200) {
        this.pendingZaps.push(this.ex[i], this.ey[i] + 1, this.ez[i], 20 * nz * this.stats.dmg);
      }
    }
    dmg = Math.max(1, Math.round(dmg * (0.9 + this.r() * 0.2)));
    const nbc = this.items[I_BLOODCRYSTAL];
    if (nbc) {
      this.bloodAcc += Math.min(dmg, this.ehp[i]) * nbc;
      if (this.bloodAcc >= 250) { const hh = Math.floor(this.bloodAcc / 250); this.bloodAcc -= hh * 250; this.hp = Math.min(this.stats.maxHp, this.hp + hh); }
    }
    this.weaponDamage[w] += Math.min(dmg, this.ehp[i]);
    this.ehp[i] -= dmg;
    this.eflash[i] = 1;
    const d = ENEMIES[this.eType[i]];
    if (kb > 0 && !d.boss) {
      const ddx = this.ex[i] - sx, ddz = this.ez[i] - sz, l = Math.hypot(ddx, ddz) || 1;
      const m = kb / (this.escale[i] * this.escale[i]) / (d.radius > 1 ? 3 : 1);
      this.ekx[i] += (ddx / l) * m; this.ekz[i] += (ddz / l) * m;
    }
    const nf = this.items[I_FROST];
    if (nf && !d.boss && this.r() < 0.05 * nf) this.efrz[i] = 1.2;
    this.emit(EV_HIT, this.ex[i], this.ey[i] + d.tall * this.escale[i], this.ez[i], dmg, crit, this.eType[i]);
    if (this.ehp[i] <= 0) this.killEnemy(i, true);
  }

  killEnemy(i: number, drop: boolean) {
    const t = this.eType[i], d = ENEMIES[t], sc = this.escale[i];
    const x = this.ex[i], y = this.ey[i], z = this.ez[i];
    this.eAlive[i] = 0;
    this.eCount--;
    this.emit(EV_KILL, x, y, z, t, sc);
    if (d.boss) {
      this.bossIdx = -1;
      for (let j = 0; j < this.eHigh; j++) if (this.eAlive[j] && ENEMIES[this.eType[j]].boss) this.bossIdx = j;
    }
    if (!drop) return;
    this.kills++;
    const elite = this.eElite[i] === 1;
    const xp = d.xp * (elite ? 6 : 1);
    const orbs = Math.min(8, Math.ceil(xp / 3));
    for (let k = 0; k < orbs; k++) this.spawnPickup(K_XP, x, z, xp / orbs);
    if (d.boss) {
      for (let k = 0; k < d.gold; k++) this.spawnPickup(K_GOLD, x, z, 1, 4);
      for (let k = 0; k < 3; k++) this.spawnPickup(K_HEART, x, z, 1, 3);
      this.spawnPickup(K_MAGNET, x, z, 1, 2);
    } else if (elite) {
      for (let k = 0; k < 8; k++) this.spawnPickup(K_GOLD, x, z, 1, 2.5);
      this.spawnPickup(K_HEART, x, z, 1);
      if (this.r() < 0.2) this.spawnPickup(K_MAGNET, x, z, 1);
      if (this.r() < 0.3) this.spawnPickup(K_BUFF + Math.floor(this.r() * BUFFS.length), x, z, 1);
    } else {
      if (this.r() < d.gold * (1 + this.stats.luck)) this.spawnPickup(K_GOLD, x, z, 1);
      if (this.r() < this.stats.heartChance) this.spawnPickup(K_HEART, x, z, 1);
      // Magnet: ganz selten; Powerups selten
      if (this.r() < 0.0012 * (1 + this.stats.luck)) this.spawnPickup(K_MAGNET, x, z, 1);
      if (this.r() < 0.0035 * (1 + this.stats.luck)) this.spawnPickup(K_BUFF + Math.floor(this.r() * BUFFS.length), x, z, 1);
    }
    // Relikt-Effekte beim Kill
    const np = this.items[I_POPBERRY];
    if (np && this.r() < 0.12) this.pendingBooms.push(x, z, 20 * np * this.stats.dmg);
    const nv = this.items[I_VAMPIRE];
    if (nv && this.r() < 0.04 * nv) this.heal(2);
    const ns = this.items[I_SOULJAR];
    if (ns && this.kills % 30 === 0) { this.bonusHp += ns; this.recalcStats(); }

    if (d.boss || elite) {
      this.hitStop = Math.max(this.hitStop, d.boss ? 0.15 : 0.08);
      this.emit(EV_BOOM, x, y, z, d.boss ? 9 : 4 * sc, B_DEATH);
    }
    if (d.boss) {
      if (t === FINAL_BOSS) { this.winT = 2.5; this.setBanner(`${d.name} fällt – Sieg!`); }
      else this.setBanner(`${d.name} besiegt!`);
    }
  }

  // Liefert die k nächsten lebenden Gegner (sortiert) innerhalb r
  nearest(x: number, z: number, r: number, k: number, out: Int32Array): number {
    const qN = this.qN, dN = this.dN;
    const n = this.grid.query(x, z, r, qN);
    let m = 0;
    for (let a = 0; a < n; a++) {
      const j = qN[a];
      if (!this.eAlive[j]) continue;
      const dx = this.ex[j] - x, dz = this.ez[j] - z, dd = dx * dx + dz * dz;
      if (dd > r * r) continue;
      qN[m] = j; dN[m] = dd; m++;
    }
    const cnt = Math.min(k, m);
    for (let a = 0; a < cnt; a++) {
      let best = a;
      for (let b = a + 1; b < m; b++) if (dN[b] < dN[best]) best = b;
      const tj = qN[a]; qN[a] = qN[best]; qN[best] = tj;
      const td = dN[a]; dN[a] = dN[best]; dN[best] = td;
      out[a] = qN[a];
    }
    return cnt;
  }

  // ================= Projektile =================
  spawnProj(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
    life: number, dmg: number, pierce: number, bounce: number, w: number, r: number) {
    for (let i = 0; i < MAX_PROJ; i++) {
      if (this.qAlive[i]) continue;
      this.qAlive[i] = 1; this.qKind[i] = kind; this.qW[i] = w;
      this.qx[i] = this.qpx[i] = x; this.qy[i] = this.qpy[i] = y; this.qz[i] = this.qpz[i] = z;
      this.qvx[i] = vx; this.qvy[i] = vy; this.qvz[i] = vz;
      this.qlife[i] = life; this.qdmg[i] = dmg; this.qpierce[i] = pierce; this.qbounce[i] = bounce; this.qr[i] = r;
      this.qhitN[i] = 0;
      if (i >= this.qHigh) this.qHigh = i + 1;
      return;
    }
  }

  private wasHit(i: number, j: number): boolean {
    const n = Math.min(8, this.qhitN[i]), o = i * 8;
    for (let k = 0; k < n; k++) if (this.qhits[o + k] === j) return true;
    return false;
  }

  private updateProjectiles(dt: number) {
    const T = this.terrain, q = this.qB;
    for (let i = 0; i < this.qHigh; i++) {
      if (!this.qAlive[i]) continue;
      this.qpx[i] = this.qx[i]; this.qpy[i] = this.qy[i]; this.qpz[i] = this.qz[i];
      this.qx[i] += this.qvx[i] * dt; this.qz[i] += this.qvz[i] * dt;

      const kind = this.qKind[i];
      if (kind === P_METEOR || kind === P_STAR) {
        this.qvy[i] -= 30 * dt;
        this.qy[i] += this.qvy[i] * dt;
        const g = T.height(this.qx[i], this.qz[i]);
        if (this.qy[i] <= g) {
          this.aoe(this.qx[i], this.qz[i], this.qr[i], this.qdmg[i], 7, this.qW[i]);
          this.emit(EV_BOOM, this.qx[i], g, this.qz[i], this.qr[i], kind === P_STAR ? B_STAR : B_METEOR);
          this.qAlive[i] = 0;
        }
        continue;
      }

      this.qlife[i] -= dt;
      if (this.qlife[i] <= 0) { this.qAlive[i] = 0; continue; }
      const g = T.height(this.qx[i], this.qz[i]) + 1.1;
      this.qy[i] += (g - this.qy[i]) * Math.min(1, dt * 10);

      const x = this.qx[i], z = this.qz[i], pr = this.qr[i];
      const n = this.grid.query(x, z, pr + 4, q);
      for (let k = 0; k < n; k++) {
        const j = q[k];
        if (!this.eAlive[j] || this.wasHit(i, j)) continue;
        const rr = pr + ENEMIES[this.eType[j]].radius * this.escale[j];
        const ddx = this.ex[j] - x, ddz = this.ez[j] - z;
        if (ddx * ddx + ddz * ddz > rr * rr) continue;
        this.damageEnemy(j, this.qdmg[i], x - this.qvx[i], z - this.qvz[i], kind === P_BULLET ? 1.5 : 3, this.qW[i]);
        this.qhits[i * 8 + (this.qhitN[i] % 8)] = j;
        this.qhitN[i]++;
        if (this.qbounce[i] > 0) {
          // abprallen zum nächsten noch nicht getroffenen Gegner
          const m = this.nearest(x, z, 10, 6, this.qC);
          let target = -1;
          for (let a = 0; a < m; a++) if (!this.wasHit(i, this.qC[a])) { target = this.qC[a]; break; }
          if (target >= 0) {
            const sp = Math.hypot(this.qvx[i], this.qvz[i]);
            const tdx = this.ex[target] - x, tdz = this.ez[target] - z, tl = Math.hypot(tdx, tdz) || 1;
            this.qvx[i] = (tdx / tl) * sp; this.qvz[i] = (tdz / tl) * sp;
            this.qlife[i] = Math.max(this.qlife[i], 0.5);
            this.qbounce[i]--;
            break;
          }
        }
        this.qpierce[i]--;
        if (this.qpierce[i] < 0) { this.qAlive[i] = 0; break; }
      }
    }
  }

  // ================= Warnflächen =================
  private updateTele(dt: number) {
    const T = this.terrain;
    for (let i = 0; i < MAX_TELE; i++) {
      if (!this.tAlive[i]) continue;
      this.ttime[i] += dt;
      if (this.ttime[i] < this.tdur[i]) continue;
      this.tAlive[i] = 0;
      const dmg = this.tdmg[i];
      if (dmg <= 0) continue;
      const jumped = this.hy - T.height(this.hx, this.hz) > 0.7; // Sprung weicht Bodenangriffen aus
      let inside = false;
      if (this.tKind[i] === T_CIRCLE) {
        const dx = this.hx - this.tx[i], dz = this.hz - this.tz[i], r = this.tr[i] + 0.4;
        inside = dx * dx + dz * dz < r * r;
        this.emit(EV_BOOM, this.tx[i], T.height(this.tx[i], this.tz[i]), this.tz[i], this.tr[i], B_ENEMY);
      } else {
        const sx = Math.sin(this.tang[i]), sz = Math.cos(this.tang[i]);
        const px = this.hx - this.tx[i], pz = this.hz - this.tz[i];
        const along = px * sx + pz * sz, perp = Math.abs(px * sz - pz * sx);
        inside = along >= -0.4 && along <= this.tlen[i] + 0.4 && perp < this.tr[i] / 2 + 0.4;
        for (let k = 1; k <= 3; k++) {
          const lx = this.tx[i] + sx * this.tlen[i] * k / 3.5, lz = this.tz[i] + sz * this.tlen[i] * k / 3.5;
          this.emit(EV_BOOM, lx, T.height(lx, lz), lz, this.tr[i], B_ENEMY);
        }
      }
      if (inside && !jumped) this.hurt(dmg);
    }
  }

  // ================= Pickups =================
  spawnPickup(kind: number, x: number, z: number, val: number, spread = 1.2) {
    x += (this.r() - 0.5) * spread; z += (this.r() - 0.5) * spread;
    if (this.kCount >= MAX_PICK - 4) {
      // voll: Wert auf eine bestehende Kugel gleicher Art legen
      for (let t = 0; t < 20; t++) {
        const j = Math.floor(this.r() * this.kHigh);
        if (this.kAlive[j] && this.kKind[j] === kind) { this.kval[j] += val; return; }
      }
      return;
    }
    for (let i = 0; i < MAX_PICK; i++) {
      if (this.kAlive[i]) continue;
      this.kAlive[i] = 1; this.kKind[i] = kind; this.kMag[i] = 0;
      this.kx[i] = x; this.kz[i] = z; this.ky[i] = this.terrain.height(x, z) + 0.5;
      this.kval[i] = val; this.kspd[i] = 0;
      if (i >= this.kHigh) this.kHigh = i + 1;
      this.kCount++;
      return;
    }
  }

  private updatePickups(dt: number) {
    const hx = this.hx, hz = this.hz, pr = this.stats.pickup, pr2 = pr * pr;
    for (let i = 0; i < this.kHigh; i++) {
      if (!this.kAlive[i]) continue;
      const dx = hx - this.kx[i], dz = hz - this.kz[i], d2 = dx * dx + dz * dz;
      // Herzen nur in kleinem Radius anziehen (man soll sie holen müssen)
      const lim = this.kKind[i] >= K_HEART ? 2.2 * 2.2 : pr2;
      if (!this.kMag[i] && d2 < lim) this.kMag[i] = 1;
      if (!this.kMag[i]) continue;
      const d = Math.sqrt(d2) || 0.001;
      this.kspd[i] = Math.min(45, this.kspd[i] + dt * 50);
      const step = Math.min(d, this.kspd[i] * dt);
      this.kx[i] += (dx / d) * step; this.kz[i] += (dz / d) * step;
      this.ky[i] += (this.hy + 0.9 - this.ky[i]) * Math.min(1, dt * 8);
      if (d >= 0.9) continue;
      this.kAlive[i] = 0; this.kCount--;
      const kind = this.kKind[i];
      if (kind === 0) {
        this.xp += this.kval[i] * this.stats.xpMul;
        this.emit(EV_XP, this.kx[i], this.ky[i], this.kz[i], this.kval[i]);
        while (this.xp >= this.xpNext) {
          this.xp -= this.xpNext;
          this.level++;
          this.xpNext = xpFor(this.level);
          this.pendingLevels++;
          this.emit(EV_LEVEL, hx, this.hy, hz, this.level);
        }
      } else if (kind === 1) {
        this.goldAcc += this.kval[i] * this.stats.goldMul;
        const g = Math.floor(this.goldAcc);
        this.gold += g; this.goldAcc -= g;
        this.emit(EV_GOLD, this.kx[i], this.ky[i], this.kz[i], this.kval[i]);
      } else if (kind === K_HEART) {
        this.heal(this.stats.heartHeal);
      } else if (kind >= K_BUFF) {
        const b = kind - K_BUFF;
        this.buffT[b] = BUFFS[b].dur;
        this.emit(EV_BUFF, hx, this.hy, hz, b);
        this.toast = `${BUFFS[b].icon} ${BUFFS[b].name}! ${BUFFS[b].info}`;
        this.toastT = 2.5;
      } else {
        // Magnet: alle XP-Kugeln und Münzen der Karte fliegen zum Helden
        for (let k = 0; k < this.kHigh; k++) if (this.kAlive[k] && this.kKind[k] <= K_GOLD) this.kMag[k] = 1;
        this.emit(EV_MAGNET, hx, this.hy, hz);
        this.toast = '🧲 Magnet! Alle Kristalle fliegen zu dir';
        this.toastT = 2.5;
      }
    }
  }

  // ================= Schreine & Truhen =================
  currentChestCost(): number {
    return Math.round(this.chestCost * (this.items[I_MIDAS] ? 0.7 : 1));
  }

  private updateInteract(dt: number) {
    this.interactProgress = 0;
    this.interactLabel = '';
    for (const it of this.interact) {
      if (it.used) continue;
      const d = Math.hypot(this.hx - it.x, this.hz - it.z);
      const reach = it.kind === 2 ? 3.4 : 2.4;
      if (d > reach || Math.abs(this.hy - it.y) > 1.6) {
        // Machtschrein entlädt sich langsam, wenn man rausgeht
        it.hold = it.kind === 2 ? Math.max(0, it.hold - dt * 0.5) : 0;
        continue;
      }
      if (it.kind === 2) {
        it.hold += dt;
        this.interactProgress = Math.min(1, it.hold / POWER_TIME);
        this.interactLabel = 'Machtschrein lädt … bleib im Kreis';
        if (it.hold < POWER_TIME) continue;
        it.used = true;
        // 3 Kräfte zur Auswahl (Anzeige wie bei Truhen)
        this.mode = 'chest';
        this.chestOffers = genOffers(this, 'shrine', 3);
        this.chestTitle = '✦ Machtschrein – wähle eine Kraft';
        this.emit(EV_POWER, it.x, it.y, it.z, Math.max(...this.chestOffers.map((o) => o.rarity)));
        return;
      }
      if (it.kind === 1) {
        // Truhe: sofort öffnen, wenn genug Gold da ist
        const cost = this.currentChestCost();
        if (this.gold < cost) { this.interactLabel = `Truhe: ${cost} Gold nötig`; continue; }
        it.used = true;
        this.gold -= cost;
        this.chestCost = Math.round(this.chestCost * 1.35 + 3);
        this.mode = 'chest';
        this.chestOffers = genOffers(this, 'chest', 3);
        this.chestTitle = '🎁 Truhe geöffnet!';
        this.emit(EV_CHEST, it.x, it.y, it.z);
        return;
      }
      it.hold += dt;
      this.interactProgress = Math.min(1, it.hold / SHRINE_TIME);
      this.interactLabel = 'Händler-Schrein …';
      if (it.hold < SHRINE_TIME) continue;
      it.used = true;
      this.mode = 'shop';
      this.rerollCost = 5;
      this.shopOffers = genOffers(this, 'shop', 4);
      return;
    }
  }

  // ================= Aktionen aus Menüs =================
  pickLevelOffer(i: number) {
    if (this.mode !== 'levelup') return;
    const o = this.offers[i];
    if (o) applyOffer(this, o);
    this.pendingLevels--;
    if (this.pendingLevels > 0) this.offers = genOffers(this, 'level', 3);
    else this.mode = 'run';
  }

  pickChest(i: number) {
    if (this.mode !== 'chest') return;
    const o = this.chestOffers[i];
    if (o) applyOffer(this, o);
    this.mode = 'run';
  }

  buyShop(i: number): boolean {
    const o = this.shopOffers[i];
    if (!o || o.sold || this.gold < o.price || !offerValid(this, o)) return false;
    this.gold -= o.price;
    applyOffer(this, o);
    o.sold = true;
    return true;
  }

  rerollShop(): boolean {
    if (this.gold < this.rerollCost) return false;
    this.gold -= this.rerollCost;
    this.rerollCost += 4;
    this.shopOffers = genOffers(this, 'shop', 4);
    return true;
  }

  leaveShop() { if (this.mode === 'shop') this.mode = 'run'; }
}
