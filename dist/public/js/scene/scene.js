// ─── Sahne ──────────────────────────────────────────────────────────────────
// Renderer + hipodrom + atlar + kamera yönetimi. Döngü `main.js` içindedir;
// burası yalnız "verilen ana göre çiz" der.

import * as THREE from 'three';
import { HORSE_BY_NUM, RACE } from '../config.js';
import { clamp } from '../core/utils.js';
import { Fireworks } from './fireworks.js';
import { createTrack, laneZ } from './track.js';
import { RaceView } from './race-view.js';

const { startX, finishX } = RACE.track;

// Son düzlükte kameranın gideceği noktalar: her karede yeniden `new
// Vector3()` üretilmesin (çöp toplama kare düşürmesin).
const FINISH_VIEW = new THREE.Vector3(finishX - 20, 6.2, 21);
const FINISH_LOOK = new THREE.Vector3(finishX - 1, 1.55, 0);

/** Yarışın neresinde olduğumuza göre kamerayı yumuşakça taşır. */
class CameraDirector {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(-40, 12, 40);
    this.look = new THREE.Vector3(startX, 1.6, 0);
    this.snapped = false;
    this._targetPos = new THREE.Vector3();
    this._targetLook = new THREE.Vector3();
  }

  update(dt, context, snap = false) {
    const { phase, time, packCenter, leaderProgress, winner } = context;
    const pos = this._targetPos;
    const look = this._targetLook;

    if (phase === 'betting') {
      // Başlangıç takının **yakınında** yavaş salınan kamera: 6 at kadrajda
      // büyük görünür (uzaktan çekim hipodromu küçük gösteriyordu).
      const sway = Math.sin(time * 0.22);
      pos.set(startX + 15 + sway * 6, 5.4 + Math.sin(time * 0.29) * 0.45, 19.5);
      look.set(startX - 1, 1.35, 0);
    } else if (phase === 'racing') {
      const cx = packCenter;
      pos.set(cx + 7.5, 8.1, 25);
      look.set(cx + 2.5, 1.65, 0);

      // Son düzlükte bitiş çizgisine geç.
      if (leaderProgress > 0.68) {
        const k = clamp((leaderProgress - 0.68) / 0.26, 0, 1);
        const ease = k * k * (3 - 2 * k);
        pos.lerp(FINISH_VIEW, ease);
        look.lerp(FINISH_LOOK, ease);
      }

      // Hafif el kamerası titremesi.
      const shake = 0.05 + leaderProgress * 0.05;
      pos.x += Math.sin(time * 11.3) * shake;
      pos.y += Math.sin(time * 13.7) * shake * 0.6;
    } else {
      // Sonuç: **cepheden** yavaş salınan kamera — bitiş tabelasındaki
      // "FINISH", üstündeki "RETRA LIVE" panosu ve altındaki kazanan yazısı
      // tam okunur.
      const sway = Math.sin(time * 0.35);
      const winnerZ = winner ? laneZ(winner) : 0;
      pos.set(
        finishX - 14 + sway * 1.6,
        7.2 + Math.sin(time * 0.5) * 0.4,
        20 + sway * 1.6 + winnerZ * 0.1,
      );
      look.set(finishX - 1, 4.0, winnerZ * 0.25);
    }

    const posLambda = snap || !this.snapped ? 1 : 1 - Math.exp(-2.6 * dt);
    const lookLambda = snap || !this.snapped ? 1 : 1 - Math.exp(-3.4 * dt);

    this.position.lerp(pos, posLambda);
    this.look.lerp(look, lookLambda);
    this.snapped = true;

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);
  }
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;

    // **Cihaz sınıfı**: dokunmatik ekran ya da az çekirdek/bellek → "low".
    // Panel genişliği değil **donanım** belirler: masaüstünde panel daralsa da
    // gölgeler açık kalır, telefonda kapalı olur.
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const cores = navigator.hardwareConcurrency || 8;
    const memory = navigator.deviceMemory || 8;
    this.quality =
      coarse || cores <= 4 || memory <= 4 || window.innerWidth < 560
        ? 'low'
        : 'high';
    const low = this.quality === 'low';

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // Kenarlar **yumuşak** çizilir (görünüm öncelikli).
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    // Gölge her cihazda **yumuşak** ve tam çözünürlükte: görünüm öncelikli.
    this.renderer.shadowMap.enabled = true;
    // Telefonda yumuşak gölge (PCFSoft) çok pahalı: standart PCF neredeyse
    // aynı görünür, kare süresini belirgin düşürür.
    this.renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060d);
    this.scene.fog = new THREE.Fog(0x0a0b1a, 150, 430);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 560);

    this.track = createTrack(this.scene);
    this.race = new RaceView(this.scene);
    this.director = new CameraDirector(this.camera);

    this.time = 0;
    this.roundId = '';
    this.phase = 'betting';
    // Uyarlanabilir çözünürlük sayacı (bkz. [_trackPerf]).
    this.renderScale = 1;
    this._perfAcc = 0;
    this._perfFrames = 0;
    this._perfCooldown = 4;
    // Sonuç anında bitiş tabelasının çevresinde patlayan havai fişekler.
    this.fireworks = new Fireworks(
      this.scene,
      { x: this.track.finishX, y: 8, z: 0 },
      this.quality,
    );
    this.applyQuality();

    this.resize();
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement ?? canvas);
    } else {
      window.addEventListener('resize', () => this.resize());
    }

    this.director.update(1 / 60, this.context(), true);
  }

  applyQuality() {
    // **Net görüntü (eski ayar)**: piksel oranı her cihazda 2'ye kadar.
    // Telefonda 1.6'ya kısmak görüntüyü bulanıklaştırıyordu; görünüm öncelikli.
    this.baseRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.applyPixelRatio();
    const sun = this.track.sun;
    const size = this.quality === 'low' ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    this.race.setQuality(this.quality);
  }

  /// Piksel oranını **temel oran × uyarlanabilir ölçek** olarak uygular.
  applyPixelRatio() {
    const ratio = Math.max(0.7, this.baseRatio * this.renderScale);
    this.renderer.setPixelRatio(ratio);
  }

  resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Tur bilgisini sahneye uygular (aynı tur için tekrar çalışmaz). */
  syncRound(round, now) {
    if (!round?.id) return;

    const phaseChanged = round.id !== this.roundId || round.phase !== this.phase;
    if (!phaseChanged) return;

    const startAt = round.bettingEndsAt ?? now;

    if (round.phase === 'betting') {
      this.race.resetToStart();
      this.track.hideWinner();
      this.fireworks.stop();
    } else if (round.phase === 'racing' && round.times) {
      this.track.hideWinner();
      this.fireworks.stop();
      this.race.startRace({
        id: round.id,
        order: round.order ?? [],
        times: round.times,
        startAt,
      });
    } else if (round.phase === 'result') {
      if (round.times) {
        this.race.startRace({
          id: round.id,
          order: round.order ?? [],
          times: round.times,
          startAt,
        });
      }
      this.race.showResult(round.winner);

      // Tabelanın altında **kazanan at** yazsın + havai fişek başlasın.
      const horse = HORSE_BY_NUM.get(Number(round.winner));
      if (horse) this.track.showWinner(`${horse.name} KAZANDI`);
      this.fireworks.start();
    }

    this.roundId = round.id;
    this.phase = round.phase;
  }

  context() {
    return {
      phase: this.phase,
      time: this.time,
      packCenter: this.race.packCenter,
      leaderProgress: this.race.leaderProgress,
      winner: this.race.winner ?? null,
    };
  }

  /**
   * **Uyarlanabilir çözünürlük**: kare süresi uzarsa (telefon yetişemiyorsa)
   * çözünürlük biraz düşer, rahatlayınca geri çıkar. Böylece animasyon
   * donmaz; netlik yalnız gerektiğinde azalır.
   */
  _trackPerf(dt) {
    this._perfAcc += dt;
    this._perfFrames += 1;
    if (this._perfAcc < 1) return;
    const avg = this._perfAcc / this._perfFrames;
    this._perfAcc = 0;
    this._perfFrames = 0;
    if (this._perfCooldown > 0) {
      this._perfCooldown -= 1;
      return;
    }
    if (avg > 0.024 && this.renderScale > 0.62) {
      this.renderScale = Math.max(0.62, this.renderScale - 0.12);
      this.applyPixelRatio();
      this._perfCooldown = 2;
    } else if (avg < 0.0155 && this.renderScale < 1) {
      this.renderScale = Math.min(1, this.renderScale + 0.06);
      this.applyPixelRatio();
      this._perfCooldown = 4;
    }
  }

  render(now, dt) {
    this._trackPerf(dt);
    this.time += dt;
    this.race.update(now, dt);
    this.fireworks.update(dt);
    this.track.update(this.race.packCenter);
    this.director.update(dt, this.context());
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.race.dispose();
    this.renderer.dispose();
  }
}
