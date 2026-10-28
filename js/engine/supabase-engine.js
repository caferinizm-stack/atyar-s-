// ─── Supabase motoru (gerçek hesap) ─────────────────────────────────────────
// Uygulamanın kendi kimliği kullanılır: e-posta/şifre, Google veya uygulamadan
// aktarılan oturum. Bakiye `profiles.crystals` olduğu için harcanan/kazanılan
// kristal uygulamayla ortaktır.
//
// Oturum kaynağı sırası:
//   1) supabase-js'in kaydettiği oturum (localStorage),
//   2) `window.__RETRA_SUPABASE_SESSION__` (WebView enjekte eder),
//   3) adresteki access_token/refresh_token (WebView / OAuth dönüşü).
//
// Anonim giriş **yoktur**: anonim kullanıcının profiles satırı olmadığı için
// kristal bakiyesi de olmaz.

const SUPABASE_VERSION = '2.45.4';
const CDN_URL = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_VERSION}/+esm`;

const ERROR_MESSAGES = {
  PHASE_CLOSED: 'Bahisler kapandı, yeni turu bekle.',
  BALANCE: 'Kristal bakiyen bu bahis için yetersiz.',
  BAD_HORSE: 'Geçersiz at seçimi.',
  BAD_AMOUNT: 'Geçersiz tutar (tek bahis en fazla 1.000.000 kristal).',
  AUTH_REQUIRED: 'Oturum bulunamadı, tekrar giriş yap.',
  PROFILE_MISSING: 'Bu hesabın oyun profili yok. Uygulamadan kayıt olman gerekiyor.',
  NO_ROUND: 'Tur bulunamadı, birkaç saniye sonra tekrar dene.',
};

export function translateSupabaseError(error) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;
  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    if (text.includes(code)) return message;
  }
  if (text.includes('Could not find the function')) {
    return 'Sunucu fonksiyonları eksik. supabase/schema.sql dosyasını çalıştır.';
  }
  // Oturum/jeton: genel "sunucuya ulaşılamadı" demek yanlış olur.
  if (/jwt|invalid claim|pgrst30/i.test(text)) {
    return 'Oturum yenileniyor…';
  }
  // Ağ kopması: oyunun kendisi çalışıyor, sadece bağlantı bekleniyor.
  if (/failed to fetch|networkerror|load failed|network request failed|timeout|aborted/i.test(text)) {
    return 'Bağlantı yeniden kuruluyor…';
  }

  // Tanınmayan **sunucu** hatası: genel mesaj yerine sebebi kısa ve açık yaz
  // (oyun ekranı bu mesajı gösterir, sorun buradan anlaşılır).
  const raw = String(error?.message ?? '').trim();
  if (raw && raw.length <= 120) return `Sunucu hatası: ${raw}`;

  return 'Sunucuya ulaşılamadı. Bağlantını kontrol et.';
}

function authMessage(error) {
  const text = `${error?.message ?? ''}`.toLowerCase();
  if (text.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (text.includes('email not confirmed')) return 'Önce e-postanı doğrulaman gerekiyor.';
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
  }
  if (text.includes('network') || text.includes('fetch')) {
    return 'Sunucuya ulaşılamadı. İnternetini kontrol et.';
  }
  return 'Giriş yapılamadı. Bilgilerini kontrol et.';
}

function readInjectedSession() {
  const direct = window.__RETRA_SUPABASE_SESSION__;
  if (direct?.access_token && direct?.refresh_token) return direct;

  for (const raw of [window.location.hash.slice(1), window.location.search.slice(1)]) {
    if (!raw) continue;
    const params = new URLSearchParams(raw);
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (access && refresh) return { access_token: access, refresh_token: refresh };
  }
  return null;
}

function clearTokensFromUrl() {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ['access_token', 'refresh_token', 'expires_in', 'token_type', 'type']) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (url.hash.includes('access_token')) {
      url.hash = '';
      changed = true;
    }
    if (changed) window.history.replaceState(null, '', url.toString());
  } catch {
    /* yoksay */
  }
}

export class SupabaseEngine {
  constructor(client) {
    this.client = client;
    this.mode = 'live';
    this.listeners = new Set();

    this.session = null;
    this.email = '';
    this.needsLogin = true;
    this.connected = false;
    this.lastError = '';

    this.snapshotCache = null;
    this.busy = false;
    this.timer = null;
    this.channel = null;
    this.started = false;
    this.refreshMs = 1200;
    // Üst üste başarısız yoklama sayacı: tek tük kopmalar bildirim çıkarmasın.
    this.failures = 0;

    try {
      this.client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          this.needsLogin = true;
          this.email = '';
          this.snapshotCache = null;
          this._stopLive();
          this._emit(null);
        }
      });
    } catch {
      /* oturum dinleyicisi kurulamazsa yoksay */
    }
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async connect() {
    await this._restoreSession();

    if (this.needsLogin) {
      this._emit(null);
      return this;
    }

    this._startLive();
    await this._refresh();
    return this;
  }

  disconnect() {
    this._stopLive();
  }

  async signIn(email, password) {
    const cleanEmail = String(email ?? '').trim();
    const cleanPassword = String(password ?? '');

    if (!cleanEmail || !cleanPassword) {
      return { ok: false, error: 'E-posta ve şifre gerekli.' };
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (error) return { ok: false, error: authMessage(error) };

    this.session = data.session ?? null;
    this.email = data.session?.user?.email ?? cleanEmail;
    this.needsLogin = false;

    await this.connect();
    return { ok: true };
  }

  async signInWithGoogle() {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (error) return { ok: false, error: authMessage(error) };
    return { ok: true, redirecting: true };
  }

  async signOut() {
    this._stopLive();
    try {
      await this.client.auth.signOut();
    } catch {
      /* ağ yoksa da yerel oturumu temizle */
    }
    this.session = null;
    this.email = '';
    this.needsLogin = true;
    this.connected = false;
    this.snapshotCache = null;
    this._emit(null);
  }

  async placeBet(horse, amount) {
    if (this.needsLogin) {
      return { ok: false, error: 'Bahis için giriş yapmalısın.' };
    }

    // **Art arda bahis**: istekler paralel gider; her cevabın tam durumu
    // ekrana basılmaz (takılma yapıyordu). Son istek dönünce en yeni durum
    // bir kez uygulanır; o sırada yoklama da beklemeye alınır.
    this.betsInFlight = (this.betsInFlight ?? 0) + 1;
    let result;
    try {
      const { data, error } = await this.client.rpc('horse_place_bet', {
        p_horse: Number(horse),
        p_amount: Math.round(Number(amount)),
      });
      if (error) {
        result = { ok: false, error: translateSupabaseError(error) };
      } else {
        if (data) this._latestBetState = data;
        result = { ok: true };
      }
    } catch (error) {
      result = { ok: false, error: translateSupabaseError(error) };
    } finally {
      this.betsInFlight -= 1;
    }
    if (this.betsInFlight === 0) {
      const latest = this._latestBetState;
      this._latestBetState = null;
      if (latest) this._apply(latest);
      else void this._refresh();
    }
    return result;
  }

  // ── İç işleyiş ───────────────────────────────────────────────────────────

  async _restoreSession() {
    let session = null;

    // **Uygulamadan gelen oturum önceliklidir**: aynı telefonda başka bir
    // hesapla giriş yapılmış olsa bile WebView'de eski oturum kalabilir; o
    // zaman oyun yanlış hesabın kristalleriyle oynanırdı.
    const injected = readInjectedSession();
    if (injected) {
      try {
        const { data, error } = await this.client.auth.setSession(injected);
        if (!error) {
          session = data.session ?? null;
          clearTokensFromUrl();
        }
      } catch {
        session = null;
      }
    }

    if (!session) {
      try {
        const { data } = await this.client.auth.getSession();
        session = data.session ?? null;
      } catch {
        session = null;
      }
    }

    this.session = session;
    this.email = session?.user?.email ?? '';
    this.needsLogin = !session;
  }

  _startLive() {
    if (this.started) return;
    this.started = true;

    this.timer = setInterval(() => {
      // Uygulama arka plandayken boşuna istek atma (mobil veri/pil).
      if (typeof document !== 'undefined' && document.hidden) return;
      this._refresh();
    }, this.refreshMs);

    if (typeof window !== 'undefined') {
      // Ağ geri gelince beklemeden tazele (mobilde sık olur).
      window.addEventListener('online', () => {
        this.failures = 0;
        this._refresh();
      });
      // Ekrana geri dönünce hemen tazele: sayaç/tur atlamasın.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        this.failures = 0;
        this._refresh();
      });
    }

    try {
      this.channel = this.client
        .channel('at-yarisi-rounds')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'horse_rounds' },
          () => this._refresh(),
        )
        .subscribe();
    } catch {
      this.channel = null;
    }
  }

  _stopLive() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    if (this.channel) {
      try {
        this.client.removeChannel(this.channel);
      } catch {
        /* yoksay */
      }
    }
    this.channel = null;
    this.started = false;
  }

  /**
   * Durumu sunucudan okur.
   *
   * Oturum/jeton hatasında **jetonu bir kez tazeleyip** tekrar dener: telefonda
   * uzun oturumlarda jeton süresi dolunca ilk istek 401 dönüyordu ve oyun
   * "sunucuya ulaşılamadı" diyordu.
   */
  async _loadState() {
    let { data, error } = await this.client.rpc('horse_state');

    if (error && (await this._recoverAuth(error))) {
      ({ data, error } = await this.client.rpc('horse_state'));
    }

    // Ham hatayı yukarı taşı: mesajı `_refresh` çevirir (jeton hatasını
    // "sunucuya ulaşılamadı" diye göstermeyiz).
    if (error) throw error;
    return data;
  }

  /** Jeton/oturum hatasında oturumu tazeler; başarılıysa `true`. */
  async _recoverAuth(error) {
    const text = `${error?.message ?? ''} ${error?.code ?? ''} ${error?.details ?? ''}`.toLowerCase();
    const authProblem =
      text.includes('jwt') ||
      text.includes('token') ||
      text.includes('401') ||
      text.includes('pgrst30');
    if (!authProblem) return false;

    try {
      const { error: refreshError } = await this.client.auth.refreshSession();
      return !refreshError;
    } catch {
      return false;
    }
  }

  async _refresh() {
    if (this.busy || this.needsLogin) return;
    // Bahis istekleri sürerken yoklama bekler (eski durum ekrana dönmesin).
    if ((this.betsInFlight ?? 0) > 0) return;
    this.busy = true;
    try {
      const data = await this._loadState();
      this.connected = true;
      this.failures = 0;
      this.lastError = '';
      this._apply(data);
    } catch (error) {
      this.connected = false;
      this.failures += 1;

      // **Tek tük kopmalar oyunu bölmesin**: mobil ağda her 1,2 sn'de bir
      // istek gidiyor; bir tanesi düşünce ekran "sunucuya ulaşılamadı"
      // dememeli. Son durum korunur, arka planda sessizce tekrar denenir.
      const transient = Boolean(this.snapshotCache) && this.failures < 3;
      if (!transient) {
        // Sunucudan gelen **gerçek** hata (yetki/eksik fonksiyon vb.) açıkça
        // söylenir; ağ kopmalarında ise sakin bir "yeniden kuruluyor" mesajı.
        const kod = String(error?.code ?? '');
        const dbError = /^(P0|22|23|42)/.test(kod);
        this.lastError =
          dbError || !this.snapshotCache
            ? translateSupabaseError(error)
            : 'Bağlantı yeniden kuruluyor…';
        this._emit(null);
      }
    } finally {
      this.busy = false;
    }
  }

  _apply(data) {
    if (!data || typeof data !== 'object') return;
    this.needsLogin = false;
    this.snapshotCache = data;
    this._emit(data);
  }

  _emit(data) {
    const base = data ?? this.snapshotCache;

    const snapshot = base
      ? {
          ...base,
          mode: 'live',
          connected: this.connected,
          needsLogin: this.needsLogin,
          email: this.email,
          error: this.lastError || undefined,
          // Sunucu saati: `horse_state` bunu `serverTime` adıyla döndürür.
          serverNow:
            Number(base.serverNow ?? base.serverTime) || Date.now(),
        }
      : {
          mode: 'live',
          connected: false,
          needsLogin: this.needsLogin,
          email: this.email,
          error: this.lastError || undefined,
          serverNow: Date.now(),
          player: { nickname: '', balance: 0 },
          round: null,
          history: [],
        };

    for (const fn of this.listeners) {
      try {
        fn(snapshot);
      } catch (error) {
        console.error('[supabase-engine] dinleyici hatası', error);
      }
    }
  }
}

/** Yapılandırılmışsa Supabase motorunu kurar; değilse `null` döner. */
export async function createSupabaseEngine(config) {
  if (!config?.url || !config?.anonKey) return null;

  const { createClient } = await import(/* @vite-ignore */ CDN_URL);

  const client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return new SupabaseEngine(client);
}
