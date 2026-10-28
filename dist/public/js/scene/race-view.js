// ─── Yarış görünümü ─────────────────────────────────────────────────────────
// 6 atı pist üzerinde konumlar. Konum tamamen `race-model` ilerlemesinden
// gelir; böylece animasyon ile sunucunun ödediği sonuç aynıdır.

import * as THREE from 'three';
import { HORSES } from '../config.js';
import { buildRaceModel, leaderAt, progressAt } from '../engine/race-model.js';
import { createHorse } from './horse.js';
import { DustField } from './dust.js';
import { laneZ, progressToX } from './track.js';
import { clamp } from '../core/utils.js';

export class RaceView {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'race';
    scene.add(this.group);

    this.entries = HORSES.map((horse, index) => {
      const view = createHorse(horse, { phaseOffset: index * 0.62 });
      this.group.add(view.root);
      return view;
    });
    this.byNum = new Map(this.entries.map((entry) => [entry.num, entry]));

    this.dust = new DustField(scene);

    this.phase = 'betting';
    this.model = null;
    this.startAt = 0;
    this.primed = false;
    this.lastProgress = {};
    this.leaderNum = null;
    this.leaderProgress = 0;
    this.packCenter = progressToX(0);
    this.winner = null;
    this.time = 0;

    this.resetToStart();
  }

  /** Atları başlangıç takına dizer (bahis fazı). */
  resetToStart() {
    this.phase = 'betting';
    this.model = null;
    this.primed = false;
    this.winner = null;
    this.leaderProgress = 0;
    this.packCenter = progressToX(0);

    for (const entry of this.entries) {
      entry.root.position.set(progressToX(0), 0, laneZ(entry.num));
      entry.root.rotation.set(0, 0, 0);
      this.lastProgress[entry.num] = 0;
      entry.update(1 / 60, 0);
    }
  }

  /** Sunucudan gelen sıra/sürelerle yarışı başlatır. */
  startRace({ id, order, times, startAt = 0 }) {
    this.model = buildRaceModel({ id, order, times });
    this.startAt = startAt;
    this.phase = 'racing';
    this.primed = false;
    this.winner = null;
    this.leaderProgress = 0;
  }

  /** Sonuç fazı: atlar bitiş çizgisinde durur, kamera kazanana döner. */
  showResult(winner) {
    this.phase = 'result';
    this.winner = Number(winner) || this.model?.winner || null;
  }

  /**
   * @param {number} now  sunucu saatine hizalı zaman (ms)
   * @param {number} dt   saniye
   */
  update(now, dt) {
    this.time += dt;

    if (this.phase === 'betting' || !this.model) {
      for (const entry of this.entries) entry.update(dt, 0);
      this.dust.update(dt);
      return this.summary();
    }

    const elapsed = Math.max(0, now - this.startAt);
    let best = 0;
    let sum = 0;

    for (const entry of this.entries) {
      const progress = progressAt(this.model, entry.num, elapsed);
      const x = progressToX(progress);

      const previous = this.lastProgress[entry.num] ?? progress;
      const rate = this.primed ? (progress - previous) / Math.max(dt, 0.0001) : 0;
      const speedFactor = this.primed ? clamp(rate / 0.082, 0, 1) : 0;

      entry.root.position.x = x;
      // Koşarken hafif şerit içi salınım; bitişte düz.
      if (this.phase === 'racing') {
        entry.root.position.z =
          laneZ(entry.num) + Math.sin(elapsed / 780 + entry.num * 1.7) * 0.1;
      }

      entry.update(dt, speedFactor);
      this.lastProgress[entry.num] = progress;

      if (progress > best) best = progress;
      sum += x;

      if (this.phase === 'racing' && speedFactor > 0.4 && Math.random() < 0.6) {
        this.dust.spawn(x - 0.85, 0.16, entry.root.position.z);
      }
    }

    this.primed = true;
    this.leaderNum = leaderAt(this.model, elapsed);
    this.leaderProgress = best;
    this.packCenter = sum / this.entries.length;

    this.dust.update(dt);
    return this.summary();
  }

  summary() {
    return {
      leader: this.leaderNum,
      progress: this.leaderProgress,
      packCenter: this.packCenter,
      winner: this.winner,
    };
  }

  /**
   * Kalite ayarı: numara rozetleri **her cihazda görünür**.
   *
   * Rozetler altı küçük sprite (160×190 doku); maliyeti yok denecek kadar az.
   * Daha önce `low` kalitede gizleniyordu ve telefonda atların renkli
   * numaraları kayboluyordu.
   */
  setQuality(level) {
    for (const entry of this.entries) {
      const badge = entry.root.children.find((child) => child.isSprite);
      if (badge) badge.visible = true;
    }
    this.quality = level;
  }

  dispose() {
    for (const entry of this.entries) entry.dispose();
    this.dust.dispose();
    this.group.removeFromParent();
  }
}
