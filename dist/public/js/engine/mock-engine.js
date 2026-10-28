// ─── Demo motoru ────────────────────────────────────────────────────────────
// Supabase yapılandırılmadığında oyunun tamamını tarayıcıda çalıştırır:
// 20 sn bahis → yarış → 5 sn sonuç → yeni tur. Sunucu sözleşmesinin aynısını
// üretir, böylece arayüz iki motorda da aynı kodu kullanır.

import { HORSES, RACE, STAKES, START_BALANCE } from '../config.js';
import { hashString, mulberry32, shuffle } from '../core/utils.js';
import { settleBets, topWinners, weightedWinner, winnerCount } from './payouts.js';

const BALANCE_KEY = 'at_yarisi.balance';
const HISTORY_KEY = 'at_yarisi.history';

const FIELD_NAMES = [
  'gecekusu',
  'mavi_simsek',
  'kaptan',
  'zeynep',
  'atlas',
  'nova',
  'kartal_07',
  'elifsu',
  'burak',
  'sardunya',
  'mert',
  'laledan',
  'onur',
  'poyraz',
];

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readNumber(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    const value = Number(raw);
    return Number.isFinite(value) && raw !== null ? value : fallback;
  } catch {
    return fallback;
  }
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export class MockEngine {
  constructor() {
    this.listeners = new Set();
    this.mode = 'demo';
    this.storage = safeStorage();
    this.balance = Math.max(0, readNumber(this.storage, BALANCE_KEY, START_BALANCE));
    this.history = readJson(this.storage, HISTORY_KEY, []).slice(0, 10);

    this.round = null;
    this.field = [];
    this.pendingOrder = [];
    this.pendingTimes = {};
    this.sequence = 0;
    this.timer = null;
    this.tickMs = 200;
  }

  get playerName() {
    return 'Sen';
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  connect() {
    this._tick();
    if (!this.timer) {
      this.timer = setInterval(() => this._tick(), this.tickMs);
    }
    return this;
  }

  disconnect() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot() {
    const round = this.round;
    return {
      mode: 'demo',
      connected: true,
      serverNow: Date.now(),
      player: { nickname: this.playerName, balance: this.balance },
      round: round
        ? {
            ...round,
            myBets: round.myBets.map((bet) => ({ ...bet })),
            leaderboard: round.leaderboard
              ? round.leaderboard.map((row) => ({ ...row }))
              : null,
            // Bu tur oynayanlar (gerçek modda sunucudan, avatarlarıyla gelir).
            players: [
              ...this.field.map((bet) => ({
                nickname: bet.nickname,
                avatar: '',
                frame: null,
              })),
              ...(round.myBets.length > 0
                ? [{ nickname: this.playerName, avatar: '', frame: null }]
                : []),
            ],
          }
        : null,
      history: this.history.map((item) => ({ ...item })),
    };
  }

  placeBet(horse, amount) {
    this._tick();

    const num = Number(horse);
    const value = Math.round(Number(amount));
    const round = this.round;

    if (!round || round.phase !== 'betting' || Date.now() >= round.bettingEndsAt) {
      return { ok: false, error: 'Bahisler kapandı, yeni turu bekle.' };
    }
    if (!HORSES.some((item) => item.num === num)) {
      return { ok: false, error: 'Geçersiz at.' };
    }
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, error: 'Geçersiz tutar.' };
    }
    if (value > this.balance) {
      return { ok: false, error: 'Bakiyen bu bahis için yetersiz.' };
    }

    this.balance -= value;
    round.myBets.push({ horse: num, amount: value });
    round.totalBet += value;
    round.totalStaked += value;
    round.playerCount = this.field.length + 1;

    this._persist();
    this._emit();
    return { ok: true };
  }

  /** Demo modda bakiye biterse oyunu kilitlememek için. */
  addDemoBalance(amount = 1000) {
    const value = Math.round(Number(amount)) || 0;
    if (value <= 0) return;
    this.balance += value;
    this._persist();
    this._emit();
  }

  // ── İç döngü ─────────────────────────────────────────────────────────────

  _tick() {
    const now = Date.now();

    if (!this.round) {
      this._newRound(now);
      return;
    }

    const round = this.round;

    if (round.phase === 'betting' && now >= round.bettingEndsAt) {
      round.phase = 'racing';
      round.order = this.pendingOrder.slice();
      round.times = { ...this.pendingTimes };
      const slowest = Math.max(...Object.values(round.times));
      round.raceEndsAt = round.bettingEndsAt + slowest + 250;
      this._emit();
      return;
    }

    if (round.phase === 'racing' && now >= round.raceEndsAt) {
      this._settle(now);
      return;
    }

    if (round.phase === 'result' && now >= round.resultEndsAt) {
      this._closeRound(now);
    }
  }

  _newRound(now) {
    this.sequence += 1;
    const id = `demo-${now.toString(36)}-${this.sequence}`;
    const random = mulberry32(hashString(id));

    // Kazanan, oranına göre ağırlıklı seçilir; kalan atlar rastgele sıralanır.
    const winner = weightedWinner(random);
    const rest = shuffle(
      HORSES.map((horse) => horse.num).filter((num) => num !== winner),
      random,
    );
    const order = [winner, ...rest];

    const times = {};
    let ms = 10400;
    order.forEach((horse, index) => {
      if (index > 0) ms += 380 + Math.floor(random() * 720);
      times[horse] = Math.round(ms);
    });

    this.pendingOrder = order;
    this.pendingTimes = times;
    this.field = this._buildField(random);

    const totalStaked = this.field.reduce((sum, bet) => sum + bet.amount, 0);

    this.round = {
      id,
      // Demo motorunda tur numarası yereldir (gerçek modda sunucudan gelir).
      number: this.sequence,
      phase: 'betting',
      bettingEndsAt: now + RACE.bettingMs,
      raceEndsAt: null,
      resultEndsAt: null,
      winner: null,
      order: null,
      times: null,
      myBets: [],
      totalBet: 0,
      myPayout: 0,
      leaderboard: null,
      winnersCount: 0,
      playerCount: this.field.length,
      totalStaked,
    };

    this._emit();
  }

  _buildField(random) {
    const names = shuffle(FIELD_NAMES, random).slice(0, 3 + Math.floor(random() * 4));
    const amounts = [10, 50, 100, 500, 1000];
    const weights = [30, 28, 22, 14, 6];
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    return names.map((nickname) => {
      let roll = random() * totalWeight;
      let amount = STAKES[0];
      for (let i = 0; i < amounts.length; i += 1) {
        roll -= weights[i];
        if (roll <= 0) {
          amount = amounts[i];
          break;
        }
      }
      return {
        nickname,
        horse: 1 + Math.floor(random() * HORSES.length),
        amount,
      };
    });
  }

  _settle(now) {
    const round = this.round;
    const winner = round.order?.[0] ?? null;
    if (!winner) return;

    const mine = settleBets(
      round.myBets.map((bet) => ({ ...bet, nickname: this.playerName })),
      winner,
    );
    const payout = mine.reduce((sum, bet) => sum + bet.payout, 0);

    if (payout > 0) {
      this.balance += payout;
      this._persist();
    }

    const allBets = [...this.field, ...mine];

    round.winner = winner;
    round.phase = 'result';
    round.resultEndsAt = now + RACE.resultMs;
    round.myPayout = payout;
    round.leaderboard = topWinners(allBets, winner, 3);
    round.winnersCount = winnerCount(allBets, winner);
    round.playerCount = this.field.length + (round.myBets.length > 0 ? 1 : 0);

    this._emit();
  }

  _closeRound(now) {
    const round = this.round;

    if (round?.winner) {
      this.history = [
        { id: round.id, winner: round.winner, at: now },
        ...this.history.filter((item) => item.id !== round.id),
      ].slice(0, 10);
      try {
        this.storage?.setItem(HISTORY_KEY, JSON.stringify(this.history));
      } catch {
        /* depolama kapalıysa geçmiş yalnız bu oturumda kalır */
      }
    }

    this.round = null;
    this._newRound(now);
  }

  _persist() {
    try {
      this.storage?.setItem(BALANCE_KEY, String(this.balance));
    } catch {
      /* yoksay */
    }
  }

  _emit() {
    const snapshot = this.snapshot();
    for (const fn of this.listeners) {
      try {
        fn(snapshot);
      } catch (error) {
        console.error('[mock-engine] dinleyici hatası', error);
      }
    }
  }
}
