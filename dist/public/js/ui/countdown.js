// ─── Geri sayım ─────────────────────────────────────────────────────────────
// Bahis fazında sahnenin ortasında halka + saniye. Yalnız saniye değişince
// DOM yazılır; halka her karede yumuşakça dolar.

import { RACE } from '../config.js';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function createCountdown(host) {
  host.innerHTML = `
    <div class="ring-wrap">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="countdown-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffd166" />
            <stop offset="1" stop-color="#9b7bff" />
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="60" cy="60" r="${RADIUS}" />
        <circle class="ring-value" cx="60" cy="60" r="${RADIUS}" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0" />
      </svg>
      <div class="ring-inner">
        <span class="ring-number">20</span>
        <span class="ring-label">bahis süresi</span>
      </div>
    </div>
  `;

  const wrap = host.querySelector('.ring-wrap');
  const arc = host.querySelector('.ring-value');
  const number = host.querySelector('.ring-number');
  const label = host.querySelector('.ring-label');

  let visible = false;
  let lastSecond = null;
  let popTimer = 0;

  function update(round, now) {
    const shouldShow = Boolean(round) && round.phase === 'betting';
    if (shouldShow !== visible) {
      visible = shouldShow;
      host.classList.toggle('visible', visible);
    }
    if (!shouldShow) return;

    const remaining = Math.max(0, round.bettingEndsAt - now);
    const ratio = Math.min(1, remaining / Math.max(1, RACE.bettingMs));
    arc.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));

    const seconds = Math.ceil(remaining / 1000);
    if (seconds === lastSecond) return;
    lastSecond = seconds;

    number.textContent = String(Math.min(99, seconds)).padStart(2, '0');
    wrap.classList.toggle('urgent', seconds <= 5);
    label.textContent = seconds <= 5 ? 'son saniyeler' : 'bahis süresi';

    wrap.classList.remove('pop');
    // Yeniden başlatmak için tarayıcıya düzen hesaplaması yaptır.
    void wrap.offsetWidth;
    wrap.classList.add('pop');
    window.clearTimeout(popTimer);
    popTimer = window.setTimeout(() => wrap.classList.remove('pop'), 360);
  }

  function hide() {
    host.classList.remove('visible');
    wrap.classList.remove('pop');
    visible = false;
    lastSecond = null;
  }

  return { update, hide };
}
