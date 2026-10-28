// ─── Geçmiş sonuçlar ────────────────────────────────────────────────────────
// Son 10 turun kazanan atı: renkli rozet + ipucu. Liste değişmedikçe DOM'a
// dokunulmaz.

import { HORSE_BY_NUM } from '../config.js';
import { formatClock } from '../core/utils.js';

export function createHistory(host) {
  // `null` başlangıç: boş liste de bir kez çizilsin ("henüz tur yok").
  let signature = null;

  function update(items) {
    const list = Array.isArray(items) ? items.slice(0, 10) : [];
    const nextSignature = list.map((item) => `${item.id}:${item.winner}`).join('|');
    if (nextSignature === signature) return;
    signature = nextSignature;

    host.replaceChildren();

    if (list.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'history-empty';
      empty.textContent = 'Henüz tamamlanmış tur yok.';
      host.append(empty);
      return;
    }

    for (const item of list) {
      const horse = HORSE_BY_NUM.get(Number(item.winner));
      const badge = document.createElement('span');
      badge.className = 'hbadge';
      if (horse) badge.style.setProperty('--horse', horse.color);
      badge.textContent = horse ? String(horse.num) : '?';

      const time = item.at ? formatClock(Number(item.at)) : '';
      const tip = horse ? `${time} · ${horse.name}` : time;
      badge.dataset.tip = tip;
      badge.title = tip;
      host.append(badge);
    }
  }

  return { update };
}
