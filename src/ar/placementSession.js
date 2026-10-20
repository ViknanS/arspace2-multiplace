/**
 * ARSpace Fix Position — custom WebXR placement with world-locked furniture.
 *
 * Flow: scan floor → Place Object (preview follows the reticle) →
 * Fix Position (object locked to a tracked world pose) → Unlock / Reset / Exit.
 *
 * World locking
 *  - With WebXR Anchors: an XRAnchor is created at the placement hit result and
 *    the object is moved to the anchor's pose every frame, so the runtime can
 *    correct it as its map of the room improves.
 *  - Without anchors: the object keeps a fixed transform in the session's
 *    reference space ('local-floor' or 'local'). That space is tracked by the
 *    device, so the object still stays put as you walk around; it just doesn't
 *    benefit from anchor corrections ("session-local placement").
 *  Either way the object is never positioned relative to the camera once fixed.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { THREE, describeXRError, startXRSession } from './xrCore.js';
import {
  MESSAGES,
  allowedActions,
  followsReticle,
  initialState,
  objectVisible,
  tapAction,
  transition,
} from './placementState.js';
import { escapeHtml, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/**
 * Start Fix Position for a product. Call from a click handler.
 * @param {{ name: string, model: string }} product
 * @param {{ onStateChange?: (ctx) => void }} [hooks] used by tests/telemetry
 */
export async function startFixPosition(product, hooks = {}) {
  const overlay = buildOverlay(product);
  document.body.append(overlay.root);

  let ctx = initialState();
  let handle = null;
  let pivot = null; // object root (model + contact shadow)
  let modelReady = false;
  let yaw = 0; // radians, user rotation about the vertical axis
  let lastHitMatrix = null;
  let lastHit = null;
  let anchor = null;
  let anchorPending = false;
  let lockedMatrix = null; // session-local placement transform
  const placePos = new THREE.Vector3();

  const dispatch = (event) => {
    const next = transition(ctx, event);
    if (next === ctx) return;
    if (next.state === ctx.state) {
      const hitChanged = next.hasHit !== ctx.hasHit;
      ctx = next;
      if (hitChanged) renderOverlay(); // enables/disables Place and Fix
      return;
    }
    const prevState = ctx.state;
    ctx = next;
    onState(prevState);
  };

  function onState(prevState) {
    const s = ctx.state;
    if (s === 'fixed' && prevState !== 'tracking-limited') lockObject();
    if ((s === 'repositioning' || s === 'scanning' || s === 'surface') && prevState !== 'tracking-limited') {
      releaseAnchor();
      lockedMatrix = null;
    }
    if (pivot) pivot.visible = objectVisible(ctx) && modelReady;
    renderOverlay();
    hooks.onStateChange?.(ctx);
  }

  function renderOverlay() {
    const a = allowedActions(ctx);
    let msg = MESSAGES[ctx.state];
    if (!modelReady && ['scanning', 'surface'].includes(ctx.state)) msg += ' Loading the 3D model…';
    overlay.status.textContent = msg;
    overlay.status.dataset.state = ctx.state;
    overlay.mode.textContent =
      ctx.state === 'fixed'
        ? anchor
          ? 'Anchored with WebXR Anchors'
          : anchorPending
            ? 'Creating anchor…'
            : 'Fixed in tracked session space (anchors not available)'
        : '';
    overlay.btn.place.hidden = !(ctx.state === 'surface' || ctx.state === 'scanning');
    overlay.btn.place.disabled = !(a.place && modelReady);
    overlay.btn.fix.hidden = !(ctx.state === 'preview' || ctx.state === 'repositioning');
    overlay.btn.fix.disabled = !a.fix;
    overlay.btn.unlock.hidden = ctx.state !== 'fixed';
    overlay.btn.reset.disabled = !a.reset;
    overlay.btn.rotL.disabled = overlay.btn.rotR.disabled = !a.rotate;
  }

  function lockObject() {
    if (!lastHitMatrix) return;
    placePos.setFromMatrixPosition(lastHitMatrix);
    lockedMatrix = composeAt(placePos, yaw);
    pivot.matrix.copy(lockedMatrix);
    // Try a real spatial anchor; fall back silently to session-local placement.
    if (handle.features.anchors && lastHit && typeof lastHit.createAnchor === 'function') {
      anchorPending = true;
      lastHit
        .createAnchor()
        .then((a) => {
          anchorPending = false;
          if (ctx.state === 'fixed' || ctx.resume === 'fixed') anchor = a;
          else a.delete?.();
          renderOverlay();
        })
        .catch(() => {
          anchorPending = false;
          renderOverlay();
        });
    }
  }

  function releaseAnchor() {
    if (anchor) {
      try {
        anchor.delete();
      } catch {
        /* runtime already released it */
      }
    }
    anchor = null;
    anchorPending = false;
  }

  const anchorPos = new THREE.Vector3();
  function onFrame({ frame, refSpace, tracking, hit, hitMatrix, cameraPosition }) {
    dispatch({ type: tracking ? 'TRACKING_RESTORED' : 'TRACKING_LOST' });
    if (!tracking) return;
    dispatch({ type: 'HIT', found: Boolean(hitMatrix) });
    if (hitMatrix) {
      lastHitMatrix = hitMatrix;
      lastHit = hit;
    }
    if (!pivot) return;

    if (followsReticle(ctx.state) && hitMatrix) {
      placePos.setFromMatrixPosition(hitMatrix);
      pivot.matrix.copy(composeAt(placePos, yaw));
    } else if (ctx.state === 'fixed') {
      if (anchor) {
        const pose = frame.getPose(anchor.anchorSpace, refSpace);
        if (pose) {
          anchorPos.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
          lockedMatrix = composeAt(anchorPos, yaw);
        }
      }
      if (lockedMatrix) pivot.matrix.copy(lockedMatrix);
    }
    // face the user when first placed
    if (ctx.state === 'preview' && !pivot.userData.faced && cameraPosition && hitMatrix) {
      placePos.setFromMatrixPosition(hitMatrix);
      yaw = Math.atan2(cameraPosition.x - placePos.x, cameraPosition.z - placePos.z);
      pivot.userData.faced = true;
    }
  }

  // --- buttons ---------------------------------------------------------
  overlay.btn.place.addEventListener('click', () => {
    if (pivot) pivot.userData.faced = false;
    dispatch({ type: 'PLACE' });
  });
  overlay.btn.fix.addEventListener('click', () => dispatch({ type: 'FIX' }));
  overlay.btn.unlock.addEventListener('click', () => dispatch({ type: 'UNLOCK' }));
  overlay.btn.reset.addEventListener('click', () => {
    yaw = 0;
    dispatch({ type: 'RESET' });
  });
  const rotate = (deg) => {
    yaw += (deg * Math.PI) / 180;
    if (ctx.state === 'fixed' && lockedMatrix) {
      const p = new THREE.Vector3().setFromMatrixPosition(lockedMatrix);
      lockedMatrix = composeAt(p, yaw);
    }
  };
  overlay.btn.rotL.addEventListener('click', () => rotate(45));
  overlay.btn.rotR.addEventListener('click', () => rotate(-45));
  overlay.btn.exit.addEventListener('click', () => handle?.end());

  // --- start -------------------------------------------------------------
  overlay.root.hidden = false;
  try {
    handle = await startXRSession({
      overlayRoot: overlay.root,
      onFrame,
      onSelect: () => {
        // Without DOM Overlay buttons, a tap steps through place → fix → unlock.
        if (handle?.features.domOverlay) return;
        const action = tapAction(ctx);
        if (action === 'PLACE' && !modelReady) return;
        if (action) dispatch({ type: action });
      },
      onEnd: () => {
        releaseAnchor();
        dispatch({ type: 'END' });
        overlay.root.remove();
      },
    });
  } catch (err) {
    overlay.root.remove();
    const msg = describeXRError(err);
    hooks.onStateChange?.({ state: 'error', error: msg });
    toast(msg, 'error', 9000);
    return null;
  }

  overlay.noOverlay.hidden = handle.features.domOverlay;
  // Read-only inspection hook for the automated browser tests (mocked WebXR runtime).
  if (window.__ARSPACE_TEST_HOOKS__) {
    window.__ARSPACE_TEST_HOOKS__.fix = {
      get state() {
        return ctx.state;
      },
      get anchored() {
        return Boolean(anchor);
      },
      objectVisible: () => Boolean(pivot?.visible),
      objectPosition: () => {
        if (!pivot) return null;
        const v = new THREE.Vector3().setFromMatrixPosition(pivot.matrix);
        return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
      },
    };
  }
  dispatch({ type: 'SESSION_STARTED' });

  // Load the model while the user scans.
  try {
    const gltf = await new GLTFLoader().loadAsync(product.model);
    if (handle.ended) return handle;
    pivot = makePivot(gltf.scene);
    pivot.visible = false;
    handle.scene.add(pivot);
    modelReady = true;
    renderOverlay();
  } catch (err) {
    console.error(err);
    toast(`The 3D model for ${product.name} could not be loaded, so AR was closed.`, 'error', 8000);
    dispatch({ type: 'ERROR' });
    handle.end();
  }
  return handle;
}

/** Wrap a glTF scene so its base sits on y = 0, centred on x/z (floor-aligned origin). */
function makePivot(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  const pivot = new THREE.Group();
  pivot.add(model);
  // soft contact shadow so the object reads as standing on the floor
  const r = Math.max(size.x, size.z) * 0.62;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.position.y = 0.002;
  pivot.add(shadow);
  pivot.matrixAutoUpdate = false;
  pivot.userData.size = size;
  return pivot;
}

function composeAt(position, yaw) {
  return new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(1, 1, 1), // true real-world scale from the model file
  );
}

function buildOverlay(product) {
  const root = document.createElement('div');
  root.className = 'xr-overlay';
  root.hidden = true;
  root.innerHTML = `
    <div class="xr-top">
      <p class="xr-title">${escapeHtml(product.name)}</p>
      <p class="xr-status" role="status" aria-live="polite" data-status>Starting AR…</p>
      <p class="xr-mode" data-mode></p>
      <p class="xr-note" data-nooverlay hidden>Tap the screen to place, tap again to fix, tap once more to unlock.</p>
    </div>
    <div class="xr-bottom">
      <div class="xr-row">
        <button type="button" class="xr-btn xr-btn--icon" data-rotl aria-label="Rotate left 45 degrees">${icon('rotateLeft', 20)}</button>
        <button type="button" class="xr-btn xr-btn--primary" data-place>${icon('scan', 18)} Place Object</button>
        <button type="button" class="xr-btn xr-btn--primary" data-fix hidden>Fix Position</button>
        <button type="button" class="xr-btn" data-unlock hidden>Unlock Position</button>
        <button type="button" class="xr-btn xr-btn--icon" data-rotr aria-label="Rotate right 45 degrees">${icon('rotateRight', 20)}</button>
      </div>
      <div class="xr-row">
        <button type="button" class="xr-btn xr-btn--ghost" data-reset>${icon('reset', 16)} Reset Placement</button>
        <button type="button" class="xr-btn xr-btn--ghost" data-exit>${icon('x', 16)} Exit AR</button>
      </div>
    </div>`;
  const q = (s) => root.querySelector(s);
  return {
    root,
    status: q('[data-status]'),
    mode: q('[data-mode]'),
    noOverlay: q('[data-nooverlay]'),
    btn: {
      place: q('[data-place]'),
      fix: q('[data-fix]'),
      unlock: q('[data-unlock]'),
      reset: q('[data-reset]'),
      exit: q('[data-exit]'),
      rotL: q('[data-rotl]'),
      rotR: q('[data-rotr]'),
    },
  };
}
