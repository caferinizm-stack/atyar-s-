// ─── Havai fişek ────────────────────────────────────────────────────────────
// Sonuç açıklandığında **bitiş tabelasının** çevresinde patlayan hafif havai
// fişekler. Tek bir `THREE.Points` kullanır (tek çizim çağrısı), böylece düşük
// telefonlarda da sahneyi kastırmaz.
//
// Ömrü biten parçacık **siyaha** boyanır (additive karışımda görünmez olur);
// böylece ek doku/geometry üretmeden söner.

import * as THREE from 'three';

const COLORS = [
  [1.0, 0.82, 0.35],
  [0.42, 0.85, 1.0],
  [0.72, 0.55, 1.0],
  [0.4, 1.0, 0.65],
  [1.0, 0.5, 0.7],
  [1.0, 1.0, 1.0],
];

const GRAVITY = -7.5;

/** Yumuşak yuvarlak kıvılcım dokusu (kare noktalar yerine). */
function sparkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Fireworks {
  /**
   * @param {THREE.Scene} scene
   * @param {{x:number,y:number,z:number}} origin  patlama merkezi
   * @param {'low'|'high'} quality
   */
  constructor(scene, origin, quality = 'high') {
    this.origin = new THREE.Vector3(origin.x, origin.y, origin.z);
    this.count = quality === 'low' ? 180 : 320;

    this.positions = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.baseColor = new Float32Array(this.count * 3);
    this.velocity = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    this.maxLife = new Float32Array(this.count);
    this.cursor = 0;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    // Başlangıçta hepsi görünmez (siyah).
    this.geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);
    this.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);

    this.material = new THREE.PointsMaterial({
      size: quality === 'low' ? 1.1 : 0.9,
      map: sparkTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);

    this.active = false;
    this.timer = 0;
  }

  /** Sonuç anında çağrılır: hemen ilk patlama + periyodik yenileri. */
  start() {
    if (this.active) return;
    this.active = true;
    this.points.visible = true;
    this.timer = 0;
    this._burst(0.55);
    this._burst(0.55);
  }

  stop() {
    this.active = false;
    this.points.visible = false;
    this.life.fill(0);
    this.colors.fill(0);
    this.geometry.attributes.color.needsUpdate = true;
  }

  /**
   * Bir patlama: merkez biraz rastgele kayar (tabelanın iki yanı).
   * @param {number} scale  parçacık yoğunluğu (0..1)
   */
  _burst(scale = 1) {
    const amount = Math.round(this.count * 0.16 * scale) + 12;
    const cx = this.origin.x + (Math.random() - 0.5) * 22;
    const cy = this.origin.y + Math.random() * 3.5;
    const cz = this.origin.z + (Math.random() - 0.5) * 18;

    for (let i = 0; i < amount; i += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 4.5 + Math.random() * 9;
      const sinPhi = Math.sin(phi);

      const i3 = index * 3;
      this.positions[i3] = cx;
      this.positions[i3 + 1] = cy;
      this.positions[i3 + 2] = cz;

      this.velocity[i3] = Math.cos(theta) * sinPhi * speed;
      this.velocity[i3 + 1] = Math.cos(phi) * speed;
      this.velocity[i3 + 2] = Math.sin(theta) * sinPhi * speed;

      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.baseColor[i3] = color[0];
      this.baseColor[i3 + 1] = color[1];
      this.baseColor[i3 + 2] = color[2];
      this.colors[i3] = color[0];
      this.colors[i3 + 1] = color[1];
      this.colors[i3 + 2] = color[2];

      const life = 0.9 + Math.random() * 0.8;
      this.life[index] = life;
      this.maxLife[index] = life;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  /** @param {number} dt saniye */
  update(dt) {
    if (!this.active) return;

    // Yeni patlamalar: sonuç boyunca ~0,6 sn arayla.
    this.timer -= dt;
    if (this.timer <= 0) {
      this._burst(1);
      this.timer = 0.5 + Math.random() * 0.35;
    }

    for (let index = 0; index < this.count; index += 1) {
      if (this.life[index] <= 0) continue;

      const i3 = index * 3;
      const remaining = (this.life[index] -= dt);

      this.velocity[i3 + 1] += GRAVITY * dt;
      this.positions[i3] += this.velocity[i3] * dt;
      this.positions[i3 + 1] += this.velocity[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocity[i3 + 2] * dt;

      // Sönüm: kendi rengi solar (additive karışımda kaybolur).
      const fade = Math.max(0, remaining / this.maxLife[index]);
      this.colors[i3] = this.baseColor[i3] * fade;
      this.colors[i3 + 1] = this.baseColor[i3 + 1] * fade;
      this.colors[i3 + 2] = this.baseColor[i3 + 2] * fade;

      if (remaining <= 0) {
        this.life[index] = 0;
        this.colors[i3] = 0;
        this.colors[i3 + 1] = 0;
        this.colors[i3 + 2] = 0;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
