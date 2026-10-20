/**
 * MultiPlace 3D room composer — the same multi-object workflow without the
 * camera, for iPhone (Safari has no WebXR AR), desktop, and any phone.
 * This is an interactive 3D scene, NOT camera-based AR.
 *
 * Coordinates: metres, room floor from (0, 0, 0) to (width, 0, length), so
 * x/z map directly onto the SmartFit plan's x/y.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createObjectManager } from './objectManager.js';
import { applyTransform, createAssetManager } from './modelAssets.js';
import { getProduct, surfaceOf } from '../data/products.js';

const WALL_HEIGHT = 2.4;

export function createComposer(container, { room, signal, onChange, onError }) {
  const manager = createObjectManager();
  const assets = createAssetManager();
  const pivots = new Map();
  const loading = new Set();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.domElement.className = 'mp-canvas';
  renderer.domElement.setAttribute('aria-label', '3D room composer');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 1;
  controls.maxDistance = 25;

  let roomGroup = null;
  let W = room.width;
  let L = room.length;

  function buildRoom() {
    if (roomGroup) {
      roomGroup.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      scene.remove(roomGroup);
    }
    roomGroup = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x1b2440, roughness: 0.95 }),
    );
    floor.position.set(W / 2, 0, L / 2);
    floor.name = 'floor';
    roomGroup.add(floor);
    const grid = [];
    for (let x = 0.5; x < W - 0.001; x += 0.5) grid.push(x, 0.001, 0, x, 0.001, L);
    for (let z = 0.5; z < L - 0.001; z += 0.5) grid.push(0, 0.001, z, W, 0.001, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    roomGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a4a7a, transparent: true, opacity: 0.6 })));
    // low wall outline
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8090c0, roughness: 0.7 });
    const t = 0.04;
    const h = 0.08;
    for (const [w, d, x, z] of [
      [W + 2 * t, t, W / 2, -t / 2],
      [W + 2 * t, t, W / 2, L + t / 2],
      [t, L, -t / 2, L / 2],
      [t, L, W + t / 2, L / 2],
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, h / 2, z);
      roomGroup.add(wall);
    }
    // full-height "dollhouse" walls for wall items: single-sided and facing
    // inwards, so the walls nearest the camera are see-through
    const tall = new THREE.MeshStandardMaterial({ color: 0x2a3560, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.FrontSide });
    for (const [w, x, z, ry] of [
      [W, W / 2, 0, 0],
      [W, W / 2, L, Math.PI],
      [L, 0, L / 2, Math.PI / 2],
      [L, W, L / 2, -Math.PI / 2],
    ]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, WALL_HEIGHT), tall);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wall.rotation.y = ry;
      wall.name = 'wall';
      roomGroup.add(wall);
    }
    scene.add(roomGroup);
  }

  function resetCamera() {
    const span = Math.max(W, L);
    camera.position.set(W / 2 + span * 0.55, span * 0.95, L + span * 0.75);
    controls.target.set(W / 2, 0, L / 2);
    controls.update();
  }

  function resize() {
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  buildRoom();
  resize();
  resetCamera();

  // ---------------------------------------------------------- objects

  async function ensurePivot(obj) {
    if (pivots.has(obj.instanceId) || loading.has(obj.instanceId)) return;
    const product = getProduct(obj.productId);
    loading.add(obj.instanceId);
    onChange?.();
    try {
      const pivot = await assets.instantiate(product);
      loading.delete(obj.instanceId);
      if (!manager.get(obj.instanceId) || signal.aborted) return assets.release(pivot);
      pivots.set(obj.instanceId, pivot);
      scene.add(pivot);
      sync(obj.instanceId);
    } catch (err) {
      console.error(err);
      loading.delete(obj.instanceId);
      manager.remove(obj.instanceId);
      onError?.(`Couldn't load ${product?.name ?? 'that model'}. The rest of the room is unchanged.`);
    }
    onChange?.();
  }

  function sync(id) {
    const o = manager.get(id);
    const p = pivots.get(id);
    if (!o || !p) return;
    applyTransform(p, o);
    p.userData.ring.visible = id === manager.selectedId;
  }

  const releaseIds = (ids) => {
    for (const id of ids) {
      const p = pivots.get(id);
      if (p) assets.release(p);
      pivots.delete(id);
    }
  };
  manager.onChange((e) => {
    if (e.type === 'add') ensurePivot(manager.get(e.id));
    if (e.type === 'remove' || e.type === 'clear') releaseIds(e.ids ?? [e.id]);
    if (e.type === 'restore') {
      releaseIds(e.removed);
      e.added.forEach((id) => ensurePivot(manager.get(id)));
    }
    pivots.forEach((_, id) => sync(id));
    onChange?.();
  });

  /**
   * The nearest wall to a floor point, and where a wall item on it sits:
   * position on the wall plane at height y, yaw facing into the room.
   */
  function wallPose(x, z, y) {
    const opts = [
      { d: z, pos: { x, z: 0 }, yaw: 0 }, // back wall, faces +Z
      { d: L - z, pos: { x, z: L }, yaw: Math.PI }, // front wall
      { d: x, pos: { x: 0, z }, yaw: Math.PI / 2 }, // left wall, faces +X
      { d: W - x, pos: { x: W, z }, yaw: -Math.PI / 2 }, // right wall
    ].sort((a, b) => a.d - b.d)[0];
    const along = (v, max) => Math.min(max - 0.2, Math.max(0.2, v));
    const pos = opts.pos.z === 0 || opts.pos.z === L ? { x: along(opts.pos.x, W), z: opts.pos.z } : { x: opts.pos.x, z: along(opts.pos.z, L) };
    return { position: { x: pos.x, y: Math.min(WALL_HEIGHT - 0.2, Math.max(0.3, y)), z: pos.z }, rotationY: opts.yaw };
  }

  /** Spread wall items along the back wall. */
  function freeWallSpot() {
    const n = manager.list().filter((o) => o.surface === 'wall').length;
    const x = W / 2 + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.8;
    return Math.min(W - 0.3, Math.max(0.3, x));
  }

  /** Spread new items around the room centre so they don't all stack. */
  function freeSpot() {
    const n = manager.count;
    const a = n * 2.4;
    const r = n ? Math.min(Math.min(W, L) * 0.35, 0.45 + 0.25 * Math.sqrt(n)) : 0;
    return { x: Math.min(W - 0.3, Math.max(0.3, W / 2 + Math.cos(a) * r)), y: 0, z: Math.min(L - 0.3, Math.max(0.3, L / 2 + Math.sin(a) * r)) };
  }

  function add(productId, opts = {}) {
    const product = getProduct(productId);
    const surface = surfaceOf(product);
    const state = opts.locked ? 'locked' : 'placed';
    if (surface === 'wall') {
      const p = opts.position;
      const pose = p ? wallPose(p.x, p.z, p.y || product.wallHeight || 1.5) : wallPose(freeWallSpot(), 0, product.wallHeight || 1.5);
      return manager.add(productId, { ...pose, scale: opts.scale ?? 1, state, surface });
    }
    return manager.add(productId, { position: opts.position ?? freeSpot(), rotationY: opts.rotationY ?? 0, scale: opts.scale ?? 1, state, surface });
  }

  // ---------------------------------------------------- pointer: select + drag

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPt = new THREE.Vector3();
  let drag = null;
  let downAt = null;

  function setRay(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  function pickAt(e) {
    setRay(e);
    const hits = raycaster.intersectObjects([...pivots.values()], true).filter(
      (h) => h.object.name !== 'selection-ring' && h.object.name !== 'contact-shadow',
    );
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o) {
      for (const [id, p] of pivots) if (p === o) return id;
      o = o.parent;
    }
    return null;
  }

  const el = renderer.domElement;
  el.addEventListener(
    'pointerdown',
    (e) => {
      downAt = { x: e.clientX, y: e.clientY };
      const id = pickAt(e);
      if (!id) return;
      manager.select(id);
      const o = manager.get(id);
      if (o.state === 'locked') return; // locked: select only
      setRay(e);
      if (raycaster.ray.intersectPlane(floorPlane, hitPt)) {
        drag = { id, dx: o.position.x - hitPt.x, dz: o.position.z - hitPt.z, pointerId: e.pointerId, recorded: false };
        controls.enabled = false;
        el.setPointerCapture(e.pointerId);
      }
    },
    { signal },
  );
  el.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      setRay(e);
      if (!raycaster.ray.intersectPlane(floorPlane, hitPt)) return;
      if (!drag.recorded) {
        manager.checkpoint(); // one undo step per drag
        drag.recorded = true;
      }
      const o = manager.get(drag.id);
      const x = Math.min(W, Math.max(0, hitPt.x + drag.dx));
      const z = Math.min(L, Math.max(0, hitPt.z + drag.dz));
      if (o?.surface === 'wall') {
        // wall items slide along the nearest wall, keeping their height
        const pose = wallPose(hitPt.x, hitPt.z, o.position.y);
        manager.setPosition(drag.id, pose.position, { rotationY: pose.rotationY });
      } else {
        manager.setPosition(drag.id, { x, y: 0, z });
      }
    },
    { signal },
  );
  const end = (e) => {
    if (drag) {
      drag = null;
      controls.enabled = true;
    } else if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4 && !pickAt(e)) {
      manager.select(null); // plain click on empty floor deselects
    }
    downAt = null;
  };
  el.addEventListener('pointerup', end, { signal });
  el.addEventListener('pointercancel', end, { signal });

  // --------------------------------------------------------------- loop

  let running = true;
  renderer.setAnimationLoop(() => {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
  });

  function dispose() {
    renderer.setAnimationLoop(null);
    ro.disconnect();
    controls.dispose();
    pivots.forEach((p) => assets.release(p));
    pivots.clear();
    assets.dispose();
    roomGroup?.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
  signal.addEventListener('abort', dispose);

  return {
    manager,
    add,
    isLoading: (id) => loading.has(id),
    loadedCount: () => pivots.size,
    resetCamera,
    /** Pause rendering (e.g. while a WebXR session owns the GPU). */
    pause: () => (running = false),
    resume: () => (running = true),
    setRoom(width, length) {
      W = width;
      L = length;
      buildRoom();
      resetCamera();
      manager.list().forEach((o) => {
        if (o.surface === 'wall' || o.position.x > W || o.position.z > L) {
          const wasLocked = o.state === 'locked';
          if (wasLocked) manager.unlock(o.instanceId);
          if (o.surface === 'wall') {
            const pose = wallPose(Math.min(W, o.position.x), Math.min(L, o.position.z), o.position.y);
            manager.setPosition(o.instanceId, pose.position, { rotationY: pose.rotationY });
          } else manager.setPosition(o.instanceId, { x: Math.min(W, o.position.x), y: 0, z: Math.min(L, o.position.z) });
          if (wasLocked) manager.lock(o.instanceId);
        }
      });
    },
    wallPose,
    get room() {
      return { width: W, length: L };
    },
    worldPosition(id) {
      const p = pivots.get(id);
      return p ? { x: +p.position.x.toFixed(3), y: +p.position.y.toFixed(3), z: +p.position.z.toFixed(3) } : null;
    },
    /** Screen position of an object (for tests and tooltips). */
    screenPosition(id) {
      const p = pivots.get(id);
      if (!p) return null;
      const v = p.position.clone().setY(0.15).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
  };
}
