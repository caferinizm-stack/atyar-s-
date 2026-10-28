// ─── Prosedürel dokular ─────────────────────────────────────────────────────
// Dışarıdan görsel indirmeye gerek kalmaması için bütün dokular tarayıcıda
// canvas ile üretilir. Üretilen her doku `repeat` ayarıyla döşenir.

import * as THREE from 'three';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, { repeat = [1, 1], colorSpace = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  if (colorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Kısa çim: koyu yeşil gürültü + biçme izleri. */
export function grassTexture(repeat = [46, 30]) {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c3b24';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 9000; i += 1) {
    const shade = 24 + Math.random() * 40;
    ctx.fillStyle = `rgba(${shade * 0.55},${shade + 26},${shade * 0.7},${0.25 + Math.random() * 0.5})`;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 2 + Math.random() * 5);
  }

  // Yatay biçme şeritleri.
  for (let y = 0; y < 512; y += 64) {
    ctx.fillStyle = y % 128 === 0 ? 'rgba(120,190,120,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 512, 32);
  }

  return toTexture(canvas, { repeat });
}

/** Killi/kumlu pist zemini. */
export function dirtTexture(repeat = [14, 2]) {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b4a31';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 7000; i += 1) {
    const r = 90 + Math.random() * 70;
    const g = 62 + Math.random() * 50;
    const b = 38 + Math.random() * 34;
    ctx.fillStyle = `rgba(${r},${g},${b},${0.12 + Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, 0.6 + Math.random() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tırmık izleri (uzunlamasına).
  for (let i = 0; i < 80; i += 1) {
    ctx.strokeStyle = `rgba(255,235,200,${0.02 + Math.random() * 0.05})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }

  return toTexture(canvas, { repeat });
}

/** Bitiş çizgisi: damalı kumaş. */
export function checkerTexture(repeat = [1, 14]) {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  const cell = 32;
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f7f7fb' : '#161320';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const texture = toTexture(canvas, { repeat });
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** Eyer örtüsünün iki yanındaki numara plakası. */
export function numberPlateTexture({ num, color, dark }) {
  const canvas = makeCanvas(320, 200);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(6, 6, 308, 188, 26);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 118px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12;
  ctx.fillText(String(num), 160, 105);

  return toTexture(canvas, { repeat: [1, 1] });
}

/** Atın üstünde yüzen numara rozeti (billboard sprite). */
export function numberBadgeTexture({ num, color }) {
  const canvas = makeCanvas(160, 190);
  const ctx = canvas.getContext('2d');

  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(80, 78, 58, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 76px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 80, 82);

  ctx.beginPath();
  ctx.moveTo(64, 128);
  ctx.lineTo(96, 128);
  ctx.lineTo(80, 152);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  return toTexture(canvas, { repeat: [1, 1] });
}

/** Toz tanesi: yumuşak radyal leke. */
export function dustTexture() {
  const canvas = makeCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,236,205,0.9)');
  gradient.addColorStop(0.45, 'rgba(214,186,150,0.45)');
  gradient.addColorStop(1, 'rgba(214,186,150,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(canvas, { repeat: [1, 1] });
}

/** Bitiş takının üstündeki afiş (**FINISH**). */
export function bannerTexture(text = 'FINISH') {
  const canvas = makeCanvas(1024, 256);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
  gradient.addColorStop(0, '#12112a');
  gradient.addColorStop(0.5, '#221a44');
  gradient.addColorStop(1, '#12112a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 256);

  for (let x = 0; x < 1024; x += 32) {
    for (let y = 0; y < 64; y += 32) {
      ctx.fillStyle = (x / 32 + y / 32) % 2 === 0 ? '#f5f5fb' : '#171225';
      ctx.fillRect(x, y, 32, 32);
      ctx.fillRect(x, 224, 32, 32);
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(120,180,255,0.7)';
  ctx.shadowBlur = 28;
  // Yazı **taşmasın**: sığana kadar küçült (uzun metin verilirse).
  let size = 116;
  do {
    ctx.font = `900 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= 900) break;
    size -= 6;
  } while (size > 40);
  ctx.fillText(text, 512, 132);

  return toTexture(canvas, { repeat: [1, 1] });
}

/**
 * Bitiş tabelasının **üstündeki reklam panosu**: "RETRA LIVE", neon ışıklı.
 * Koyu cam zemin + neon çerçeve + renk geçişli parlayan yazı.
 */
export function neonBoardTexture(text = 'RETRA LIVE') {
  const canvas = makeCanvas(1024, 192);
  const ctx = canvas.getContext('2d');

  // Koyu cam panel.
  const bg = ctx.createLinearGradient(0, 0, 0, 192);
  bg.addColorStop(0, '#0b1024');
  bg.addColorStop(0.55, '#101638');
  bg.addColorStop(1, '#070a18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 192);

  // Neon çerçeve (dışarı taşan ışıma + ince çizgi).
  ctx.shadowColor = 'rgba(120, 220, 255, 0.9)';
  ctx.shadowBlur = 26;
  ctx.strokeStyle = 'rgba(120, 235, 255, 0.95)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 996, 164);

  ctx.shadowColor = 'rgba(190, 120, 255, 0.85)';
  ctx.shadowBlur = 20;
  ctx.strokeStyle = 'rgba(200, 150, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, 968, 136);

  // Yanlardaki neon noktalar (canlı yayın ışığı gibi).
  for (const x of [72, 952]) {
    ctx.beginPath();
    ctx.fillStyle = '#ff5c8a';
    ctx.shadowColor = 'rgba(255, 92, 138, 1)';
    ctx.shadowBlur = 28;
    ctx.arc(x, 96, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Yazı: mavi → mor → pembe geçişi, güçlü ışıma.
  const grad = ctx.createLinearGradient(0, 40, 1024, 150);
  grad.addColorStop(0, '#8ff4ff');
  grad.addColorStop(0.45, '#b9a6ff');
  grad.addColorStop(1, '#ff9ad5');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 104;
  do {
    ctx.font = `900 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= 760) break;
    size -= 6;
  } while (size > 40);

  ctx.shadowColor = 'rgba(120, 220, 255, 0.95)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = grad;
  ctx.fillText(text, 512, 98);

  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.strokeText(text, 512, 98);

  return toTexture(canvas, { repeat: [1, 1] });
}

/**
 * Bitiş tabelasının altındaki **kazanan yazısı**: "Kızıl Şimşek kazandı".
 * Arka plan saydamdır; yalnız yazı ve ışıması çizilir.
 */
export function winnerTexture(text) {
  const canvas = makeCanvas(1024, 200);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 40, 0, 170);
  grad.addColorStop(0, '#fff6d8');
  grad.addColorStop(0.55, '#ffd166');
  grad.addColorStop(1, '#ff9a3d');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 92;
  do {
    ctx.font = `900 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= 940) break;
    size -= 5;
  } while (size > 34);

  ctx.shadowColor = 'rgba(255, 170, 40, 0.9)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = grad;
  ctx.fillText(text, 512, 104);

  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.strokeText(text, 512, 104);

  const texture = toTexture(canvas, { repeat: [1, 1] });
  texture.needsUpdate = true;
  return texture;
}

/** Tribün seyircisi için rastgele forma renkleri. */
export const CROWD_COLORS = [
  '#f4d35e',
  '#ee964b',
  '#f95738',
  '#3ddc97',
  '#4cc9f0',
  '#7b61ff',
  '#f72585',
  '#ffffff',
  '#adb5bd',
  '#2ec4b6',
];
