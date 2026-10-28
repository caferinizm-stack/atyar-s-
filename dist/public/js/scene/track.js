// ─── Hipodrom ───────────────────────────────────────────────────────────────
// Pist, korkuluklar, bitiş çizgisi, tribün, projektörler ve gökyüzü. Hepsi
// ilkel geometriden üretilir; harici model/doku dosyası yoktur.

import * as THREE from 'three';
import { RACE } from '../config.js';
import {
  bannerTexture,
  checkerTexture,
  neonBoardTexture,
  winnerTexture,
  CROWD_COLORS,
  dirtTexture,
  grassTexture,
} from './textures.js';

const { startX, finishX, laneGap, lanes, width, railOffset } = RACE.track;
const trackCenter = (startX + finishX) / 2;
const trackLength = finishX - startX + 80;

/** At numarasına göre şerit merkezi (z ekseni). */
export function laneZ(num) {
  return ((lanes + 1) / 2 - Number(num)) * laneGap;
}

/** Atın pist üzerindeki dünya konumu (x). */
export function progressToX(progress) {
  return startX + (finishX - startX) * progress;
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, cast = false, receive = false } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function createTrack(scene) {
  const group = new THREE.Group();
  group.name = 'track';

  // ── Gökyüzü: gece mavisi/mor gradyan + yıldızlar ─────────────────────────
  const sky = mesh(
    new THREE.SphereGeometry(430, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 horizon = vec3(0.105, 0.075, 0.19);
          vec3 middle  = vec3(0.055, 0.055, 0.145);
          vec3 zenith  = vec3(0.012, 0.014, 0.045);
          vec3 color = mix(horizon, middle, smoothstep(0.0, 0.22, h));
          color = mix(color, zenith, smoothstep(0.22, 0.85, h));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  sky.frustumCulled = false;
  group.add(sky);

  const starCount = 420;
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.42;
    const r = 400;
    starPositions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
    starPositions[i * 3 + 1] = Math.sin(phi) * r + 40;
    starPositions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  group.add(
    new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xdfe6ff,
        size: 1.35,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        fog: false,
      }),
    ),
  );

  // ── Çim zemin ────────────────────────────────────────────────────────────
  const grass = mesh(
    new THREE.PlaneGeometry(760, 560),
    new THREE.MeshStandardMaterial({
      map: grassTexture([52, 36]),
      color: 0x9fb894,
      roughness: 1,
      metalness: 0,
    }),
    { y: -0.03 },
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  group.add(grass);

  // ── Toprak pist ──────────────────────────────────────────────────────────
  const shoulder = mesh(
    new THREE.PlaneGeometry(trackLength + 12, width + 8),
    new THREE.MeshStandardMaterial({
      map: dirtTexture([18, 2]),
      color: 0x8d6f52,
      roughness: 1,
    }),
    { y: 0.005 },
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.receiveShadow = true;
  group.add(shoulder);

  const surface = mesh(
    new THREE.PlaneGeometry(trackLength, width),
    new THREE.MeshStandardMaterial({
      map: dirtTexture([16, 2]),
      color: 0xb9987a,
      roughness: 0.96,
      metalness: 0.02,
    }),
    { y: 0.02 },
  );
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = true;
  group.add(surface);

  // Şerit ayırıcı beyaz kesikler.
  const dashGeometry = new THREE.BoxGeometry(1.5, 0.02, 0.07);
  const dashMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f1ea,
    roughness: 0.8,
    emissive: 0x3a3833,
    emissiveIntensity: 0.25,
  });
  const dashesPerLane = Math.floor(trackLength / 5.6);
  const dividerCount = lanes - 1;
  const dashes = new THREE.InstancedMesh(
    dashGeometry,
    dashMaterial,
    dashesPerLane * dividerCount,
  );
  dashes.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let dashIndex = 0;
  for (let d = 1; d <= dividerCount; d += 1) {
    const z = (width / 2 - d * laneGap);
    for (let i = 0; i < dashesPerLane; i += 1) {
      dummy.position.set(trackCenter - trackLength / 2 + 2.8 + i * 5.6, 0.035, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(dashIndex, dummy.matrix);
      dashIndex += 1;
    }
  }
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // ── Bitiş çizgisi ────────────────────────────────────────────────────────
  const finish = mesh(
    new THREE.PlaneGeometry(2.6, width + 0.4),
    new THREE.MeshStandardMaterial({
      map: checkerTexture([1, 15]),
      roughness: 0.72,
      emissive: 0x2a2a36,
      emissiveIntensity: 0.3,
    }),
    { x: finishX, y: 0.04 },
  );
  finish.rotation.x = -Math.PI / 2;
  finish.receiveShadow = true;
  group.add(finish);

  // Bitiş takı (iki direk + afiş).
  const steel = new THREE.MeshStandardMaterial({
    color: 0x2b3350,
    roughness: 0.45,
    metalness: 0.6,
  });
  const bannerMap = bannerTexture('FINISH');
  const banner = new THREE.Mesh(
    // Portre ekranda yazı **tam** okunabilsin diye tabela derli toplu.
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshStandardMaterial({
      map: bannerMap,
      emissive: 0xffffff,
      emissiveMap: bannerMap,
      emissiveIntensity: 0.35,
      roughness: 0.6,
      side: THREE.DoubleSide,
    }),
  );
  banner.position.set(finishX, 7.6, 0);
  group.add(banner);

  // **Reklam panosu**: bitiş tabelasının hemen üstünde neon “RETRA LIVE”.
  const neonMap = neonBoardTexture('RETRA LIVE');
  const adBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 2.25),
    new THREE.MeshStandardMaterial({
      map: neonMap,
      emissive: 0xffffff,
      emissiveMap: neonMap,
      emissiveIntensity: 0.95,
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide,
    }),
  );
  adBoard.position.set(finishX, 10.5, 0);
  group.add(adBoard);

  // **Kazanan yazısı**: tabelanın hemen altında, yarış bitince atın adı +
  // “kazandı” yazar. Başlangıçta gizlidir.
  const winnerBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 1.76),
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  winnerBoard.position.set(finishX, 4.6, 0.05);
  winnerBoard.visible = false;
  group.add(winnerBoard);

  /** Kazanan atı tabelanın altına yazar (`"Kızıl Şimşek kazandı"`). */
  function showWinner(text) {
    const clean = String(text ?? '').trim();
    if (!clean) {
      hideWinner();
      return;
    }
    const previous = winnerBoard.material.map;
    winnerBoard.material.map = winnerTexture(clean);
    winnerBoard.material.needsUpdate = true;
    previous?.dispose();
    winnerBoard.visible = true;
  }

  function hideWinner() {
    winnerBoard.visible = false;
  }

  // Direkler reklam panosunu da taşısın diye biraz daha yüksek.
  for (const side of [-1, 1]) {
    const pole = mesh(new THREE.CylinderGeometry(0.16, 0.22, 11.8, 10), steel, {
      x: finishX,
      y: 5.9,
      z: side * 11,
      cast: true,
    });
    group.add(pole);
  }

  // Başlangıç takı.
  for (const side of [-1, 1]) {
    const post = mesh(new THREE.CylinderGeometry(0.13, 0.18, 4.6, 8), steel, {
      x: startX,
      y: 2.3,
      z: side * 10.6,
      cast: true,
    });
    group.add(post);
  }
  const beam = mesh(new THREE.BoxGeometry(21.6, 0.28, 0.28), steel, {
    x: startX,
    y: 4.6,
  });
  group.add(beam);
  const neonStrip = mesh(
    new THREE.BoxGeometry(21.4, 0.07, 0.07),
    new THREE.MeshBasicMaterial({ color: 0x7ce8ff, toneMapped: false }),
    { x: startX, y: 4.44 },
  );
  group.add(neonStrip);

  // ── Korkuluklar ──────────────────────────────────────────────────────────
  const postGeometry = new THREE.CylinderGeometry(0.055, 0.055, 1.05, 6);
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0xe9edf7,
    roughness: 0.55,
    metalness: 0.15,
  });
  const postSpacing = 4;
  const postsPerSide = Math.ceil(trackLength / postSpacing) + 1;
  const posts = new THREE.InstancedMesh(postGeometry, postMaterial, postsPerSide * 2);
  let postIndex = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < postsPerSide; i += 1) {
      dummy.position.set(trackCenter - trackLength / 2 + i * postSpacing, 0.52, side * railOffset);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      posts.setMatrixAt(postIndex, dummy.matrix);
      postIndex += 1;
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.castShadow = true;
  group.add(posts);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f9ff,
    roughness: 0.42,
    metalness: 0.25,
    emissive: 0x6d7794,
    emissiveIntensity: 0.18,
  });
  for (const side of [-1, 1]) {
    for (const height of [1.04, 0.62]) {
      const rail = mesh(new THREE.BoxGeometry(trackLength, 0.09, 0.06), railMaterial, {
        x: trackCenter,
        y: height,
        z: side * railOffset,
      });
      group.add(rail);
    }
  }

  // ── Tribün ───────────────────────────────────────────────────────────────
  const standZ = -24;
  const tribune = new THREE.Group();
  tribune.position.set(trackCenter, 0, standZ);

  const concrete = new THREE.MeshStandardMaterial({
    color: 0x232a44,
    roughness: 0.85,
    metalness: 0.08,
  });
  const stepMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d3552,
    roughness: 0.75,
  });

  const tiers = 5;
  const tierDepth = 3.4;
  for (let i = 0; i < tiers; i += 1) {
    const step = mesh(new THREE.BoxGeometry(122, 1.15, tierDepth), stepMaterial, {
      y: 0.58 + i * 1.15,
      z: -i * tierDepth,
      receive: true,
    });
    tribune.add(step);
  }
  // Ön duvar.
  tribune.add(
    mesh(new THREE.BoxGeometry(122, 1.4, 0.7), concrete, {
      y: 0.7,
      z: 2,
      receive: true,
    }),
  );

  // Seyirci kalabalığı: her basamağa rastgele formalar.
  const crowdGeometry = new THREE.BoxGeometry(0.34, 0.52, 0.34);
  const crowdMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const crowdCount = tiers * 150;
  const crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, crowdCount);
  const color = new THREE.Color();
  let crowdIndex = 0;
  for (let i = 0; i < tiers; i += 1) {
    for (let j = 0; j < 150; j += 1) {
      dummy.position.set(
        -58 + (j % 30) * 4 + (Math.random() - 0.5) * 1.2,
        1.35 + i * 1.15 + Math.random() * 0.22,
        -i * tierDepth + 0.4 + Math.random() * 1.6,
      );
      dummy.rotation.set(0, Math.random() * 0.6 - 0.3, 0);
      dummy.scale.setScalar(0.85 + Math.random() * 0.4);
      dummy.updateMatrix();
      crowd.setMatrixAt(crowdIndex, dummy.matrix);
      color.set(CROWD_COLORS[Math.floor(Math.random() * CROWD_COLORS.length)]);
      crowd.setColorAt(crowdIndex, color.multiplyScalar(0.55 + Math.random() * 0.4));
      crowdIndex += 1;
    }
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  tribune.add(crowd);

  // Çatı ve aydınlatma bandı.
  tribune.add(
    mesh(new THREE.BoxGeometry(128, 0.5, 20), concrete, {
      y: 9.4,
      z: -7,
      cast: true,
    }),
  );
  const lightStrip = mesh(
    new THREE.BoxGeometry(120, 0.16, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xdce9ff, toneMapped: false }),
    { y: 9.05, z: 2.2 },
  );
  tribune.add(lightStrip);

  for (let i = 0; i < 7; i += 1) {
    tribune.add(
      mesh(new THREE.CylinderGeometry(0.22, 0.26, 9.4, 8), steel, {
        x: -57 + i * 19,
        y: 4.7,
        z: 3,
      }),
    );
  }
  group.add(tribune);

  // ── Projektör direkleri ──────────────────────────────────────────────────
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3f6ff,
    emissive: 0xf0f5ff,
    emissiveIntensity: 2.2,
    roughness: 0.3,
  });
  for (const x of [startX - 18, trackCenter, finishX + 18]) {
    for (const z of [-16, 18]) {
      const mast = mesh(new THREE.CylinderGeometry(0.24, 0.36, 17, 8), steel, {
        x,
        y: 8.5,
        z,
        cast: true,
      });
      group.add(mast);
      const head = mesh(new THREE.BoxGeometry(3.6, 1.15, 0.45), lampMaterial, {
        x,
        y: 17.1,
        z,
      });
      head.lookAt(x, 2, 0);
      group.add(head);
    }
  }

  // ── Işıklar ──────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0x8fa6ff, 0x23301f, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3dd, 2.35);
  sun.position.set(trackCenter + 40, 62, 46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -62;
  sun.shadow.camera.right = 62;
  sun.shadow.camera.top = 46;
  sun.shadow.camera.bottom = -46;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  // Pist ışıklarının yansıması için hafif dolgu.
  const fill = new THREE.DirectionalLight(0x9fb6ff, 0.55);
  fill.position.set(trackCenter - 60, 30, -40);
  scene.add(fill);

  scene.add(group);

  /** Güneşi ve gölge alanını öndeki atlarla birlikte kaydırır. */
  function update(focusX = trackCenter) {
    const x = Number.isFinite(focusX) ? focusX : trackCenter;
    sun.position.set(x + 40, 64, 48);
    sun.target.position.set(x + 4, 0, 0);
    sun.target.updateMatrixWorld();
  }

  return {
    group,
    sun,
    update,
    startX,
    finishX,
    laneZ,
    progressToX,
    banner,
    adBoard,
    winnerBoard,
    showWinner,
    hideWinner,
  };
}
