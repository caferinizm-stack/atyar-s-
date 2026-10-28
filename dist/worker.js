// Statik dosyaları Sites'in ASSETS bağlayıcısından sunar.
//
// **Önbellek**: oyun WebView içinde açıldığı için telefon eski `js` dosyalarını
// tutabiliyordu (yeni sürüm yayınlansa bile eski kod çalışıyordu). Bu yüzden
// HTML `no-store`, diğer dosyalar `no-cache` + ETag ile sunulur: tarayıcı her
// açılışta doğrular, değişmemiş dosya 304 ile gelir (hızlı ama taze).
//
// KURAL: güncelleme sonrası yeni kodun cihaza ulaşması, önbellekten daha
// önemlidir.
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);

    const headers = new Headers(response.headers);
    const type = headers.get('content-type') || '';
    const isHtml = type.includes('text/html');

    headers.set(
      'Cache-Control',
      isHtml ? 'no-store, must-revalidate' : 'no-cache, max-age=0, must-revalidate',
    );
    headers.delete('Expires');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
