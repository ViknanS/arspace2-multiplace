/**
 * Shared WebXR immersive-ar session for ARSpace's custom AR tools
 * (Fix Position and AutoGrid corner capture).
 *
 * Responsibilities
 *  - start exactly one immersive-ar session at a time
 *  - set up a three.js renderer in XR mode, lights, and a hit-test reticle
 *  - run the frame loop: viewer pose → tracking state, hit test → reticle
 *  - expose the DOM Overlay root when the browser grants it
 *  - clean up everything (renderer, GPU resources, hit-test source,
 *    listeners, anchors held by callers) when the session ends
 *
 * All poses are in the session's reference space ('local-floor' when the
 * browser provides it, otherwise 'local'): metres, Y up, gravity aligned.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let active = null; // the one running session handle

export function xrSessionActive() {
  return Boolean(active);
}

/** Map a requestSession() rejection to a clear message. */
export function describeXRError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'AR was blocked. Allow camera access for this site in your browser settings, then try again.';
  }
  if (name === 'NotSupportedError') {
    return 'This browser can start AR but not with surface detection (WebXR hit testing), which these controls need.';
  }
  if (name === 'SetupError') {
    return 'AR started, but the 3D view could not be set up on this device. Use View in my room instead.';
  }
  if (name === 'InvalidStateError') {
    return 'Another AR session is already running. Close it and try again.';
  }
  return `AR could not start${err?.message ? `: ${err.message}` : '.'}`;
}

/**
 * Start a session. Must be called from a user gesture (button click).
 * @param {object} opts
 * @param {HTMLElement} opts.overlayRoot   element shown over the camera (DOM Overlay)
 * @param {(f: FrameInfo) => void} opts.onFrame
 * @param {() => void} [opts.onSelect]     screen tap that was not on an overlay button
 * @param {() => void} [opts.onEnd]
 */
export async function startXRSession({ overlayRoot, onFrame, onSelect, onEnd }) {
  if (active) throw Object.assign(new Error('An AR session is already running.'), { name: 'InvalidStateError' });
  if (!navigator.xr) throw Object.assign(new Error('WebXR is not available.'), { name: 'NotSupportedError' });

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'anchors', 'local-floor'],
    domOverlay: overlayRoot ? { root: overlayRoot } : undefined,
  });

  const handle = { session, ended: false };
  active = handle;
  let renderer = null;

  try {
    // Pick the best reference space the runtime grants.
    let refType = 'local';
    try {
      await session.requestReferenceSpace('local-floor');
      refType = 'local-floor';
    } catch {
      /* local-floor not granted; 'local' is always available in immersive sessions */
    }

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType(refType);
    renderer.domElement.className = 'xr-canvas';
    document.body.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1, 3, 2);
    scene.add(sun);

    // Placement reticle: a flat ring that sits on the detected surface.
    const reticle = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.115, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6c8cff, transparent: true, opacity: 0.95, depthTest: false }),
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.02, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
    );
    ring.renderOrder = dot.renderOrder = 10;
    reticle.add(ring, dot);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    await renderer.xr.setSession(session);

    const viewerSpace = await session.requestReferenceSpace('viewer');
    const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

    const domOverlay = Boolean(session.domOverlayState && session.domOverlayState.type);
    const features = {
      domOverlay,
      // anchors are optional; createAnchor exists only when the runtime granted them
      anchors: Array.isArray(session.enabledFeatures)
        ? session.enabledFeatures.includes('anchors')
        : typeof XRFrame !== 'undefined' && 'createAnchor' in XRFrame.prototype,
      referenceSpace: refType,
    };

    Object.assign(handle, { renderer, scene, camera, reticle, hitTestSource, features });

    const tmp = new THREE.Vector3();
    renderer.setAnimationLoop((time, frame) => {
      if (!frame || handle.ended) return;
      const refSpace = renderer.xr.getReferenceSpace();
      const viewerPose = frame.getViewerPose(refSpace);
      const tracking = Boolean(viewerPose) && !viewerPose.emulatedPosition;
      let hit = null;
      let hitMatrix = null;
      if (tracking) {
        const results = frame.getHitTestResults(hitTestSource);
        if (results.length) {
          const pose = results[0].getPose(refSpace);
          if (pose) {
            hit = results[0];
            hitMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
          }
        }
      }
      reticle.visible = Boolean(hitMatrix) && handle.showReticle !== false;
      if (hitMatrix) reticle.matrix.copy(hitMatrix);
      const camPos = viewerPose
        ? tmp.set(viewerPose.transform.position.x, viewerPose.transform.position.y, viewerPose.transform.position.z).clone()
        : null;
      try {
        onFrame?.({ time, frame, refSpace, tracking, hit, hitMatrix, cameraPosition: camPos, handle });
      } catch (err) {
        console.error(err);
      }
      renderer.render(scene, camera);
    });

    // Taps on overlay buttons must not also count as a scene tap.
    const stopSelect = (e) => e.preventDefault();
    overlayRoot?.addEventListener('beforexrselect', stopSelect);

    const onSelectEvt = () => onSelect?.();
    session.addEventListener('select', onSelectEvt);

    session.addEventListener(
      'end',
      () => {
        handle.ended = true;
        renderer.setAnimationLoop(null);
        try {
          hitTestSource.cancel();
        } catch {
          /* already cancelled */
        }
        session.removeEventListener('select', onSelectEvt);
        overlayRoot?.removeEventListener('beforexrselect', stopSelect);
        disposeScene(scene);
        envTex.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        active = null;
        onEnd?.();
      },
      { once: true },
    );

    handle.end = () => {
      if (!handle.ended) session.end().catch(() => {});
    };
    return handle;
  } catch (err) {
    // setup failed after the session started: close it cleanly
    console.error('AR setup failed', err);
    active = null;
    handle.ended = true;
    try {
      renderer?.setAnimationLoop(null);
      renderer?.dispose();
      renderer?.domElement.remove();
      await session.end();
    } catch {
      /* ignore */
    }
    throw Object.assign(new Error(err?.message || 'setup failed'), { name: 'SetupError', cause: err });
  }
}

/** Release geometries, materials and textures held by a scene graph. */
export function disposeScene(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
}

export { THREE };
