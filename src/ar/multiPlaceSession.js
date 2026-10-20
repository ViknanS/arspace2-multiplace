/**
 * ARSpace MultiPlace — several furniture objects in ONE WebXR immersive-ar
 * session, each with its own transform and lock state.
 *
 * ARPlacementManager role (this file):
 *  - one XR session (xrCore) and one three.js scene for everything
 *  - the reticle from real hit tests; only the single "follower" object
 *    (a new preview, or an object being moved) tracks it
 *  - locked objects get their own XRAnchor where the runtime grants anchors,
 *    otherwise they keep a fixed transform in the tracked reference space
 *  - nothing is ever parented to the camera
 * PlacedObjectManager (objectManager.js) owns the per-object data;
 * ModelAssetManager (modelAssets.js) loads and clones models;
 * the picker and objects panel come from ui.js.
 */
import { THREE, describeXRError, startXRSession } from './xrCore.js';
import { createObjectManager } from '../multiplace/objectManager.js';
import { applyTransform, createAssetManager } from '../multiplace/modelAssets.js';
import { objectRowsHTML, renderPicker } from '../multiplace/ui.js';
import { toArrangement } from '../multiplace/arrangement.js';
import { getProduct } from '../data/products.js';
import { icon } from '../utils/icons.js';

const ROTATE_STEP = Math.PI / 12; // 15°
const SCALE_STEP = 0.1;
const PERF_HINT_AT = 10;

/**
 * Start MultiPlace AR. Call from a click handler.
 * @param {{ initialProductId?: string, onEnd?: (arrangement) => void, onError?: (msg) => void }} opts
 */
export async function startMultiPlace({ initialProductId, onEnd, onError } = {}) {
  const manager = createObjectManager();
  const assets = createAssetManager();
  const pivots = new Map(); // instanceId -> THREE.Group
  const anchors = new Map(); // instanceId -> XRAnchor
  const pendingAnchor = new Set(); // instanceIds to anchor on the next frame
  const loading = new Set();
  let handle = null;
  let hitPos = null;
  let tracking = true;
  let flash = '';
  let flashTimer;
  let clearArmed = false;
  let panelOpen = false;
  const ui = buildOverlay();
  document.body.append(ui.root);

  // ------------------------------------------------------------ scene sync

  async function ensurePivot(obj) {
    if (pivots.has(obj.instanceId) || loading.has(obj.instanceId)) return;
    const product = getProduct(obj.productId);
    loading.add(obj.instanceId);
    render();
    try {
      const pivot = await assets.instantiate(product);
      loading.delete(obj.instanceId);
      if (!manager.get(obj.instanceId) || handle?.ended) {
        assets.release(pivot); // removed while loading
        return;
      }
      pivot.matrixAutoUpdate = true;
      pivots.set(obj.instanceId, pivot);
      handle.scene.add(pivot);
      syncPivot(obj.instanceId);
    } catch (err) {
      console.error(err);
      loading.delete(obj.instanceId);
      manager.remove(obj.instanceId); // a failed model never affects the other objects
      say(`Couldn't load ${product?.name ?? 'that model'}. Other objects are unaffected.`);
    }
    render();
  }

  function syncPivot(id) {
    const obj = manager.get(id);
    const pivot = pivots.get(id);
    if (!obj || !pivot) return;
    applyTransform(pivot, obj);
    // a preview/moving object is shown only where there is a surface under it
    pivot.visible = obj.state === 'preview' || obj.state === 'moving' ? Boolean(hitPos) : true;
    pivot.userData.ring.visible = id === manager.selectedId;
  }

  function dropPivot(id) {
    const pivot = pivots.get(id);
    if (pivot) assets.release(pivot);
    pivots.delete(id);
    releaseAnchor(id);
  }

  function releaseAnchor(id) {
    const a = anchors.get(id);
    if (a) {
      try {
        a.delete();
      } catch {
        /* already gone */
      }
    }
    anchors.delete(id);
    pendingAnchor.delete(id);
  }

  manager.onChange((e) => {
    if (e.type === 'remove') dropPivot(e.id);
    if (e.type === 'clear') e.ids.forEach(dropPivot);
    if (e.type === 'add') ensurePivot(manager.get(e.id));
    if (e.type === 'update') {
      const o = manager.get(e.id);
      if (o?.state !== 'locked') releaseAnchor(e.id); // unlock / move releases its anchor
    }
    pivots.forEach((_, id) => syncPivot(id));
    render();
  });

  // ---------------------------------------------------------------- actions

  function pick(productId) {
    manager.add(productId, { position: hitPos ?? { x: 0, y: 0, z: -1.5 } });
    if (hitPos) manager.follow(hitPos);
  }

  function placeFollower() {
    const f = manager.follower();
    if (!f || !hitPos || !pivots.has(f.instanceId)) return false;
    manager.place(f.instanceId, hitPos);
    return true;
  }

  function lockSelected() {
    const o = manager.selected();
    if (!o) return;
    if (manager.lock(o.instanceId) && handle.features.anchors) pendingAnchor.add(o.instanceId);
  }

  function say(text) {
    flash = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = '';
      render();
    }, 3000);
    render();
  }

  // ------------------------------------------------------------------- UI

  function statusText() {
    if (flash) return flash;
    if (!tracking) return 'Tracking limited. Move slowly and point at a well-lit, textured area.';
    const f = manager.follower();
    const sel = manager.selected();
    if (f) {
      if (loading.has(f.instanceId)) return `Loading ${getProduct(f.productId)?.name}…`;
      if (!hitPos) return 'Move your phone to scan the floor.';
      return f.state === 'moving' ? 'Ready to Place. Aim at the new spot and tap Place.' : 'Surface Found. Ready to Place.';
    }
    if (sel?.state === 'placed') return 'Object Placed — Lock Position.';
    if (sel?.state === 'locked') return 'Locked. Pick another item below to add more.';
    if (!manager.count) return hitPos ? 'Surface Found. Pick an object below.' : 'Move your phone to scan the floor.';
    return 'Pick an object below, or tap an object to select it.';
  }

  function render() {
    if (!ui.root.isConnected) return;
    const sel = manager.selected();
    const f = manager.follower();
    const n = manager.count;
    ui.status.textContent = statusText();
    ui.status.dataset.tone = !tracking ? 'warn' : sel?.state === 'locked' ? 'ok' : hitPos ? 'ok' : '';
    ui.count.textContent = `Objects (${n})`;
    ui.perf.hidden = n < PERF_HINT_AT;
    ui.anchorMode.textContent = handle?.features.anchors ? 'Locks use WebXR anchors' : 'Locks use tracked session space';

    ui.selName.textContent = sel ? `${getProduct(sel.productId)?.name ?? sel.productId} · ${sel.instanceId}` : 'Nothing selected';
    const st = sel?.state;
    const show = (el, v) => (el.hidden = !v);
    show(ui.btn.place, f && f === sel);
    ui.btn.place.disabled = !hitPos || !f || !pivots.has(f.instanceId);
    show(ui.btn.lock, st === 'placed');
    show(ui.btn.unlock, st === 'locked');
    show(ui.btn.move, st === 'placed');
    show(ui.btn.cancel, st === 'moving' || st === 'preview');
    const editable = sel && st !== 'locked';
    [ui.btn.rotL, ui.btn.rotR, ui.btn.smaller, ui.btn.bigger, ui.btn.reset].forEach((b) => (b.disabled = !editable));
    ui.btn.remove.disabled = !sel;
    ui.scale.textContent = sel ? `${Math.round(sel.scale * 100)}%` : '–';

    ui.panel.hidden = !panelOpen;
    if (panelOpen) {
      ui.list.innerHTML = objectRowsHTML(manager);
      ui.clear.textContent = clearArmed ? 'Tap again to clear every object' : 'Clear entire room';
      ui.clear.classList.toggle('is-armed', clearArmed);
      ui.clear.disabled = n === 0;
    }
    ui.count.setAttribute('aria-expanded', String(panelOpen));
  }

  const picker = renderPicker(ui.pickerRoot, { onPick: (id) => pick(id) });

  ui.btn.place.addEventListener('click', placeFollower);
  ui.btn.lock.addEventListener('click', lockSelected);
  ui.btn.unlock.addEventListener('click', () => manager.unlock(manager.selectedId));
  ui.btn.move.addEventListener('click', () => {
    manager.move(manager.selectedId);
    if (hitPos) manager.follow(hitPos);
  });
  ui.btn.cancel.addEventListener('click', () => manager.cancel());
  ui.btn.rotL.addEventListener('click', () => manager.rotate(manager.selectedId, ROTATE_STEP));
  ui.btn.rotR.addEventListener('click', () => manager.rotate(manager.selectedId, -ROTATE_STEP));
  ui.btn.smaller.addEventListener('click', () => manager.setScale(manager.selectedId, (manager.selected()?.scale ?? 1) - SCALE_STEP));
  ui.btn.bigger.addEventListener('click', () => manager.setScale(manager.selectedId, (manager.selected()?.scale ?? 1) + SCALE_STEP));
  ui.btn.reset.addEventListener('click', () => manager.resetObject(manager.selectedId));
  ui.btn.remove.addEventListener('click', () => manager.remove(manager.selectedId));
  ui.btn.exit.addEventListener('click', () => handle?.end());
  ui.count.addEventListener('click', () => {
    panelOpen = !panelOpen;
    clearArmed = false;
    render();
  });
  ui.clear.addEventListener('click', () => {
    // two-tap confirmation: browser dialogs are not shown inside immersive AR
    if (!clearArmed) {
      clearArmed = true;
      render();
      setTimeout(() => {
        clearArmed = false;
        render();
      }, 4000);
      return;
    }
    clearArmed = false;
    manager.clear();
  });
  ui.list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'select') manager.select(id);
    if (b.dataset.act === 'lock') {
      manager.select(id);
      lockSelected();
    }
    if (b.dataset.act === 'unlock') manager.unlock(id);
    if (b.dataset.act === 'remove') manager.remove(id);
  });

  // ------------------------------------------------------------ frame loop

  const raycaster = new THREE.Raycaster();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  let lastHitPresent = false;

  function onFrame({ frame, refSpace, tracking: t, hitMatrix }) {
    const trackingChanged = t !== tracking;
    tracking = t;
    hitPos = hitMatrix ? tmpV.setFromMatrixPosition(hitMatrix).clone() : null;
    const f = manager.follower();
    if (f && hitPos) manager.follow(hitPos);

    // create anchors for objects locked since the last frame
    if (pendingAnchor.size && typeof frame.createAnchor === 'function' && typeof XRRigidTransform !== 'undefined') {
      for (const id of [...pendingAnchor]) {
        pendingAnchor.delete(id);
        const o = manager.get(id);
        if (!o || o.state !== 'locked') continue;
        tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rotationY);
        frame
          .createAnchor(new XRRigidTransform({ ...o.position, w: 1 }, { x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }), refSpace)
          .then((a) => {
            if (manager.get(id)?.state === 'locked' && !handle.ended) anchors.set(id, a);
            else a.delete?.();
            render();
          })
          .catch(() => {
            /* runtime refused: keep the session-space lock */
          });
      }
    }
    // locked objects with anchors follow their anchor's tracked pose
    for (const [id, a] of anchors) {
      const pose = frame.getPose(a.anchorSpace, refSpace);
      if (pose) {
        const p = pose.transform.position;
        manager.applyAnchorPose(id, { x: p.x, y: p.y, z: p.z });
      }
    }
    pivots.forEach((_, id) => syncPivot(id));
    if (trackingChanged || Boolean(hitPos) !== lastHitPresent) render();
    lastHitPresent = Boolean(hitPos);
  }

  function onSelect(event) {
    // A screen tap (not on an overlay button). Tap an object to select it;
    // otherwise place whatever is following the reticle.
    const frame = event?.frame;
    const refSpace = handle.renderer.xr.getReferenceSpace();
    const src = event?.inputSource;
    if (frame && src && refSpace) {
      const pose = frame.getPose(src.targetRaySpace, refSpace);
      if (pose) {
        const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
        raycaster.ray.origin.setFromMatrixPosition(m);
        raycaster.ray.direction.set(0, 0, -1).transformDirection(m);
        const hits = raycaster.intersectObjects([...pivots.values()].filter((p) => p.visible), true);
        const hit = hits.find((h) => h.object.name !== 'selection-ring' && h.object.name !== 'contact-shadow');
        if (hit) {
          let o = hit.object;
          while (o && !pivots.has(findId(o))) o = o.parent;
          const id = o && findId(o);
          const f = manager.follower();
          if (id && (!f || f.instanceId !== id)) {
            manager.select(id);
            return;
          }
        }
      }
    }
    if (placeFollower()) return;
    if (!handle.features.domOverlay) {
      // no on-screen buttons: tap cycles place → lock → add another of the same
      if (manager.follower()) {
        say('No surface yet. Move your phone slowly over the floor, then tap.');
        return;
      }
      const sel = manager.selected();
      if (sel?.state === 'placed') lockSelected();
      else if (initialProductId) pick(initialProductId);
    }
  }

  function findId(obj) {
    for (const [id, p] of pivots) if (p === obj) return id;
    return null;
  }

  // ---------------------------------------------------------------- start

  ui.root.hidden = false;
  try {
    handle = await startXRSession({
      overlayRoot: ui.root,
      onFrame,
      onSelect,
      onEnd: () => {
        clearTimeout(flashTimer);
        anchors.forEach((a) => {
          try {
            a.delete();
          } catch {
            /* ignore */
          }
        });
        anchors.clear();
        const arrangement = toArrangement(manager.list(), { source: 'ar' });
        pivots.forEach((p) => assets.release(p));
        pivots.clear();
        assets.dispose();
        ui.root.remove();
        onEnd?.(arrangement);
      },
    });
  } catch (err) {
    ui.root.remove();
    assets.dispose();
    onError?.(describeXRError(err));
    return null;
  }
  ui.noOverlay.hidden = handle.features.domOverlay;
  if (window.__ARSPACE_TEST_HOOKS__) {
    window.__ARSPACE_TEST_HOOKS__.multi = {
      manager,
      anchorCount: () => anchors.size,
      worldPosition: (id) => {
        const p = pivots.get(id);
        if (!p) return null;
        const v = new THREE.Vector3().setFromMatrixPosition(p.matrixWorld);
        return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
      },
      loaded: (id) => pivots.has(id),
      handle,
    };
  }
  if (initialProductId) {
    picker.setSelected(initialProductId);
    pick(initialProductId);
  }
  render();
  return handle;
}

function buildOverlay() {
  const root = document.createElement('div');
  root.className = 'xr-overlay mp-overlay';
  root.hidden = true;
  root.innerHTML = `
    <div class="mp-top">
      <div class="mp-top__row">
        <span class="mp-brand"><span class="brand__mark" aria-hidden="true"></span>MultiPlace</span>
        <button type="button" class="xr-btn xr-btn--ghost mp-count" data-count aria-expanded="false">Objects (0)</button>
        <button type="button" class="xr-btn xr-btn--ghost mp-exit" data-exit aria-label="Exit AR">${icon('x', 18)}</button>
      </div>
      <p class="xr-status" role="status" aria-live="polite" data-status>Starting AR…</p>
      <p class="xr-mode" data-anchor-mode></p>
      <p class="xr-note" data-perf hidden>Many objects placed. Some phones may slow down; remove a few if the view stutters.</p>
      <p class="xr-note" data-nooverlay hidden>Tap to place, tap again to lock, tap once more to add another.</p>
      <div class="mp-panel" data-panel hidden>
        <ul class="mp-list" data-list></ul>
        <button type="button" class="xr-btn xr-btn--ghost mp-clear" data-clear>Clear entire room</button>
      </div>
    </div>
    <div class="mp-bottom">
      <div class="mp-card">
        <p class="mp-sel" data-selname>Nothing selected</p>
        <div class="mp-actions">
          <button type="button" class="xr-btn xr-btn--primary" data-place hidden>${icon('scan', 18)} Place</button>
          <button type="button" class="xr-btn xr-btn--primary" data-lock hidden>Lock Position</button>
          <button type="button" class="xr-btn" data-unlock hidden>Unlock</button>
          <button type="button" class="xr-btn" data-move hidden>Move</button>
          <button type="button" class="xr-btn xr-btn--ghost" data-cancel hidden>Cancel</button>
          <button type="button" class="xr-btn xr-btn--ghost" data-remove>${icon('x', 16)} Remove</button>
        </div>
        <div class="mp-actions mp-actions--small">
          <button type="button" class="xr-btn xr-btn--icon" data-rotl aria-label="Rotate left 15 degrees">${icon('rotateLeft', 18)}</button>
          <button type="button" class="xr-btn xr-btn--icon" data-rotr aria-label="Rotate right 15 degrees">${icon('rotateRight', 18)}</button>
          <button type="button" class="xr-btn xr-btn--icon" data-smaller aria-label="Smaller">−</button>
          <span class="mp-scale" data-scale aria-label="Size">–</span>
          <button type="button" class="xr-btn xr-btn--icon" data-bigger aria-label="Bigger">+</button>
          <button type="button" class="xr-btn xr-btn--ghost" data-reset>True size</button>
        </div>
      </div>
      <div data-picker></div>
    </div>`;
  const q = (s) => root.querySelector(s);
  return {
    root,
    status: q('[data-status]'),
    anchorMode: q('[data-anchor-mode]'),
    perf: q('[data-perf]'),
    noOverlay: q('[data-nooverlay]'),
    count: q('[data-count]'),
    panel: q('[data-panel]'),
    list: q('[data-list]'),
    clear: q('[data-clear]'),
    selName: q('[data-selname]'),
    scale: q('[data-scale]'),
    pickerRoot: q('[data-picker]'),
    btn: {
      place: q('[data-place]'),
      lock: q('[data-lock]'),
      unlock: q('[data-unlock]'),
      move: q('[data-move]'),
      cancel: q('[data-cancel]'),
      remove: q('[data-remove]'),
      rotL: q('[data-rotl]'),
      rotR: q('[data-rotr]'),
      smaller: q('[data-smaller]'),
      bigger: q('[data-bigger]'),
      reset: q('[data-reset]'),
      exit: q('[data-exit]'),
    },
  };
}
