// ─── Sesler (WebAudio · dosya yok) ──────────────────────────────────────────
// Tarayıcı/WebView ses dosyası indirmeden, kısa osilatör ve gürültü
// patlamalarıyla üretilir:
//   * `coin()`  — kart/bahis dokunuşu (para sesi),
//   * `startHoof()` / `stopHoof()` — yarış boyunca nal sesleri,
//   * `win()` / `lose()` — sonuç açıklanırken.
//
// Ses bağlamı **ilk dokunuşta** açılır (tarayıcı kuralı); o zamana kadar
// çağrılar sessizce yok sayılır.

let ctx = null;
let noiseBuffer = null;
let hoofTimer = null;

function audio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  try {
    ctx = new AudioCtor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** İlk dokunuşta çağrılır: ses bağlamını açar (yoksa sessiz kalır). */
export function unlockSound() {
  audio();
}

/** Tek nota. */
function tone({
  freq = 440,
  endFreq = freq,
  duration = 0.12,
  type = 'sine',
  gain = 0.08,
  delay = 0,
}) {
  const ac = audio();
  if (!ac) return;

  const now = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
  }
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(amp).connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** Kısa gürültü patlaması (nal sesi, vuruş). */
function burst({ duration = 0.09, gain = 0.05, band = 220, q = 1.1, delay = 0 }) {
  const ac = audio();
  if (!ac) return;

  if (!noiseBuffer) {
    const length = Math.floor(ac.sampleRate * 0.2);
    noiseBuffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  const now = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = q;

  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(now);
  src.stop(now + duration + 0.02);
}

/** Para sesi: iki kısa kristal tık. */
export function coin() {
  tone({ freq: 1180, endFreq: 1560, duration: 0.075, type: 'triangle', gain: 0.06 });
  tone({
    freq: 1760,
    endFreq: 2100,
    duration: 0.06,
    type: 'triangle',
    gain: 0.035,
    delay: 0.055,
  });
}

/** Kazanma: yükselen üçlü akor. */
export function win() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    tone({
      freq,
      duration: 0.16,
      type: 'triangle',
      gain: 0.075,
      delay: i * 0.085,
    });
  });
  burst({ duration: 0.24, gain: 0.03, band: 2600, q: 0.8, delay: 0.02 });
}

/** Kaybetme: inen iki alçak nota. */
export function lose() {
  tone({ freq: 392, endFreq: 330, duration: 0.2, type: 'sawtooth', gain: 0.05 });
  tone({
    freq: 262,
    endFreq: 196,
    duration: 0.3,
    type: 'sawtooth',
    gain: 0.045,
    delay: 0.16,
  });
}

/** Dörtnal: yarış boyunca 165 ms'de bir nal vuruşu (sağ-sol dönüşümlü). */
export function startHoof() {
  if (hoofTimer) return;
  const step = () => {
    burst({ duration: 0.07, gain: 0.045, band: 240, q: 1.4 });
    tone({ freq: 128, endFreq: 92, duration: 0.06, type: 'sine', gain: 0.03 });
    window.setTimeout(() => {
      if (!hoofTimer) return;
      burst({ duration: 0.06, gain: 0.035, band: 300, q: 1.6 });
    }, 82);
  };
  step();
  hoofTimer = window.setInterval(step, 165);
}

/** Nal seslerini durdurur (sonuç açıklandığında / panel kapanınca). */
export function stopHoof() {
  if (!hoofTimer) return;
  window.clearInterval(hoofTimer);
  hoofTimer = null;
}
