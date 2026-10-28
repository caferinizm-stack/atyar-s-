// ─── Küçük yardımcılar: rastgelelik, sayı biçimi, olay yayını ───────────────

/** Tohumlu PRNG (mulberry32): aynı tohum her zaman aynı diziyi üretir. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Metni 32 bit tohuma çevirir (FNV-1a). */
export function hashString(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Fisher–Yates; verilen rastgelelik kaynağını kullanır. */
export function shuffle(list, random = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const numberFormat = new Intl.NumberFormat('tr-TR');

/** 1234567 → "1.234.567" */
export function formatCoins(value) {
  const n = Number(value) || 0;
  return numberFormat.format(Math.round(n));
}

/**
 * **Kısa** tutar: 10.000 ve üstü `K` / `M` ile yazılır, yer kaplamaz.
 *
 *   9.500 → "9.500" · 10.500 → "10,5K" · 240.000 → "240K" · 1.250.000 → "1,3M"
 */
export function formatCompact(value) {
  const n = Math.round(Number(value) || 0);
  const abs = Math.abs(n);
  if (abs < 10000) return numberFormat.format(n);

  const unit = abs >= 1000000 ? 1000000 : 1000;
  const suffix = abs >= 1000000 ? 'M' : 'K';
  const scaled = Math.round((n / unit) * 10) / 10;
  const text = Number.isInteger(scaled)
    ? String(scaled)
    : scaled.toFixed(1).replace('.', ',');
  return `${text}${suffix}`;
}

/** Kalan süreyi saniyeye yuvarlar (asla negatif değil). */
export function secondsLeft(endsAt, now) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Saat: 14:05 */
export function formatClock(timestamp) {
  const d = new Date(timestamp);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Basit olay yayıncısı: `on` aboneliği bırakan bir fonksiyon döndürür. */
export class Emitter {
  constructor() {
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(payload) {
    for (const fn of this.listeners) {
      try {
        fn(payload);
      } catch (error) {
        console.error('[emitter] dinleyici hatası', error);
      }
    }
  }
}
