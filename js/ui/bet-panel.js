// ─── Bahis paneli ───────────────────────────────────────────────────────────
// Tutar düğmeleri + iki sıra hâlinde 6 at kartı. Kartlar bir kez kurulur,
// yalnız değişen sınıflar/metinler güncellenir (her karede DOM yazımı yok).

import { CURRENCY, HORSES, STAKES } from '../config.js';
import { formatCoins, formatCompact } from '../core/utils.js';
import { HORSE_ART_HUE } from './horse-art.js';

export function createBetPanel({ cardsHost, stakesHost, totalHost, onBet, onStake }) {
  let selectedStake = STAKES[1] ?? STAKES[0];
  let round = null;
  let lastLocked = false;
  /** Sunucu onayı beklenen bahisler (at → tutar): kart **anında** güncellenir. */
  const pending = new Map();

  // ── Tutar düğmeleri ───────────────────────────────────────────────────────
  const stakeButtons = new Map();

  for (const amount of STAKES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stake';
    button.dataset.amount = String(amount);
    button.innerHTML = `<img class="coin-icon coin-xs" src="./assets/kristal.png" alt="" />${formatCoins(amount)}`;
    button.addEventListener('click', () => {
      selectedStake = amount;
      syncStakes();
      onStake?.(amount);
    });
    stakesHost.appendChild(button);
    stakeButtons.set(amount, button);
  }

  function syncStakes() {
    for (const [amount, button] of stakeButtons) {
      button.classList.toggle('active', amount === selectedStake);
      button.setAttribute('aria-pressed', amount === selectedStake ? 'true' : 'false');
    }
    for (const entry of cards.values()) {
      if (!entry.node.classList.contains('locked')) {
        entry.node.title = `${formatCoins(selectedStake)} ${CURRENCY} seçili — karta dokun`;
      }
    }
  }

  // ── At kartları ───────────────────────────────────────────────────────────
  const cards = new Map();

  // **Kart düzeni**: yarı saydam at görseli + sol üstte numara + sol altta
  // çarpan. Başka yazı yok (istek: "bu kadar").
  HORSES.forEach((horse, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.horse = String(horse.num);
    card.style.setProperty('--horse', horse.color);
    card.style.setProperty('--art-hue', `${HORSE_ART_HUE[index % HORSE_ART_HUE.length]}deg`);
    card.setAttribute('aria-label', `${horse.num} numaralı at · ${horse.odds}×`);
    card.innerHTML = `
      <span class="card-art" aria-hidden="true">
        <span class="horse-emoji">🐎</span>
      </span>
      <span class="card-top">
        <span class="num">${horse.num}</span>
        <span class="card-bet">
          <img class="coin-icon coin-xs" src="./assets/kristal.png" alt="" />
          <i>0</i>
        </span>
      </span>
      <span class="odds">${horse.odds}<small>×</small></span>
    `;
    card.addEventListener('click', () => onBet?.(horse.num));

    cardsHost.appendChild(card);
    // "+tutar" baloncuğu (önceden kurulur; her dokunuşta yeniden kullanılır).
    const float = document.createElement('span');
    float.className = 'card-float';
    card.appendChild(float);

    cards.set(horse.num, {
      node: card,
      float,
      betNode: card.querySelector('.card-bet'),
      betAmount: 0,
      isLeader: false,
      isWinner: false,
    });
  });

  syncStakes();

  /** Tur bilgisini kartlara uygular. */
  function update(nextRound, { locked = false } = {}) {
    if (nextRound?.id !== round?.id) pending.clear();
    round = nextRound;
    lastLocked = locked;

    const betsByHorse = new Map();
    let total = 0;
    for (const bet of round?.myBets ?? []) {
      betsByHorse.set(bet.horse, (betsByHorse.get(bet.horse) ?? 0) + bet.amount);
      total += bet.amount;
    }
    for (const [horse, amount] of pending) {
      betsByHorse.set(horse, (betsByHorse.get(horse) ?? 0) + amount);
      total += amount;
    }

    const totalText = formatCoins(total);
    if (totalHost.textContent !== totalText) totalHost.textContent = totalText;

    for (const [num, entry] of cards) {
      const amount = betsByHorse.get(num) ?? 0;
      if (amount !== entry.betAmount) {
        entry.betAmount = amount;
        const valueNode = entry.betNode?.querySelector('i');
        // 10.000 ve üstü "10K" gibi kısa yazılır (kartı taşırmasın).
        if (valueNode) valueNode.textContent = formatCompact(amount);
        // Bahis tutarı kartın **sol üstünde**, numaranın yanında görünür.
        entry.node.classList.toggle('has-bet', amount > 0);
      }
      if (entry.locked !== locked) {
        entry.locked = locked;
        entry.node.classList.toggle('locked', locked);
        entry.node.setAttribute('aria-disabled', locked ? 'true' : 'false');
        entry.node.title = locked
          ? 'Bahisler kapandı'
          : `${formatCoins(selectedStake)} ${CURRENCY} seçili — karta dokun`;
      }
    }
  }

  /**
   * Dokunur dokunmaz: kartta tutar artar, "+tutar" yükselir, kart parlar.
   * Sunucu cevabı beklenmez (çok hızlı art arda bahiste takılma olmaz).
   */
  function addPending(horse, amount) {
    pending.set(horse, (pending.get(horse) ?? 0) + amount);
    update(round, { locked: lastLocked });
    const entry = cards.get(horse);
    if (!entry) return;
    entry.float.textContent = `+${formatCompact(amount)}`;
    entry.float.classList.remove('go');
    entry.node.classList.remove('tap');
    // Animasyonu yeniden başlat (yalnız transform/opacity: GPU'da akar).
    void entry.float.offsetWidth;
    entry.float.classList.add('go');
    entry.node.classList.add('tap');
  }

  /** Sunucu cevap verdi: bekleyen tutar düşer (onaylıysa tura yazılmıştır). */
  function settlePending(horse, amount) {
    const left = (pending.get(horse) ?? 0) - amount;
    if (left > 0) pending.set(horse, left);
    else pending.delete(horse);
  }

  /** Koşu sırasında önde olan atı işaretler (yalnız değişince yazar). */
  function setLeader(num) {
    if (!round || round.phase !== 'racing') num = null;
    for (const [horse, entry] of cards) {
      const leader = horse === num;
      if (leader === entry.isLeader) continue;
      entry.isLeader = leader;
      entry.node.classList.toggle('leader', leader);
    }
  }

  /** Sonuç fazında kazanan kartı vurgular. */
  function setWinner(num) {
    for (const [horse, entry] of cards) {
      const winner = horse === Number(num);
      if (winner === entry.isWinner) continue;
      entry.isWinner = winner;
      entry.node.classList.toggle('winner', winner);
    }
  }

  function clearHighlights() {
    for (const entry of cards.values()) {
      entry.isLeader = false;
      entry.isWinner = false;
      entry.node.classList.remove('leader', 'winner');
    }
  }

  function getStake() {
    return selectedStake;
  }

  function setStake(value) {
    if (!STAKES.includes(value)) return;
    selectedStake = value;
    syncStakes();
  }

  return {
    update,
    setLeader,
    setWinner,
    clearHighlights,
    getStake,
    setStake,
    addPending,
    settlePending,
    refresh: () => update(round, { locked: lastLocked }),
  };
}
