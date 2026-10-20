/**
 * Procedural low-poly furniture for ARSpace, built with three.js and exported
 * as binary glTF (.glb) into public/models/. These are original models made
 * for this project (CC0). Dimensions are the designed sizes in metres; every
 * model's origin is the floor centre, +Y up, front facing +Z.
 *
 * Regenerate: npm run dev, open /tools/build-models.html, or run the
 * Playwright helper described in tools/README.md.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const mat = {
  oak: () => new THREE.MeshStandardMaterial({ name: 'Oak', color: 0xb0814f, roughness: 0.62 }),
  walnut: () => new THREE.MeshStandardMaterial({ name: 'Walnut', color: 0x5c3a24, roughness: 0.55 }),
  black: () => new THREE.MeshStandardMaterial({ name: 'Black metal', color: 0x1f1f22, roughness: 0.35, metalness: 0.85 }),
  brass: () => new THREE.MeshStandardMaterial({ name: 'Brass', color: 0xc9a14a, roughness: 0.28, metalness: 1 }),
  white: () => new THREE.MeshStandardMaterial({ name: 'White lacquer', color: 0xefefea, roughness: 0.45 }),
  grey: () => new THREE.MeshStandardMaterial({ name: 'Grey', color: 0x6d7178, roughness: 0.6 }),
  sage: () => new THREE.MeshStandardMaterial({ name: 'Sage', color: 0x8fa58a, roughness: 0.55 }),
  linen: () => new THREE.MeshStandardMaterial({ name: 'Linen shade', color: 0xeee3cf, roughness: 0.9, side: THREE.DoubleSide }),
  bulb: () => new THREE.MeshStandardMaterial({ name: 'Bulb', color: 0xfff4d6, emissive: 0xffe2a8, emissiveIntensity: 1.5 }),
  stone: () => new THREE.MeshStandardMaterial({ name: 'Stone', color: 0xd9d6cf, roughness: 0.85 }),
};

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}
function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, seg = 24, open = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open), material);
  m.position.set(x, y, z);
  return m;
}
const group = (name, ...children) => {
  const g = new THREE.Group();
  g.name = name;
  children.flat().forEach((c) => g.add(c));
  return g;
};

// deterministic pseudo-random so the bookshelf looks the same every build
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export const BUILDERS = {
  'coffee-table': () => {
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(cyl(0.018, 0.018, 0.41, mat.black(), sx * 0.44, 0.205, sz * 0.215, 12));
    return group('Coffee table', box(1.0, 0.04, 0.55, mat.oak(), 0, 0.43), box(0.9, 0.02, 0.45, mat.oak(), 0, 0.12), legs);
  },
  'side-table': () =>
    group(
      'Side table',
      cyl(0.225, 0.225, 0.03, mat.walnut(), 0, 0.535, 0, 40),
      cyl(0.028, 0.028, 0.5, mat.black(), 0, 0.27, 0, 16),
      cyl(0.16, 0.17, 0.02, mat.black(), 0, 0.01, 0, 32),
    ),
  'dining-table': () => {
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(box(0.06, 0.71, 0.06, mat.walnut(), sx * 0.62, 0.355, sz * 0.32));
    return group('Dining table', box(1.4, 0.04, 0.8, mat.walnut(), 0, 0.73), box(1.2, 0.08, 0.04, mat.walnut(), 0, 0.67, 0.32), box(1.2, 0.08, 0.04, mat.walnut(), 0, 0.67, -0.32), legs);
  },
  desk: () => {
    const drawers = [];
    for (let i = 0; i < 3; i++) {
      const y = 0.12 + i * 0.22;
      drawers.push(box(0.36, 0.19, 0.01, mat.white(), -0.38, y + 0.1, 0.285));
      drawers.push(box(0.12, 0.012, 0.012, mat.black(), -0.38, y + 0.16, 0.295));
    }
    return group(
      'Study desk',
      box(1.2, 0.03, 0.6, mat.oak(), 0, 0.735),
      box(0.4, 0.72, 0.56, mat.grey(), -0.38, 0.36, 0),
      drawers,
      box(0.03, 0.72, 0.56, mat.grey(), 0.57, 0.36, 0),
      box(0.74, 0.25, 0.015, mat.grey(), 0.19, 0.58, -0.25),
    );
  },
  bookshelf: () => {
    const W = 0.8, H = 1.8, D = 0.3, t = 0.02;
    const parts = [
      box(t, H, D, mat.oak(), -W / 2 + t / 2, H / 2),
      box(t, H, D, mat.oak(), W / 2 - t / 2, H / 2),
      box(W - 2 * t, H, 0.01, mat.oak(), 0, H / 2, -D / 2 + 0.005), // back panel
    ];
    const shelfY = [0.06, 0.42, 0.78, 1.14, 1.5, H - t / 2];
    shelfY.forEach((y) => parts.push(box(W - 2 * t, t, D - 0.01, mat.oak(), 0, y, 0.005)));
    const r = rng(7);
    const colors = [0x7a3b3b, 0x2f4f6f, 0xc9b27c, 0x3f6b4f, 0x5d4c7a, 0xd6d0c4, 0x8a5a3b];
    for (let s = 0; s < 4; s++) {
      let x = -W / 2 + t + 0.02;
      const base = shelfY[s] + t / 2;
      while (x < W / 2 - t - 0.08) {
        const bw = 0.025 + r() * 0.03;
        const bh = 0.2 + r() * 0.1;
        if (r() < 0.18) {
          x += 0.06;
          continue;
        }
        const m = new THREE.MeshStandardMaterial({ name: 'Book', color: colors[Math.floor(r() * colors.length)], roughness: 0.8 });
        parts.push(box(bw, bh, 0.2, m, x + bw / 2, base + bh / 2, 0.02));
        x += bw + 0.004;
      }
    }
    return group('Bookshelf', parts);
  },
  'tv-unit': () => {
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(cyl(0.015, 0.012, 0.12, mat.black(), sx * 0.74, 0.06, sz * 0.15, 12));
    return group(
      'TV console',
      box(1.6, 0.38, 0.4, mat.walnut(), 0, 0.31),
      box(0.52, 0.3, 0.01, mat.oak(), -0.53, 0.31, 0.2),
      box(0.52, 0.3, 0.01, mat.oak(), 0.53, 0.31, 0.2),
      box(0.5, 0.012, 0.36, mat.walnut(), 0, 0.31, 0.01),
      legs,
    );
  },
  'storage-cabinet': () =>
    group(
      'Storage cabinet',
      box(0.8, 0.94, 0.45, mat.sage(), 0, 0.53),
      box(0.8, 0.06, 0.42, mat.black(), 0, 0.03),
      box(0.388, 0.9, 0.012, mat.sage(), -0.199, 0.53, 0.231),
      box(0.388, 0.9, 0.012, mat.sage(), 0.199, 0.53, 0.231),
      cyl(0.008, 0.008, 0.16, mat.brass(), -0.03, 0.62, 0.245, 10),
      cyl(0.008, 0.008, 0.16, mat.brass(), 0.03, 0.62, 0.245, 10),
    ),
  'floor-lamp': () =>
    group(
      'Floor lamp',
      cyl(0.18, 0.18, 0.03, mat.black(), 0, 0.015, 0, 40),
      cyl(0.012, 0.012, 1.35, mat.brass(), 0, 0.705, 0, 12),
      cyl(0.13, 0.2, 0.28, mat.linen(), 0, 1.46, 0, 40, true),
      new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), mat.bulb()).translateY(1.42),
    ),
  stool: () => {
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const leg = cyl(0.015, 0.018, 0.62, mat.oak(), Math.cos(a) * 0.13, 0.31, Math.sin(a) * 0.13, 10);
      leg.rotation.set(Math.sin(a) * -0.06, 0, Math.cos(a) * 0.06);
      legs.push(leg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.008, 8, 40), mat.black());
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.24;
    return group('Wooden stool', cyl(0.175, 0.17, 0.04, mat.oak(), 0, 0.63, 0, 40), legs, ring);
  },
  sculpture: () => {
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.09, 0.028, 160, 20, 2, 3), mat.brass());
    knot.position.y = 0.25 + 0.15;
    return group('Abstract sculpture', box(0.3, 0.25, 0.3, mat.stone(), 0, 0.125), knot);
  },
};

export async function exportGLB(object) {
  const exporter = new GLTFExporter();
  return exporter.parseAsync(object, { binary: true });
}

/** Build every model; returns { id: ArrayBuffer }. */
export async function buildAll() {
  const out = {};
  for (const [id, build] of Object.entries(BUILDERS)) {
    const scene = new THREE.Scene();
    scene.add(build());
    out[id] = await exportGLB(scene);
  }
  return out;
}
