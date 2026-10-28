// ─── Toz efekti ─────────────────────────────────────────────────────────────
// Tek bir Points nesnesi + shader: her parçacık kendi alfa ve boyutunu taşır.
// Havuz sabit olduğu için koşu sırasında bellek ayrılmaz.

import * as THREE from 'three';
import { dustTexture } from './textures.js';

const VERTEX = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (220.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    if (tex.a < 0.01) discard;
    gl_FragColor = vec4(tex.rgb, tex.a * vAlpha * 0.55);
  }
`;

export class DustField {
  constructor(scene, count = 280) {
    this.count = count;
    this.cursor = 0;

    this.positions = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    this.size = new Float32Array(count);
    this.velocity = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dustTexture() } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  /** Bir toz bulutu bırakır. */
  spawn(x, y, z) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;

    this.positions[i * 3] = x + (Math.random() - 0.5) * 0.5;
    this.positions[i * 3 + 1] = y + Math.random() * 0.25;
    this.positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;

    this.velocity[i * 3] = -1.2 - Math.random() * 2.6;
    this.velocity[i * 3 + 1] = 0.4 + Math.random() * 1.1;
    this.velocity[i * 3 + 2] = (Math.random() - 0.5) * 1.4;

    this.maxLife[i] = 0.65 + Math.random() * 0.6;
    this.life[i] = this.maxLife[i];
    this.size[i] = 0.8 + Math.random() * 1.4;
    this.alpha[i] = 1;
  }

  update(dt) {
    const alpha = this.points.geometry.getAttribute('aAlpha');
    const position = this.points.geometry.getAttribute('position');

    let active = false;
    for (let i = 0; i < this.count; i += 1) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          active = true;
        }
        continue;
      }

      active = true;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);

      this.positions[i * 3] += this.velocity[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocity[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocity[i * 3 + 2] * dt;

      this.velocity[i * 3 + 1] -= 0.6 * dt;
      this.alpha[i] = t * t;
      this.size[i] += dt * 1.8;
    }

    if (active) {
      alpha.needsUpdate = true;
      position.needsUpdate = true;
      this.points.geometry.getAttribute('aSize').needsUpdate = true;
    }
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.map?.dispose();
    this.points.material.dispose();
    this.points.removeFromParent();
  }
}
