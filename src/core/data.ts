// Alle Spielwerte als Daten – hier wird balanciert.

export const TICK = 1 / 60;
export const MAX_ENEMIES = 1400;
export const MAX_PROJ = 1500;
export const MAX_PICK = 2500;
export const MAX_TELE = 160;
export const MAX_SLOTS = 6;
// Boss-Zeitplan (Sekunden); der letzte ist der Endboss
export const E_BEETLE = 0, E_WOLF = 1, E_SHAMAN = 2, E_WISP = 3, E_GOLEM = 4, E_HYDRA = 5, E_TITAN = 6, E_KING = 7, E_WITCH = 8,
  E_QUEEN = 9, E_DARK = 10, E_SKELETON = 11, E_BAT = 12, E_SHADE = 13;
export const BOSSES = [
  { t: 120, type: E_KING, text: 'Der Käferkönig stampft heran!' },
  { t: 240, type: E_HYDRA, text: 'Die Kristall-Hydra erwacht!' },
  { t: 360, type: E_QUEEN, text: 'Die Kristallspinnen-Königin lauert!' },
  { t: 480, type: E_WITCH, text: 'Die Sturmhexe zieht auf!' },
  { t: 600, type: E_TITAN, text: 'Der Moos-Titan erhebt sich!' },
  { t: 750, type: E_DARK, text: 'Der Schattenfürst erscheint – das Ende naht!' },
];
export const FINAL_BOSS = E_DARK;

// Elites: verstärkte Normalgegner mit goldenem Glanz und besserer Beute
export const ELITE = { start: 110, every: 38, minEvery: 18, hp: 7, dmg: 1.5, scale: 1.5 };

// ---------- Seltenheit (Rot = stärkste) ----------
export interface RarityDef { name: string; color: string; mult: number }
export const RARITIES: RarityDef[] = [
  { name: 'Gewöhnlich', color: '#b8b0c8', mult: 1 },
  { name: 'Ungewöhnlich', color: '#5cc97a', mult: 1.4 },
  { name: 'Selten', color: '#4f9dff', mult: 1.9 },
  { name: 'Episch', color: '#b061ff', mult: 2.6 },
  { name: 'Legendär', color: '#ff3b4e', mult: 3.5 },
];
// Grundgewichte je Quelle; Glück verschiebt Richtung höherer Stufen
export const RARITY_WEIGHTS = {
  level: [60, 25, 10, 4, 1],
  chest: [0, 50, 30, 14, 6],
  shop: [40, 30, 18, 9, 3],
  shrine: [25, 35, 24, 11, 5],
};

// ---------- Gegner ----------

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  radius: number;
  xp: number;
  gold: number; // normal: Drop-Chance, Boss: Anzahl Münzen
  color: number; // Partikelfarbe
  flying: boolean;
  boss: boolean;
  tall: number; // Höhe für Schadenszahlen
}

export const ENEMIES: EnemyDef[] = [
  { name: 'Kristall-Käfer', hp: 10, speed: 3.3, dmg: 6, radius: 0.6, xp: 1, gold: 0.1, color: 0x7fd8d0, flying: false, boss: false, tall: 1.1 },
  { name: 'Dornen-Wolf', hp: 20, speed: 5.2, dmg: 9, radius: 0.75, xp: 2, gold: 0.18, color: 0x9b8fc4, flying: false, boss: false, tall: 1.5 },
  { name: 'Pilz-Schamane', hp: 24, speed: 2.8, dmg: 8, radius: 0.7, xp: 3, gold: 0.3, color: 0xff8fb0, flying: false, boss: false, tall: 1.9 },
  { name: 'Irrlicht', hp: 9, speed: 4.4, dmg: 5, radius: 0.55, xp: 2, gold: 0.15, color: 0xffe38a, flying: true, boss: false, tall: 1.2 },
  { name: 'Stein-Golem', hp: 90, speed: 1.9, dmg: 14, radius: 1.3, xp: 8, gold: 0.6, color: 0xb8a99a, flying: false, boss: false, tall: 3 },
  { name: 'Kristall-Hydra', hp: 3000, speed: 2.3, dmg: 20, radius: 3.2, xp: 120, gold: 40, color: 0xa8d8ff, flying: false, boss: true, tall: 6.5 },
  { name: 'Moos-Titan', hp: 7000, speed: 1.7, dmg: 25, radius: 3.8, xp: 0, gold: 0, color: 0x9fcf8f, flying: false, boss: true, tall: 8.5 },
  { name: 'Käferkönig', hp: 1400, speed: 3.0, dmg: 16, radius: 2.2, xp: 60, gold: 25, color: 0x5fc8c0, flying: false, boss: true, tall: 3.6 },
  { name: 'Sturmhexe', hp: 5000, speed: 3.4, dmg: 18, radius: 1.8, xp: 160, gold: 50, color: 0xc6a8ff, flying: true, boss: true, tall: 4.5 },
  { name: 'Kristallspinnen-Königin', hp: 4200, speed: 2.8, dmg: 18, radius: 2.8, xp: 140, gold: 45, color: 0x9a7ad8, flying: false, boss: true, tall: 4 },
  { name: 'Der Schattenfürst', hp: 32000, speed: 2.6, dmg: 30, radius: 2.6, xp: 0, gold: 0, color: 0x6a3a9a, flying: false, boss: true, tall: 8 },
  { name: 'Skelett-Krieger', hp: 45, speed: 2.7, dmg: 12, radius: 0.75, xp: 4, gold: 0.3, color: 0xd8d0c0, flying: false, boss: false, tall: 2.1 },
  { name: 'Fledermaus', hp: 6, speed: 6.4, dmg: 4, radius: 0.45, xp: 1, gold: 0.08, color: 0x7a6a9a, flying: true, boss: false, tall: 1 },
  { name: 'Schattenwandler', hp: 32, speed: 3.0, dmg: 10, radius: 0.7, xp: 4, gold: 0.3, color: 0x5a4a8a, flying: false, boss: false, tall: 2.3 },
];

// ---------- Waffen ----------
export const W_SPEAR = 0, W_SHARD = 1, W_BLADES = 2, W_CHAIN = 3, W_NOVA = 4, W_METEOR = 5, W_PISTOL = 6, W_KATANA = 7,
  W_INFERNO = 8, W_BLOODSWORD = 9, W_DEMON = 10;
export const W_RELICS = 15; // Schadens-Statistik für Relikt-Effekte

export interface WeaponDef {
  name: string;
  icon: string;
  info: string[]; // Text für das Erreichen von Stufe 1..5
}

export const WEAPONS: WeaponDef[] = [
  { name: 'Speer-Salve', icon: '🔱', info: ['Wirft Speere sternförmig in alle Richtungen', '+2 Speere, schneller', '+2 Speere, +1 Durchschlag', '+2 Speere, schneller', '+2 Speere, +1 Durchschlag'] },
  { name: 'Kristall-Splitter', icon: '💎', info: ['Schnelle Schüsse auf den nächsten Gegner', '+Schaden, schneller', '+1 Schuss, prallt 1× ab', '+Schaden, prallt 2× ab', '+1 Schuss, prallt 3× ab'] },
  { name: 'Wirbelklingen', icon: '🌀', info: ['Zwei Klingen kreisen um dich', '+1 Klinge, größerer Radius', '+1 Klinge, +Schaden', '+1 Klinge, größerer Radius', '+1 Klinge, +Schaden'] },
  { name: 'Blitz-Kette', icon: '⚡', info: ['Blitz springt von Gegner zu Gegner', '+1 Sprung, +Schaden', '+1 Sprung, schneller', '+1 Sprung, +Schaden', '+1 Sprung, schneller'] },
  { name: 'Frost-Nova', icon: '❄️', info: ['Eisring um dich, verlangsamt', '+Radius, +Schaden', 'schneller, länger langsam', '+Radius, +Schaden', 'schneller, länger langsam'] },
  { name: 'Meteor-Stab', icon: '☄️', info: ['Meteore schlagen in Gegnergruppen ein', '+Einschlagsgröße, +Schaden', '+1 Meteor', '+Größe, schneller', '+1 Meteor, +Schaden'] },
  { name: 'Pistole', icon: '🔫', info: ['Schnelles Dauerfeuer auf den nächsten Gegner', '+Schaden, schneller', '+1 Kugel pro Schuss', 'Kugeln durchschlagen 1 Gegner', '+1 Kugel, +Schaden'] },
  { name: 'Samurai-Katana', icon: '⚔️', info: ['Blitzschneller Hieb im Halbkreis vor dir', '+Schaden, schneller', 'Hieb auch nach hinten', '+Reichweite, +Schaden', 'Klingensturm: +30% Schaden, schneller'] },
  { name: 'Inferno-Stab', icon: '🔥', info: ['Flammenkegel auf den nächsten Gegner, der Boden brennt', '+Schaden, längere Flammen', 'Brennender Boden hält länger', '+Schaden, breiterer Kegel', 'Höllenfeuer: größere Brandflächen'] },
  { name: 'Blut-Langschwert', icon: '🗡️', info: ['Gewaltiger Rundumhieb, heilt ein wenig', '+Schaden, größerer Radius', 'Zweiter Hieb direkt hinterher', '+Schaden, heilt mehr', 'Blutsturm: Hiebe schleudern Blutwellen'] },
  { name: 'Dämonenschädel', icon: '👹', info: ['Brennende Schädel jagen Gegner und explodieren', '+1 Schädel', 'Größere Explosionen', '+1 Schädel, +Schaden', 'Höllenpakt: Schädel zerplatzen in zwei kleine'] },
];

// ---------- Werte ----------
export interface Stats {
  dmg: number;
  cd: number; // Abklingzeit-Faktor (kleiner = schneller)
  area: number;
  speed: number;
  maxHp: number;
  regen: number;
  armor: number;
  pickup: number;
  luck: number;
  crit: number;
  critDmg: number;
  xpMul: number;
  extraProj: number;
  jump: number; // Sprunghöhe-Faktor
  airSpeed: number; // Laufgeschwindigkeit in der Luft (weiter springen)
  extraJumps: number;
  heartChance: number;
  heartHeal: number;
  goldMul: number;
}

export const baseStats = (): Stats => ({
  dmg: 1, cd: 1, area: 1, speed: 1, maxHp: 100, regen: 0, armor: 0,
  pickup: 3.2, luck: 0, crit: 0.08, critDmg: 2, xpMul: 1, extraProj: 0,
  jump: 1, airSpeed: 1.15, extraJumps: 0, heartChance: 0.006, heartHeal: 15, goldMul: 1,
});

// ---------- Fähigkeiten (Level-ups, Wert skaliert mit Seltenheit) ----------
export interface PassiveDef {
  name: string;
  icon: string;
  info: (m: number) => string;
  max: number;
  minRarity?: number;
  apply: (s: Stats, m: number) => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const num = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

export const PASSIVES: PassiveDef[] = [
  { name: 'Kraft', icon: '💪', max: 6, info: (m) => `+${pct(0.1 * m)} Schaden`, apply: (s, m) => (s.dmg += 0.1 * m) },
  { name: 'Eile', icon: '⏱️', max: 6, info: (m) => `+${pct(0.08 * m)} Angriffstempo`, apply: (s, m) => (s.cd /= 1 + 0.08 * m) },
  { name: 'Leichtfuß', icon: '🪶', max: 5, info: (m) => `+${pct(0.07 * m)} Laufgeschwindigkeit`, apply: (s, m) => (s.speed += 0.07 * m) },
  { name: 'Vitalität', icon: '❤️', max: 6, info: (m) => `+${Math.round(15 * m)} Max-HP`, apply: (s, m) => (s.maxHp += Math.round(15 * m)) },
  { name: 'Magnet', icon: '🧲', max: 5, info: (m) => `+${pct(0.25 * m)} Sammelradius`, apply: (s, m) => (s.pickup *= 1 + 0.25 * m) },
  { name: 'Panzer', icon: '🛡️', max: 6, info: (m) => `+${num(2 * m)} Rüstung`, apply: (s, m) => (s.armor += 2 * m) },
  { name: 'Glück', icon: '🍀', max: 5, info: (m) => `+${pct(0.12 * m)} Glück, +${pct(0.03 * m)} Krit`, apply: (s, m) => { s.luck += 0.12 * m; s.crit += 0.03 * m; } },
  { name: 'Regeneration', icon: '🌿', max: 5, info: (m) => `+${num(0.3 * m)} HP pro Sekunde`, apply: (s, m) => (s.regen += 0.3 * m) },
  { name: 'Weite', icon: '⭕', max: 5, info: (m) => `+${pct(0.1 * m)} Fläche`, apply: (s, m) => (s.area += 0.1 * m) },
  { name: 'Weisheit', icon: '📖', max: 5, info: (m) => `+${pct(0.1 * m)} Erfahrung`, apply: (s, m) => (s.xpMul += 0.1 * m) },
  { name: 'Sprungkraft', icon: '🦘', max: 4, info: (m) => `+${pct(0.1 * m)} Sprunghöhe & -weite`, apply: (s, m) => { s.jump += 0.1 * m; s.airSpeed += 0.08 * m; } },
  { name: 'Mehrfachwurf', icon: '✳️', max: 2, minRarity: 2, info: () => '+1 Projektil für alle Waffen', apply: (s) => (s.extraProj += 1) },
  { name: 'Präzision', icon: '🎯', max: 5, info: (m) => `+${pct(0.2 * m)} Krit-Schaden`, apply: (s, m) => (s.critDmg += 0.2 * m) },
  { name: 'Sammler', icon: '🪙', max: 5, info: (m) => `+${pct(0.2 * m)} Gold`, apply: (s, m) => (s.goldMul += 0.2 * m) },
];

// ---------- Relikte (aus Truhen, feste Seltenheit, echte Effekte) ----------
export const I_HEARTBERRY = 0, I_GOLDTOOTH = 1, I_SPRINGS = 2, I_THORNS = 3, I_FEATHERSHOES = 4, I_POPBERRY = 5,
  I_CRYSTALHEART = 6, I_LUCKYCAT = 7, I_VAMPIRE = 8, I_FROST = 9, I_SOULJAR = 10, I_BUBBLE = 11, I_THUNDERBOOTS = 12,
  I_BIGHEART = 13, I_WRATH = 14, I_PHOENIX = 15, I_STARFALL = 16,
  I_SPRINT = 17, I_STORMRING = 18, I_BLOODCRYSTAL = 19, I_HUNTER = 20, I_MIDAS = 21, I_TIMEGLASS = 22, I_SKULL = 23;

export interface ItemDef {
  name: string;
  icon: string;
  rarity: number;
  max: number;
  info: string;
  apply?: (s: Stats) => void; // reine Werte; Effekte stecken in sim.ts
}

export const ITEMS: ItemDef[] = [
  { name: 'Herzbeere', icon: '🍓', rarity: 0, max: 5, info: 'Gegner lassen öfter Herzen fallen', apply: (s) => (s.heartChance += 0.005) },
  { name: 'Goldzahn', icon: '🦷', rarity: 0, max: 5, info: '+30% Gold', apply: (s) => (s.goldMul += 0.3) },
  { name: 'Sprungfedern', icon: '🪀', rarity: 0, max: 3, info: '+20% Sprunghöhe, weiter springen', apply: (s) => { s.jump += 0.2; s.airSpeed += 0.15; } },
  { name: 'Dornenrüstung', icon: '🌵', rarity: 0, max: 5, info: 'Wirst du getroffen, nehmen Gegner um dich 30 Schaden' },
  { name: 'Federschuhe', icon: '👟', rarity: 1, max: 2, info: 'Doppelsprung (+1 Sprung in der Luft)', apply: (s) => (s.extraJumps += 1) },
  { name: 'Knallbeere', icon: '💥', rarity: 1, max: 5, info: 'Besiegte Gegner explodieren mit 12% Chance' },
  { name: 'Kristallherz', icon: '💗', rarity: 1, max: 3, info: 'Herzen heilen 50% mehr', apply: (s) => (s.heartHeal *= 1.5) },
  { name: 'Glückskatze', icon: '🐱', rarity: 1, max: 3, info: '+25% Glück (bessere Seltenheit)', apply: (s) => (s.luck += 0.25) },
  { name: 'Vampirzahn', icon: '🧛', rarity: 2, max: 4, info: '4% Chance, pro Kill 2 HP zu heilen' },
  { name: 'Frostkristall', icon: '🧊', rarity: 2, max: 4, info: 'Treffer frieren Gegner mit 5% Chance ein' },
  { name: 'Seelenkrug', icon: '🏺', rarity: 2, max: 3, info: '+1 Max-HP alle 30 Kills' },
  { name: 'Schutzblase', icon: '🫧', rarity: 3, max: 3, info: 'Blockt alle 12 s einen Treffer' },
  { name: 'Donnerstiefel', icon: '🥾', rarity: 3, max: 3, info: 'Landung nach Sprung: Schockwelle um dich' },
  { name: 'Riesenherz', icon: '🫀', rarity: 3, max: 3, info: '+50 Max-HP und sofort heilen', apply: (s) => (s.maxHp += 50) },
  { name: 'Zornklinge', icon: '💢', rarity: 4, max: 2, info: '+100% Krit-Schaden, +10% Krit', apply: (s) => { s.critDmg += 1; s.crit += 0.1; } },
  { name: 'Phönixfeder', icon: '🔥', rarity: 4, max: 2, info: 'Einmal wiederbeleben mit halber HP' },
  { name: 'Sternenregen', icon: '🌠', rarity: 4, max: 3, info: 'Alle 5 s regnen Sterne auf Gegner' },
  { name: 'Sprintband', icon: '🎽', rarity: 0, max: 3, info: '+12% Laufgeschwindigkeit', apply: (s) => (s.speed += 0.12) },
  { name: 'Sturmring', icon: '💍', rarity: 1, max: 3, info: 'Krits lösen mit 30% Chance einen Blitz aus' },
  { name: 'Blutkristall', icon: '🩸', rarity: 2, max: 3, info: 'Heilt 1 HP pro 250 verursachtem Schaden' },
  { name: 'Jägermal', icon: '🏹', rarity: 2, max: 3, info: '+40% Schaden gegen Elites und Bosse' },
  { name: 'Midas-Krone', icon: '👑', rarity: 3, max: 1, info: 'Truhen kosten 30% weniger' },
  { name: 'Zeitsanduhr', icon: '⏳', rarity: 4, max: 2, info: '-15% Abklingzeit aller Waffen', apply: (s) => (s.cd *= 0.85) },
  { name: 'Totenkopf-Amulett', icon: '📿', rarity: 4, max: 1, info: '+2% Schaden je 100 Kills (max. +50%)' },
];

// ---------- Profil-Fortschritt (zwischen den Läufen) ----------
export const profileNeed = (level: number) => 400 + level * 300;

// Dauerhafte Startboni, die das Profil-Level freischaltet
export interface MetaBonus { hp: number; dmg: number; xp: number; speed: number; luck: number; gold: number }
export const noMeta = (): MetaBonus => ({ hp: 0, dmg: 0, xp: 0, speed: 0, luck: 0, gold: 0 });

export interface ProfileReward { level: number; text: string; skin?: string; bonus?: Partial<MetaBonus> }
export const PROFILE_REWARDS: ProfileReward[] = [
  { level: 2, text: '+10 Max-HP zu Beginn', bonus: { hp: 10 } },
  { level: 3, text: 'Skin: Blutmond-Assassine', skin: 'assassin_blood' },
  { level: 4, text: '+5% Erfahrung', bonus: { xp: 0.05 } },
  { level: 5, text: 'Skin: Schatten-Wanderin', skin: 'wanderer_shadow' },
  { level: 6, text: '+5% Schaden', bonus: { dmg: 0.05 } },
  { level: 7, text: 'Skin: Frost-Assassine', skin: 'assassin_frost' },
  { level: 8, text: '+15 Gold zu Beginn', bonus: { gold: 15 } },
  { level: 9, text: '+5% Laufgeschwindigkeit', bonus: { speed: 0.05 } },
  { level: 10, text: 'Skin: Gold-Assassine', skin: 'assassin_gold' },
  { level: 11, text: '+10 Max-HP zu Beginn', bonus: { hp: 10 } },
  { level: 12, text: '+10% Glück', bonus: { luck: 0.1 } },
  { level: 13, text: '+5% Schaden', bonus: { dmg: 0.05 } },
  { level: 15, text: 'Skin: Dämonen-Assassine', skin: 'assassin_demon' },
];

export function metaFor(level: number): MetaBonus {
  const m = noMeta();
  for (const r of PROFILE_REWARDS) {
    if (r.level > level || !r.bonus) continue;
    for (const k of Object.keys(r.bonus) as (keyof MetaBonus)[]) m[k] += r.bonus[k]!;
  }
  return m;
}

// ---------- Powerups (zeitlich begrenzt, liegen auf dem Boden) ----------
export const BUFFS = [
  { name: 'Raserei', icon: '🔥', info: 'Doppelter Schaden', dur: 10, color: 0xff5a4a },
  { name: 'Sturmschritt', icon: '⚡', info: 'Schneller laufen & angreifen', dur: 10, color: 0xffd84a },
  { name: 'Kristallhaut', icon: '🛡️', info: 'Unverwundbar', dur: 6, color: 0x7fe8ff },
];
