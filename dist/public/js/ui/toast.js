// ─── Bildirimler ────────────────────────────────────────────────────────────
// **Tek bildirim** kuralı: yeni mesaj gelince önceki kaldırılır, yenisi aynı
// yere gelir. Üst üste yığılma olmaz (eskiden 3'e kadar birikiyordu).

let host = null;

export function initToasts(element) {
  host = element;
}

export function toast(message, kind = 'info', duration = 2600) {
  if (!host || !message) return;

  // Önceki bildirim(ler) hemen kalkar: aynı anda yalnız **bir** bildirim.
  host.replaceChildren();

  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  host.appendChild(node);

  window.setTimeout(() => {
    if (!node.isConnected) return;
    node.classList.add('leaving');
    window.setTimeout(() => node.remove(), 220);
  }, duration);
}
