// ─── Giriş ekranı (yalnız tarayıcı) ────────────────────────────────────────
// Oyun gerçek kristalle oynandığı için uygulamanın hesabı gerekir. Bu katman
// **uygulama içinde hiç kurulmaz** (`?app=1`): orada kimlik WebView'e hazır
// gelir. Tarayıcıda oturum yoksa e-posta/şifre ile giriş istenir.

export function createLogin(host, { onSubmit }) {
  host.innerHTML = `
    <div class="login-card" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <span class="login-mark" aria-hidden="true">🏇</span>
      <h2 id="login-title">Retra hesabınla giriş yap</h2>
      <p class="login-sub">Bahisler ve kazançlar uygulamadaki <b>kristal</b> bakiyenle çalışır.</p>

      <form class="login-form" novalidate>
        <label class="login-field">
          <span>E-posta</span>
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            autocapitalize="none"
            spellcheck="false"
            placeholder="ornek@retra.app"
            required
          />
        </label>
        <label class="login-field">
          <span>Şifre</span>
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            placeholder="••••••••"
            required
          />
        </label>

        <p class="login-error" hidden></p>

        <button class="login-submit" type="submit">Giriş yap</button>
      </form>

      <small class="login-note">Hesabın yoksa Retra uygulamasından kayıt ol.</small>
    </div>
  `;

  const form = host.querySelector('.login-form');
  const emailInput = host.querySelector('input[name="email"]');
  const passwordInput = host.querySelector('input[name="password"]');
  const submit = host.querySelector('.login-submit');
  const errorBox = host.querySelector('.login-error');

  let busy = false;

  function setBusy(value) {
    busy = value;
    submit.disabled = value;
    submit.textContent = value ? 'Giriş yapılıyor…' : 'Giriş yap';
  }

  function setError(message) {
    if (!message) {
      errorBox.hidden = true;
      errorBox.textContent = '';
      return;
    }
    errorBox.hidden = false;
    errorBox.textContent = message;
  }

  async function submitForm(event) {
    event.preventDefault();
    if (busy) return;

    if (!form.reportValidity()) return;

    setError('');
    setBusy(true);

    try {
      const result = await onSubmit(emailInput.value.trim(), passwordInput.value);
      if (!result?.ok) {
        setError(result?.error ?? 'Giriş yapılamadı.');
        passwordInput.select();
      }
    } catch (error) {
      console.error('[login]', error);
      setError('Giriş yapılamadı. Bağlantını kontrol et.');
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener('submit', submitForm);

  function show(errorMessage = '') {
    if (!host.hidden) {
      if (errorMessage) setError(errorMessage);
      return;
    }
    host.hidden = false;
    setError(errorMessage);
    setBusy(false);
    // Mobil klavyeyi hemen açmamak için odak geciktirilir.
    window.setTimeout(() => {
      if (!host.hidden && window.matchMedia('(min-width: 760px)').matches) {
        emailInput.focus();
      }
    }, 120);
  }

  function hide() {
    if (host.hidden) return;
    host.hidden = true;
    passwordInput.value = '';
    setError('');
    setBusy(false);
  }

  return { show, hide, setError };
}
