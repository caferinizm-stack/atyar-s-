// ─── Oyun ayarları ──────────────────────────────────────────────────────────
// Tüm sayısal sabitler tek yerde. Oranlar sunucudaki `horse_odds()` fonksiyonu
// ile birebir aynı olmalı (supabase/schema.sql); aksi hâlde arayüzde görünen
// çarpan ile ödenen tutar farklı olur.

/** 6 at: kimlik rengi, gerçekçi tüy rengi ve kazanç çarpanı. */
export const HORSES = [
  {
    num: 1,
    name: 'Kızıl Şimşek',
    color: '#ff3d58',
    dark: '#8e1024',
    coat: '#6b3f24',
    mane: '#2a1a10',
    odds: 2,
  },
  {
    num: 2,
    name: 'Mavi Rüzgar',
    color: '#3d8bff',
    dark: '#12386e',
    coat: '#2b2622',
    mane: '#171412',
    odds: 3,
  },
  {
    num: 3,
    name: 'Yeşil Yıldırım',
    color: '#2ed47a',
    dark: '#0f5a35',
    coat: '#8a4a22',
    mane: '#40200e',
    odds: 5,
  },
  {
    num: 4,
    name: 'Sarı Kasırga',
    color: '#ffd23d',
    dark: '#7a5c05',
    coat: '#c49a5c',
    mane: '#8d6a36',
    odds: 10,
  },
  {
    num: 5,
    name: 'Mor Fırtına',
    color: '#a45cff',
    dark: '#4a2080',
    coat: '#8f8b86',
    mane: '#5c5955',
    odds: 25,
  },
  {
    num: 6,
    name: 'Turuncu Alev',
    color: '#ff8a2b',
    dark: '#7a3a08',
    coat: '#4a2a18',
    mane: '#1f120a',
    odds: 50,
  },
];

export const HORSE_BY_NUM = new Map(HORSES.map((h) => [h.num, h]));

/** Tur fazları ve süreleri (sunucudaki SQL de bu süreleri kullanır). */
export const RACE = {
  bettingMs: 20000,
  resultMs: 5000,
  distanceLabel: '1600 m',
  /** Yeni turda at izlerinin ölçüleri (1 birim ≈ 1 m). */
  track: {
    startX: -96,
    finishX: 96,
    laneGap: 3,
    lanes: 6,
    width: 18,
    railOffset: 12.4,
  },
};

/**
 * Hızlı bahis düğmeleri — uygulamadaki **UEFA** ekranıyla aynı sıra ve tutarlar
 * (`lib/uefa.dart` → `10, 50, 100, 500, 1000, 10000, 50000, 500000, 1000000`).
 */
export const STAKES = [10, 50, 100, 500, 1000, 10000, 50000, 500000, 1000000];

/** Demo (Supabase'siz) moddaki açılış bakiyesi. */
export const START_BALANCE = 1000;

/**
 * Supabase bağlantısı — uygulamanın kendi projesi (lib/main.dart ile aynı).
 * `anon` anahtarı istemci için tasarlanmıştır; service_role anahtarı buraya
 * **asla** konmaz.
 *
 * Yerel geliştirmede (localhost) demo motoru çalışır; böylece tarayıcıda hesap
 * açmadan oyun denenebilir. Yayınlanan adreste gerçek hesap girişi devreye
 * girer. Yerelde de canlıyı denemek için adrese `?live=1` ekle.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '']);

const host = typeof window === 'undefined' ? '' : window.location.hostname;
const wantsLive =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('live');

export const SUPABASE = {
  url: 'https://mwjyppehzqobmcrsmxlj.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13anlwcGVoenFvYm1jcnNteGxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODYxOTksImV4cCI6MjEwNTc2MjE5OX0.OWXeMWkfzwftIJXGR4Pkr66mBq4IB5u6vM9T7I7Nx-0',
  enabled: !LOCAL_HOSTS.has(host) || wantsLive,
};

/**
 * **Uygulama modu** (`?app=1`): sayfa mobil uygulamanın içinde (WebView) açıldı.
 *
 * Bu modda:
 *   * **giriş ekranı hiç gösterilmez** (kimlik uygulamadan hazır gelir),
 *   * Google/e-posta/şifre alanı yoktur,
 *   * oturum kurulamazsa sade bir "bağlanıyor" durumu + tekrar dene çıkar,
 *   * hazır olunca uygulamaya `RetraGame` kanalından `ready` bildirilir ve
 *     3 saniyelik açılış animasyonu kapanır.
 */
export const APP_MODE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('app');

/** Arayüzde gösterilen para birimi işareti. */
export const CURRENCY = '◈';
