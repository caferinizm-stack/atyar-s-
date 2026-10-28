// ─── Giriş noktası ──────────────────────────────────────────────────────────
// Sahne + motor + arayüz parçalarını bağlar. Tüm zaman hesabı sunucu saatine
// hizalanır (`offset`): geri sayım, yarış ve sonuç aynı saati kullanır.

import { APP_MODE, HORSE_BY_NUM, STAKES } from './config.js';
import { formatCoins } from './core/utils.js';
import { createEngine } from './engine/index.js';
import { Stage } from './scene/scene.js';
import { createBetPanel } from './ui/bet-panel.js';
import { createCountdown } from './ui/countdown.js';
import { createHistory } from './ui/history.js';
import { createHud } from './ui/hud.js';
import { createLogin } from './ui/login.js';
import { createResults } from './ui/results.js';
import { coin, lose, startHoof, stopHoof, unlockSound, win } from './ui/sound.js';
import { initToasts, toast } from './ui/toast.js';

const byId = (id) => document.getElementById(id);
const STAKE_KEY = 'at_yarisi.stake';

// ── Açılış katmanı ────────────────────────────────────────────────────────
// Hipodrom arkada (**gizlice**) kurulur; ekranda yalnız oyun görseli,
// "Oyun yükleniyor" yazısı ve gerçekten ilerleyen bir çubuk görünür.
const bootFill = byId('boot-fill');
const bootTitle = byId('boot-title');
const bootNote = byId('boot-note');
const bootBarNode = byId('boot-progress');
let bootValue = 5;

/** Çubuğu ilerletir (asla geri gitmez). */
function boot(pct, label) {
  bootValue = Math.max(bootValue, Math.min(100, Math.round(pct)));
  if (bootFill) bootFill.style.width = `${bootValue}%`;
  bootBarNode?.setAttribute('aria-valuenow', String(bootValue));
  if (label && bootTitle) bootTitle.textContent = label;
}

let bootGone = false;

/** Katmanı yumuşakça kaldırır (katman kaldırılsa da oyun arkada hazır). */
function hideBoot() {
  if (bootGone) return;
  bootGone = true;
  boot(100);
  const layer = byId('stage-loading');
  window.setTimeout(() => {
    layer?.classList.add('done');
    window.setTimeout(() => layer?.remove(), 650);
  }, 240);
}

function showFatal(message) {
  const layer = byId('stage-loading');
  if (layer) layer.classList.remove('done');
  if (bootTitle) bootTitle.textContent = 'Oyun açılamadı';
  if (bootNote) bootNote.textContent = message;
  if (bootFill) bootFill.style.width = '100%';
}

async function boot_() {
  initToasts(byId('toasts'));

  // Ses bağlamı ilk dokunuşta açılır (tarayıcı kuralı); o ana kadar sessiz.
  document.addEventListener('pointerdown', unlockSound, { once: true });
  document.addEventListener('keydown', unlockSound, { once: true });

  boot(12);

  let stage;
  try {
    stage = new Stage(byId('scene'));
    boot(34, 'Hipodrom hazırlanıyor');
  } catch (error) {
    console.error('[stage] WebGL başlatılamadı', error);
    showFatal(
      '3D sahne açılamadı. Tarayıcında WebGL kapalı olabilir; donanım hızlandırmayı açıp sayfayı yenile.',
    );
    return;
  }

  const countdown = createCountdown(byId('countdown'));
  const history = createHistory(byId('history'));
  const results = createResults(byId('results'), {
    getPlayerName: () => snapshot?.player?.nickname ?? 'Sen',
  });

  const hud = createHud({
    phasePill: byId('phase-pill'),
    roundPill: byId('round-pill'),
    balance: byId('balance'),
    connection: byId('connection'),
    connectionLabel: byId('connection-label'),
    hint: byId('stage-hint'),
    leader: byId('leader'),
    leaderText: byId('leader-text'),
    playersHost: byId('players'),
  });

  let offset = 0;
  let snapshot = null;
  let lastLeader = null;
  let lastError = '';

  /// Sonuç sesinin her turda **bir kez** çalması için son işlenen tur.
  let lastResultRound = '';

  /// Sunucu onayı bekleyen bahislerin toplamı (bakiye anında düşsün).
  let pendingTotal = 0;
  const settleQueue = [];

  /// Büyük kazançları uygulamaya bildir (odalarda global duyuru).
  function reportWin(amount) {
    try {
      window.RetraGame?.postMessage(`win:${Math.round(amount)}`);
    } catch {
      /* kanal yoksa yoksay */
    }
  }

  const now = () => Date.now() + offset;

  const panel = createBetPanel({
    cardsHost: byId('cards'),
    stakesHost: byId('stakes'),
    totalHost: byId('round-total'),
    onBet: (horse) => {
      void placeBet(horse);
    },
    onStake: (amount) => {
      try {
        localStorage.setItem(STAKE_KEY, String(amount));
      } catch {
        /* yoksay */
      }
    },
  });

  try {
    const saved = Number(localStorage.getItem(STAKE_KEY));
    if (STAKES.includes(saved)) panel.setStake(saved);
  } catch {
    /* yoksay */
  }

  // ── Motor ────────────────────────────────────────────────────────────────
  let engine;
  boot(52, 'Sunucuya bağlanılıyor');
  try {
    engine = await createEngine({
      onFallback: (error) =>
        toast(
          error?.message ?? 'Canlı sunucuya bağlanılamadı, demo moduna geçildi.',
          'warn',
          6500,
        ),
    });
    boot(72);
  } catch (error) {
    console.error('[engine] başlatılamadı', error);
    showFatal('Oyun motoru başlatılamadı. Sayfayı yenileyip tekrar dene.');
    return;
  }

  // **Uygulama modu**: giriş ekranı hiç kurulmaz. Kimlik uygulamadan
  // (WebView belirteçleriyle) gelir; sayfa yalnız hazır olduğunu bildirir.
  if (APP_MODE) document.body.classList.add('app-mode');

  const login = APP_MODE
    ? null
    : createLogin(byId('login'), {
        onSubmit: (email, password) => engine.signIn(email, password),
      });

  // Uygulamada oturum kurulamazsa gösterilen sade durum (giriş formu YOK).
  let gateState = '';
  let gateTimer = null;

  function showAppGate(state, message) {
    if (gateState === state) return;
    gateState = state;

    const host = byId('login');
    if (!host) return;
    host.hidden = false;
    host.replaceChildren();

    const card = document.createElement('div');
    card.className = 'login-card app-gate';

    const mark = document.createElement('span');
    mark.className = 'login-mark';
    const markImg = document.createElement('img');
    markImg.src = './assets/atyarisi.png';
    markImg.alt = '';
    mark.appendChild(markImg);

    const title = document.createElement('h2');
    title.textContent = state === 'loading' ? 'Hipodroma bağlanıyorsun' : 'Bağlantı kurulamadı';

    const sub = document.createElement('p');
    sub.className = 'login-sub';
    sub.textContent = message;

    card.append(mark, title, sub);

    if (state === 'loading') {
      const bar = document.createElement('div');
      bar.className = 'app-gate-bar';
      const fill = document.createElement('i');
      bar.append(fill);
      card.append(bar);

      // 8 saniye sonra hâlâ bağlanamadıysak yalan söylemeyelim.
      window.clearTimeout(gateTimer);
      gateTimer = window.setTimeout(() => {
        showAppGate(
          'error',
          'Sunucuya ulaşılamadı. İnternetini kontrol edip tekrar dene.',
        );
      }, 8000);
    } else {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'login-submit';
      retry.textContent = 'Tekrar dene';
      retry.addEventListener('click', () => window.location.reload());
      card.append(retry);
    }

    host.append(card);
  }

  function hideAppGate() {
    if (gateState === '') return;
    gateState = '';
    window.clearTimeout(gateTimer);
    const host = byId('login');
    if (host) {
      host.hidden = true;
      host.replaceChildren();
    }
  }

  // Uygulamaya "oyun hazır" haberini bir kez gönder (3 sn'lik açılış
  // animasyonu bununla kapanır).
  let readySent = false;
  function tellAppReady() {
    if (readySent) return;
    readySent = true;
    try {
      window.RetraGame?.postMessage('ready');
    } catch {
      /* kanal yoksa (tarayıcı) yoksay */
    }
  }

  let logoutButton = null;

  function ensureLogoutButton() {
    if (APP_MODE) return;
    if (logoutButton) return;
    logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'chip logout';
    logoutButton.textContent = 'Çıkış';
    logoutButton.title = 'Hesaptan çıkış yap';
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      await engine.signOut?.();
      window.location.reload();
    });
    document.querySelector('.topbar-meta')?.appendChild(logoutButton);
  }

  engine.on((next) => {
    if (!next) return;
    applySnapshot(next);
  });

  try {
    await engine.connect();
    boot(88, 'Bahisler hazırlanıyor');
  } catch (error) {
    console.error('[engine] bağlantı kurulamadı', error);
    toast('Sunucuya bağlanılamadı, bağlantını kontrol et.', 'error', 6000);
  }

  // ── Anlık görüntüyü arayüze dağıt ────────────────────────────────────────
  function applySnapshot(next) {
    snapshot = next;

    const serverNow = Number(next.serverNow);
    if (Number.isFinite(serverNow)) offset = serverNow - Date.now();

    // Faz: CSS bu bayrakla bahis panelini gizleyip hipodromu büyütür.
    const phase = next.round?.phase ?? '';
    if (document.body.dataset.phase !== phase) {
      if (phase) document.body.dataset.phase = phase;
      else delete document.body.dataset.phase;
    }

    // Gerçek hesap modunda oturum yoksa oyun kilitli kalır.
    if (next.needsLogin) {
      if (APP_MODE) {
        showAppGate(
          'loading',
          'Uygulamadaki hesabınla eşleşiyorsun, birkaç saniye sürer.',
        );
      } else {
        login?.show();
      }
      stopHoof();
      panel.update(null, { locked: true });
      results.hide();
      history.update([]);
      hud.update(next);
      lastError = '';
      return;
    }

    if (APP_MODE) {
      hideAppGate();
      tellAppReady();
    } else {
      login?.hide();
    }

    if (next.mode === 'live') ensureLogoutButton();

    const round = next.round;

    if (round) {
      // Tur verisi geldi: çubuk sona yaklaşır.
      if (!bootGone && round.id) boot(96);
      stage.syncRound(round, now());
      const locked = round.phase !== 'betting';
      panel.update(round, { locked });

      // Nal sesleri yalnız koşu sırasında.
      if (round.phase === 'racing') startHoof();
      else stopHoof();

      if (round.phase === 'result') {
        results.show(round);
        panel.setWinner(round.winner);

        if (lastResultRound !== round.id) {
          lastResultRound = round.id;
          const payout = Number(round.myPayout) || 0;
          const played = (round.myBets ?? []).length > 0;
          if (payout > 0) {
            win();
            reportWin(payout);
          } else if (played) {
            lose();
          }
        }
      } else {
        results.hide();
        panel.setWinner(null);
      }
    } else {
      stopHoof();
      panel.update(null, { locked: true });
      results.hide();
    }

    history.update(next.history);
    hud.update(next);
    if (pendingTotal > 0) showBalance();

    if (next.error) {
      if (next.error !== lastError) {
        lastError = next.error;
        toast(next.error, 'error', 5000);
      }
    } else {
      lastError = '';
    }
  }

  async function placeBet(horse) {
    if (snapshot?.needsLogin) {
      // Uygulama modunda "giriş" yok: kimlik henüz eşleşiyor olabilir.
      toast(
        APP_MODE
          ? 'Hesabın eşleşiyor, birkaç saniye sonra tekrar dene.'
          : 'Bahis için giriş yapmalısın.',
        'warn',
      );
      return;
    }

    const round = snapshot?.round;

    if (!round) {
      toast('Tur hazırlanıyor…', 'warn');
      return;
    }
    if (round.phase !== 'betting') {
      toast('Bahisler kapandı, yeni turu bekle.', 'warn');
      return;
    }

    const amount = panel.getStake();
    const balance = Number(snapshot?.player?.balance) || 0;

    if (amount > balance) {
      toast('Bakiyen bu bahis için yetersiz.', 'error');
      return;
    }

    // Bakiye bekleyen bahislerle birlikte kontrol edilir (art arda dokunuş).
    if (amount > balance - pendingTotal) {
      toast('Bakiyen bu bahis için yetersiz.', 'error');
      return;
    }

    // Kart/bahis dokunuşu: para sesi + kartta **anında** tutar (sunucu
    // cevabı beklenmez; hızlı art arda bahislerde ekran takılmaz).
    coin();
    pendingTotal += amount;
    panel.addPending(horse, amount);
    showBalance();

    let response;
    try {
      response = await engine.placeBet(horse, amount);
    } catch {
      response = { ok: false };
    }
    // Bekleyen tutarlar, **son** istek de dönüp yeni durum uygulanınca düşer
    // (kartta tutar bir an azalıp geri artmasın).
    settleQueue.push([horse, amount]);
    if ((engine.betsInFlight ?? 0) === 0) {
      for (const [h, a] of settleQueue) {
        pendingTotal = Math.max(0, pendingTotal - a);
        panel.settlePending(h, a);
      }
      settleQueue.length = 0;
      panel.refresh();
      showBalance();
    }
    if (!response?.ok) {
      toast(response?.error ?? 'Bahis alınamadı.', 'error');
    }
  }

  /** Bakiye: sunucu bakiyesi − henüz onaylanmamış bahisler. */
  function showBalance() {
    const node = byId('balance');
    const value = Math.max(0, (Number(snapshot?.player?.balance) || 0) - pendingTotal);
    const text = formatCoins(value);
    if (node && node.textContent !== text) node.textContent = text;
  }

  byId('wallet').addEventListener('click', () => {
    if (snapshot?.mode === 'demo') {
      engine.addDemoBalance?.(1000);
      toast('Demo bakiyesi: +1.000 kristal', 'success', 1800);
    } else {
      toast('Bakiye sunucu tarafından yönetilir.', 'info');
    }
  });

  window.addEventListener('beforeunload', () => {
    stopHoof();
    engine.disconnect?.();
  });

  // Uygulama arka plana düşünce nal sesleri susar (kullanıcı duymaz).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopHoof();
  });

  // ── Kare döngüsü ─────────────────────────────────────────────────────────
  let lastFrame = performance.now();

  /// **Bahis fazı kare sınırı**: sahne bu fazda neredeyse sabit (yalnız
  /// kameranın yavaş salınımı). 32 fps yeterli, yarış/sonuç tam hızda çizilir.
  const IDLE_FPS = 32;
  let idleDt = 0;

  function frame(time) {
    const dt = Math.min(0.05, Math.max(0.001, (time - lastFrame) / 1000));
    lastFrame = time;

    const current = now();
    const round = snapshot?.round ?? null;
    const phase = round?.phase ?? 'betting';

    // **Her kare çizilir** (eski 32 fps sınırı bahis fazında kesik kesik
    // görünüyordu); yük, sahnenin uyarlanabilir çözünürlüğüyle dengelenir.
    void phase;
    void IDLE_FPS;
    idleDt = 0;
    const step = dt;

    stage.render(current, step);
    countdown.update(round, current);
    results.update(round, current);

    if (round?.phase === 'racing') {
      const leader = stage.race.leaderNum ?? null;
      if (leader !== lastLeader) {
        lastLeader = leader;
        panel.setLeader(leader);
        hud.setLeader(leader);
      }
    } else if (lastLeader !== null) {
      lastLeader = null;
      panel.setLeader(null);
      hud.setLeader(null);
    }

    requestAnimationFrame(frame);
  }

  // İlk kareler çizildikten sonra açılış katmanı kalkar.
  requestAnimationFrame(() => {
    stage.render(now(), 0.016);
    requestAnimationFrame(() => {
      boot(100);
      hideBoot();
      requestAnimationFrame(frame);
    });
  });
}

boot_().catch((error) => {
  console.error(error);
  showFatal('Oyun başlatılamadı. Konsolu kontrol edip sayfayı yenile.');
});
