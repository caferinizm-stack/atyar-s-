// ─── Ödemeler ve oranlar ────────────────────────────────────────────────────
// Sunucudaki `horse_odds` / `horse_advance` ile aynı kurallar:
//   * çarpanlar 2/3/5/10/25/50,
//   * kazanan, **1/oran** ağırlığıyla seçilir.
//
// 1/oran ağırlığı şart: 6 at eşit şansla seçilirse ortalama ödeme 15,8× olur
// ve gerçek kristal ekonomisi her turda şişer. 1/oran ağırlığında her bahsin
// beklenen getirisi ~1× olur (50× at ~%1,7 olasılıkla kazanır).

import { HORSES, HORSE_BY_NUM } from '../config.js';

/** Bahis çarpanı: 1→2x, 2→3x, 3→5x, 4→10x, 5→25x, 6→50x. */
export function oddsFor(horse) {
  return HORSE_BY_NUM.get(Number(horse))?.odds ?? 0;
}

/**
 * Kazanan atı oranına göre ağırlıklı seçer.
 * @param {() => number} random 0..1 üreten fonksiyon
 */
export function weightedWinner(random = Math.random) {
  const weights = HORSES.map((horse) => 1 / horse.odds);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let i = 0; i < HORSES.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return HORSES[i].num;
  }
  return HORSES[HORSES.length - 1].num;
}

/** Tek bahsin sonucu. */
export function settleBet(bet, winner) {
  const won = Number(bet.horse) === Number(winner);
  return {
    ...bet,
    status: won ? 'won' : 'lost',
    payout: won ? Math.round(Number(bet.amount) * oddsFor(bet.horse)) : 0,
  };
}

/** Bir turdaki tüm bahisleri sonuçlandırır. */
export function settleBets(bets, winner) {
  return bets.map((bet) => settleBet(bet, winner));
}

/** Kazananlardan en yüksek ödemeli ilk [limit] kişi. */
export function topWinners(bets, winner, limit = 3) {
  return settleBets(bets, winner)
    .filter((bet) => bet.status === 'won')
    .sort((a, b) => b.payout - a.payout || a.nickname.localeCompare(b.nickname, 'tr'))
    .slice(0, limit)
    .map((bet) => ({
      nickname: bet.nickname,
      horse: bet.horse,
      amount: bet.amount,
      payout: bet.payout,
    }));
}

/** Turda kazanan kaç kişi var? */
export function winnerCount(bets, winner) {
  return bets.filter((bet) => Number(bet.horse) === Number(winner)).length;
}
