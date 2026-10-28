// ─── At görseli (kart arka planı) ───────────────────────────────────────────
// Kartta **gerçek at** görseli kullanılır: 🐎 glifi, atın kendi rengine göre
// renk döndürülür (`hue-rotate`) ve yarı saydam basılır. Böylece her kartta
// tanınan bir at silueti olur; harici görsel dosyası gerekmez.
//
// Değerler at rengine göre seçildi (kırmızı · mavi · yeşil · sarı · mor ·
// turuncu): taban at görseli kahverengidir (~25°), hedef tona kaydırılır.

/** At sırasına göre `hue-rotate` açısı (derece). */
export const HORSE_ART_HUE = [-25, 190, 105, 23, 255, -6];
