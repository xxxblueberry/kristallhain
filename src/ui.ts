// HUD & Menüs als DOM-Overlay (wenige Elemente, ereignisarm aktualisiert).
import type { Sim } from './core/sim';
import { BUFFS, ENEMIES, ITEMS, MAX_SLOTS, PASSIVES, RARITIES, WEAPONS, W_RELICS } from './core/data';
import { offerInfo, offerValid, type Offer } from './core/upgrades';
import type { SaveData } from './save';
import { SKINS } from './render/hero';

const fmtTime = (t: number) => {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface Btn { label: string; onClick: () => void; primary?: boolean; disabled?: boolean }

export class UI {
  screen: 'none' | 'main' | 'settings' | 'skins' | 'levelup' | 'shop' | 'chest' | 'pause' | 'result' = 'none';
  readonly joyBase: HTMLElement;
  readonly joyKnob: HTMLElement;
  readonly jumpBtn: HTMLElement;
  readonly pauseBtn: HTMLElement;
  readonly zoomBtn: HTMLElement;
  onUiSound: (ok: boolean) => void = () => {};

  private hud: HTMLElement;
  private overlay: HTMLElement;
  private focus: HTMLElement[] = [];
  private fi = 0;
  private openedAt = 0;
  private backFn: (() => void) | null = null;
  private el: Record<string, HTMLElement> = {};
  private mini: CanvasRenderingContext2D;
  private miniT = 0;
  private cache: Record<string, string | number> = {};
  private lastHp = 0;

  constructor(root: HTMLElement, isTouch: boolean) {
    this.hud = h('div', 'hud hidden');
    this.hud.innerHTML = `
      <div class="xpbar"><div class="xpfill"></div><span class="xptext"></span></div>
      <div class="tl">
        <div class="hprow"><div class="lvl">1</div><div class="hpbar"><div class="hpfill"></div><span class="hptext"></span></div><div class="buffs"></div></div>
        <div class="hudrow"><span class="hudlabel">Waffen</span><div class="slots"></div></div>
        <div class="hudrow"><span class="hudlabel">Fähigk.</span><div class="passives"></div></div>
        <div class="hudrow"><span class="hudlabel">Relikte</span><div class="relics"></div></div>
      </div>
      <div class="tc"><div class="timer">0:00</div>
        <div class="boss hidden"><div class="bossname"></div><div class="bossbar"><div class="bossfill"></div></div></div>
      </div>
      <div class="tr"><div class="stat">🪙 <span class="gold">0</span></div><div class="stat">💀 <span class="kills">0</span></div><canvas class="minimap" width="130" height="130"></canvas></div>
      <div class="banner"></div>
      <div class="toast"></div>
      <div class="interact hidden"><div class="ilabel"></div><div class="ibar"><div class="ifill"></div></div></div>
      <div class="vignette"></div>
      <div class="lowhp"></div>`;
    root.appendChild(this.hud);
    for (const k of ['xpbar', 'xpfill', 'xptext', 'buffs', 'lvl', 'hpfill', 'hptext', 'slots', 'passives', 'relics', 'timer', 'boss', 'bossname', 'bossfill', 'gold', 'kills', 'banner', 'toast', 'interact', 'ilabel', 'ifill', 'vignette', 'lowhp']) {
      this.el[k] = this.hud.querySelector('.' + k)!;
    }
    this.mini = (this.hud.querySelector('.minimap') as HTMLCanvasElement).getContext('2d')!;

    this.pauseBtn = h('button', 'pausebtn', '❚❚');
    this.hud.appendChild(this.pauseBtn);
    this.zoomBtn = h('button', 'zoombtn', '🔍');
    if (isTouch) this.hud.appendChild(this.zoomBtn);
    this.joyBase = h('div', 'joybase');
    this.joyKnob = h('div', 'joyknob');
    this.joyBase.appendChild(this.joyKnob);
    this.jumpBtn = h('button', 'jumpbtn', '⤒');
    if (isTouch) { root.appendChild(this.joyBase); this.hud.appendChild(this.jumpBtn); this.hud.classList.add('touch'); }

    this.overlay = h('div', 'overlay hidden');
    root.appendChild(this.overlay);
    root.appendChild(h('div', 'rotate', '<div>📱↻</div><p>Bitte ins Querformat drehen</p>'));
  }

  // ---------------- Menü-Grundlagen ----------------
  private open(screen: UI['screen'], content: HTMLElement, back: (() => void) | null) {
    this.screen = screen;
    this.overlay.innerHTML = '';
    this.overlay.appendChild(content);
    this.overlay.classList.remove('hidden');
    this.overlay.dataset.screen = screen;
    this.backFn = back;
    this.openedAt = performance.now();
    this.focus = Array.from(content.querySelectorAll<HTMLElement>('[data-nav]'));
    this.fi = Math.max(0, this.focus.findIndex((e) => !(e as HTMLButtonElement).disabled));
    this.applyFocus();
  }

  close() {
    this.screen = 'none';
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    this.focus = [];
  }

  private applyFocus() {
    this.focus.forEach((e, i) => e.classList.toggle('focus', i === this.fi));
  }

  nav(dx: number, dy: number) {
    if (!this.focus.length) return;
    const n = this.focus.length;
    this.fi = (this.fi + (dx || dy) + n) % n;
    this.applyFocus();
    this.onUiSound(true);
  }
  confirm() {
    if (performance.now() - this.openedAt < 350) return;
    this.focus[this.fi]?.click();
  }
  back() { this.backFn?.(); }

  private button(b: Btn) {
    const e = h('button', 'btn' + (b.primary ? ' primary' : ''), b.label) as HTMLButtonElement;
    e.dataset.nav = '1';
    e.disabled = !!b.disabled;
    e.onclick = () => {
      if (performance.now() - this.openedAt < 350) return;
      if (e.disabled) { this.onUiSound(false); return; }
      this.onUiSound(true);
      b.onClick();
    };
    return e;
  }

  private card(o: Offer, onClick: () => void, price?: number, disabled = false) {
    const i = offerInfo(o);
    const e = h('button', `card k-${o.kind} r${o.kind === 'weapon' ? 0 : o.rarity}` + (o.kind === 'weapon' && o.level === 1 ? ' new' : '')) as HTMLButtonElement;
    e.dataset.nav = '1';
    e.disabled = disabled;
    e.style.setProperty('--rc', i.color);
    e.innerHTML = `<div class="ctype">${o.kind === 'weapon' ? '⚔️ ' : o.kind === 'item' ? '✦ ' : ''}${i.type}</div>` +
      `<div class="cicon">${i.icon}</div><div class="ctitle">${i.title}</div><div class="ctag">${i.tag}</div><div class="cdesc">${i.desc}</div>` +
      (price !== undefined ? `<div class="cprice">${o.sold ? 'Gekauft' : `🪙 ${price}`}</div>` : '');
    e.onclick = () => {
      if (performance.now() - this.openedAt < 350) return;
      if (e.disabled) { this.onUiSound(false); return; }
      this.onUiSound(true);
      onClick();
    };
    return e;
  }

  // ---------------- Bildschirme ----------------
  showMain(save: SaveData, isTouch: boolean, onStart: () => void, onSettings: () => void, onSkins: () => void) {
    const c = h('div', 'panel main');
    c.innerHTML = `<h1>Kristallhain</h1><p class="sub">Überlebe den verfluchten Hain – fünf Bosse, dann der Schattenfürst.</p>`;
    c.appendChild(this.button({ label: 'Lauf starten', onClick: onStart, primary: true }));
    const skin = SKINS.find((s) => s.id === save.settings.skin) ?? SKINS[0];
    c.appendChild(this.button({ label: `Held: ${skin.icon} ${skin.name}`, onClick: onSkins }));
    c.appendChild(this.button({ label: 'Einstellungen', onClick: onSettings }));
    const best = save.bestTime > 0 ? `Bestzeit ${fmtTime(save.bestTime)} · Rekord ${save.bestKills} Kills · ${save.wins} Siege` : 'Noch kein Lauf gespielt';
    c.appendChild(h('p', 'best', best));
    c.appendChild(h('p', 'controls', isTouch
      ? 'Links ziehen: laufen · Rechts wischen: Kamera drehen & neigen · ⤒: springen · 🔍: Zoom'
      : 'WASD: laufen · Leertaste: springen · Maus ziehen oder Q/E, R/F: Kamera drehen & neigen · Mausrad oder +/−: Zoom · Esc: Pause · Gamepad geht auch'));
    this.open('main', c, null);
  }

  showSettings(save: SaveData, onChange: () => void, onBack: () => void) {
    const s = save.settings;
    const c = h('div', 'panel');
    c.appendChild(h('h2', '', 'Einstellungen'));
    const render = () => this.showSettings(save, onChange, onBack);
    const row = (label: string, value: string, btns: Btn[]) => {
      const r = h('div', 'setrow');
      r.appendChild(h('span', 'setlabel', label));
      const v = h('span', 'setval', value);
      r.appendChild(v);
      for (const b of btns) r.appendChild(this.button(b));
      c.appendChild(r);
    };
    row('Lautstärke', `${Math.round(s.volume * 100)}%`, [
      { label: '−', onClick: () => { s.volume = Math.max(0, +(s.volume - 0.1).toFixed(1)); onChange(); render(); } },
      { label: '+', onClick: () => { s.volume = Math.min(1, +(s.volume + 0.1).toFixed(1)); onChange(); render(); } },
    ]);
    row('Musik', `${Math.round(s.music * 100)}%`, [
      { label: '−', onClick: () => { s.music = Math.max(0, +(s.music - 0.1).toFixed(1)); onChange(); render(); } },
      { label: '+', onClick: () => { s.music = Math.min(1, +(s.music + 0.1).toFixed(1)); onChange(); render(); } },
    ]);
    row('Grafik', s.quality === 'hoch' ? 'Hoch (Leuchten)' : 'Niedrig (schneller)', [{ label: 'Umschalten', onClick: () => { s.quality = s.quality === 'hoch' ? 'niedrig' : 'hoch'; onChange(); render(); } }]);
    row('Bildschirmwackeln', s.shake ? 'An' : 'Aus', [{ label: 'Umschalten', onClick: () => { s.shake = !s.shake; onChange(); render(); } }]);
    row('Schadenszahlen', s.numbers ? 'An' : 'Aus', [{ label: 'Umschalten', onClick: () => { s.numbers = !s.numbers; onChange(); render(); } }]);
    row('Boden-Texturen', s.textures ? 'An' : 'Aus', [{ label: 'Umschalten', onClick: () => { s.textures = !s.textures; onChange(); render(); } }]);
    c.appendChild(this.button({ label: 'Zurück', onClick: onBack, primary: true }));
    const keep = this.screen === 'settings' ? this.fi : -1;
    this.open('settings', c, onBack);
    this.openedAt = 0; // Einstellungen sofort bedienbar
    if (keep >= 0) { this.fi = Math.min(keep, this.focus.length - 1); this.applyFocus(); }
  }

  showSkins(current: string, available: (id: string) => boolean, onPick: (id: string) => void, onBack: () => void) {
    const c = h('div', 'panel wide');
    c.appendChild(h('h2', '', 'Held wählen'));
    const row = h('div', 'cards');
    for (const s of SKINS) {
      const ok = available(s.id);
      const e = h('button', 'card skin' + (s.id === current ? ' chosen' : '')) as HTMLButtonElement;
      e.dataset.nav = '1';
      e.disabled = !ok;
      e.innerHTML = `<div class="ctype">${s.id === current ? '✓ Gewählt' : 'Held'}</div><div class="cicon">${s.icon}</div><div class="ctitle">${s.name}</div><div class="cdesc">${ok ? s.desc : 'lädt …'}</div>`;
      e.onclick = () => { if (!e.disabled) { this.onUiSound(true); onPick(s.id); } };
      row.appendChild(e);
    }
    c.appendChild(row);
    c.appendChild(this.button({ label: 'Zurück', onClick: onBack, primary: true }));
    this.open('skins', c, onBack);
    this.openedAt = 0;
    this.fi = Math.max(0, SKINS.findIndex((s) => s.id === current));
    this.applyFocus();
  }

  showLevelUp(sim: Sim, onPick: (i: number) => void) {
    const c = h('div', 'panel wide');
    c.appendChild(h('h2', 'glow', `Stufe ${sim.level - sim.pendingLevels + 1}!`));
    c.appendChild(h('p', 'sub', 'Wähle eine Verbesserung'));
    const row = h('div', 'cards');
    sim.offers.forEach((o, i) => row.appendChild(this.card(o, () => onPick(i))));
    c.appendChild(row);
    this.open('levelup', c, null);
  }

  showChest(sim: Sim, onPick: (i: number) => void) {
    const c = h('div', 'panel wide chest');
    c.appendChild(h('h2', 'glow', '🎁 Truhe geöffnet!'));
    c.appendChild(h('p', 'sub', 'Wähle ein Relikt'));
    const row = h('div', 'cards');
    sim.chestOffers.forEach((o, i) => row.appendChild(this.card(o, () => onPick(i))));
    c.appendChild(row);
    this.open('chest', c, null);
  }

  showShop(sim: Sim, onBuy: (i: number) => void, onReroll: () => void, onLeave: () => void) {
    const c = h('div', 'panel wide');
    c.appendChild(h('h2', '', 'Händler-Schrein'));
    c.appendChild(h('p', 'sub', `Du hast 🪙 ${sim.gold}`));
    const row = h('div', 'cards');
    sim.shopOffers.forEach((o, i) => {
      const dis = !!o.sold || sim.gold < o.price || !offerValid(sim, o);
      row.appendChild(this.card(o, () => onBuy(i), o.price, dis));
    });
    c.appendChild(row);
    const bar = h('div', 'btnrow');
    bar.appendChild(this.button({ label: `Neu würfeln (🪙 ${sim.rerollCost})`, onClick: onReroll, disabled: sim.gold < sim.rerollCost }));
    bar.appendChild(this.button({ label: 'Weiter kämpfen', onClick: onLeave, primary: true }));
    c.appendChild(bar);
    const keep = this.screen === 'shop' ? this.fi : -1;
    this.open('shop', c, onLeave);
    if (keep >= 0) { this.openedAt = 0; this.fi = Math.min(keep, this.focus.length - 1); this.applyFocus(); }
  }

  showPause(sim: Sim, onResume: () => void, onSettings: () => void, onRestart: () => void, onMenu: () => void) {
    const c = h('div', 'panel pause');
    c.appendChild(h('h2', '', 'Pause'));
    const cols = h('div', 'pausecols');
    const btns = h('div', 'pausebtns');
    btns.appendChild(this.button({ label: 'Weiter', onClick: onResume, primary: true }));
    btns.appendChild(this.button({ label: 'Einstellungen', onClick: onSettings }));
    btns.appendChild(this.button({ label: 'Neu starten', onClick: onRestart }));
    btns.appendChild(this.button({ label: 'Hauptmenü', onClick: onMenu }));
    // Werte-Übersicht des aktuellen Builds
    const s = sim.stats, p = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
    const rows: [string, string][] = [
      ['💪 Schaden', p(s.dmg - 1)], ['⏱️ Angriffstempo', p(1 / s.cd - 1)], ['⭕ Fläche', p(s.area - 1)],
      ['🪶 Tempo', p(s.speed - 1)], ['❤️ Max-HP', String(s.maxHp)], ['🌿 Regeneration', `${s.regen.toFixed(1)}/s`],
      ['🛡️ Rüstung', s.armor.toFixed(1)], ['🎯 Krit', `${Math.round(s.crit * 100)}% · ×${s.critDmg.toFixed(1)}`],
      ['🍀 Glück', p(s.luck)], ['🧲 Sammelradius', s.pickup.toFixed(1)], ['🦘 Sprung', `${p(s.jump - 1)} · ${1 + s.extraJumps}×`],
      ['✳️ Extra-Projektile', String(s.extraProj)],
    ];
    const tbl = h('div', 'statlist');
    tbl.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    cols.appendChild(btns);
    cols.appendChild(tbl);
    c.appendChild(cols);
    this.open('pause', c, onResume);
    this.openedAt = 0;
  }

  showResult(sim: Sim, won: boolean, newBest: boolean, onRestart: () => void, onMenu: () => void) {
    const c = h('div', 'panel wide');
    c.appendChild(h('h2', won ? 'glow' : '', won ? 'Sieg! Der Hain ist befreit.' : 'Gefallen …'));
    if (newBest) c.appendChild(h('p', 'sub', '✨ Neue Bestleistung!'));
    const stats = h('div', 'stats');
    stats.innerHTML = `<div><b>${fmtTime(sim.time)}</b>Zeit</div><div><b>${sim.kills}</b>Kills</div><div><b>${sim.level}</b>Stufe</div><div><b>${sim.gold}</b>Gold übrig</div>`;
    c.appendChild(stats);
    const rows = sim.weapons.map((w) => ({ label: `${WEAPONS[w.id].icon} ${WEAPONS[w.id].name} <small>St. ${w.level}</small>`, d: sim.weaponDamage[w.id] }));
    if (sim.weaponDamage[W_RELICS] > 0) rows.push({ label: '✦ Relikte', d: sim.weaponDamage[W_RELICS] });
    const total = rows.reduce((a, r) => a + r.d, 0) || 1;
    const dmg = h('div', 'dmglist');
    for (const r of rows.sort((a, b) => b.d - a.d)) {
      dmg.innerHTML += `<div class="dmgrow"><span>${r.label}</span><div class="dmgbar"><div style="width:${(r.d / total) * 100}%"></div></div><span>${Math.round(r.d).toLocaleString('de-DE')}</span></div>`;
    }
    c.appendChild(dmg);
    const bar = h('div', 'btnrow');
    bar.appendChild(this.button({ label: 'Nochmal', onClick: onRestart, primary: true }));
    bar.appendChild(this.button({ label: 'Hauptmenü', onClick: onMenu }));
    c.appendChild(bar);
    this.open('result', c, onMenu);
    this.openedAt = performance.now() + 400; // kurzer Schutz gegen versehentliches Weiterdrücken
  }

  // ---------------- HUD ----------------
  showHud(v: boolean) { this.hud.classList.toggle('hidden', !v); }

  setLowHp(v: boolean) {
    this.set('lowhp', v ? 1 : 0, () => this.el.lowhp.classList.toggle('on', v));
  }

  private set(key: string, value: string | number, fn: (v: string | number) => void) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  resetHud() { this.cache = {}; this.lastHp = 0; }

  updateHud(sim: Sim, yaw: number, dt: number) {
    const e = this.el;
    this.set('xp', Math.round((sim.xp / sim.xpNext) * 1000), (v) => (e.xpfill.style.width = `${(v as number) / 10}%`));
    this.set('xpt', `${Math.floor(sim.xp)}/${sim.xpNext}`, () => (e.xptext.textContent = `Stufe ${sim.level} · ${Math.floor(sim.xp)} / ${sim.xpNext} XP`));
    this.set('lvl', sim.level, (v) => {
      e.lvl.textContent = String(v);
      e.xpbar.classList.remove('up');
      void e.xpbar.offsetWidth;
      e.xpbar.classList.add('up');
    });
    const hp = Math.ceil(sim.hp);
    this.set('hp', `${hp}/${sim.stats.maxHp}`, (v) => {
      e.hptext.textContent = String(v);
      e.hpfill.style.width = `${(sim.hp / sim.stats.maxHp) * 100}%`;
    });
    if (this.lastHp && sim.hp < this.lastHp - 0.5) {
      e.vignette.classList.remove('hit');
      void e.vignette.offsetWidth;
      e.vignette.classList.add('hit');
    }
    this.lastHp = sim.hp;
    this.set('time', Math.floor(sim.time), () => (e.timer.textContent = fmtTime(sim.time)));
    this.set('gold', sim.gold, (v) => (e.gold.textContent = String(v)));
    this.set('kills', sim.kills, (v) => (e.kills.textContent = String(v)));

    const bsig = Array.from(sim.buffT).map((t) => (t > 0 ? Math.ceil(t) : 0)).join(',');
    this.set('buffs', bsig, () => {
      let html = '';
      sim.buffT.forEach((t, b) => { if (t > 0) html += `<span class="buff" title="${BUFFS[b].name}">${BUFFS[b].icon}<b>${Math.ceil(t)}</b></span>`; });
      e.buffs.innerHTML = html;
    });

    const wsig = sim.weapons.map((w) => `${w.id}:${w.level}`).join(',');
    this.set('slots', wsig, () => {
      let html = '';
      for (let i = 0; i < MAX_SLOTS; i++) {
        const w = sim.weapons[i];
        html += w
          ? `<div class="slot" title="${WEAPONS[w.id].name}">${WEAPONS[w.id].icon}<div class="pips">${'●'.repeat(w.level)}${'○'.repeat(5 - w.level)}</div></div>`
          : '<div class="slot empty"></div>';
      }
      e.slots.innerHTML = html;
    });
    this.set('pass', sim.passiveList.length, () => {
      // Rahmenfarbe = höchste erreichte Seltenheit dieser Fähigkeit
      const best = new Map<number, number>();
      for (const p of sim.passiveList) best.set(p.id, Math.max(best.get(p.id) ?? 0, p.r));
      let html = '';
      sim.passives.forEach((n, i) => {
        if (n) html += `<span class="pas" style="--rc:${RARITIES[best.get(i) ?? 0].color}" title="${PASSIVES[i].name}">${PASSIVES[i].icon}<sub>${n}</sub></span>`;
      });
      e.passives.innerHTML = html || '<span class="none">–</span>';
    });
    this.set('relics', Array.from(sim.items).join(','), () => {
      let html = '';
      sim.items.forEach((n, i) => {
        if (n) html += `<span class="rel" style="--rc:${RARITIES[ITEMS[i].rarity].color}" title="${ITEMS[i].name}: ${ITEMS[i].info}">${ITEMS[i].icon}${n > 1 ? `<sub>${n}</sub>` : ''}</span>`;
      });
      e.relics.innerHTML = html || '<span class="none">–</span>';
    });

    const bi = sim.bossIdx;
    this.set('boss', bi >= 0 ? 1 : 0, (v) => e.boss.classList.toggle('hidden', !v));
    if (bi >= 0) {
      this.set('bossname', sim.eType[bi], () => (e.bossname.textContent = ENEMIES[sim.eType[bi]].name));
      this.set('bosshp', Math.round((sim.ehp[bi] / sim.emax[bi]) * 500), (v) => (e.bossfill.style.width = `${(v as number) / 5}%`));
    }

    this.set('banner', sim.bannerT > 0 ? sim.banner : '', (v) => {
      e.banner.textContent = String(v);
      e.banner.classList.toggle('show', !!v);
    });
    this.set('toast', sim.toastT > 0 ? sim.toast : '', (v) => {
      e.toast.textContent = String(v);
      e.toast.classList.toggle('show', !!v);
    });
    this.set('ilabel', sim.interactLabel, (v) => {
      e.ilabel.textContent = String(v);
      e.interact.classList.toggle('hidden', !v);
    });
    this.set('iprog', Math.round(sim.interactProgress * 100), (v) => (e.ifill.style.width = `${v}%`));

    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.15; this.drawMinimap(sim, yaw); }
  }

  // Minikarte, gedreht wie die Kamera (oben = Blickrichtung)
  private drawMinimap(sim: Sim, yaw: number) {
    const c = this.mini, S = 130, R = S / 2, range = 90, k = (R - 6) / range;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2);
    c.fillStyle = 'rgba(24,18,40,0.62)'; c.fill();
    c.strokeStyle = 'rgba(190,160,255,0.45)'; c.lineWidth = 2; c.stroke();
    c.clip();
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const proj = (wx: number, wz: number, clamp: boolean): [number, number] => {
      const dx = wx - sim.hx, dz = wz - sim.hz;
      let px = (dx * cy - dz * sy) * k, py = (dx * sy + dz * cy) * k;
      const l = Math.hypot(px, py);
      if (clamp && l > R - 8) { px = (px / l) * (R - 8); py = (py / l) * (R - 8); }
      return [R + px, R + py];
    };
    for (const it of sim.interact) {
      if (it.used) continue;
      const far = Math.hypot(it.x - sim.hx, it.z - sim.hz) > range;
      if (far && it.kind !== 0) continue;
      const [x, y] = proj(it.x, it.z, true);
      c.globalAlpha = far ? 0.6 : 1;
      if (it.kind === 0) {
        c.fillStyle = '#a98cf0';
        c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 5, y); c.lineTo(x, y + 6); c.lineTo(x - 5, y); c.fill();
      } else if (it.kind === 2) {
        c.strokeStyle = '#7fe8ff'; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.stroke();
      } else {
        c.fillStyle = sim.gold >= sim.currentChestCost() ? '#f0b44c' : '#8a7a5a';
        c.fillRect(x - 3, y - 3, 6, 6);
      }
    }
    c.globalAlpha = 1;
    if (sim.bossIdx >= 0) {
      const [x, y] = proj(sim.ex[sim.bossIdx], sim.ez[sim.bossIdx], true);
      c.fillStyle = '#ff4d6d';
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
    }
    // Held
    const fpx = sim.fx * cy - sim.fz * sy, fpy = sim.fx * sy + sim.fz * cy;
    c.translate(R, R);
    c.rotate(Math.atan2(fpx, -fpy));
    c.fillStyle = '#f2eaff';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.fill();
    c.restore();
  }
}
