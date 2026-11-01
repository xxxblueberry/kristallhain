// Stellt Bilder mit Magenta-Hintergrund (#FF00FF) sauber frei und schreibt PNG mit Transparenz.
//   node tools/key-magenta.mjs <eingabe> <ausgabe.png>
//
// 1. Anteil Magenta je Pixel schätzen (nur kräftiges Magenta zählt, Lila/Rosa im Motiv bleibt)
// 2. Farbe "entmischen": Magenta-Anteil aus Kantenpixeln herausrechnen (kein pinker Saum)
// 3. Farben in transparente Bereiche ausdehnen, damit Mipmaps keinen Magenta-Rand erzeugen
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Aufruf: node tools/key-magenta.mjs <eingabe> <ausgabe.png>');
  process.exit(1);
}

const T0 = 110, T1 = 220; // Schwellen für "Magenta-heit" = min(r,b) - g

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = new Float32Array(W * H * 4);

let cut = 0;
for (let i = 0; i < W * H; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  const m = Math.min(r, b) - g;
  let key = (m - T0) / (T1 - T0);
  key = key < 0 ? 0 : key > 1 ? 1 : key;
  const a = 1 - key;
  let R = r, G = g, B = b;
  if (key > 0 && a > 0.02) {
    // C = a*F + key*M  →  F = (C - key*M) / a
    R = (r - key * 255) / a; G = g / a; B = (b - key * 255) / a;
  }
  px[i * 4] = Math.max(0, Math.min(255, R));
  px[i * 4 + 1] = Math.max(0, Math.min(255, G));
  px[i * 4 + 2] = Math.max(0, Math.min(255, B));
  px[i * 4 + 3] = a <= 0.02 ? 0 : a * 255;
  if (px[i * 4 + 3] === 0) cut++;
}

// Kantenfarben nach außen ausdehnen (nur RGB, Alpha bleibt 0)
const filled = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) filled[i] = px[i * 4 + 3] > 0 ? 1 : 0;
for (let pass = 0; pass < 12; pass++) {
  const add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (filled[i]) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (!filled[j]) continue;
      r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++;
    }
    if (n) add.push(i, r / n, g / n, b / n);
  }
  if (!add.length) break;
  for (let k = 0; k < add.length; k += 4) {
    const i = add[k];
    px[i * 4] = add[k + 1]; px[i * 4 + 1] = add[k + 2]; px[i * 4 + 2] = add[k + 3];
    filled[i] = 1;
  }
}

const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < out.length; i++) out[i] = Math.round(px[i]);
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(output);
console.log(`${input} → ${output}  (${W}×${H}, ${((cut / (W * H)) * 100).toFixed(1)}% transparent)`);
