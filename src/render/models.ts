// Platzhalter-Figuren aus Code: Primitive mit Vertex-Farben, zu je einer Geometrie verschmolzen
// (eine Geometrie pro Typ = ein Draw-Call pro Typ mit Instancing).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

export function part(g: THREE.BufferGeometry, color: number, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s),
  );
  geo.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  return g;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ico = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
const oct = (r: number) => new THREE.OctahedronGeometry(r);
const cone = (r: number, h: number, s = 6) => new THREE.ConeGeometry(r, h, s);
const cyl = (rt: number, rb: number, h: number, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const dome = (r: number, w = 8, h = 4) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
const PI = Math.PI;

// Alle Figuren schauen nach +Z, Fußpunkt bei y = 0
export function heroGeo() {
  return merge([
    part(box(0.2, 0.4, 0.22), 0x6a5aa8, [-0.15, 0.2, 0]),
    part(box(0.2, 0.4, 0.22), 0x6a5aa8, [0.15, 0.2, 0]),
    part(cyl(0.34, 0.5, 0.95, 7), 0xb9a7f0, [0, 0.82, 0]),
    part(box(0.75, 0.12, 0.45), 0xffc7de, [0, 1.22, 0]),
    part(ico(0.36, 1), 0xffdcc8, [0, 1.58, 0]),
    part(cone(0.44, 0.62, 7), 0x8f7fe0, [0, 1.92, -0.06], [-0.15, 0, 0]),
    part(box(0.09, 0.12, 0.04), 0x3b2f5a, [-0.12, 1.6, 0.33]),
    part(box(0.09, 0.12, 0.04), 0x3b2f5a, [0.12, 1.6, 0.33]),
    part(box(0.1, 0.06, 0.04), 0xff9fb8, [-0.2, 1.48, 0.31]),
    part(box(0.1, 0.06, 0.04), 0xff9fb8, [0.2, 1.48, 0.31]),
    // Speer auf dem Rücken
    part(cyl(0.035, 0.035, 2.0, 5), 0xe8d6a8, [0.05, 1.2, -0.42], [0, 0, 0.5]),
    part(cone(0.1, 0.32, 5), 0xa8e6ff, [-0.45, 2.1, -0.42], [0, 0, 0.5]),
  ]);
}

export function beetleGeo() {
  const legs: THREE.BufferGeometry[] = [];
  for (let k = -1; k <= 1; k++) for (const sx of [-1, 1]) {
    legs.push(part(box(0.5, 0.08, 0.08), 0x3d3a5c, [sx * 0.55, 0.12, k * 0.3], [0, 0, sx * -0.4]));
  }
  return merge([
    ...legs,
    part(dome(0.6), 0x7fd8d0, [0, 0.12, -0.05], [0, 0, 0], [1, 0.8, 1.2]),
    part(box(0.9, 0.06, 1.1), 0x5fb8b8, [0, 0.14, -0.05]),
    part(ico(0.26), 0x3d3a5c, [0, 0.3, 0.62]),
    part(box(0.08, 0.08, 0.05), 0xffffff, [-0.1, 0.36, 0.84]),
    part(box(0.08, 0.08, 0.05), 0xffffff, [0.1, 0.36, 0.84]),
    part(oct(0.22), 0xff9ed8, [0, 0.72, -0.1], [0, 0, 0], [0.7, 1.7, 0.7]),
    part(oct(0.14), 0xc6a8ff, [0.25, 0.6, -0.3], [0, 0, 0.4], [0.7, 1.6, 0.7]),
  ]);
}

export function wolfGeo() {
  const parts = [
    part(box(0.62, 0.55, 1.3), 0x9b8fc4, [0, 0.8, 0]),
    part(box(0.52, 0.48, 0.55), 0x9b8fc4, [0, 1.05, 0.82]),
    part(box(0.3, 0.24, 0.38), 0xc9bfe6, [0, 0.95, 1.2]),
    part(box(0.12, 0.1, 0.06), 0x3b2f5a, [0, 1.02, 1.4]),
    part(cone(0.12, 0.3, 4), 0x7d70ad, [-0.16, 1.42, 0.78]),
    part(cone(0.12, 0.3, 4), 0x7d70ad, [0.16, 1.42, 0.78]),
    part(box(0.1, 0.08, 0.04), 0xff5c8a, [-0.14, 1.12, 1.1]),
    part(box(0.1, 0.08, 0.04), 0xff5c8a, [0.14, 1.12, 1.1]),
    part(cone(0.16, 0.7, 5), 0x7d70ad, [0, 0.95, -0.85], [-1.9, 0, 0]),
  ];
  for (const [x, z] of [[-0.2, 0.45], [0.2, 0.45], [-0.2, -0.45], [0.2, -0.45]]) parts.push(part(box(0.17, 0.55, 0.17), 0x6f6399, [x, 0.27, z]));
  for (let k = 0; k < 4; k++) parts.push(part(cone(0.1, 0.42, 4), 0x7fcf9a, [0, 1.18, 0.35 - k * 0.3], [-0.6, 0, 0]));
  return merge(parts);
}

export function shamanGeo() {
  const parts = [
    part(cyl(0.3, 0.42, 0.9, 7), 0xfff1dc, [0, 0.45, 0]),
    part(dome(0.78, 9, 4), 0xff8fb0, [0, 0.82, 0], [0, 0, 0], [1, 0.75, 1]),
    part(box(0.09, 0.13, 0.04), 0x3b2f5a, [-0.11, 0.6, 0.31]),
    part(box(0.09, 0.13, 0.04), 0x3b2f5a, [0.11, 0.6, 0.31]),
    part(cyl(0.04, 0.04, 1.5, 5), 0x9a7b5c, [0.5, 0.75, 0.15]),
    part(ico(0.16), 0xb7f0a0, [0.5, 1.58, 0.15]),
  ];
  for (const [x, y, z] of [[0.3, 1.25, 0.35], [-0.4, 1.15, 0.2], [0, 1.38, -0.2], [-0.15, 1.2, 0.5], [0.45, 1.05, -0.35]]) {
    parts.push(part(ico(0.1), 0xffffff, [x, y, z]));
  }
  return merge(parts);
}

export function wispGeo() {
  return merge([
    part(ico(0.42, 1), 0xfff0a0, [0, 0, 0]),
    part(cone(0.32, 0.85, 6), 0xffc6e0, [0, 0.55, -0.08], [-0.25, 0, 0]),
    part(ico(0.18), 0xffffff, [0.15, 0.1, 0.25]),
    part(box(0.07, 0.12, 0.04), 0x5a3a7a, [-0.12, 0.05, 0.4]),
    part(box(0.07, 0.12, 0.04), 0x5a3a7a, [0.12, 0.05, 0.4]),
  ]);
}

export function golemGeo() {
  return merge([
    part(box(0.6, 0.8, 0.6), 0x9d8f82, [-0.45, 0.4, 0]),
    part(box(0.6, 0.8, 0.6), 0x9d8f82, [0.45, 0.4, 0]),
    part(box(1.6, 1.4, 1.1), 0xb8a99a, [0, 1.45, 0], [0.1, 0, 0]),
    part(box(1.5, 0.25, 1.0), 0x9fd89a, [0, 2.2, -0.05]),
    part(box(0.7, 0.6, 0.6), 0xc4b6a8, [0, 2.4, 0.35]),
    part(box(0.12, 0.1, 0.04), 0x7ff0ff, [-0.15, 2.45, 0.66]),
    part(box(0.12, 0.1, 0.04), 0x7ff0ff, [0.15, 2.45, 0.66]),
    part(box(0.55, 1.5, 0.55), 0xa89a8c, [-1.1, 1.25, 0.15], [0.2, 0, 0.1]),
    part(box(0.55, 1.5, 0.55), 0xa89a8c, [1.1, 1.25, 0.15], [0.2, 0, -0.1]),
    part(oct(0.35), 0xa8e0ff, [-0.9, 2.3, -0.1], [0, 0, 0.4], [0.7, 1.5, 0.7]),
    part(oct(0.3), 0xffb8e0, [0.85, 2.35, -0.2], [0, 0, -0.3], [0.7, 1.5, 0.7]),
  ]);
}

export function hydraGeo() {
  const parts = [
    part(ico(2.1, 1), 0xa8d8ff, [0, 2.0, -0.4], [0, 0, 0], [1, 0.75, 1.2]),
    part(cone(0.8, 2.6, 6), 0x8cc4f0, [0, 1.6, -3.0], [-1.8, 0, 0]),
  ];
  for (const sx of [-1, 0, 1]) {
    parts.push(part(cyl(0.38, 0.6, 3.2, 6), 0x9fd0ff, [sx * 1.0, 3.6, 1.1], [0.55, 0, -sx * 0.35]));
    parts.push(part(box(0.9, 0.7, 1.4), 0xb8e2ff, [sx * 1.6, 5.0, 2.2], [0.25, 0, 0]));
    parts.push(part(cone(0.18, 0.5, 4), 0xff9ed8, [sx * 1.6 - 0.25, 5.5, 2.0], [-0.4, 0, 0.3]));
    parts.push(part(cone(0.18, 0.5, 4), 0xff9ed8, [sx * 1.6 + 0.25, 5.5, 2.0], [-0.4, 0, -0.3]));
    parts.push(part(box(0.14, 0.12, 0.05), 0xff4d8a, [sx * 1.6 - 0.22, 5.12, 2.92]));
    parts.push(part(box(0.14, 0.12, 0.05), 0xff4d8a, [sx * 1.6 + 0.22, 5.12, 2.92]));
  }
  for (let k = 0; k < 5; k++) parts.push(part(oct(0.45), k % 2 ? 0xff9ed8 : 0xd0b8ff, [0, 3.4 - k * 0.1, 0.6 - k * 0.8], [0, 0, 0], [0.6, 1.8, 0.6]));
  for (const [x, z] of [[-1.3, 0.8], [1.3, 0.8], [-1.3, -1.4], [1.3, -1.4]]) parts.push(part(box(0.6, 1.2, 0.6), 0x86b8e8, [x, 0.6, z]));
  return merge(parts);
}

export function titanGeo() {
  const parts = [
    part(box(1.3, 2.4, 1.3), 0x8e8e9e, [-1.0, 1.2, 0]),
    part(box(1.3, 2.4, 1.3), 0x8e8e9e, [1.0, 1.2, 0]),
    part(box(3.4, 3.0, 2.4), 0xa0a0b0, [0, 3.9, 0], [0.12, 0, 0]),
    part(box(3.2, 0.6, 2.2), 0x9fcf8f, [0, 5.5, -0.2]),
    part(box(1.4, 1.2, 1.2), 0xb0b0c0, [0, 6.2, 0.7]),
    part(box(0.25, 0.18, 0.05), 0xffe38a, [-0.3, 6.3, 1.32]),
    part(box(0.25, 0.18, 0.05), 0xffe38a, [0.3, 6.3, 1.32]),
    part(box(1.2, 3.8, 1.2), 0x96969f, [-2.4, 3.6, 0.3], [0.25, 0, 0.12]),
    part(box(1.2, 3.8, 1.2), 0x96969f, [2.4, 3.6, 0.3], [0.25, 0, -0.12]),
    part(box(1.0, 0.4, 1.0), 0x9fcf8f, [-2.4, 5.6, 0.2]),
    part(box(1.0, 0.4, 1.0), 0x9fcf8f, [2.4, 5.6, 0.2]),
  ];
  // kleine Bäume und Kristalle auf dem Rücken
  for (const [x, z, c] of [[-0.9, -0.5, 0xffc2dc], [0.8, -0.7, 0xa8e6c8], [0.1, -1.0, 0xffd6e8]] as [number, number, number][]) {
    parts.push(part(cyl(0.12, 0.16, 0.8, 5), 0xb08a7a, [x, 6.1, z]));
    parts.push(part(ico(0.6), c, [x, 6.8, z]));
  }
  parts.push(part(oct(0.5), 0xa8e0ff, [-1.4, 6.0, 0.5], [0, 0, 0.3], [0.6, 1.8, 0.6]));
  parts.push(part(oct(0.4), 0xffb8e0, [1.5, 6.0, 0.6], [0, 0, -0.3], [0.6, 1.8, 0.6]));
  return merge(parts);
}

export function kingGeo() {
  // großer Käfer mit Krone und Kristallpanzer
  const legs: THREE.BufferGeometry[] = [];
  for (let k = -1; k <= 1; k++) for (const sx of [-1, 1]) {
    legs.push(part(box(1.4, 0.22, 0.22), 0x2e2a4a, [sx * 1.5, 0.35, k * 0.8], [0, 0, sx * -0.45]));
  }
  return merge([
    ...legs,
    part(dome(1.6, 10, 5), 0x4fb8b0, [0, 0.35, -0.2], [0, 0, 0], [1, 0.85, 1.25]),
    part(box(2.4, 0.15, 2.9), 0x3e9a94, [0, 0.4, -0.2]),
    part(ico(0.75, 1), 0x2e2a4a, [0, 0.8, 1.6]),
    part(box(0.2, 0.18, 0.08), 0xff4d8a, [-0.28, 0.95, 2.28]),
    part(box(0.2, 0.18, 0.08), 0xff4d8a, [0.28, 0.95, 2.28]),
    part(cone(0.18, 0.9, 4), 0x2e2a4a, [-0.45, 0.6, 2.3], [1.3, 0, 0.3]),
    part(cone(0.18, 0.9, 4), 0x2e2a4a, [0.45, 0.6, 2.3], [1.3, 0, -0.3]),
    // Krone
    part(cyl(0.55, 0.6, 0.25, 8), 0xffd56b, [0, 1.45, 1.55]),
    part(cone(0.12, 0.4, 4), 0xffd56b, [-0.38, 1.75, 1.55]),
    part(cone(0.12, 0.45, 4), 0xffd56b, [0, 1.8, 1.55]),
    part(cone(0.12, 0.4, 4), 0xffd56b, [0.38, 1.75, 1.55]),
    part(oct(0.1), 0xff9ed8, [0, 1.48, 2.08]),
    // Kristalle auf dem Panzer
    part(oct(0.5), 0xff9ed8, [0, 2.1, -0.4], [0, 0, 0], [0.7, 1.7, 0.7]),
    part(oct(0.35), 0xc6a8ff, [-0.7, 1.8, -0.9], [0, 0, 0.4], [0.7, 1.6, 0.7]),
    part(oct(0.35), 0xa8e0ff, [0.7, 1.8, -0.9], [0, 0, -0.4], [0.7, 1.6, 0.7]),
  ]);
}

export function witchGeo() {
  // schwebende Hexe: Kleid ohne Füße, spitzer Hut, Sternenstab (Ursprung = Schwebehöhe)
  return merge([
    part(cone(0.9, 2.0, 7), 0x6a4fb0, [0, -0.1, 0], [PI, 0, 0]),
    part(cone(1.1, 0.5, 7), 0x8f6fd8, [0, -1.0, 0], [PI, 0, 0]),
    part(cyl(0.45, 0.6, 0.9, 7), 0x7d5fc8, [0, 1.2, 0]),
    part(ico(0.48, 1), 0xd8c8ff, [0, 2.0, 0]),
    part(box(0.14, 0.1, 0.05), 0xfff07a, [-0.16, 2.05, 0.44]),
    part(box(0.14, 0.1, 0.05), 0xfff07a, [0.16, 2.05, 0.44]),
    part(cyl(1.0, 1.0, 0.08, 10), 0x3b2f6a, [0, 2.35, 0]),
    part(cone(0.55, 1.4, 7), 0x3b2f6a, [0.1, 3.05, -0.15], [-0.25, 0, 0.12]),
    part(box(1.04, 0.14, 0.14), 0xffb8e0, [0, 2.45, 0]),
    part(cyl(0.05, 0.05, 2.6, 5), 0xb08a7a, [0.9, 1.2, 0.3], [0.1, 0, -0.15]),
    part(oct(0.3), 0xfff0a0, [1.08, 2.55, 0.4]),
    part(box(0.18, 0.7, 0.18), 0x7d5fc8, [-0.6, 1.2, 0.2], [0.4, 0, 0.5]),
  ]);
}

export function queenGeo() {
  // riesige Spinne mit Kristall-Hinterleib
  const parts: THREE.BufferGeometry[] = [
    part(ico(1.5, 1), 0x4a3a7a, [0, 1.6, -1.6], [0, 0, 0], [1, 0.85, 1.25]),
    part(ico(0.9, 1), 0x3a2e5e, [0, 1.3, 0.4]),
    part(ico(0.55, 0), 0x2e2448, [0, 1.25, 1.35]),
  ];
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const z = 0.9 - k * 0.55, spread = 0.5 - k * 0.3;
    parts.push(part(box(0.16, 0.16, 1.9), 0x2e2448, [sx * 1.0, 1.7, z], [0.0, sx * (1.2 + spread), sx * 0.5]));
    parts.push(part(box(0.13, 1.8, 0.13), 0x2e2448, [sx * 2.1, 0.85, z + spread * 0.6], [0, 0, sx * 0.25]));
  }
  for (const [x, y, z, c] of [[-0.3, 1.35, 1.88, 0xff4d8a], [0.3, 1.35, 1.88, 0xff4d8a], [-0.15, 1.5, 1.82, 0xff8ab8], [0.15, 1.5, 1.82, 0xff8ab8]] as [number, number, number, number][]) {
    parts.push(part(box(0.12, 0.12, 0.05), c, [x, y, z]));
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push(part(oct(0.35), k % 2 ? 0xb89aff : 0x7fd8ff, [Math.sin(a) * 0.9, 2.5, -1.6 + Math.cos(a) * 1.0], [0.3, a, 0], [0.6, 1.8, 0.6]));
  }
  return merge(parts);
}

export function darkLordGeo() {
  // gepanzerter Schattenfürst, ~7,5 m, Umhang, Kristallkrone, Großschwert
  const A = 0x2a2238, B = 0x3c3050, C = 0x15111f, G = 0xc04dff, R = 0xff3b6b;
  return merge([
    part(box(1.0, 2.6, 1.0), A, [-0.75, 1.3, 0]),
    part(box(1.0, 2.6, 1.0), A, [0.75, 1.3, 0]),
    part(box(1.15, 0.5, 1.4), C, [-0.75, 0.25, 0.15]),
    part(box(1.15, 0.5, 1.4), C, [0.75, 0.25, 0.15]),
    part(box(2.6, 2.8, 1.6), B, [0, 4.0, 0], [0.08, 0, 0]),
    part(box(2.2, 0.35, 1.7), C, [0, 2.7, 0]),
    part(box(3.6, 0.8, 1.9), A, [0, 5.3, -0.05]),
    part(box(0.9, 3.4, 0.9), A, [-2.1, 3.6, 0.3], [0.2, 0, 0.12]),
    part(box(0.9, 3.4, 0.9), A, [2.1, 3.6, 0.3], [0.35, 0, -0.12]),
    part(box(3.0, 4.6, 0.15), C, [0, 3.2, -0.95], [-0.08, 0, 0]),
    part(box(1.1, 1.2, 1.1), C, [0, 6.3, 0.2]),
    part(box(0.36, 0.14, 0.05), R, [-0.25, 6.35, 0.76]),
    part(box(0.36, 0.14, 0.05), R, [0.25, 6.35, 0.76]),
    part(cone(0.3, 1.2, 4), C, [-0.55, 7.1, 0.1], [0, 0, 0.4]),
    part(cone(0.3, 1.2, 4), C, [0.55, 7.1, 0.1], [0, 0, -0.4]),
    part(oct(0.3), G, [0, 7.2, 0.3], [0, 0, 0], [0.6, 1.8, 0.6]),
    part(oct(0.22), G, [-0.35, 7.0, 0.35], [0, 0, 0.3], [0.6, 1.6, 0.6]),
    part(oct(0.22), G, [0.35, 7.0, 0.35], [0, 0, -0.3], [0.6, 1.6, 0.6]),
    // Großschwert in der rechten Hand
    part(box(0.18, 5.2, 0.5), 0x8a7aa8, [2.4, 3.0, 1.4], [0.5, 0, 0]),
    part(box(0.06, 5.0, 0.12), G, [2.4, 3.0, 1.45], [0.5, 0, 0]),
    part(box(1.1, 0.2, 0.25), C, [2.4, 1.45, 0.45], [0.5, 0, 0]),
  ]);
}

// ---- neue Monster ----
export function skeletonGeo() {
  const B = 0xe2dccc, D = 0x2a2236;
  const parts = [
    part(box(0.14, 0.75, 0.14), B, [-0.18, 0.38, 0]),
    part(box(0.14, 0.75, 0.14), B, [0.18, 0.38, 0]),
    part(box(0.5, 0.15, 0.3), B, [0, 0.82, 0]),
    part(box(0.1, 0.7, 0.1), B, [0, 1.2, -0.05]),
    part(ico(0.3, 1), B, [0, 1.85, 0.02]),
    part(box(0.1, 0.1, 0.05), 0xff4d6a, [-0.1, 1.88, 0.28]),
    part(box(0.1, 0.1, 0.05), 0xff4d6a, [0.1, 1.88, 0.28]),
    part(box(0.22, 0.08, 0.05), D, [0, 1.72, 0.27]),
    part(box(0.12, 0.6, 0.12), B, [-0.38, 1.25, 0.1], [0.3, 0, 0.2]),
    part(box(0.12, 0.6, 0.12), B, [0.38, 1.25, 0.15], [-0.6, 0, -0.2]),
    // rostiges Schwert + kaputtes Schild
    part(box(0.08, 0.06, 1.1), 0x9a8a8a, [0.45, 1.1, 0.7], [0.2, 0, 0]),
    part(box(0.1, 0.55, 0.45), 0x5a4038, [-0.5, 1.2, 0.25], [0, 0.4, 0]),
  ];
  for (let k = 0; k < 4; k++) parts.push(part(box(0.5, 0.05, 0.08), B, [0, 1.05 + k * 0.13, 0.08]));
  return merge(parts);
}
export function batGeo() {
  return merge([
    part(ico(0.25, 1), 0x4a3a6a, [0, 0, 0]),
    part(cone(0.07, 0.18, 4), 0x4a3a6a, [-0.12, 0.27, 0.05]),
    part(cone(0.07, 0.18, 4), 0x4a3a6a, [0.12, 0.27, 0.05]),
    part(box(0.07, 0.07, 0.04), 0xff5a8a, [-0.08, 0.05, 0.23]),
    part(box(0.07, 0.07, 0.04), 0xff5a8a, [0.08, 0.05, 0.23]),
    part(box(0.75, 0.04, 0.42), 0x6a5a8a, [-0.5, 0.06, -0.02], [0, 0, 0.35]),
    part(box(0.75, 0.04, 0.42), 0x6a5a8a, [0.5, 0.06, -0.02], [0, 0, -0.35]),
  ]);
}
export function shadeGeo() {
  return merge([
    part(cone(0.6, 1.9, 7), 0x2e2448, [0, 0.95, 0], [PI, 0, 0]),
    part(cyl(0.35, 0.5, 0.7, 7), 0x3a2e5a, [0, 1.6, 0]),
    part(cone(0.42, 0.75, 7), 0x221a36, [0, 2.15, -0.05], [-0.2, 0, 0]),
    part(box(0.12, 0.06, 0.04), 0x8af0ff, [-0.11, 1.92, 0.33]),
    part(box(0.12, 0.06, 0.04), 0x8af0ff, [0.11, 1.92, 0.33]),
    part(box(0.18, 0.9, 0.18), 0x2e2448, [-0.45, 1.3, 0.25], [0.7, 0, 0.3]),
    part(box(0.18, 0.9, 0.18), 0x2e2448, [0.45, 1.3, 0.25], [0.7, 0, -0.3]),
  ]);
}

// ---- neue Waffen ----
export function skullGeo() {
  return merge([
    part(ico(0.32, 1), 0xf0e6d8, [0, 0, 0]),
    part(box(0.26, 0.14, 0.2), 0xe0d6c8, [0, -0.2, 0.1]),
    part(box(0.1, 0.1, 0.05), 0xff3aa0, [-0.11, 0.03, 0.29]),
    part(box(0.1, 0.1, 0.05), 0xff3aa0, [0.11, 0.03, 0.29]),
    part(cone(0.3, 0.9, 6), 0xb03aff, [0, 0.05, -0.55], [-PI / 2, 0, 0]),
    part(cone(0.18, 0.6, 6), 0xff5ad0, [0, 0.12, -0.45], [-PI / 2, 0, 0]),
  ]);
}
export const bloodWaveGeo = () => merge([part(new THREE.TorusGeometry(0.7, 0.12, 4, 10, PI), 0xd8143a, [0, 0, 0], [PI / 2, 0, 0])]);
export function bloodSwordGeo() {
  return merge([
    part(box(0.1, 0.24, 2.4), 0x4a0a18, [0, 0, 1.3]),
    part(box(0.04, 0.12, 2.2), 0xff2a4a, [0, 0.13, 1.25]),
    part(cone(0.13, 0.4, 4), 0x4a0a18, [0, 0, 2.65], [PI / 2, 0, 0]),
    part(box(0.6, 0.14, 0.14), 0x1a1018, [0, 0, 0.05]),
    part(box(0.09, 0.09, 0.55), 0x2a1a20, [0, 0, -0.3]),
    part(oct(0.09), 0xff2a4a, [0, 0, -0.6]),
  ]);
}
export const lanternGeo = () => merge([
  part(box(0.16, 0.2, 0.16), 0x2a2030, [0, 0, 0]),
  part(oct(0.09), 0xffd890, [0, 0, 0], [0, 0, 0], [1, 1.3, 1]),
  part(cyl(0.02, 0.02, 0.18, 4), 0x2a2030, [0, 0.18, 0]),
]);

// ---- Welt: Ruinen, Altäre, Feuer, Pilze ----
export function wallGeo() {
  return merge([
    part(box(4.4, 2.2, 0.8), 0x7c7290, [0, 1.1, 0]),
    part(box(1.4, 0.7, 0.8), 0x7c7290, [-1.4, 2.5, 0]),
    part(box(0.8, 0.4, 0.8), 0x8a809e, [0.6, 2.4, 0], [0, 0, 0.2]),
    part(box(4.6, 0.25, 1.0), 0x5a5470, [0, 0.12, 0]),
    part(box(1.6, 0.18, 0.85), 0x5f8a6a, [0.8, 2.25, 0]),
    part(box(0.6, 0.45, 0.5), 0x6e6680, [2.6, 0.22, 0.6], [0.3, 0.4, 0.1]),
  ]);
}
export function floorGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    if (Math.abs(x) + Math.abs(z) > 3) continue;
    const c = (x + z) % 2 ? 0x5e566e : 0x6a6280;
    parts.push(part(box(1.9, 0.1, 1.9), c, [x * 2, 0.05 + ((x * 7 + z * 3) % 3) * 0.015, z * 2], [0, 0, 0]));
  }
  return merge(parts);
}
export function brazierGeo() {
  return merge([
    part(cyl(0.18, 0.28, 1.1, 6), 0x3a3248, [0, 0.55, 0]),
    part(cyl(0.6, 0.3, 0.35, 8), 0x4a4058, [0, 1.25, 0]),
    part(box(0.9, 0.1, 0.9), 0x2a2238, [0, 0.05, 0]),
  ]);
}
export const flameGeo = () => merge([
  part(cone(0.42, 0.9, 6), 0xff8a2a, [0, 1.75, 0]),
  part(cone(0.26, 0.65, 6), 0xffd060, [0.05, 1.7, 0.02]),
]);
export function mushroomGeo() {
  return merge([
    part(cyl(0.3, 0.45, 2.2, 7), 0xd8cfc0, [0, 1.1, 0]),
    part(dome(1.5, 9, 4), 0x3a8a96, [0, 2.1, 0], [0, 0, 0], [1, 0.6, 1]),
    part(cyl(1.35, 1.4, 0.1, 9), 0x2a5a66, [0, 2.12, 0]),
    part(ico(0.15), 0x9ff8ff, [0.6, 2.7, 0.4]),
    part(ico(0.12), 0x9ff8ff, [-0.5, 2.6, -0.5]),
    part(ico(0.12), 0x9ff8ff, [0.1, 2.95, -0.2]),
  ]);
}
export function altarGeo() {
  return merge([
    part(box(2.4, 0.3, 2.4), 0x2a2236, [0, 0.15, 0]),
    part(box(1.6, 1.0, 1.1), 0x3a2e48, [0, 0.8, 0]),
    part(box(1.9, 0.18, 1.35), 0x241c30, [0, 1.38, 0]),
    part(cone(0.12, 0.6, 4), 0x241c30, [-0.85, 1.75, 0.55]),
    part(cone(0.12, 0.6, 4), 0x241c30, [0.85, 1.75, 0.55]),
    part(cyl(0.06, 0.06, 0.25, 5), 0xe8dcc0, [-0.7, 1.6, -0.45]),
    part(cyl(0.06, 0.06, 0.3, 5), 0xe8dcc0, [0.75, 1.62, -0.4]),
    part(box(0.06, 0.6, 0.06), 0xff2a5a, [0, 0.8, 0.56]),
    part(box(0.4, 0.06, 0.06), 0xff2a5a, [0, 0.95, 0.56]),
  ]);
}

// ---- Welt: Biom-Requisiten ----
export function deadTreeGeo() {
  const W = 0x5a4a52, D = 0x463a42;
  return merge([
    part(cyl(0.16, 0.32, 2.4, 6), W, [0, 1.2, 0], [0.05, 0, 0.08]),
    part(cyl(0.08, 0.15, 1.4, 5), D, [0.45, 2.5, 0], [0, 0, -0.8]),
    part(cyl(0.07, 0.13, 1.3, 5), D, [-0.4, 2.7, 0.1], [0.2, 0, 0.9]),
    part(cyl(0.05, 0.1, 1.0, 5), D, [0.1, 3.0, -0.35], [-0.7, 0, 0]),
    part(cyl(0.04, 0.07, 0.7, 4), D, [0.95, 3.0, 0], [0, 0, -0.3]),
    part(cyl(0.04, 0.07, 0.6, 4), D, [-0.85, 3.2, 0.1], [0, 0, 0.4]),
  ]);
}
export function pillarGeo() {
  const S = 0x8a8098, M = 0x5f8a6a;
  return merge([
    part(box(1.3, 0.35, 1.3), 0x6e6680, [0, 0.17, 0]),
    part(cyl(0.48, 0.52, 1.4, 8), S, [0, 1.05, 0]),
    part(cyl(0.46, 0.48, 1.1, 8), S, [0.03, 2.3, 0], [0.04, 0, 0.05]),
    part(cyl(0.44, 0.46, 0.5, 8), 0x9a90a8, [0.08, 3.05, 0.04], [0.15, 0, 0.12]),
    part(box(0.7, 0.12, 0.55), M, [0.1, 0.4, 0.5]),
    part(box(0.4, 0.5, 0.4), 0x7a7090, [0.9, 0.25, 0.6], [0.3, 0.5, 0.2]),
  ]);
}
export function crystalClusterGeo() {
  return merge([
    part(oct(0.7), 0x8a6aff, [0, 1.3, 0], [0.1, 0.3, 0.05], [0.6, 2.0, 0.6]),
    part(oct(0.5), 0x5fc8ff, [0.6, 0.8, 0.2], [0.2, 0, -0.5], [0.6, 1.8, 0.6]),
    part(oct(0.45), 0xd06aff, [-0.55, 0.7, -0.2], [-0.1, 0, 0.55], [0.6, 1.7, 0.6]),
    part(oct(0.35), 0x7fe0ff, [0.1, 0.5, -0.6], [-0.5, 0, 0], [0.6, 1.6, 0.6]),
    part(new THREE.DodecahedronGeometry(0.8), 0x4a4060, [0, 0.1, 0], [0, 0, 0], [1.3, 0.3, 1.3]),
  ]);
}
export function obeliskGeo() {
  return merge([
    part(box(1.6, 0.4, 1.6), 0x3a3248, [0, 0.2, 0]),
    part(cyl(0.45, 0.7, 4.2, 4), 0x2e283c, [0, 2.5, 0], [0, Math.PI / 4, 0]),
    part(cone(0.47, 0.8, 4), 0x2e283c, [0, 5.0, 0], [0, Math.PI / 4, 0]),
    part(box(0.08, 2.4, 0.08), 0xc04dff, [0, 2.6, 0.5]),
    part(box(0.08, 2.4, 0.08), 0xc04dff, [0, 2.6, -0.5]),
    part(oct(0.22), 0xff6ad5, [0, 5.7, 0]),
  ]);
}
export function graveGeo() {
  return merge([
    part(box(0.75, 1.0, 0.18), 0x7a7088, [0, 0.5, 0], [0, 0, 0.05]),
    part(cyl(0.375, 0.375, 0.18, 8, ), 0x7a7088, [0, 1.0, 0], [Math.PI / 2, 0, 0]),
    part(box(0.9, 0.12, 1.3), 0x5a5a4a, [0, 0.06, 0.55]),
  ]);
}
export function powerShrineGeo() {
  // Steinkreis mit vier Runensteinen
  const parts = [part(cyl(3.1, 3.2, 0.15, 16), 0x4a4258, [0, 0.07, 0])];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(box(0.5, 1.6, 0.35), 0x5a526c, [Math.sin(a) * 3.0, 0.8, Math.cos(a) * 3.0], [0, a, 0.08]));
    parts.push(part(box(0.1, 0.8, 0.05), 0x7fe8ff, [Math.sin(a) * 2.8, 0.9, Math.cos(a) * 2.8], [0, a, 0.08]));
  }
  return merge(parts);
}

// ---- Projektile & Pickups ----
export const buffGeo = (c: number) => merge([part(ico(0.32, 1), c), part(oct(0.5), 0xffffff, [0, 0, 0], [0, 0, 0], [0.35, 1.3, 0.35])]);
export function magnetGeo() {
  const arc = new THREE.TorusGeometry(0.32, 0.12, 6, 10, PI);
  return merge([
    part(arc, 0xff4d6d, [0, 0.05, 0], [0, 0, PI]),
    part(box(0.24, 0.22, 0.24), 0xe8e8f4, [-0.32, 0.18, 0]),
    part(box(0.24, 0.22, 0.24), 0xe8e8f4, [0.32, 0.18, 0]),
  ]);
}
export function katanaGeo() {
  return merge([
    part(box(0.05, 0.1, 1.4), 0xeef4ff, [0, 0, 0.7]),
    part(box(0.02, 0.04, 1.3), 0xa8d0ff, [0, 0.07, 0.68]),
    part(cyl(0.13, 0.13, 0.04, 8), 0xffd56b, [0, 0, 0], [PI / 2, 0, 0]),
    part(box(0.07, 0.08, 0.38), 0x3b2f5a, [0, 0, -0.2]),
    part(box(0.08, 0.09, 0.06), 0xff4d8a, [0, 0, -0.38]),
  ]);
}
export function spearGeo() {
  return merge([
    part(cyl(0.05, 0.05, 1.5, 5), 0xf0dfb0, [0, 0, 0], [PI / 2, 0, 0]),
    part(cone(0.13, 0.42, 5), 0xa8e6ff, [0, 0, 0.95], [PI / 2, 0, 0]),
    part(box(0.25, 0.02, 0.2), 0xffc7de, [0, 0, -0.7]),
  ]);
}
export const shardGeo = () => merge([part(oct(0.26), 0xff9ed8, [0, 0, 0], [0, 0, 0], [0.6, 0.6, 1.9])]);
export const meteorGeo = () => merge([part(ico(0.8), 0xffa07a), part(ico(0.55), 0xffd27a, [0.2, 0.3, 0.1])]);
export const bladeGeo = () => merge([
  part(box(0.16, 0.08, 1.2), 0xc6f0ff, [0, 0, 0], [0, 0.4, 0]),
  part(cone(0.1, 0.35, 4), 0xe8faff, [0.22, 0, 0.6], [PI / 2, 0, -0.4]),
  part(box(0.25, 0.12, 0.25), 0x8f7fe0),
]);
export const bulletGeo = () => merge([part(cyl(0.07, 0.07, 0.55, 5), 0xfff3b0, [0, 0, 0], [PI / 2, 0, 0]), part(ico(0.1), 0xffffff, [0, 0, 0.28])]);
export const starGeo = () => merge([part(oct(0.6), 0xfff0a0, [0, 0, 0], [0, 0, 0], [1, 1, 0.5]), part(oct(0.45), 0xffc6f0, [0, 0, 0], [0, 0, PI / 4], [1, 1, 0.5])]);
export const heartGeo = () => merge([
  part(ico(0.2, 1), 0xff5c8a, [-0.14, 0.08, 0]),
  part(ico(0.2, 1), 0xff5c8a, [0.14, 0.08, 0]),
  part(cone(0.3, 0.42, 4), 0xff5c8a, [0, -0.17, 0], [PI, PI / 4, 0], [1, 1, 0.65]),
  part(ico(0.06), 0xffffff, [-0.16, 0.16, 0.14]),
]);
export function pistolGeo() {
  return merge([
    part(box(0.12, 0.16, 0.5), 0x5b4a8a, [0, 0, 0.12]),
    part(cyl(0.05, 0.05, 0.25, 6), 0x3b2f5a, [0, 0.03, 0.45], [PI / 2, 0, 0]),
    part(box(0.1, 0.24, 0.12), 0xc6a8ff, [0, -0.15, -0.05], [-0.25, 0, 0]),
    part(oct(0.06), 0x8ff0d8, [0, 0.11, 0.1]),
  ]);
}
export const orbGeo = () => merge([part(oct(0.22), 0x8ff0d8)]);
export const coinGeo = () => merge([part(cyl(0.26, 0.26, 0.08, 8), 0xffd56b, [0, 0, 0], [0, 0, PI / 2])]);

// ---- Welt ----
export function treeGeo(leaf: number, leaf2: number) {
  return merge([
    part(cyl(0.18, 0.28, 1.6, 6), 0xb08a7a, [0, 0.8, 0]),
    part(ico(1.25), leaf, [0, 2.3, 0]),
    part(ico(0.85), leaf2, [0.5, 2.9, 0.25]),
    part(ico(0.7), leaf2, [-0.55, 2.0, -0.3]),
  ]);
}
export const rockGeo = () => merge([part(new THREE.DodecahedronGeometry(1), 0x8e86a4, [0, 0.3, 0], [0, 0, 0], [1, 0.7, 1]), part(new THREE.DodecahedronGeometry(0.5), 0x7c7494, [0.8, 0.1, 0.3])]);
export const flowerGeo = (c: number) => merge([part(cyl(0.03, 0.03, 0.4, 3), 0x8fcf8f, [0, 0.2, 0]), part(ico(0.14), c, [0, 0.45, 0])]);
export const crystalGeo = () => new THREE.OctahedronGeometry(1).scale(0.5, 1.6, 0.5);

export function shrineGeo() {
  const parts = [
    part(cyl(1.7, 2.0, 0.4, 8), 0xf3e9ff, [0, 0.2, 0]),
    part(cyl(1.3, 1.5, 0.3, 8), 0xe6d8ff, [0, 0.55, 0]),
    part(cyl(1.5, 1.5, 0.2, 8), 0xffd6ec, [0, 2.9, 0]),
  ];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + PI / 4;
    parts.push(part(box(0.3, 2.3, 0.3), 0xe0d4ff, [Math.sin(a) * 1.2, 1.7, Math.cos(a) * 1.2]));
  }
  return merge(parts);
}
export function chestGeo() {
  return merge([
    part(box(1.2, 0.7, 0.8), 0xd9a066, [0, 0.35, 0]),
    part(box(1.25, 0.3, 0.85), 0xe8b57c, [0, 0.85, 0]),
    part(box(1.28, 0.12, 0.12), 0xffe08a, [0, 0.7, 0.42]),
    part(box(0.18, 0.25, 0.08), 0xffe08a, [0, 0.62, 0.43]),
  ]);
}
