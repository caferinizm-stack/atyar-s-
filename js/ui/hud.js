// ─── HUD ────────────────────────────────────────────────────────────────────
// Faz etiketi, tur bilgisi, bakiye, bağlantı durumu ve "önde" rozeti.
// Metinler yalnız değiştiğinde yazılır.

import { APP_MODE, HORSE_BY_NUM } from '../config.js';
import { formatCoins } from '../core/utils.js';
import { avatarNode } from './avatar.js';

const PHASE_LABEL = {
  betting: 'Bahisler açık',
  racing: 'Yarış sürüyor',
  result: 'Sonuç',
};

const HINTS = {
  betting: 'Tutar seç, atın kartına dokun.',
  racing: 'Yarış sürüyor — kartlar kilitli.',
  result: 'Yeni tur birazdan başlıyor.',
};

export function createHud({
  phasePill,
  roundPill,
  balance,
  connection,
  connectionLabel,
  hint,
  leader,
  leaderText,
  playersHost,
}) {
  /** En fazla 5 avatar + "+N" (alan dar). */
  const MAX_AVATARS = 5;
  let lastPlayersKey = '';
  let lastPhase = '';
  let lastRoundId = '';
  let roundNo = 0;
  let lastRoundText = '';
  let lastBalance = null;
  let lastLeader = null;
  let lastHint = '';
  let bumpTimer = 0;

  function update(snapshot) {
    const round = snapshot.round;

    // Bağlantı rozeti.
    const mode = snapshot.mode === 'live' ? 'live' : 'demo';
    const connected = snapshot.connected !== false;
    connection.classList.toggle('live', mode === 'live' && connected);
    connection.classList.toggle('offline', !connected && mode === 'live');
    const label =
      mode === 'demo' ? 'Demo' : connected ? 'Canlı' : 'Bağlantı yok';
    if (connectionLabel.textContent !== label) connectionLabel.textContent = label;

    // Bakiye.
    const coins = Number(snapshot.player?.balance) || 0;
    balance.textContent = formatCoins(coins);
    if (lastBalance !== null && coins > lastBalance) {
      balance.classList.remove('bump');
      void balance.offsetWidth;
      balance.classList.add('bump');
      window.clearTimeout(bumpTimer);
      bumpTimer = window.setTimeout(() => balance.classList.remove('bump'), 600);
    }
    lastBalance = coins;

    if (snapshot.needsLogin) {
      connection.classList.remove('live', 'offline');
      // **Uygulama modunda** "giriş" diye bir şey yok: kimlik uygulamadan
      // geliyor, o yüzden kullanıcıya bağlanma durumu gösterilir.
      const loginLabel = APP_MODE ? 'Bağlanıyor' : 'Giriş gerekli';
      if (connectionLabel.textContent !== loginLabel) {
        connectionLabel.textContent = loginLabel;
      }
      phasePill.className = 'pill ghost';
      phasePill.textContent = APP_MODE ? 'Hazırlanıyor' : 'Giriş gerekli';
      roundPill.textContent = APP_MODE ? 'Retra · At Yarışı' : 'Retra hesabı';
      hint.textContent = APP_MODE
        ? 'Kimliğin doğrulanıyor…'
        : 'Kristallerinle oynamak için giriş yap.';
      setLeader(null);
      return;
    }

    if (!round) {
      phasePill.textContent = 'Bağlanıyor…';
      phasePill.className = 'pill ghost';
      roundPill.textContent = 'Tur hazırlanıyor…';
      return;
    }

    if (round.id !== lastRoundId) {
      if (lastRoundId) roundNo += 1;
      lastRoundId = round.id;
      lastLeader = null;
    }

    if (round.phase !== lastPhase) {
      lastPhase = round.phase;
      phasePill.className = `pill ${round.phase === 'result' ? 'result' : round.phase === 'racing' ? 'racing' : ''}`.trim();
      phasePill.textContent = PHASE_LABEL[round.phase] ?? 'Tur';
      if (round.phase !== 'racing') setLeader(null);
    }

    // **Tur numarası sunucudan** gelir: uygulama kapanıp açılsa da sıfırlanmaz
    // (eskiden her açılışta 1'den başlıyordu). Sunucu değeri yoksa yerel sayaç.
    const players = Number(round.playerCount) || 0;
    const serverNo = Number(round.number);
    const shownNo = serverNo > 0 ? serverNo : Math.max(1, roundNo);
    const roundText = `Tur ${shownNo} · ${players} oyuncu`;
    if (roundText !== lastRoundText) {
      lastRoundText = roundText;
      roundPill.textContent = roundText;
    }

    const nextHint = HINTS[round.phase] ?? '';
    if (nextHint !== lastHint) {
      lastHint = nextHint;
      hint.textContent = nextHint;
    }

    updatePlayers(round.players);

    if (round.phase !== 'racing') setLeader(null);
  }

  /**
   * Bu turda **oynayan** kişilerin avatarları (çerçeveleriyle).
   * Liste değişmedikçe DOM'a dokunulmaz.
   */
  function updatePlayers(list) {
    if (!playersHost) return;
    const players = Array.isArray(list) ? list : [];
    const key = players
      .map((p) => `${p?.nickname ?? ''}|${p?.avatar ?? ''}`)
      .join(',');
    if (key === lastPlayersKey) return;
    lastPlayersKey = key;

    playersHost.replaceChildren();
    if (players.length === 0) return;

    for (const player of players.slice(0, MAX_AVATARS)) {
      const node = avatarNode(player, 22);
      node.classList.add('av-sm');
      node.title = String(player?.nickname ?? '');
      playersHost.append(node);
    }

    const extra = players.length - MAX_AVATARS;
    if (extra > 0) {
      const more = document.createElement('span');
      more.className = 'players-more';
      more.textContent = `+${extra}`;
      playersHost.append(more);
    }
  }

  /** Koşu sırasında önde giden atı gösterir. */
  function setLeader(num) {
    if (num === lastLeader) return;
    lastLeader = num;

    const horse = num ? HORSE_BY_NUM.get(Number(num)) : null;
    if (!horse) {
      leader.hidden = true;
      leaderText.textContent = '—';
      return;
    }
    leader.hidden = false;
    // Numara + isim birlikte: hangi atın önde olduğu karışmasın.
    leaderText.textContent = `Önde: ${horse.num} · ${horse.name}`;
    leader.style.borderColor = `${horse.color}66`;
    leader.style.color = horse.color;
  }

  return { update, setLeader };
}
