import type { Sim } from './sim';
import { ITEMS, MAX_SLOTS, PASSIVES, RARITIES, RARITY_WEIGHTS, WEAPONS, W_INFERNO } from './data';
import { newWeapon } from './weapons';

export type OfferKind = 'weapon' | 'passive' | 'item' | 'heal';
export type OfferSource = 'level' | 'chest' | 'shop' | 'shrine';

export interface Offer {
  kind: OfferKind;
  id: number;
  level: number; // Zielstufe (Waffe / Fähigkeit)
  rarity: number;
  price: number;
  sold?: boolean;
}

export function rollRarity(s: Sim, src: OfferSource, min = 0): number {
  const w = RARITY_WEIGHTS[src].map((v, r) => (r < min ? 0 : v * Math.pow(1 + s.stats.luck, r)));
  let total = 0;
  for (const v of w) total += v;
  let p = s.r() * total;
  for (let r = 0; r < w.length; r++) if ((p -= w[r]) < 0) return r;
  return w.length - 1;
}

export function offerValid(s: Sim, o: Offer): boolean {
  if (o.kind === 'weapon') {
    const ws = s.weapons.find((w) => w.id === o.id);
    return ws ? ws.level === o.level - 1 : o.level === 1 && s.weapons.length < MAX_SLOTS;
  }
  if (o.kind === 'passive') return s.passives[o.id] === o.level - 1;
  if (o.kind === 'item') return s.items[o.id] < ITEMS[o.id].max;
  return true;
}

function weaponPool(s: Sim): { o: Offer; w: number }[] {
  const pool: { o: Offer; w: number }[] = [];
  for (let id = 0; id < WEAPONS.length; id++) {
    if (id >= W_INFERNO) continue; // Inferno-Stab, Blut-Langschwert, Dämonenschädel: noch nicht gebaut
    const ws = s.weapons.find((w) => w.id === id);
    if (ws) {
      if (ws.level < 5) pool.push({ o: { kind: 'weapon', id, level: ws.level + 1, rarity: 0, price: 0 }, w: 1.3 });
    } else if (s.weapons.length < MAX_SLOTS) {
      pool.push({ o: { kind: 'weapon', id, level: 1, rarity: 0, price: 0 }, w: s.weapons.length < 3 ? 1.6 : 0.8 });
    }
  }
  return pool;
}

function passivePool(s: Sim, src: OfferSource): { o: Offer; w: number }[] {
  const pool: { o: Offer; w: number }[] = [];
  for (let id = 0; id < PASSIVES.length; id++) {
    const p = PASSIVES[id];
    if (s.passives[id] >= p.max) continue;
    pool.push({ o: { kind: 'passive', id, level: s.passives[id] + 1, rarity: rollRarity(s, src, p.minRarity ?? 0), price: 0 }, w: p.minRarity ? 0.4 : 1 });
  }
  return pool;
}

function pickItem(s: Sim, src: OfferSource, taken: Set<number>): Offer | null {
  const want = rollRarity(s, src);
  // gewünschte Seltenheit, sonst nach unten, dann nach oben ausweichen
  const order = [want, ...[4, 3, 2, 1, 0].filter((r) => r < want), ...[0, 1, 2, 3, 4].filter((r) => r > want)];
  for (const r of order) {
    const ids = ITEMS.map((_, i) => i).filter((i) => ITEMS[i].rarity === r && s.items[i] < ITEMS[i].max && !taken.has(i));
    if (ids.length) {
      const id = ids[Math.floor(s.r() * ids.length)];
      taken.add(id);
      return { kind: 'item', id, level: s.items[id] + 1, rarity: r, price: 0 };
    }
  }
  return null;
}

function pickWeighted(s: Sim, pool: { o: Offer; w: number }[]): Offer | null {
  if (!pool.length) return null;
  let total = 0;
  for (const p of pool) total += p.w;
  let r = s.r() * total, k = 0;
  while (k < pool.length - 1 && (r -= pool[k].w) > 0) k++;
  const o = pool[k].o;
  pool.splice(k, 1);
  return o;
}

export function genOffers(s: Sim, src: OfferSource, n: number): Offer[] {
  const out: Offer[] = [];
  if (src === 'shrine') {
    const pool = passivePool(s, src);
    while (out.length < n) { const o = pickWeighted(s, pool); if (!o) break; out.push(o); }
  } else if (src === 'level') {
    const pool = [...weaponPool(s), ...passivePool(s, src)];
    while (out.length < n) { const o = pickWeighted(s, pool); if (!o) break; out.push(o); }
  } else if (src === 'chest') {
    const taken = new Set<number>();
    while (out.length < n) { const o = pickItem(s, src, taken); if (!o) break; out.push(o); }
  } else {
    // Shop: 1 Waffe, 2 Fähigkeiten, 1 Relikt
    const wp = weaponPool(s), pp = passivePool(s, src), taken = new Set<number>();
    for (const o of [pickWeighted(s, wp), pickWeighted(s, pp), pickWeighted(s, pp), pickItem(s, src, taken)]) if (o) out.push(o);
    const inflation = 1 + s.time / 240;
    for (const o of out) {
      const base = o.kind === 'weapon' ? (o.level === 1 ? 22 : 14 + 6 * o.level)
        : o.kind === 'passive' ? 12 + 3 * o.level + 6 * o.rarity
        : 18 + 14 * o.rarity;
      o.price = Math.round(base * inflation);
    }
  }
  while (out.length < n) out.push({ kind: 'heal', id: 0, level: 0, rarity: 0, price: Math.round(10 * (1 + s.time / 240)) });
  return out;
}

export function applyOffer(s: Sim, o: Offer) {
  if (!offerValid(s, o)) return;
  if (o.kind === 'weapon') {
    const ws = s.weapons.find((w) => w.id === o.id);
    if (ws) ws.level = o.level;
    else s.weapons.push(newWeapon(o.id));
  } else if (o.kind === 'passive') {
    s.passives[o.id]++;
    s.passiveList.push({ id: o.id, r: o.rarity });
    s.recalcStats();
  } else if (o.kind === 'item') {
    s.addItem(o.id);
  } else {
    s.heal(30);
  }
}

export type OfferInfo = { icon: string; title: string; tag: string; desc: string; type: string; color: string };

export function offerInfo(o: Offer): OfferInfo {
  if (o.kind === 'weapon') {
    const w = WEAPONS[o.id];
    return { icon: w.icon, title: w.name, tag: o.level === 1 ? 'Neu!' : `Stufe ${o.level}`, desc: w.info[o.level - 1], type: 'Waffe', color: '#6b58b8' };
  }
  const rar = RARITIES[o.rarity];
  if (o.kind === 'passive') {
    const p = PASSIVES[o.id];
    return { icon: p.icon, title: p.name, tag: rar.name, desc: p.info(rar.mult), type: 'Fähigkeit', color: rar.color };
  }
  if (o.kind === 'item') {
    const it = ITEMS[o.id];
    return { icon: it.icon, title: it.name, tag: rar.name, desc: it.info, type: 'Relikt', color: rar.color };
  }
  return { icon: '🍵', title: 'Heiltrank', tag: '', desc: 'Heilt 30 HP', type: 'Trank', color: '#5cc97a' };
}
