// ─── Kişi avatarı (+ takılı çerçeve) ────────────────────────────────────────
// Uygulamada profil fotoğrafının çevresinde **çerçeve** (VIP/SVIP vb.) durur:
// `profiles.frame` = `{ image, scale, dx, dy }`. Oyun da aynı çerçeveyi çizer.
//
// Çerçeve resmi, avatardan **büyük** olabilir (`scale`); bu yüzden avatarın
// kırpıldığı kutu ile çerçevenin taşabildiği sarmalayıcı ayrıdır.

import { clamp } from '../core/utils.js';

/**
 * `profiles.frame` alanını güvenli bir çerçeve tanımına çevirir.
 * @returns {{image:string, scale:number, dx:number, dy:number}|null}
 */
export function frameOf(row) {
  const raw = row?.frame;
  if (!raw || typeof raw !== 'object') return null;
  const image = String(raw.image ?? '').trim();
  if (!image) return null;
  return {
    image,
    scale: clamp(Number(raw.scale) || 1, 0.3, 12),
    dx: clamp(Number(raw.dx) || 0, -1.5, 1.5),
    dy: clamp(Number(raw.dy) || 0, -1.5, 1.5),
  };
}

/**
 * Yuvarlak avatar (+ varsa çerçeve). Yüklenemezse baş harf gösterilir.
 *
 * @param {{nickname?:string, avatar?:string, frame?:object}} row
 * @param {number} size  avatar çapı (px)
 */
export function avatarNode(row, size) {
  const nick = String(row?.nickname ?? 'Oyuncu');
  const wrap = document.createElement('span');
  wrap.className = 'av';
  wrap.style.setProperty('--av', `${size}px`);

  const circle = document.createElement('span');
  circle.className = 'av-circle';
  circle.textContent = nick.slice(0, 1).toUpperCase();

  const url = String(row?.avatar ?? '').trim();
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    circle.append(img);
  }
  wrap.append(circle);

  const frame = frameOf(row);
  if (frame) {
    const img = document.createElement('img');
    img.className = 'av-frame';
    img.src = frame.image;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.style.setProperty('--scale', String(frame.scale));
    img.style.setProperty('--dx', `${frame.dx * 100}%`);
    img.style.setProperty('--dy', `${frame.dy * 100}%`);
    img.addEventListener('error', () => img.remove());
    wrap.append(img);
  }

  return wrap;
}
