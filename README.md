# Retra · At Yarışı (Web)

Three.js ile çizilen 3D hipodromda, **uygulamanın gerçek kristalleriyle**
oynanan canlı at yarışı. 6 at, 20 saniyelik bahis turu, otomatik yarış ve
5 saniyelik sonuç ekranı sonsuz döngüde çalışır. Mobil/WebView için tasarlandı.

- **Bakiye:** `public.profiles.crystals` — uygulamadaki cüzdanla **aynı**.
- **Kullanıcı:** uygulama hesabı (e-posta/şifre veya Google). Anonim giriş yok.
- Derleme adımı yok: saf ES modülleri + tek CSS dosyası.
- Harici model/doku yok: at, pist, tribün ve dokular tarayıcıda üretilir
  (CDN'den yalnız `three` yüklenir).

**Yayındaki adres:** <https://site-fb506202fcc147209bc085bab29c442b.freebuff.page>

Uygulama bu sayfayı **diğer şans oyunları gibi yarım ekran panelde** açar:
Şans Oyunları ▸ **At Yarışı** kartı ya da odadaki **Şans oyunları** menüsü.
Panelin üstünde diğer oyunların önizleme şeridi durur (UEFA ile aynı);
sayfanın **kendi üst barı yoktur**. Dış tarayıcıya çıkılmaz, **giriş ekranı hiç
çıkmaz**: kimlik uygulamadan otomatik aktarılır, 3 saniyelik açılış
animasyonundan sonra oyun doğrudan başlar.

➡️ [`lib/screens/horse_race_screen.dart`](../lib/screens/horse_race_screen.dart)
(`HorseRaceView` · WebView + açılış animasyonu + `win:` köprüsü)

## Hızlı başlangıç

```bash
cd at_yarisi_web
node tools/serve.mjs
# → http://127.0.0.1:5173
```

`js/config.js` boşsa oyun **demo modunda** açılır (bakiye tarayıcıda tutulur,
cüzdan düğmesi +1.000 ekler). Supabase anahtarları girildiğinde gerçek hesap
girişi devreye girer.

## Supabase kurulumu

1. `public.profiles` tablosunun mevcut olduğundan emin ol
   (`id`, `username`, `crystals`) — uygulamanın kendi şeması.
2. SQL Editor → [`supabase/schema.sql`](supabase/schema.sql) dosyasının tamamı.
   Bu dosya **anonim giriş istemez**, `horse_players` tablosu oluşturmaz.
3. [`js/config.js`](js/config.js) → `SUPABASE.url` ve `SUPABASE.anonKey`
   (Project Settings → API → `anon public`). `service_role` **asla** buraya
   konmaz.
4. Authentication → URL Configuration → oyunun yayınlandığı adresi
   `Redirect URLs` listesine ekle (Google girişi ve e-posta bağlantıları için).
5. Sayfayı yenile → giriş ekranı gelir → uygulamadaki hesabınla gir.

> Daha önce v1 şemasını (anonim + `horse_players`) çalıştırdıysan, dosyanın
> başındaki 4 satırlık `drop table` bloğunu bir kez çalıştır.

### Nasıl çalışır?

- Bahis tutarı `horse_place_bet` içinde **anında** `profiles.crystals`'ten
  düşer (satır `for update` ile kilitlenir).
- Yarış bitince `horse_advance` kazancı aynı cüzdana ekler.
- 24 saatlik şans oyunları sıralamasının defterine (`public.game_results`)
  yazım **tetikleyiciye** bağlıdır: `horse_bets` satırları bahis → sonuç
  olarak güncellendiği an `horse_record_ledger(round)` çalışır
  (`record_game_result(uid, 'horse', bahis, ödeme)`). Yani `horse_advance`
  hangi sürüm olursa olsun kayıt atlanmaz; `horse_ledger_rounds` işareti
  sayesinde aynı tur iki kez yazılmaz.
- Kurulumda depo kökündeki
  [`supabase_faz63_at_yarisi_siralama.sql`](../supabase_faz63_at_yarisi_siralama.sql)
  dosyasını SQL Editor'de bir kez çalıştır: tetikleyiciyi kurar ve son 24
  saatte deftere yazılmamış turları **geriye dönük** doldurur.
  Sonunda tek satırlık durum tablosu döner (`son24_kayit`, `isaretli_tur`,
  `tetikleyici_var`).
- Uygulamadaki kristal, oyundaki bakiye ile aynıdır; ayrı cüzdan yoktur.
- Bahis düğmeleri uygulamadaki **UEFA** ekranıyla aynı: 10, 50, 100, 500,
  1.000, 10.000, 50.000, 500.000, 1.000.000.
- Tek bahis üst sınırı **1.000.000 kristal**; arayüzdeki en büyük düğmeyle aynı.

## Oyun kuralları

| Faz | Süre | Ne olur |
| --- | --- | --- |
| Bahis | 20 sn | Tutar seçilir, kartlara dokunularak bahis konur. Ortada geri sayım. |
| Yarış | ~11–14 sn | Bahisler kilitlenir, 6 at bitişe koşar. |
| Sonuç | 5 sn | Kazanan at en üstte, **ilk 3 oyuncu** (avatar + isim + bahis + kazanç) ve kişisel sonuç popup'ı. Sonra yeni tur. |

Sesler tarayıcıda **üretilir** (dosya yok): yarışta nal sesleri, kart
dokunuşunda para sesi, sonuçta kazanma/kaybetme sesi
([`js/ui/sound.js`](js/ui/sound.js)). Bildirimler **tek** gösterilir; yeni mesaj
eskiyi kaldırır.

Sıralama **oyuncu başına tek satırdır**: aynı kişi kazanan ata birkaç bahis
yaptıysa ödemeleri toplanır (eskiden aynı isim birden çok kez görünüyordu).

**Oranlar:** 1 → 2×, 2 → 3×, 3 → 5×, 4 → 10×, 5 → 25×, 6 → 50×.

Kazanan **1/oran ağırlığıyla** seçilir (2× at ~%42, 50× at ~%1,7). Böylece her
bahsin beklenen getirisi ~1× olur; 6 at eşit şansla seçilseydi ortalama ödeme
15,8× olur ve gerçek kristal ekonomisi her turda şişerdi. Aynı kural hem
sunucuda (`horse_advance`) hem demo motorda (`weightedWinner`) uygulanır.

## Mobil / uygulama içi kullanım

Sayfa mobil öncelikli: 390 px genişlikte taşma yok, `safe-area` boşlukları
hesaplanır, kartlar 3×2 düzeninde ve dokunma hedefleri büyüktür.

### Uygulama modu (`?app=1`)

Uygulama sayfayı `?app=1` ile açar. Bu modda:

- **giriş katmanı hiç kurulmaz** — e-posta/şifre ve Google düğmesi yoktur,
- kimlik WebView belirteçleriyle gelir; oturum kurulamazsa sade bir
  "bağlanıyor" kartı + **tekrar dene** gösterilir (giriş formu değil),
- sayfa hazır olduğunda uygulamaya `RetraGame` kanalından `ready` gönderilir,
  açılış animasyonu ondan sonra kapanır (en az 3 sn, en çok 10 sn).

Tarayıcıda (uygulama dışında) ise e-posta/şifre ile giriş istenir; Google
seçeneği kaldırıldı.

Uygulamaya bağlamanın iki yolu var:

1. **WebView (uygulamada kullanılan yol).** Flutter tarafında `webview_flutter`
   ile sayfa açılır ve oturum **adresin `#` kısmıyla** aktarılır:
   ```dart
   final session = supabase.auth.currentSession!;
   final url = '$kHorseRaceUrl#access_token=${session.accessToken}'
       '&refresh_token=${session.refreshToken}';
   ```
   `#` sunucuya gitmez; sayfa belirteçleri bir kez okur, adresten temizler ve
   Supabase oturumuna dönüştürür. Enjekte edilen oturum, WebView'de kalmış eski
   oturumdan **önceliklidir** (hesap değiştirme güvenli). Alternatif olarak
   `window.__RETRA_SUPABASE_SESSION__ = { access_token, refresh_token }`
   enjekte edilebilir.
2. **Tarayıcı.** Kullanıcı oyun adresini açar, uygulamadaki e-posta/şifresiyle
   (veya Google ile) giriş yapar. Ayrı üyelik yoktur.

Her iki yolda da bahis/kazanç aynı `profiles.crystals` alanına yazılır.
Sayfa HTTPS üzerinden yayınlanmalıdır (WebView ve OAuth zorunluluğu).

## Mimari

```
index.html                 iskelet + import map + giriş katmanı
css/styles.css             koyu neon tema, mobil, giriş ekranı
js/config.js               atlar, oranlar, süreler, Supabase anahtarları
js/core/utils.js           PRNG, biçimlendirme
js/scene/scene.js          renderer, kamera direktörü, kare döngüsü
js/scene/track.js          pist, korkuluk, tribün, ışık, gökyüzü
js/scene/horse.js          prosedürel at + dörtnal animasyonu
js/scene/race-view.js      6 atı konumlandırma, toz, lider
js/scene/dust.js           shader tabanlı toz parçacıkları
js/scene/textures.js       canvas ile üretilen dokular
js/engine/mock-engine.js   demo tur döngüsü (localStorage cüzdan)
js/engine/supabase-engine.js  gerçek hesap: giriş, RPC, realtime, çıkış
js/engine/race-model.js    bitiş sürelerinden deterministik ilerleme
js/engine/payouts.js       oran, ağırlıklı kazanan, ödeme, sıralama
js/ui/*.js                 kartlar, geri sayım, sonuç, geçmiş, HUD, giriş, toast
js/ui/horse-art.js         kartların at siluetleri (renk başına SVG)
js/ui/sound.js             WebAudio sesleri (nal, para, kazanma, kaybetme)
supabase/schema.sql        tablolar, RLS, RPC'ler, realtime (profiles.crystals)
supabase/cron.sql          isteğe bağlı: 5 sn'de bir tur ilerletme (pg_cron)
../supabase_faz63_...sql   şans oyunları sıralamasına kazanç kaydı (bir kez)
dist/                      yayına yüklenen çıktı (statik kopya + worker)
tools/serve.mjs            bağımlılıksız statik sunucu
tools/smoke.mjs            saf mantık testleri
```

### Sonuç neden animasyonla tutarlı?

Sunucu, bahisler kapanınca kazanan sırayı **ve her atın bitiş süresini**
üretir (`horse_round_secrets`). İstemci yalnız bu süreleri alır;
[`race-model.js`](js/engine/race-model.js) ilerlemeyi bu sürelerden türetir.
Bir at 1.0 ilerlemeye ancak kendi bitiş süresi geldiğinde ulaşır; bu yüzden
ekranda gördüğün sıra ile sunucunun ödediği sıra aynıdır.

Sıra ve süreler **bahis fazında istemciye hiç gönderilmez**: ayrı tabloda
tutulur, tablonun RLS politikası yoktur, yalnız `horse_state()` fonksiyonu
`phase <> 'betting'` olduğunda döndürür.

### Tur döngüsü neden sunucuda?

`horse_advance()` fonksiyonu `pg_advisory_xact_lock` ile korunur. Her istemci
saniyede bir `horse_state()` çağırır; fonksiyon süresi dolan fazı ilerletir.
Böylece sunucu saati tek doğrudur ve aynı anda 100 istemci çağırsa bile tek
geçiş olur.

Kazanan ve bitiş süreleri **yalnız sunucuda** üretilir; istemci bunları bahis
fazında göremez. Bu yüzden ayrı bir Edge Function gerekmez (aynı SQL mantığını
sarmalayıp fazladan ağ adımı eklerdi). Uygulama kapalıyken de turların
dönmesi için [`supabase/cron.sql`](supabase/cron.sql) dosyasını bir kez
çalıştır: dosya `pg_cron`ın açık olup olmadığını **SQL ile söyler**, kapalıysa
SQL ile açmayı dener ve 5 saniyelik görevi kurar.

## Görünüm ve performans

Görüntü **eski net ayarında**: `antialias: true`, cihaz piksel oranı (telefon
1.6 · masaüstü 2), gölge 1024/2048 **PCFSoft**, tüm at parçaları gölge düşürür.
Gerçek telefonda hafif takılma kabul edildi; görünümden ödün verilmiyor.

Kare bütçesini **görünümü değiştirmeden** rahatlatan iki şey kaldı:

- **Bahis fazında 32 fps** (`js/main.js`): sahne bu fazda neredeyse sabit, yalnız
  kamera salınıyor; yarış ve sonuç tam hızda çizilir.
- Kamera hedef vektörleri her karede yeniden üretilmez (`scene.js` sabitleri).

## Test

```bash
node tools/smoke.mjs
```

Oran tablosu, ağırlıklı kazanan dağılımı (50× ≈ %1,7), ödeme/sıralama, bitiş
sırasının korunması ve animasyonun monotonluğu doğrulanır.

## Üretim notları

- `profiles.crystals` kolonunu istemci rollerine karşı koruyan trigger
  (`protect_balance_columns`) açık olmalı; oyun RPC'leri SECURITY DEFINER
  olduğu için bu korumadan etkilenmez.
- Bahisler kristal hareket defterine (`crystal_ledger`) yazılmıyor; muhasebe
  istiyorsan `horse_bets` satırlarını oraya bağla.
- Gerçek para/kristal için kasa riski: 1/oran ağırlığı beklenen getiriyi ~1×
  tutar, yine de tek turda büyük bir 50× ödeme bakiyeyi zorlayabilir; gerekirse
  kasa tavanı veya kademeli oran ekle.
- Maç geçmişi büyüdükçe `horse_rounds` için arşiv tablosu ekle.
- Operasyon paneli: tur iptali, bakiye manuel düzeltme (yalnız service_role).
