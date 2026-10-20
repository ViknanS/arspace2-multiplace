/**
 * ARSpace MultiPlace — several furniture objects in ONE WebXR immersive-ar
 * session, each with its own transform and lock state.
 *
 * ARPlacementManager role (this file):
 *  - one XR session (xrCore) and one three.js scene for everything
 *  - the reticle from real hit tests; only the single "follower" object
 *    (a new preview, or an object being moved) tracks it
 *  - floor items follow horizontal hits, wall items follow vertical hits and
 *    turn to face out of the wall (classifyHitMatrix)
 *  - locked objects get their own XRAnchor where the runtime grants anchors,
 *    otherwise they keep a fixed transform in the tracked reference space
 *  - nothing is ever parented to the camera
 * PlacedObjectManager (objectManager.js) owns the per-object data and undo;
 * ModelAssetManager (modelAssets.js) loads and clones models;
 * the furniture carousel and objects panel come from ui.js.
 */
import { THREE, describeXRError, startXRSession } from './xrCore.js';
import { createObjectManager } from '../multiplace/objectManager.js';
import { applyTransform, createAssetManager } from '../multiplace/modelAssets.js';
import { objectRowsHTML, renderPicker } from '../multiplace/ui.js';
import { toArrangement } from '../multiplace/arrangement.js';
import { classifyHitMatrix, suits } from '../multiplace/surface.js';
import { getProduct, surfaceOf } from '../data/products.js';
import { icon } from '../utils/icons.js';

const ROTATE_STEP = Math.PI / 12; // 15°
const SCALE_STEP = 0.1;
const PERF_HINT_AT = 10;
const NO_WALL_HINT_MS = 8000;

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
  let surface = null; // classified hit under the reticle
  let tracking = true;
  let flash = '';
  let flashTimer;
  let clearArmed = false;
  let clearTimer;
  let panelOpen = false;
  let wallSeen = false; // has any vertical surface been detected this session?
  let wallWaitSince = 0; // when a wall item started waiting for a wall
  const ui = buildOverlay();
  document.body.append(ui.root);

  /** The hit, if it suits the object that is following the reticle. */
  const targetFor = (obj) => (obj && suits(surface, obj.surface) ? surface : null);

  // ------------------------------------------------------------ scene sync

  async function ensurePivot(obj) {
    if (!obj || pivots.has(obj.instanceId) || loading.has(obj.instanceId)) return;
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
    // a preview/moving object is shown only where there is a suitable surface under it
    pivot.visible = obj.state === 'preview' || obj.state === 'moving' ? Boolean(targetFor(obj)) : true;
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

  const anchorIfLocked = (id) => {
    if (handle?.features.anchors && manager.get(id)?.state === 'locked' && !anchors.has(id)) pendingAnchor.add(id);
  };

  manager.onChange((e) => {
    if (e.type === 'remove') dropPivot(e.id);
    if (e.type === 'clear') e.ids.forEach(dropPivot);
    if (e.type === 'add') ensurePivot(manager.get(e.id));
    if (e.type === 'update') {
      const o = manager.get(e.id);
      if (o?.state !== 'locked') releaseAnchor(e.id); // unlock / move releases its anchor
    }
    if (e.type === 'restore') {
      // undo: rebuild exactly what changed; re-anchor objects that are locked again
      e.removed.forEach(dropPivot);
      e.changed.forEach((id) => {
        releaseAnchor(id);
        anchorIfLocked(id);
      });
      e.added.forEach((id) => {
        ensurePivot(manager.get(id));
        anchorIfLocked(id);
      });
    }
    pivots.forEach((_, id) => syncPivot(id));
    render();
  });

  // ---------------------------------------------------------------- actions

  function pick(productId) {
    const product = getProduct(productId);
    if (!product) return;
    const kind = surfaceOf(product);
    const hit = surface && suits(surface, kind) ? surface : null;
    manager.add(productId, { position: hit?.position ?? { x: 0, y: 0, z: -1.5 }, rotationY: hit?.yaw ?? 0, surface: kind });
    wallWaitSince = kind === 'wall' ? performance.now() : 0;
    picker.setSelected(productId);
  }

  function placeFollower() {
    const f = manager.follower();
    const hit = targetFor(f);
    if (!f || !hit || !pivots.has(f.instanceId)) return false;
    manager.place(f.instanceId, hit.position, { rotationY: hit.yaw });
    wallWaitSince = 0;
    return true;
  }

  function lockSelected() {
    const o = manager.selected();
    if (!o) return false;
    if (!manager.lock(o.instanceId)) return false;
    anchorIfLocked(o.instanceId);
    return true;
  }

  function placeAndLock() {
    if (placeFollower()) lockSelected();
  }

  function duplicateSelected() {
    const o = manager.selected();
    if (!o) return;
    const size = pivots.get(o.instanceId)?.userData.size;
    const offset = Math.max(0.3, (size ? size.x : 0.4) * o.scale + 0.1);
    const dup = manager.duplicate(o.instanceId, { offset });
    if (dup) say(`Copy added beside it (${dup.instanceId}). Move or lock it.`);
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
      const name = getProduct(f.productId)?.name ?? 'object';
      if (loading.has(f.instanceId)) return `Loading ${name}…`;
      if (f.surface === 'wall') {
        if (targetFor(f)) return f.state === 'moving' ? 'Wall found. Aim at the new spot, then Place & Lock.' : 'Wall Found. Ready to Place.';
        if (surface?.kind === 'floor') return `That's the floor. Aim at a wall to hang the ${name}.`;
        if (!wallSeen && wallWaitSince && performance.now() - wallWaitSince > NO_WALL_HINT_MS) {
          return 'No wall detected yet. Move closer to a plain, well-lit wall. Some phones only detect floors in the browser; if so, wall placement is unsupported here.';
        }
        return 'Point at a wall and move slowly to detect it.';
      }
      if (targetFor(f)) return f.state === 'moving' ? 'Ready to Place. Aim at the new spot, then Place & Lock.' : 'Surface Found. Ready to Place.';
      if (surface?.kind === 'wall') return 'That is a wall. Aim at the floor or a tabletop.';
      return 'Move your phone to scan the floor.';
    }
    if (sel?.state === 'placed') return 'Object Placed — Lock Position.';
    if (sel?.state === 'locked') return 'Locked. Pick another item below to add more.';
    if (!manager.count) return surface ? 'Surface Found. Pick an object below.' : 'Move your phone to scan the floor.';
    return 'Pick an object below, or tap an object to select it.';
  }

  function render() {
    if (!ui.root.isConnected) return;
    const sel = manager.selected();
    const f = manager.follower();
    const n = manager.count;
    const locked = manager.list().filter((o) => o.state === 'locked').length;
    ui.status.textContent = statusText();
    ui.status.dataset.tone = !tracking ? 'warn' : sel?.state === 'locked' || targetFor(f) ? 'ok' : '';
    ui.tracking.textContent = `Tracking: ${tracking ? 'Good' : 'Limited'}`;
    ui.tracking.dataset.tone = tracking ? 'ok' : 'warn';
    ui.placed.textContent = `Objects Placed: ${n - (f?.state === 'preview' ? 1 : 0)}`;
    ui.placed.title = `${locked} locked`;
    ui.count.textContent = `Objects in Room (${n})`;
    ui.perf.hidden = n < PERF_HINT_AT;
    ui.anchorMode.textContent = handle?.features.anchors ? 'Locks use WebXR anchors' : 'Locks use tracked session space';

    const st = sel?.state;
    const name = sel ? getProduct(sel.productId)?.name ?? sel.productId : '';
    ui.selName.innerHTML = sel
      ? `Selected: <strong>${name}</strong> <span>${sel.instanceId} · ${{ preview: 'placing', moving: 'moving', placed: 'placed', locked: 'locked' }[st]}${sel.surface === 'wall' ? ' · wall' : ''}</span>`
      : 'Pick furniture below to add it to the room';
    const show = (el, v) => (el.hidden = !v);
    const following = st === 'preview' || st === 'moving';
    const editable = sel && st !== 'locked';
    const canPlace = Boolean(f && f === sel && targetFor(f) && pivots.has(f.instanceId));
    show(ui.btn.placeLock, following);
    show(ui.btn.place, following);
    ui.btn.placeLock.disabled = ui.btn.place.disabled = !canPlace;
    show(ui.btn.cancel, following);
    show(ui.btn.lock, st === 'placed');
    show(ui.btn.unlock, st === 'locked');
    show(ui.btn.move, st === 'placed');
    show(ui.btn.dup, st === 'placed' || st === 'locked');
    show(ui.btn.remove, Boolean(sel));
    show(ui.edit, editable);
    const wall = sel?.surface === 'wall';
    show(ui.btn.rotL, editable && !wall);
    show(ui.btn.rotR, editable && !wall);
    show(ui.wallNote, editable && wall);
    ui.scale.textContent = sel ? `${Math.round(sel.scale * 100)}%` : '–';
    ui.btn.smaller.disabled = !editable || sel.scale <= 0.5 + 1e-9;
    ui.btn.bigger.disabled = !editable || sel.scale >= 1.5 - 1e-9;
    ui.btn.undo.disabled = !manager.canUndo;

    ui.panel.hidden = !panelOpen;
    if (panelOpen) ui.list.innerHTML = objectRowsHTML(manager);
    ui.clear.textContent = clearArmed ? 'Tap again to clear' : 'Clear Room';
    ui.clear.classList.toggle('is-armed', clearArmed);
    ui.clear.disabled = n === 0;
    ui.count.setAttribute('aria-expanded', String(panelOpen));
  }

  const picker = renderPicker(ui.pickerRoot, { onPick: (id) => pick(id) });

  const on = (el, fn) => el.addEventListener('click', fn);
  on(ui.btn.placeLock, placeAndLock);
  on(ui.btn.place, placeFollower);
  on(ui.btn.lock, lockSelected);
  on(ui.btn.unlock, () => manager.unlock(manager.selectedId));
  on(ui.btn.move, () => {
    const o = manager.selected();
    if (!o) return;
    manager.move(o.instanceId);
    const hit = targetFor(o);
    if (hit) manager.follow(hit.position, { rotationY: hit.yaw });
    wallWaitSince = o.surface === 'wall' ? performance.now() : 0;
  });
  on(ui.btn.cancel, () => manager.cancel());
  on(ui.btn.rotL, () => manager.rotate(manager.selectedId, ROTATE_STEP));
  on(ui.btn.rotR, () => manager.rotate(manager.selectedId, -ROTATE_STEP));
  on(ui.btn.smaller, () => manager.setScale(manager.selectedId, (manager.selected()?.scale ?? 1) - SCALE_STEP));
  on(ui.btn.bigger, () => manager.setScale(manager.selectedId, (manager.selected()?.scale ?? 1) + SCALE_STEP));
  on(ui.btn.reset, () => manager.resetObject(manager.selectedId));
  on(ui.btn.dup, duplicateSelected);
  on(ui.btn.remove, () => manager.remove(manager.selectedId));
  on(ui.btn.undo, () => {
    if (manager.undo()) say('Undone.');
  });
  on(ui.btn.exit, () => handle?.end());
  on(ui.count, () => {
    panelOpen = !panelOpen;
    render();
  });
  on(ui.clear, () => {
    // two-tap confirmation: browser dialogs are not shown inside immersive AR
    clearTimeout(clearTimer);
    if (!clearArmed) {
      clearArmed = true;
      render();
      clearTimer = setTimeout(() => {
        clearArmed = false;
        render();
      }, 4000);
      return;
    }
    clearArmed = false;
    manager.clear();
    say('Room cleared. Undo brings everything back.');
  });
  on(ui.list, (e) => {
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
  const tmpQ = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let lastKey = '';

  function onFrame({ frame, refSpace, tracking: t, hitMatrix }) {
    tracking = t;
    surface = hitMatrix ? classifyHitMatrix(hitMatrix.elements) : null;
    if (surface?.kind === 'wall') wallSeen = true;
    const f = manager.follower();
    const hit = targetFor(f);
    if (hit) manager.follow(hit.position, { rotationY: hit.yaw });

    // create anchors for objects locked since the last frame
    if (pendingAnchor.size && typeof frame.createAnchor === 'function' && typeof XRRigidTransform !== 'undefined') {
      for (const id of [...pendingAnchor]) {
        pendingAnchor.delete(id);
        const o = manager.get(id);
        if (!o || o.state !== 'locked') continue;
        tmpQ.setFromAxisAngle(yAxis, o.rotationY);
        frame
          .createAnchor(new XRRigidTransform({ ...o.position, w: 1 }, { x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }), refSpace)
          .then((a) => {
            if (manager.get(id)?.state === 'locked' && !handle.ended && !anchors.has(id)) anchors.set(id, a);
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
    // re-render the overlay only when what it shows can have changed
    const waited = wallWaitSince && !wallSeen && performance.now() - wallWaitSince > NO_WALL_HINT_MS;
    const key = `${tracking}|${surface?.kind ?? '-'}|${waited}`;
    if (key !== lastKey) render();
    lastKey = key;
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
        say('No suitable surface yet. Move your phone slowly over the floor, then tap.');
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
        clearTimeout(clearTimer);
        anchors.forEach((a) => {
          try {
            a.delete();
          } catch {
            /* ignore */
          }
        });
        anchors.clear();
        pendingAnchor.clear();
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
      worldYaw: (id) => {
        const p = pivots.get(id);
        return p ? +p.rotation.y.toFixed(3) : null;
      },
      loaded: (id) => pivots.has(id),
      surface: () => surface?.kind ?? null,
      handle,
    };
  }
  if (initialProductId) pick(initialProductId);
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
        <span class="mp-brand"><span class="brand__mark" aria-hidden="true"></span>ARSpace MultiPlace</span>
        <button type="button" class="xr-btn xr-btn--ghost mp-exit" data-exit>${icon('x', 16)} Exit AR</button>
      </div>
      <div class="mp-top__row mp-top__row--stats">
        <span class="mp-stat" data-tracking data-tone="ok">Tracking: Good</span>
        <span class="mp-stat" data-placed>Objects Placed: 0</span>
      </div>
      <p class="xr-status" role="status" aria-live="polite" data-status>Starting AR…</p>
      <p class="xr-mode" data-anchor-mode></p>
      <p class="xr-note" data-perf hidden>Many objects placed. Some phones may slow down; remove a few if the view stutters.</p>
      <p class="xr-note" data-nooverlay hidden>Tap to place, tap again to lock, tap once more to add another.</p>
      <div class="mp-panel" data-panel hidden>
        <p class="mp-panel__title">Objects in Room</p>
        <ul class="mp-list" data-list></ul>
      </div>
    </div>
    <div class="mp-bottom">
      <div class="mp-sheet">
        <p class="mp-sel" data-selname>Pick furniture below to add it to the room</p>
        <div class="mp-actions" data-actions>
          <div class="mp-edit" data-edit hidden>
            <button type="button" class="xr-btn xr-btn--icon" data-rotl aria-label="Rotate left 15 degrees">${icon('rotateLeft', 18)}</button>
            <button type="button" class="xr-btn xr-btn--icon" data-rotr aria-label="Rotate right 15 degrees">${icon('rotateRight', 18)}</button>
            <span class="mp-wallnote" data-wallnote hidden>Faces out from the wall</span>
            <span class="mp-resize" role="group" aria-label="Resize">
              <button type="button" class="xr-btn xr-btn--icon" data-smaller aria-label="Smaller">−</button>
              <span class="mp-scale" data-scale aria-live="polite">–</span>
              <button type="button" class="xr-btn xr-btn--icon" data-bigger aria-label="Bigger">+</button>
            </span>
            <button type="button" class="xr-btn xr-btn--ghost" data-reset>True size</button>
          </div>
          <button type="button" class="xr-btn xr-btn--primary" data-placelock hidden>${icon('scan', 18)} Place &amp; Lock</button>
          <button type="button" class="xr-btn" data-place hidden>Place</button>
          <button type="button" class="xr-btn xr-btn--ghost" data-cancel hidden>Cancel</button>
          <button type="button" class="xr-btn xr-btn--primary" data-lock hidden>Lock Position</button>
          <button type="button" class="xr-btn" data-unlock hidden>Unlock</button>
          <button type="button" class="xr-btn" data-move hidden>Move</button>
          <button type="button" class="xr-btn" data-dup hidden>Duplicate</button>
          <button type="button" class="xr-btn xr-btn--ghost mp-danger-btn" data-remove hidden>${icon('x', 16)} Remove</button>
        </div>
        <div data-picker></div>
        <div class="mp-tools">
          <button type="button" class="xr-btn xr-btn--ghost" data-count aria-expanded="false">Objects in Room (0)</button>
          <button type="button" class="xr-btn xr-btn--ghost" data-undo disabled>Undo</button>
          <button type="button" class="xr-btn xr-btn--ghost mp-clear" data-clear disabled>Clear Room</button>
        </div>
      </div>
    </div>`;
  const q = (s) => root.querySelector(s);
  return {
    root,
    status: q('[data-status]'),
    tracking: q('[data-tracking]'),
    placed: q('[data-placed]'),
    anchorMode: q('[data-anchor-mode]'),
    perf: q('[data-perf]'),
    noOverlay: q('[data-nooverlay]'),
    count: q('[data-count]'),
    panel: q('[data-panel]'),
    list: q('[data-list]'),
    clear: q('[data-clear]'),
    selName: q('[data-selname]'),
    scale: q('[data-scale]'),
    edit: q('[data-edit]'),
    wallNote: q('[data-wallnote]'),
    pickerRoot: q('[data-picker]'),
    btn: {
      placeLock: q('[data-placelock]'),
      place: q('[data-place]'),
      lock: q('[data-lock]'),
      unlock: q('[data-unlock]'),
      move: q('[data-move]'),
      cancel: q('[data-cancel]'),
      dup: q('[data-dup]'),
      remove: q('[data-remove]'),
      undo: q('[data-undo]'),
      rotL: q('[data-rotl]'),
      rotR: q('[data-rotr]'),
      smaller: q('[data-smaller]'),
      bigger: q('[data-bigger]'),
      reset: q('[data-reset]'),
      exit: q('[data-exit]'),
    },
  };
}
