// ─── Prosedürel at ──────────────────────────────────────────────────────────
// Harici GLTF dosyası yok: gövde, boyun, baş, yele, kuyruk, dört bacak, eyer
// örtüsü ve jokey ilkel geometriden kurulur. Dörtnal (gallop) döngüsü kasıtlı
// olarak basit bir faz animasyonudur; kare başına maliyeti neredeyse sıfırdır.

import * as THREE from 'three';
import { numberBadgeTexture, numberPlateTexture } from './textures.js';

const HOOF_COLOR = 0x191512;
const LEATHER = 0x2a1c15;

function createMaterials(horse) {
  const coat = new THREE.Color(horse.coat);
  return {
    coat: new THREE.MeshStandardMaterial({ color: coat, roughness: 0.62, metalness: 0.03 }),
    coatDark: new THREE.MeshStandardMaterial({
      color: coat.clone().multiplyScalar(0.72),
      roughness: 0.7,
    }),
    mane: new THREE.MeshStandardMaterial({ color: new THREE.Color(horse.mane), roughness: 0.85 }),
    hoof: new THREE.MeshStandardMaterial({ color: HOOF_COLOR, roughness: 0.45 }),
    leather: new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.6 }),
    cloth: new THREE.MeshStandardMaterial({
      color: new THREE.Color(horse.color),
      roughness: 0.75,
      side: THREE.DoubleSide,
    }),
    silk: new THREE.MeshStandardMaterial({ color: new THREE.Color(horse.color), roughness: 0.68 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd9a882, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xd6dcec, roughness: 0.32, metalness: 0.7 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x07060a, roughness: 0.25 }),
  };
}

function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(position[0], position[1], position[2]);
  m.rotation.set(rotation[0], rotation[1], rotation[2]);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function buildLeg(rig, mats, { x, z, front }) {
  const hip = new THREE.Group();
  hip.position.set(x, 1.16, z);
  rig.add(hip);

  addMesh(hip, new THREE.CylinderGeometry(0.135, 0.095, 0.5, 9), mats.coat, [0, -0.25, 0]);

  const knee = new THREE.Group();
  knee.position.y = -0.5;
  hip.add(knee);

  addMesh(knee, new THREE.CylinderGeometry(0.085, 0.058, 0.52, 8), mats.coatDark, [0, -0.26, 0]);

  const hoof = addMesh(
    knee,
    new THREE.CylinderGeometry(0.078, 0.098, 0.16, 10),
    mats.hoof,
    [0.01, -0.56, 0],
  );

  return { hip, knee, hoof, front };
}

export function createHorse(horse, { phaseOffset = 0 } = {}) {
  const mats = createMaterials(horse);
  const root = new THREE.Group();
  root.name = `horse-${horse.num}`;

  const rig = new THREE.Group();
  root.add(rig);

  // ── Gövde ────────────────────────────────────────────────────────────────
  const torso = addMesh(
    rig,
    new THREE.CapsuleGeometry(0.44, 1.18, 6, 16),
    mats.coat,
    [0, 1.34, 0],
    [0, 0, Math.PI / 2],
  );
  torso.scale.set(1, 1, 0.94);

  const chest = addMesh(rig, new THREE.SphereGeometry(0.46, 16, 12), mats.coat, [0.6, 1.3, 0]);
  chest.scale.set(0.88, 0.96, 0.9);

  const rump = addMesh(rig, new THREE.SphereGeometry(0.5, 16, 12), mats.coat, [-0.72, 1.36, 0]);
  rump.scale.set(1, 1, 0.94);

  // ── Boyun ────────────────────────────────────────────────────────────────
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0.7, 1.46, 0);
  neckPivot.rotation.z = -0.52;
  rig.add(neckPivot);

  const neck = addMesh(
    neckPivot,
    new THREE.CylinderGeometry(0.23, 0.38, 0.98, 14, 1, false),
    mats.coat,
    [0, 0.44, 0],
  );
  neck.scale.z = 0.9;

  // Yele: boynun üstünde kısa tutamlar.
  for (let i = 0; i < 8; i += 1) {
    const t = i / 7;
    const tuft = addMesh(
      neckPivot,
      new THREE.ConeGeometry(0.075 - t * 0.02, 0.3 - t * 0.08, 5),
      mats.mane,
      [0.12 + t * 0.05, 0.12 + t * 0.78, 0],
      [0, 0, 0.9 + t * 0.3],
    );
    tuft.scale.z = 0.7;
  }

  // ── Baş ──────────────────────────────────────────────────────────────────
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.94, 0);
  headPivot.rotation.z = 0.66;
  neckPivot.add(headPivot);

  const skull = addMesh(headPivot, new THREE.SphereGeometry(0.2, 14, 12), mats.coat, [0.16, 0.02, 0]);
  skull.scale.set(1.5, 1.05, 0.95);

  const muzzle = addMesh(
    headPivot,
    new THREE.CapsuleGeometry(0.115, 0.26, 4, 10),
    mats.coat,
    [0.44, -0.04, 0],
    [0, 0, Math.PI / 2],
  );
  muzzle.scale.set(1, 0.92, 0.86);

  addMesh(headPivot, new THREE.SphereGeometry(0.14, 12, 10), mats.coatDark, [0.31, -0.13, 0]);

  // Burun delikleri.
  for (const side of [-1, 1]) {
    addMesh(
      headPivot,
      new THREE.SphereGeometry(0.028, 8, 6),
      mats.eye,
      [0.53, -0.03, side * 0.065],
    );
    // Gözler.
    addMesh(
      headPivot,
      new THREE.SphereGeometry(0.048, 10, 8),
      mats.eye,
      [0.19, 0.075, side * 0.17],
    );
    // Kulaklar.
    addMesh(
      headPivot,
      new THREE.ConeGeometry(0.055, 0.21, 6),
      mats.coat,
      [-0.03, 0.23, side * 0.085],
      [side * 0.22, 0, -0.18],
    );
  }

  // Alın bandı ve burun bandı: atın kimlik rengi.
  addMesh(
    headPivot,
    new THREE.TorusGeometry(0.2, 0.026, 6, 18),
    mats.silk,
    [0.06, 0.06, 0],
    [0, Math.PI / 2, 0],
  );
  addMesh(
    headPivot,
    new THREE.TorusGeometry(0.125, 0.022, 6, 16),
    mats.leather,
    [0.42, -0.02, 0],
    [0, Math.PI / 2, 0],
  );

  // ── Kuyruk ───────────────────────────────────────────────────────────────
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-1.02, 1.56, 0);
  rig.add(tailPivot);

  addMesh(
    tailPivot,
    new THREE.CylinderGeometry(0.085, 0.02, 0.95, 8),
    mats.mane,
    [-0.16, -0.45, 0],
    [0, 0, -0.34],
  );
  for (let i = 0; i < 5; i += 1) {
    const spread = (i - 2) * 0.055;
    const strand = addMesh(
      tailPivot,
      new THREE.CapsuleGeometry(0.02, 0.72 - i * 0.04, 3, 5),
      mats.mane,
      [-0.26 - i * 0.012, -0.56, spread],
      [spread * 1.6, 0, -0.3 - i * 0.03],
    );
    strand.scale.z = 0.8;
  }

  // ── Eyer örtüsü + numara ─────────────────────────────────────────────────
  const saddle = new THREE.Group();
  saddle.position.set(0.02, 1.66, 0);
  rig.add(saddle);

  addMesh(saddle, new THREE.BoxGeometry(0.9, 0.12, 1.0), mats.cloth, [0, 0.03, 0]);
  addMesh(saddle, new THREE.BoxGeometry(0.56, 0.16, 0.44), mats.leather, [0, 0.12, 0]);

  const plate = numberPlateTexture(horse);
  for (const side of [-1, 1]) {
    const face = addMesh(
      saddle,
      new THREE.PlaneGeometry(0.82, 0.54),
      new THREE.MeshStandardMaterial({
        map: plate,
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
      [-0.02, -0.22, side * 0.505],
      [0, side === 1 ? 0 : Math.PI, 0],
    );
    face.castShadow = false;
  }

  // ── Jokey ────────────────────────────────────────────────────────────────
  const jockey = new THREE.Group();
  jockey.position.set(-0.06, 1.82, 0);
  rig.add(jockey);

  const torsoJ = addMesh(
    jockey,
    new THREE.CapsuleGeometry(0.15, 0.3, 4, 10),
    mats.silk,
    [0, 0.32, 0],
    [0, 0, -0.42],
  );
  torsoJ.scale.z = 0.82;

  addMesh(jockey, new THREE.SphereGeometry(0.105, 12, 10), mats.skin, [0.2, 0.56, 0]);

  const helmet = addMesh(
    jockey,
    new THREE.SphereGeometry(0.135, 12, 10),
    mats.silk,
    [0.19, 0.6, 0],
  );
  helmet.scale.set(1.05, 0.95, 1);

  addMesh(jockey, new THREE.BoxGeometry(0.12, 0.05, 0.2), mats.eye, [0.29, 0.585, 0]);

  for (const side of [-1, 1]) {
    addMesh(
      jockey,
      new THREE.CapsuleGeometry(0.045, 0.3, 3, 6),
      mats.silk,
      [0.14, 0.3, side * 0.17],
      [0, 0, -1.15],
    );
    addMesh(
      jockey,
      new THREE.CapsuleGeometry(0.05, 0.34, 3, 6),
      mats.silk,
      [-0.02, -0.06, side * 0.23],
      [side * 0.22, 0, 1.25],
    );
    addMesh(jockey, new THREE.SphereGeometry(0.045, 8, 6), mats.leather, [0.24, 0.24, side * 0.14]);
  }

  // ── Bacaklar ─────────────────────────────────────────────────────────────
  const legs = [
    buildLeg(rig, mats, { x: 0.62, z: 0.35, front: true }),
    buildLeg(rig, mats, { x: 0.62, z: -0.35, front: true }),
    buildLeg(rig, mats, { x: -0.66, z: 0.35, front: false }),
    buildLeg(rig, mats, { x: -0.66, z: -0.35, front: false }),
  ];

  // ── Üstte yüzen numara rozeti ────────────────────────────────────────────
  const badge = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: numberBadgeTexture(horse),
      transparent: true,
      depthWrite: false,
      depthTest: true,
    }),
  );
  badge.position.set(0, 3.05, 0);
  badge.scale.set(0.78, 0.92, 1);
  root.add(badge);

  // ── Animasyon durumu ─────────────────────────────────────────────────────
  const gallopOffsets = [0, 0.55, 2.35, 2.85];
  let phase = Math.random() * Math.PI * 2;
  let speed = 0;
  const baseLean = 0;

  /** @param {number} dt @param {number} targetSpeed 0..1 */
  function update(dt, targetSpeed = 0) {
    const clamped = Math.max(0, Math.min(1, targetSpeed));
    speed += (clamped - speed) * Math.min(1, dt * 4.5);
    const amp = 0.08 + speed * 0.92;

    phase += dt * (2.2 + speed * 16);
    const p = phase + phaseOffset;

    // Gövde: dikey salınım + hafif eğim.
    rig.position.y = Math.abs(Math.sin(p)) * 0.055 * amp;
    rig.rotation.z = Math.sin(p * 2 + 0.7) * 0.028 * amp + baseLean;
    rig.rotation.x = Math.sin(p) * 0.016 * amp;

    // Boyun/baş: koşarken öne uzanır, dururken hafifçe sallanır.
    neckPivot.rotation.z = -0.52 - speed * 0.1 + Math.sin(p * 2 + 1.1) * 0.055 * amp;
    headPivot.rotation.z = 0.66 + speed * 0.12 + Math.sin(p + 0.5) * 0.045 * amp;

    // Kuyruk ve yele.
    tailPivot.rotation.z = 0.06 + Math.sin(p * 0.9) * 0.09 * amp + speed * 0.18;
    tailPivot.rotation.y = Math.sin(p * 1.3) * 0.14 * amp;
    neck.rotation.y = Math.sin(p * 1.1) * 0.02 * amp;

    // Bacaklar: dörtnal fazları.
    for (let i = 0; i < legs.length; i += 1) {
      const leg = legs[i];
      const swing = Math.sin(p + gallopOffsets[i]);
      const reach = leg.front ? 0.62 : 0.72;
      const lift = Math.max(0, Math.cos(p + gallopOffsets[i]));

      leg.hip.rotation.z = swing * reach * amp;
      leg.knee.rotation.z = -lift * 0.85 * amp - 0.05;
      leg.hoof.rotation.z = lift * 0.35 * amp;

      if (speed < 0.05) {
        leg.hip.rotation.z = 0;
        leg.knee.rotation.z = -0.03;
        leg.hoof.rotation.z = 0;
      }
    }

    // Jokey: koşarken hafifçe öne kapanır ve zıplar.
    jockey.position.y = 1.82 + Math.sin(p * 2) * 0.022 * amp;
    jockey.rotation.z = -0.08 * speed + Math.sin(p * 2 + 0.4) * 0.02 * amp;

    badge.position.y = 3.05 + Math.sin(p * 2) * 0.03 * amp;
  }

  function dispose() {
    root.traverse((object) => {
      if (object.isMesh || object.isSprite) {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material?.map?.dispose?.();
          material?.dispose?.();
        }
      }
    });
  }

  return {
    num: horse.num,
    horse,
    root,
    update,
    dispose,
    get speed() {
      return speed;
    },
  };
}
