import './style.css';
import './theme.css';
import { Sim } from './core/sim';
import { TICK, BOSSES, metaFor, profileNeed } from './core/data';
import { View } from './render/view';
import { Input } from './input';
import { Sfx } from './audio';
import { Music } from './music';
import { UI } from './ui';
import { loadSave, writeSave, addProfileXp } from './save';
import { createSkin, loadAssassin, SKINS, type AssassinParts } from './render/hero';

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const lowQ = isTouch; // Handy: weniger Pixel, weniger Gegner, weniger Partikel
const enemyCap = lowQ ? 650 : 1100;

const save = loadSave();
const view = new View(document.getElementById('app')!, lowQ);
const ui = new UI(document.getElementById('ui')!, isTouch);
const input = new Input(view.renderer.domElement, ui.joyBase, ui.joyKnob, ui.jumpBtn);
const sfx = new Sfx();
const music = new Music();
let beatT = 0;

const newSeed = () => Math.floor(Math.random() * 1e9);
let sim = new Sim(newSeed(), enemyCap, metaFor(save.profile.level));
view.attach(sim);
let state: 'menu' | 'run' | 'pause' | 'result' = 'menu';
let acc = 0;

function applySettings() {
  sfx.setVolume(save.settings.volume);
  music.setVolume(save.settings.music);
  view.setQuality(save.settings.quality === 'hoch');
  view.shakeOn = save.settings.shake;
  view.numbersOn = save.settings.numbers;
  view.zoom = view.dist = save.settings.zoom;
  view.setTextures(save.settings.textures);
  view.lampOn = save.settings.lantern;
  writeSave(save);
}

function toMenu() {
  state = 'menu';
  ui.showHud(false);
  ui.showMain(save, isTouch, startRun, () => ui.showSettings(save, applySettings, toMenu), showSkins, () => ui.showProfile(save, toMenu));
}

// ---- Helden-Skins (teils über Profil-Stufen freigeschaltet) ----
let assassinParts: AssassinParts | null = null;
const skinUnlocked = (id: string) => (SKINS.find((s) => s.id === id)?.level ?? 99) <= save.profile.level;
function applySkin() {
  if (!skinUnlocked(save.settings.skin)) save.settings.skin = 'assassin';
  view.setSkin(createSkin(save.settings.skin, assassinParts));
}
function showSkins() {
  ui.showSkins(
    save.settings.skin,
    save.profile.level,
    (id) => SKINS.find((s) => s.id === id)?.base !== 'assassin' || !!assassinParts,
    (id) => { if (!skinUnlocked(id)) return; save.settings.skin = id; writeSave(save); applySkin(); showSkins(); },
    toMenu,
  );
}
loadAssassin(`${import.meta.env.BASE_URL}models/assassin.glb`)
  .then((p) => {
    assassinParts = p;
    applySkin();
    if (ui.screen === 'skins') showSkins();
  })
  .catch((e) => console.warn('Assassine konnte nicht geladen werden', e));

function startRun() {
  sim = new Sim(newSeed(), enemyCap, metaFor(save.profile.level));
  view.attach(sim);
  view.pitchTarget = save.settings.pitch;
  view.zoom = save.settings.zoom;
  acc = 0;
  state = 'run';
  ui.close();
  ui.resetHud();
  ui.showHud(true);
  input.consumeJump();
}

function pause() {
  if (state !== 'run' || sim.mode !== 'run') return;
  state = 'pause';
  showPause();
}
function showPause() {
  ui.showPause(sim, resume, () => ui.showSettings(save, applySettings, showPause), startRun, toMenu);
}
function resume() {
  state = 'run';
  ui.close();
  input.consumeJump();
}

function openLevelUp() {
  ui.showLevelUp(sim, (i) => {
    sim.pickLevelOffer(i);
    if (sim.mode === 'levelup') openLevelUp();
    else { ui.close(); input.consumeJump(); }
  });
}
function openChest() {
  ui.showChest(sim, (i) => { sim.pickChest(i); ui.close(); input.consumeJump(); });
}
function openShop() {
  ui.showShop(
    sim,
    (i) => { sim.buyShop(i); openShop(); },
    () => { sim.rerollShop(); openShop(); },
    () => { sim.leaveShop(); ui.close(); input.consumeJump(); },
  );
}

function finish(won: boolean) {
  state = 'result';
  save.runs++;
  let newBest = false;
  if (sim.time > save.bestTime) { save.bestTime = sim.time; newBest = true; }
  if (sim.kills > save.bestKills) { save.bestKills = sim.kills; newBest = true; }
  if (won) save.wins++;
  // Profil-Erfahrung: Kills, Überlebenszeit, Bosse, Sieg
  const gained = Math.round(sim.kills * 0.6 + sim.time * 1.2 + sim.bossKills * 150 + (won ? 800 : 0));
  const before = save.profile.level;
  const rewards = addProfileXp(save, gained);
  writeSave(save);
  ui.showResult(sim, won, newBest, startRun, toMenu, {
    gained, level: save.profile.level, levelsUp: save.profile.level - before, rewards,
    xp: save.profile.xp, need: profileNeed(save.profile.level),
  });
}

function toggleLamp() {
  save.settings.lantern = !save.settings.lantern;
  view.lampOn = save.settings.lantern;
  writeSave(save);
}

input.onNav = (x, y) => ui.nav(x, y);
input.onConfirm = () => ui.confirm();
input.onBack = () => ui.back();
input.onToggleLamp = toggleLamp;
ui.lampBtn.addEventListener('click', toggleLamp);
ui.onUiSound = (ok) => (ok ? sfx.ui() : sfx.deny());
ui.pauseBtn.addEventListener('click', pause);
// Touch: Zoom in drei Stufen durchschalten
let zoomDirty = false;
ui.zoomBtn.addEventListener('click', () => {
  const steps = [16, 22, 30];
  const next = steps.find((s) => s > view.zoom + 0.5) ?? steps[0];
  view.zoom = next;
  save.settings.zoom = next;
  writeSave(save);
});

// Audio darf erst nach einer Eingabe starten (iOS/Chrome)
const unlock = () => {
  sfx.unlock();
  if (sfx.context) music.start(sfx.context);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
window.addEventListener('gamepadconnected', unlock);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// Testhilfen nur im Dev-Server: L = Level-up, G = +100 Gold, B = zum nächsten Boss springen
if (import.meta.env.DEV) {
  window.addEventListener('keydown', (e) => {
    if (state !== 'run' || sim.mode !== 'run') return;
    if (e.code === 'KeyL') { sim.xp = sim.xpNext; sim.spawnPickup(0, sim.hx, sim.hz, 0.01, 0); }
    if (e.code === 'KeyG') sim.gold += 100;
    if (e.code === 'KeyB') { const nb = BOSSES.find((b) => b.t > sim.time); if (nb) sim.time = nb.t - 2; }
  });
  (window as unknown as { game: unknown }).game = { get sim() { return sim; }, view, ui };
}

applySettings();
toMenu();

let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.menuActive = ui.screen !== 'none';
  input.poll(dt);

  if (state === 'run') {
    if (input.consumePause()) pause();
    view.yaw += input.consumeRot();
    const z = input.consumeZoom();
    if (z !== 1) { view.zoomBy(z); save.settings.zoom = view.zoom; zoomDirty = true; }
    // Kamera neigen: flacher (mehr Horizont) bis steil von oben
    const p = input.consumePitch();
    if (p !== 0) {
      view.pitchTarget = Math.max(0.45, Math.min(1.3, view.pitchTarget + p));
      view.pitch = view.pitchTarget;
      save.settings.pitch = view.pitchTarget;
      zoomDirty = true;
    }
    if (state === 'run' && sim.mode === 'run') {
      const [wx, wz] = view.toWorld(input.moveX, input.moveY);
      sim.inX = wx; sim.inZ = wz;
      if (input.consumeJump()) sim.jumpBuf = 0.15;
      let simDt = dt;
      if (sim.hitStop > 0) { sim.hitStop -= dt; simDt *= 0.15; }
      acc += simDt;
      let steps = 0;
      while (acc >= TICK && steps < 6 && sim.mode === 'run') { sim.step(TICK); acc -= TICK; steps++; }
      if (steps >= 6) acc = 0;
    }
    view.handleEvents(sim);
    sfx.handleEvents(sim, dt);
    sim.evN = 0;
    if (sim.mode === 'levelup' && ui.screen !== 'levelup') openLevelUp();
    if (sim.mode === 'shop' && ui.screen !== 'shop') openShop();
    if (sim.mode === 'chest' && ui.screen !== 'chest') openChest();
    if (sim.mode === 'dead' || sim.mode === 'won') finish(sim.mode === 'won');
    ui.updateHud(sim, view.yaw, dt);
  } else {
    input.consumePause(); input.consumeJump(); input.consumeRot(); input.consumeZoom(); input.consumePitch();
    if (zoomDirty) { zoomDirty = false; writeSave(save); }
    if (state === 'menu') {
      // Heldenauswahl: nah ranzoomen und langsam um den Helden kreisen (Vorschau)
      const preview = ui.screen === 'skins';
      view.yaw += dt * (preview ? 0.5 : 0.06);
      view.zoom = preview ? 7 : 24;
      view.pitchTarget = preview ? 0.22 : 0.3; // flach: Berge am Horizont sichtbar
    }
  }

  // Musik folgt dem Geschehen: mehr Gegner = mehr Ebenen, Boss = Moll + volle Drums
  let mi = 0.12, boss = false;
  if (state === 'run' || state === 'pause') {
    boss = sim.bossIdx >= 0;
    mi = boss ? 1 : 0.3 + Math.min(1, sim.eCount / 450) * 0.45 + Math.min(0.1, sim.time / 600);
    if (sim.mode === 'dead') mi = 0;
  }
  music.set({ intensity: mi, boss, muffled: state !== 'run' && state !== 'menu' || (state === 'run' && sim.mode !== 'run') });

  // Wenig HP: Herzschlag + pulsierender Rand
  const low = state === 'run' && sim.mode === 'run' && sim.hp < sim.stats.maxHp * 0.3;
  ui.setLowHp(low);
  if (low) {
    beatT -= dt;
    if (beatT <= 0) { sfx.heartbeat(); beatT = 0.55 + (sim.hp / (sim.stats.maxHp * 0.3)) * 0.5; }
  }

  const live = state === 'run' && sim.mode === 'run';
  view.update(sim, Math.min(1, acc / TICK), live || state === 'menu' ? dt : 0);
}
requestAnimationFrame(frame);
