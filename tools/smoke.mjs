// ─── Duman testi ────────────────────────────────────────────────────────────
// `node tools/smoke.mjs` — DOM'suz saf mantığı doğrular:
//   * oran tablosu,
//   * ödeme/sıralama hesabı,
//   * yarış animasyonunun bitiş sırası garantisi.

import assert from 'node:assert/strict';
import { mulberry32 } from '../js/core/utils.js';
import {
  oddsFor,
  settleBets,
  topWinners,
  weightedWinner,
  winnerCount,
} from '../js/engine/payouts.js';
import { buildRaceModel, progressAt, leaderAt } from '../js/engine/race-model.js';

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

console.log('At Yarışı · duman testi');

check('oranlar 2/3/5/10/25/50', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(oddsFor), [2, 3, 5, 10, 25, 50]);
});

check('kazanan oranla ters ağırlıkla seçilir', () => {
  const random = mulberry32(20261026);
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const draws = 120000;
  for (let i = 0; i < draws; i += 1) counts[weightedWinner(random)] += 1;

  // 1/oran ağırlığı: 1 → %42, 6 → ~%1,7
  assert.ok(Math.abs(counts[1] / draws - 0.4195) < 0.012, `at1: ${counts[1] / draws}`);
  assert.ok(Math.abs(counts[6] / draws - 0.0168) < 0.005, `at6: ${counts[6] / draws}`);
  assert.ok(counts[1] > counts[2] && counts[2] > counts[3], 'sıra oranlarla ters olmalı');
});

check('bahis ödemesi çarpanla hesaplanır', () => {
  const bets = [
    { nickname: 'a', horse: 6, amount: 100 },
    { nickname: 'b', horse: 1, amount: 100 },
  ];
  const settled = settleBets(bets, 6);
  assert.equal(settled[0].status, 'won');
  assert.equal(settled[0].payout, 5000);
  assert.equal(settled[1].status, 'lost');
  assert.equal(settled[1].payout, 0);
  assert.equal(winnerCount(bets, 6), 1);
});

check('kazanan tablosu ödemeye göre sıralanır', () => {
  const bets = [
    { nickname: 'az', horse: 2, amount: 10 },
    { nickname: 'cok', horse: 2, amount: 500 },
    { nickname: 'orta', horse: 2, amount: 100 },
    { nickname: 'kaybetti', horse: 5, amount: 1000 },
  ];
  const rows = topWinners(bets, 2, 3);
  assert.deepEqual(
    rows.map((row) => row.nickname),
    ['cok', 'orta', 'az'],
  );
  assert.deepEqual(
    rows.map((row) => row.payout),
    [1500, 300, 30],
  );
});

const times = { 3: 10400, 1: 11100, 2: 11600, 4: 12100, 5: 12700, 6: 13300 };
const model = buildRaceModel({ id: 'test-round', order: [3, 1, 2, 4, 5, 6], times });

check('yarış modeli sunucudaki sırayı korur', () => {
  assert.equal(model.winner, 3);
  assert.equal(model.maxTime, 13300);
  assert.deepEqual(Object.keys(model.times).map(Number).sort(), [1, 2, 3, 4, 5, 6]);
});

check('atlar kendi bitiş süresinden önce 1 e ulaşmaz', () => {
  for (const [horse, finish] of Object.entries(times)) {
    assert.ok(progressAt(model, Number(horse), finish - 1) < 1);
    assert.equal(progressAt(model, Number(horse), finish), 1);
  }
});

check('bitiş çizgisinde sıra sunucununkiyle aynı', () => {
  const finishers = Object.entries(times)
    .map(([horse, finish]) => ({ horse: Number(horse), finish }))
    .sort((a, b) => a.finish - b.finish)
    .map((row) => row.horse);
  assert.deepEqual(finishers, model.order);
  assert.equal(leaderAt(model, 13300), 3);
});

check('ilerleme monoton ve 0..1 arası', () => {
  for (const horse of [1, 2, 3, 4, 5, 6]) {
    let previous = -1;
    for (let t = 0; t <= 14000; t += 100) {
      const p = progressAt(model, horse, t);
      assert.ok(p >= 0 && p <= 1, `p=${p}`);
      assert.ok(p >= previous - 1e-9, `${horse} atı ${t} ms’de geri gitti`);
      previous = p;
    }
    assert.equal(progressAt(model, horse, 14000), 1);
  }
});

check('aynı tur kimliği aynı animasyonu üretir', () => {
  const a = buildRaceModel({ id: 'x', order: [1, 2, 3, 4, 5, 6], times });
  const b = buildRaceModel({ id: 'x', order: [1, 2, 3, 4, 5, 6], times });
  for (let t = 0; t <= 14000; t += 250) {
    assert.equal(progressAt(a, 4, t), progressAt(b, 4, t));
  }
});

console.log(`\n${checks} kontrol geçti.`);
