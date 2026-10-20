/**
 * ModelAssetManager — loads each product's GLB once, then hands out safe,
 * independent instances (SkeletonUtils.clone handles skinned meshes; geometry
 * and materials are shared read-only between instances, so N chairs cost one
 * download and one set of GPU buffers).
 *
 * Instances are wrapped in a pivot whose origin is the model's floor centre, so
 * position = the floor point under the object, rotationY spins it in place.
 * Selection highlighting uses a separate ring mesh per instance, never by
 * changing the shared materials.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { surfaceOf } from '../data/products.js';

export function createAssetManager() {
  const loader = new GLTFLoader();
  const cache = new Map(); // url -> Promise<{ scene, size, center, minY }>
  const ringGeo = new Map(); // size key -> RingGeometry (shared)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x6c8cff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

  function load(url) {
    if (!cache.has(url)) {
      const p = loader.loadAsync(url).then((gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        return {
          scene: gltf.scene,
          size: box.getSize(new THREE.Vector3()),
          center: box.getCenter(new THREE.Vector3()),
          minY: box.min.y,
          minZ: box.min.z,
        };
      });
      // a failed load must not poison the cache: allow a retry later
      p.catch(() => cache.delete(url));
      cache.set(url, p);
    }
    return cache.get(url);
  }

  /**
   * New independent instance of a product: a pivot group.
   * Floor items: pivot = floor centre under the object.
   * Wall items: pivot = centre of the object's back, on the wall; the model
   * faces the pivot's +Z, which the placement turns to face out of the wall.
   */
  async function instantiate(product) {
    const asset = await load(product.model);
    const model = skeletonClone(asset.scene);
    const wall = surfaceOf(product) === 'wall';
    if (wall) model.position.set(-asset.center.x, -asset.center.y, -asset.minZ);
    else model.position.set(-asset.center.x, -asset.minY, -asset.center.z);
    const pivot = new THREE.Group();
    pivot.name = product.id;
    pivot.add(model);

    if (wall) {
      // selection outline: a flat ring on the wall around the object, no floor shadow
      const r = Math.max(asset.size.x, asset.size.y) * 0.62;
      const key = `w${r.toFixed(2)}`;
      if (!ringGeo.has(key)) ringGeo.set(key, new THREE.RingGeometry(r * 0.95, r, 48));
      const ring = new THREE.Mesh(ringGeo.get(key), ringMat);
      ring.position.z = 0.004;
      ring.visible = false;
      ring.name = 'selection-ring';
      pivot.add(ring);
      pivot.userData = { productId: product.id, size: asset.size.clone(), ring, ownGeometry: [], surface: 'wall' };
      return pivot;
    }

    const r = Math.max(asset.size.x, asset.size.z) * 0.6;
    const key = r.toFixed(2);
    if (!ringGeo.has(key)) ringGeo.set(key, new THREE.RingGeometry(r * 0.94, r, 48).rotateX(-Math.PI / 2));
    const ring = new THREE.Mesh(ringGeo.get(key), ringMat);
    ring.position.y = 0.004;
    ring.visible = false;
    ring.name = 'selection-ring';
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 40).rotateX(-Math.PI / 2), shadowMat);
    shadow.position.y = 0.002;
    shadow.name = 'contact-shadow';
    pivot.add(ring, shadow);
    pivot.userData = { productId: product.id, size: asset.size.clone(), ring, ownGeometry: [shadow.geometry], surface: 'floor' };
    return pivot;
  }

  /** Release an instance's own resources (shared ones stay cached). */
  function release(pivot) {
    pivot.removeFromParent();
    (pivot.userData.ownGeometry || []).forEach((g) => g.dispose());
  }

  /** Free everything (end of session / page). */
  async function dispose() {
    for (const p of cache.values()) {
      try {
        const a = await p;
        a.scene.traverse((o) => {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          mats.forEach((m) => {
            Object.values(m).forEach((v) => v?.isTexture && v.dispose());
            m.dispose();
          });
        });
      } catch {
        /* failed loads have nothing to free */
      }
    }
    cache.clear();
    ringGeo.forEach((g) => g.dispose());
    ringGeo.clear();
    ringMat.dispose();
    shadowMat.dispose();
  }

  return { load, instantiate, release, dispose };
}

/** Copy manager data (position, rotationY, scale) onto a pivot. */
export function applyTransform(pivot, obj) {
  pivot.position.set(obj.position.x, obj.position.y, obj.position.z);
  pivot.rotation.set(0, obj.rotationY, 0);
  pivot.scale.setScalar(obj.scale);
  pivot.updateMatrixWorld(true);
}
