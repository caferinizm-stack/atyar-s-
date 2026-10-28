// ─── Yarış modeli ───────────────────────────────────────────────────────────
// Sunucu her at için **bitiş süresi** verir (ms). Animasyon tamamen bu
// sürelerden türetilir; böylece 6 istemci aynı yarışı aynı sırada bitirir ve
// ekranda görünen sonuç ile sunucunun ödediği sonuç birbirini tutar.
//
// Sıra garantisi: bir atın ilerlemesi ancak kendi bitiş süresi geldiğinde 1
// olur. Ara sırada oluşan dalgalanma (wobble) yarış sonuna doğru sıfıra
// indiği için "önde gibi görünen at" son çizgide sırasını değiştiremez.

import { hashString, mulberry32 } from '../core/utils.js';

/**
 * @param {{id?: string, order?: number[], times?: Record<string, number>}} round
 * @returns {{id:string, order:number[], times:Record<number,number>,
 *            seeds:Record<number,number>, winner:number|null, maxTime:number}}
 */
export function buildRaceModel(round = {}) {
  const order = Array.isArray(round.order) ? round.order.map(Number) : [];
  const times = {};
  const seeds = {};

  for (const [key, value] of Object.entries(round.times ?? {})) {
    const horse = Number(key);
    const ms = Number(value);
    if (!Number.isFinite(horse) || !Number.isFinite(ms)) continue;
    times[horse] = Math.max(1200, ms);
  }

  for (const horse of Object.keys(times).map(Number)) {
    seeds[horse] = mulberry32(hashString(`${round.id ?? ''}:${horse}`))();
  }

  return {
    id: String(round.id ?? ''),
    order,
    times,
    seeds,
    winner: order[0] ?? null,
    maxTime: Math.max(1200, ...Object.values(times)),
  };
}

/** Atın [0, 1] arası pist ilerlemesi. */
export function progressAt(model, horse, elapsedMs) {
  const finish = model.times[horse];
  if (!finish) return 0;
  if (elapsedMs >= finish) return 1;
  if (elapsedMs <= 0) return 0;

  const u = elapsedMs / finish;
  // Yavaş başlar, son 200 metrede hızlanır.
  const base = Math.pow(u, 1.12);

  // Orta bölümde nefes/pozisyon dalgalanması: uçlarda sıfıra iner.
  const seed = model.seeds[horse] ?? 0.5;
  const envelope = u * (1 - u) * 4;
  const wobble =
    (Math.sin(u * 9.5 + seed * 6.283) * 0.028 +
      Math.sin(u * 17.3 + seed * 11.7) * 0.016) *
    envelope;

  // Son çizgiye 1.5 m kala tepe: yarış sırası bozulmaz, geçiş yumuşak olur.
  const ceiling = 0.985 + 0.015 * Math.pow(u, 40);
  return Math.min(ceiling, Math.max(0, base + wobble));
}

/**
 * Bir anda hangi at önde? (HUD ve kamera için)
 *
 * Bitişte bütün atlar 1'e ulaşır; eşitlikte **bitiş süresi kısa olan** önde
 * sayılır, böylece gösterilen lider her zaman gerçek kazananla aynı olur.
 */
export function leaderAt(model, elapsedMs) {
  let leader = null;
  let best = -1;
  let bestFinish = Infinity;

  for (const horse of Object.keys(model.times).map(Number)) {
    const p = progressAt(model, horse, elapsedMs);
    const finish = model.times[horse];
    if (p > best + 1e-9 || (Math.abs(p - best) <= 1e-9 && finish < bestFinish)) {
      best = p;
      bestFinish = finish;
      leader = horse;
    }
  }
  return leader;
}

/** Tüm atların ilerlemesi (kamera ve toz efekti için tek geçiş). */
export function progressMap(model, elapsedMs) {
  const map = {};
  for (const horse of Object.keys(model.times).map(Number)) {
    map[horse] = progressAt(model, horse, elapsedMs);
  }
  return map;
}
