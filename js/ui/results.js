// ─── Sonuç kartı (UEFA düzeninde, 3 kişilik podyum) ─────────────────────────
// Yarış bitince **hipodromun altında** açılır:
//   * üstte kazanan at — bahis kartının aynısı (numara + çarpan + at görseli),
//   * altında **podyum**: 2. solda, 1. ortada (taç), 3. sağda; her birinde
//     profil resmi + takılı çerçeve, isim ve kazanç,
//   * en altta kişisel sonuç ve "yeni tur N sn içinde" çubuğu.
//
// Tutarlar 10.000 üstünde kısaltılır (`240K`), böylece kart yer kaplamaz.
// Kullanıcı adları sunucudan geldiği için metin olarak yazılır.

import { HORSE_BY_NUM, RACE } from '../config.js';
import { formatCoins, formatCompact } from '../core/utils.js';
import { avatarNode } from './avatar.js';
import { HORSE_ART_HUE } from './horse-art.js';

/** Küçük yardımcı: sınıflı, metinli eleman. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Kazanan atın **bahis kartı** görünümü (numara + çarpan + at görseli).
 * Bahis panelindeki kartla birebir aynı sınıflar kullanılır.
 */
function horseCard(horse) {
  const card = el('div', 'card rc-horse');
  card.style.setProperty('--horse', horse.color);
  const index = Math.max(0, horse.num - 1);
  card.style.setProperty(
    '--art-hue',
    `${HORSE_ART_HUE[index % HORSE_ART_HUE.length]}deg`,
  );

  const art = el('span', 'card-art');
  art.setAttribute('aria-hidden', 'true');
  art.append(el('span', 'horse-emoji', '🐎'));

  const top = el('span', 'card-top');
  top.append(el('span', 'num', String(horse.num)));

  const odds = el('span', 'odds');
  odds.append(String(horse.odds), el('small', '', '×'));

  card.append(art, top, odds);
  return card;
}

export function createResults(host, { getPlayerName = () => 'Sen' } = {}) {
  let openFor = null;
  let barEl = null;
  let timerEl = null;

  function hide() {
    host.hidden = true;
    host.replaceChildren();
    openFor = null;
    barEl = null;
    timerEl = null;
  }

  /** Podyumdaki tek kişi: avatar (+çerçeve), isim, kazanç. */
  function podiumSlot(row, place) {
    const slot = el('div', `rc-slot rc-slot-${place}`);
    if (row && String(row.nickname) === getPlayerName()) slot.classList.add('me');

    if (!row) {
      slot.classList.add('empty');
      slot.append(el('span', 'rc-slot-av-empty', '—'));
      slot.append(el('span', 'rc-slot-name', place === 1 ? 'Kazanan yok' : `—`));
      return slot;
    }

    const avWrap = el('div', 'rc-slot-av');
    avWrap.append(avatarNode(row, place === 1 ? 46 : 36));
    if (place === 1) avWrap.append(el('span', 'rc-sen', 'SEN'));
    avWrap.append(el('span', 'rc-slot-rank', String(place)));

    const horse = HORSE_BY_NUM.get(Number(row.horse));
    const payout = Number(row.payout) || 0;

    // Kazanç, **gerçek kristal ikonu** ile yazılır.
    const gain = el('span', 'rc-slot-gain');
    const coin = document.createElement('img');
    coin.className = 'rc-coin';
    coin.src = './assets/kristal.png';
    coin.alt = '';
    gain.append(coin, document.createTextNode(`+${formatCompact(payout)}`));

    slot.append(
      avWrap,
      el('span', 'rc-slot-name', String(row.nickname ?? 'Oyuncu')),
      el(
        'span',
        'rc-slot-sub',
        horse ? `At ${horse.num} · ${formatCompact(Number(row.amount) || 0)}` : '',
      ),
      gain,
    );
    slot.title = `${row.nickname ?? 'Oyuncu'} · +${formatCoins(payout)} kristal`;
    return slot;
  }

  function show(round) {
    if (!round || round.phase !== 'result') return;
    if (openFor === round.id) return;
    openFor = round.id;

    const horse = HORSE_BY_NUM.get(round.winner) ?? null;
    const myBets = round.myBets ?? [];
    const myPayout = Number(round.myPayout) || 0;
    const rows = Array.isArray(round.leaderboard) ? round.leaderboard : [];

    const card = el('div', 'rc');

    // ── Başlık: KAZANANLAR + tur numarası ──────────────────────────────────
    const head = el('div', 'rc-head');
    const title = el('span', 'rc-title');
    title.append(el('span', 'rc-cup', '🏆'), document.createTextNode('KAZANANLAR'));
    const roundNo = Number(round.number);
    head.append(
      title,
      el('span', 'rc-round', roundNo > 0 ? `TUR #${roundNo}` : 'SONUÇ'),
    );

    // ── Kazanan at: bahis kartı + isim + bitiş sırası ─────────────────────
    const hero = el('div', 'rc-hero');
    const heroTop = el('div', 'rc-hero-top');
    if (horse) heroTop.append(horseCard(horse));

    const heroText = el('div', 'rc-hero-text');
    const heroName = el('span', 'rc-hero-name', horse ? horse.name : 'Sonuç yok');
    const order = Array.isArray(round.order) ? round.order.slice(0, 3) : [];
    heroText.append(
      heroName,
      el(
        'span',
        'rc-hero-sub',
        horse && order.length > 0
          ? `Bitiş · ${order.join(' · ')}`
          : 'Yarış tamamlandı',
      ),
    );
    heroTop.append(heroText);
    hero.append(heroTop);

    // ── Podyum: 2 · 1 · 3 ─────────────────────────────────────────────────
    const winners = el('div', 'rc-podium');
    const [first, second, third] = rows.slice(0, 3);
    winners.append(
      podiumSlot(second, 2),
      podiumSlot(first, 1),
      podiumSlot(third, 3),
    );

    const noWinner = rows.length === 0
      ? el('div', 'rc-empty', 'Bu tur kimse kazanamadı')
      : null;

    // ── Kişisel sonuç ─────────────────────────────────────────────────────
    const me = el('div', 'rc-me');
    if (myBets.length === 0) {
      me.classList.add('neutral');
      me.textContent = 'Bu tura bahis yapmadın.';
    } else if (myPayout > 0) {
      me.classList.add('won');
      me.textContent = `Kazandın! +${formatCompact(myPayout)} kristal`;
    } else {
      me.classList.add('lost');
      me.textContent = 'Bu tur kazanamadın.';
    }

    // ── Alt: yeni tur sayacı ──────────────────────────────────────────────
    const foot = el('div', 'rc-foot');
    const footText = el('span', 'rc-foot-text');
    footText.append('Yeni tur ');
    timerEl = el('b', '', '5');
    footText.append(timerEl, ' sn içinde başlıyor');

    const bar = el('div', 'rc-bar');
    barEl = document.createElement('i');
    barEl.style.width = '100%';
    bar.append(barEl);
    foot.append(footText, bar);

    card.append(head, hero);
    if (noWinner) {
      card.append(noWinner);
    } else {
      card.append(winners);
      // Podyumda 3 kişi var; daha fazla kazanan varsa kısa bir satırla söylenir.
      const extra = (Number(round.winnersCount) || 0) - rows.length;
      if (extra > 0) {
        card.append(el('div', 'rc-more', `+${extra} kişi daha kazandı`));
      }
    }
    card.append(me, foot);

    host.replaceChildren(card);
    host.hidden = false;
  }

  /** Her karede yalnız ilerleme çubuğu ve saniye güncellenir. */
  function update(round, now) {
    if (host.hidden || !round || round.phase !== 'result') return;
    if (!round.resultEndsAt) return;

    const remaining = Math.max(0, round.resultEndsAt - now);
    const ratio = Math.min(1, remaining / Math.max(1, RACE.resultMs));

    if (barEl) barEl.style.width = `${(ratio * 100).toFixed(1)}%`;
    if (timerEl) {
      const seconds = Math.ceil(remaining / 1000);
      const text = String(seconds);
      if (timerEl.textContent !== text) timerEl.textContent = text;
    }
  }

  return { show, update, hide };
}
