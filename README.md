# Kristallhain – Survivor-Prototyp

3D-Roguelite-Survivor (Three.js + TypeScript + Vite). Pastell-Fantasy, Platzhalter-Figuren aus Code.

## Starten

```bash
npm install
npm run dev
```

Dann http://localhost:5173 öffnen. Auf dem Handy im selben WLAN die „Network“-Adresse aus der Konsole öffnen.

## Steuerung

| | PC | Gamepad | Handy |
|---|---|---|---|
| Laufen | WASD / Pfeile | linker Stick | links ziehen |
| Springen | Leertaste | A / ✕ | ⤒-Knopf |
| Kamera drehen | Q/E oder Maus ziehen | rechter Stick | rechts wischen |
| Pause | Esc / P | Start / Options | ❚❚ |

Schreine und Truhen öffnen sich, wenn man kurz darauf stehen bleibt.

Testhilfen (nur `npm run dev`): **L** = Level-up, **G** = +100 Gold, **B** = zum nächsten Boss springen.

## Bilder mit Magenta-Hintergrund freistellen

```bash
node tools/key-magenta.mjs assets/bild.png public/textures/bild.png
```

Entfernt `#FF00FF` sauber (ohne pinken Saum) und schreibt ein PNG mit Transparenz. Originale bleiben in `assets/`, fertige Dateien kommen nach `public/`.

## Aufbau

- `src/core/` – Spiellogik ohne Three.js (portierbar): `sim.ts` (Held, Gegner, Projektile, Pickups, Warnflächen, Spawns), `weapons.ts`, `upgrades.ts`, `terrain.ts`, `data.ts` (**alle Werte zum Balancieren**)
- `src/render/` – Darstellung: `view.ts` (Kamera, Instancing, Spielgefühl), `world.ts` (Terrain & Requisiten), `fx.ts` (Partikel, Schadenszahlen, Warnflächen), `models.ts` (Figuren aus Primitiven)
- `src/ui.ts`, `src/input.ts`, `src/audio.ts` (synthetische Sounds), `src/save.ts` (lokales Speichern)
