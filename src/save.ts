// Lokales Speichern. Später austauschbar gegen iOS-Speicher / Cloud-Save – nur diese Datei ändern.
export interface Settings {
  volume: number;
  shake: boolean;
  numbers: boolean;
  zoom: number;
  skin: string;
  textures: boolean;
}

export interface SaveData {
  bestTime: number;
  bestKills: number;
  wins: number;
  runs: number;
  settings: Settings;
}

const KEY = 'kristallhain-save-v1';

const defaults = (): SaveData => ({
  bestTime: 0, bestKills: 0, wins: 0, runs: 0,
  settings: { volume: 0.7, shake: true, numbers: true, zoom: 20, skin: 'assassin', textures: true },
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const base = defaults();
    return { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}) } };
  } catch {
    return defaults();
  }
}

export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* privater Modus o. ä. – Spiel läuft ohne Speichern weiter */
  }
}
