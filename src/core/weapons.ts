import type { Sim } from './sim';
import { EV_BLOODSLASH, EV_CHAIN, EV_FLAME, EV_NOVA, EV_SHOOT, EV_SLASH, P_BLOODWAVE, P_BULLET, P_METEOR, P_SHARD, P_SKULL, P_SPEAR } from './sim';
import { ENEMIES, W_BLADES, W_BLOODSWORD, W_CHAIN, W_DEMON, W_INFERNO, W_KATANA, W_METEOR, W_NOVA, W_PISTOL, W_SHARD, W_SPEAR } from './data';

export interface WeaponState {
  id: number;
  level: number;
  cd: number;
  angle: number;
}

export const newWeapon = (id: number): WeaponState => ({ id, level: 1, cd: 0.3, angle: 0 });

const TAU = Math.PI * 2;

// Von Rendering geteilt, damit die Klingen dort an derselben Stelle gezeichnet werden
export const bladeLayout = (level: number, area: number) => ({ count: 1 + level, radius: (2.4 + 0.25 * level) * area });

// Blut-Langschwert: Rundumhieb, heilt pro Treffer ein wenig; ab Stufe 5 fliegen Blutwellen
function bloodSlash(s: Sim, L: number) {
  const st = s.stats;
  const R = (4 + 0.45 * L) * st.area, dmg = (30 + 12 * L) * st.dmg;
  const n = s.grid.query(s.hx, s.hz, R + 4, s.qC);
  let hits = 0;
  for (let c = 0; c < n; c++) {
    const e = s.qC[c];
    if (!s.eAlive[e]) continue;
    const rr = R + ENEMIES[s.eType[e]].radius * s.escale[e];
    const dx = s.ex[e] - s.hx, dz = s.ez[e] - s.hz;
    if (dx * dx + dz * dz > rr * rr) continue;
    s.damageEnemy(e, dmg, s.hx, s.hz, 12, W_BLOODSWORD);
    hits++;
  }
  if (hits) s.heal(Math.min(4, hits * (L >= 4 ? 0.5 : 0.25)));
  s.emit(EV_BLOODSLASH, s.hx, s.hy + 1, s.hz, R);
  if (L >= 5) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      s.spawnProj(P_BLOODWAVE, s.hx, s.hy + 1, s.hz, Math.sin(a) * 18, 0, Math.cos(a) * 18, 0.6, dmg * 0.5, 99, 0, W_BLOODSWORD, 0.9);
    }
  }
}

export function updateWeapons(s: Sim, dt: number) {
  const st = s.stats;
  const haste = s.buffT[1] > 0 ? 1.4 : 1; // Powerup "Sturmschritt"
  for (const w of s.weapons) {
    w.cd -= dt * haste;
    const L = w.level;
    switch (w.id) {
      case W_SPEAR: {
        if (w.cd > 0) break;
        w.cd = (1.25 - 0.07 * L) * st.cd;
        const n = 5 + 2 * (L - 1) + st.extraProj * 2;
        const pierce = 1 + Math.floor(L / 2);
        w.angle += 0.6;
        for (let k = 0; k < n; k++) {
          const a = w.angle + (k / n) * TAU;
          s.spawnProj(P_SPEAR, s.hx, s.hy + 1.1, s.hz, Math.sin(a) * 24, 0, Math.cos(a) * 24, 0.8, (9 + 3 * L) * st.dmg, pierce, 0, W_SPEAR, 0.4);
        }
        s.emit(EV_SHOOT, W_SPEAR);
        break;
      }
      case W_SHARD: {
        if (w.cd > 0) break;
        const shots = 1 + Math.floor((L - 1) / 2) + st.extraProj;
        const m = s.nearest(s.hx, s.hz, 18, shots, s.qC);
        if (m === 0) { w.cd = 0.15; break; }
        w.cd = (0.62 - 0.05 * L) * st.cd;
        for (let k = 0; k < shots; k++) {
          const j = s.qC[k % m];
          const dx = s.ex[j] - s.hx, dz = s.ez[j] - s.hz, l = Math.hypot(dx, dz) || 1;
          const a = Math.atan2(dx / l, dz / l) + (k >= m ? (k - m + 1) * 0.2 : 0);
          s.spawnProj(P_SHARD, s.hx, s.hy + 1.2, s.hz, Math.sin(a) * 30, 0, Math.cos(a) * 30, 0.8, (12 + 5 * L) * st.dmg, 0, Math.max(0, L - 2), W_SHARD, 0.3);
        }
        s.emit(EV_SHOOT, W_SHARD);
        break;
      }
      case W_BLADES: {
        w.angle += 3.4 * dt;
        const { count, radius } = bladeLayout(L, st.area);
        const dmg = (7 + 3 * L) * st.dmg;
        for (let k = 0; k < count; k++) {
          const a = w.angle + (k / count) * TAU;
          const bx = s.hx + Math.sin(a) * radius, bz = s.hz + Math.cos(a) * radius;
          const n = s.grid.query(bx, bz, 4, s.qC);
          for (let c = 0; c < n; c++) {
            const j = s.qC[c];
            if (!s.eAlive[j] || s.eblade[j] > 0) continue;
            const rr = 0.8 + ENEMIES[s.eType[j]].radius * s.escale[j];
            const dx = s.ex[j] - bx, dz = s.ez[j] - bz;
            if (dx * dx + dz * dz > rr * rr) continue;
            s.eblade[j] = 0.35;
            s.damageEnemy(j, dmg, s.hx, s.hz, 5, W_BLADES);
          }
        }
        break;
      }
      case W_CHAIN: {
        if (w.cd > 0) break;
        if (s.nearest(s.hx, s.hz, 11, 1, s.qC) === 0) { w.cd = 0.15; break; }
        w.cd = (1.7 - 0.12 * L) * st.cd;
        let cur = s.qC[0];
        let lx = s.hx, ly = s.hy + 1.2, lz = s.hz;
        const hit: number[] = [];
        const jumps = 2 + L + st.extraProj;
        for (let k = 0; k <= jumps && cur >= 0; k++) {
          const ex = s.ex[cur], ey = s.ey[cur] + 1, ez = s.ez[cur];
          s.emit(EV_CHAIN, lx, ly, lz, ex, ey, ez);
          hit.push(cur);
          s.damageEnemy(cur, (15 + 7 * L) * st.dmg, lx, lz, 2, W_CHAIN);
          lx = ex; ly = ey; lz = ez;
          const m = s.nearest(ex, ez, 7, 8, s.qC);
          cur = -1;
          for (let a = 0; a < m; a++) if (!hit.includes(s.qC[a])) { cur = s.qC[a]; break; }
        }
        break;
      }
      case W_NOVA: {
        if (w.cd > 0) break;
        w.cd = (3.4 - 0.25 * L) * st.cd;
        const R = (5 + 0.7 * L) * st.area;
        const n = s.grid.query(s.hx, s.hz, R + 4, s.qC);
        for (let c = 0; c < n; c++) {
          const j = s.qC[c];
          if (!s.eAlive[j]) continue;
          const rr = R + ENEMIES[s.eType[j]].radius * s.escale[j];
          const dx = s.ex[j] - s.hx, dz = s.ez[j] - s.hz;
          if (dx * dx + dz * dz > rr * rr) continue;
          s.eslow[j] = 1.5 + 0.3 * L;
          s.damageEnemy(j, (12 + 6 * L) * st.dmg, s.hx, s.hz, 9, W_NOVA);
        }
        s.emit(EV_NOVA, s.hx, s.hy, s.hz, R);
        break;
      }
      case W_PISTOL: {
        if (w.cd > 0) break;
        const shots = 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) + st.extraProj;
        const m = s.nearest(s.hx, s.hz, 20, 1, s.qC);
        if (m === 0) { w.cd = 0.1; break; }
        w.cd = (0.42 - 0.04 * L) * st.cd;
        const j = s.qC[0];
        const a0 = Math.atan2(s.ex[j] - s.hx, s.ez[j] - s.hz);
        s.pistolAim = a0;
        const ox = s.hx + Math.sin(a0) * 0.6, oz = s.hz + Math.cos(a0) * 0.6;
        for (let k = 0; k < shots; k++) {
          const a = a0 + (k - (shots - 1) / 2) * 0.09;
          s.spawnProj(P_BULLET, ox, s.hy + 1.1, oz, Math.sin(a) * 42, 0, Math.cos(a) * 42, 0.55, (8 + 3 * L) * st.dmg, L >= 4 ? 1 : 0, 0, W_PISTOL, 0.25);
        }
        s.emit(EV_SHOOT, W_PISTOL, ox, s.hy + 1.1, oz, a0);
        break;
      }
      case W_KATANA: {
        if (w.cd > 0) break;
        const m = s.nearest(s.hx, s.hz, 6.5, 1, s.qC);
        if (m === 0) { w.cd = 0.1; break; }
        w.cd = (1.0 - 0.07 * L) * st.cd * (L >= 5 ? 0.8 : 1);
        const j = s.qC[0];
        const a0 = Math.atan2(s.ex[j] - s.hx, s.ez[j] - s.hz);
        const R = (3.6 + (L >= 4 ? 0.8 : 0) + 0.15 * L) * st.area;
        const half = 1.2; // ±69° = ~140° Bogen
        const dmg = (18 + 8 * L) * st.dmg * (L >= 5 ? 1.3 : 1);
        const dirs = L >= 3 ? [a0, a0 + Math.PI] : [a0];
        const n = s.grid.query(s.hx, s.hz, R + 4, s.qC);
        for (const a of dirs) {
          for (let c = 0; c < n; c++) {
            const e = s.qC[c];
            if (!s.eAlive[e]) continue;
            const dx = s.ex[e] - s.hx, dz = s.ez[e] - s.hz;
            const rr = R + ENEMIES[s.eType[e]].radius * s.escale[e];
            if (dx * dx + dz * dz > rr * rr) continue;
            let da = Math.atan2(dx, dz) - a;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            if (Math.abs(da) > half) continue;
            s.damageEnemy(e, dmg, s.hx, s.hz, 7, W_KATANA);
          }
          s.emit(EV_SLASH, s.hx, s.hy + 1, s.hz, a, R);
        }
        s.katanaSwing = a0;
        break;
      }
      case W_INFERNO: {
        // Flammenkegel auf den nächsten Gegner; ab und zu fängt der Boden Feuer
        if (w.cd > 0) break;
        const m = s.nearest(s.hx, s.hz, 9, 1, s.qC);
        if (m === 0) { w.cd = 0.1; break; }
        w.cd = 0.15 * st.cd;
        const t = s.qC[0];
        const a0 = Math.atan2(s.ex[t] - s.hx, s.ez[t] - s.hz);
        const len = (6 + 0.6 * L) * st.area, half = 0.36 + (L >= 4 ? 0.14 : 0);
        const dmg = (4 + 2.2 * L) * st.dmg;
        const n = s.grid.query(s.hx, s.hz, len + 4, s.qC);
        for (let c = 0; c < n; c++) {
          const e = s.qC[c];
          if (!s.eAlive[e]) continue;
          const dx = s.ex[e] - s.hx, dz = s.ez[e] - s.hz, d = Math.hypot(dx, dz);
          if (d > len + ENEMIES[s.eType[e]].radius * s.escale[e]) continue;
          let da = Math.atan2(dx, dz) - a0;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) > half + 0.15) continue;
          s.damageEnemy(e, dmg, s.hx, s.hz, 0.6, W_INFERNO);
        }
        s.emit(EV_FLAME, s.hx, s.hy + 1.1, s.hz, a0, len, half);
        w.angle += 0.15; // hier als Zeitgeber für Brandflächen genutzt
        if (w.angle >= 0.45) {
          w.angle = 0;
          const d = len * (0.45 + 0.45 * s.r()), pa = a0 + (s.r() - 0.5) * half * 1.6;
          s.addPatch(s.hx + Math.sin(pa) * d, s.hz + Math.cos(pa) * d, (1.5 + (L >= 5 ? 0.9 : 0)) * st.area, 2.5 + (L >= 3 ? 1.5 : 0), (2 + L) * st.dmg);
        }
        break;
      }
      case W_BLOODSWORD: {
        // zweiter Hieb (ab Stufe 3) läuft über w.angle als Zeitgeber
        if (w.angle > 0) { w.angle -= dt; if (w.angle <= 0) bloodSlash(s, L); }
        if (w.cd > 0) break;
        const R = (4 + 0.45 * L) * st.area;
        if (s.nearest(s.hx, s.hz, R + 1, 1, s.qC) === 0) { w.cd = 0.1; break; }
        w.cd = (2.3 - 0.15 * L) * st.cd;
        bloodSlash(s, L);
        if (L >= 3) w.angle = 0.3;
        break;
      }
      case W_DEMON: {
        if (w.cd > 0) break;
        if (s.nearest(s.hx, s.hz, 18, 1, s.qC) === 0) { w.cd = 0.2; break; }
        w.cd = (2.9 - 0.18 * L) * st.cd;
        const cnt = 2 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0) + st.extraProj;
        const R = (2.2 + (L >= 3 ? 0.8 : 0)) * st.area;
        for (let k = 0; k < cnt; k++) {
          const a = s.r() * Math.PI * 2;
          s.spawnProj(P_SKULL, s.hx, s.hy + 1.8, s.hz, Math.sin(a) * 9, 0, Math.cos(a) * 9, 3, (18 + 7 * L) * st.dmg, 0, L >= 5 ? 1 : 0, W_DEMON, R);
        }
        s.emit(EV_SHOOT, W_DEMON);
        break;
      }
      case W_METEOR: {
        if (w.cd > 0) break;
        const m = s.nearest(s.hx, s.hz, 18, 24, s.qC);
        if (m === 0) { w.cd = 0.2; break; }
        w.cd = (2.8 - 0.2 * L) * st.cd;
        const cnt = 1 + Math.floor(L / 2) + st.extraProj;
        const R = (3.2 + 0.35 * L) * st.area;
        for (let k = 0; k < cnt; k++) {
          const j = s.qC[Math.floor(s.r() * m)];
          const tx = s.ex[j], tz = s.ez[j];
          const g = s.terrain.height(tx, tz);
          // fällt in ~0,62 s schräg aus dem Himmel
          s.spawnProj(P_METEOR, tx - 4, g + 24, tz - 2, 4 / 0.62, -28, 2 / 0.62, 5, (28 + 14 * L) * st.dmg, 0, 0, W_METEOR, R);
        }
        s.emit(EV_SHOOT, W_METEOR);
        break;
      }
    }
  }
}
