/**
 * AutoGrid AR corner capture (WebXR immersive-ar + hit testing).
 *
 * The user aims the reticle at each floor corner and captures it. Every
 * captured point is the real hit-test position in the session's tracked
 * reference space (metres). Markers and edges are drawn in that same world
 * space, so they stay on the floor as the phone moves. Geometry validation
 * and measurement happen afterwards in autogrid/roomGeometry.js.
 */
import { THREE, describeXRError, startXRSession } from './xrCore.js';
import { escapeHtml } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const MIN_SEPARATION = 0.15; // m; closer captures are treated as the same corner

export async function startMeasure({ onFinish, onError, hooks = {} } = {}) {
  const ui = buildOverlay();
  document.body.append(ui.root);

  const corners = []; // { x, y, z } in metres
  let handle = null;
  let hitPoint = null;
  let tracking = true;
  let finished = false;
  let note = '';
  const group = new THREE.Group();
  const markers = [];
  const lineMat = new THREE.LineBasicMaterial({ color: 0x6c8cff });
  const previewMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.05, gapSize: 0.04 });
  let edgeLine = null;
  let previewLine = null;

  function refreshLines() {
    if (edgeLine) {
      group.remove(edgeLine);
      edgeLine.geometry.dispose();
      edgeLine = null;
    }
    if (corners.length >= 2) {
      const pts = corners.map((c) => new THREE.Vector3(c.x, c.y + 0.005, c.z));
      if (corners.length === 4) pts.push(pts[0].clone());
      edgeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      group.add(edgeLine);
    }
  }

  function addMarker(p, n) {
    const m = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9d7bff }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pole.position.y = 0.125;
    const label = makeLabel(String(n));
    label.position.y = 0.3;
    m.add(dot, pole, label);
    m.position.set(p.x, p.y, p.z);
    group.add(m);
    markers.push(m);
  }

  function removeLastMarker() {
    const m = markers.pop();
    if (!m) return;
    group.remove(m);
    m.traverse((o) => {
      o.geometry?.dispose();
      o.material?.map?.dispose();
      o.material?.dispose();
    });
  }

  function render() {
    const n = corners.length;
    ui.progress.forEach((el, i) => el.classList.toggle('is-done', i < n));
    let msg;
    if (!tracking) msg = 'Tracking limited. Move slowly and point at a well-lit, textured area.';
    else if (n === 4) msg = '4 of 4 corners captured. Press Finish Scan to see the measurements.';
    else if (!hitPoint) msg = n === 0 ? 'Move your phone slowly to scan the floor.' : `${n} of 4 corners captured. Find the floor again to continue.`;
    else msg = n === 0 ? 'Point at the first visible floor corner.' : `${n} of 4 corners captured. Point at corner ${n + 1}, going around the room.`;
    ui.status.textContent = note || msg;
    ui.capture.innerHTML = `${icon('scan', 18)} Capture Corner ${Math.min(n + 1, 4)}`;
    ui.capture.disabled = !hitPoint || !tracking || n >= 4;
    ui.capture.hidden = n >= 4;
    ui.finish.hidden = n < 4;
    ui.undo.disabled = n === 0;
    ui.clear.disabled = n === 0;
    hooks.onChange?.({ corners: corners.slice(), hasHit: Boolean(hitPoint), tracking });
  }

  function capture() {
    if (!hitPoint || corners.length >= 4 || !tracking) return;
    const p = { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z };
    const dup = corners.findIndex((c) => Math.hypot(c.x - p.x, c.z - p.z) < MIN_SEPARATION);
    if (dup !== -1) {
      flash(`That is the same spot as corner ${dup + 1}. Aim at a different corner.`);
      return;
    }
    note = '';
    clearTimeout(noteTimer);
    corners.push(p);
    addMarker(p, corners.length);
    refreshLines();
    render();
  }

  let noteTimer;
  function flash(text) {
    note = text;
    render();
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      note = '';
      render();
    }, 2500);
  }

  ui.capture.addEventListener('click', capture);
  ui.undo.addEventListener('click', () => {
    corners.pop();
    removeLastMarker();
    refreshLines();
    render();
  });
  ui.clear.addEventListener('click', () => {
    while (markers.length) removeLastMarker();
    corners.length = 0;
    refreshLines();
    render();
  });
  ui.finish.addEventListener('click', () => {
    finished = true;
    handle?.end();
  });
  ui.exit.addEventListener('click', () => handle?.end());

  const tmp = new THREE.Vector3();
  ui.root.hidden = false;
  try {
    handle = await startXRSession({
      overlayRoot: ui.root,
      onFrame: ({ tracking: t, hitMatrix }) => {
        const changed = t !== tracking || Boolean(hitMatrix) !== Boolean(hitPoint);
        tracking = t;
        hitPoint = hitMatrix ? tmp.setFromMatrixPosition(hitMatrix).clone() : null;
        // live distance from the last corner to the reticle, on the floor plane
        if (hitPoint && corners.length && corners.length < 4) {
          const last = corners[corners.length - 1];
          ui.readout.textContent = `${Math.hypot(hitPoint.x - last.x, hitPoint.z - last.z).toFixed(2)} m`;
          const pts = [new THREE.Vector3(last.x, last.y + 0.005, last.z), hitPoint.clone().setY(hitPoint.y + 0.005)];
          if (!previewLine) {
            previewLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), previewMat);
            group.add(previewLine);
          } else previewLine.geometry.setFromPoints(pts);
          previewLine.computeLineDistances();
          previewLine.visible = true;
        } else {
          ui.readout.textContent = '';
          if (previewLine) previewLine.visible = false;
        }
        if (changed) render();
      },
      onSelect: () => {
        // without DOM Overlay, a tap captures; the 4th tap finishes
        if (handle?.features.domOverlay) return;
        capture();
        if (corners.length === 4) {
          finished = true;
          handle.end();
        }
      },
      onEnd: () => {
        clearTimeout(noteTimer);
        lineMat.dispose();
        previewMat.dispose();
        ui.root.remove();
        if (finished && corners.length === 4) onFinish?.(corners.map((c) => ({ ...c })));
      },
    });
  } catch (err) {
    ui.root.remove();
    onError?.(describeXRError(err));
    return null;
  }
  handle.scene.add(group);
  ui.noOverlay.hidden = handle.features.domOverlay;
  if (window.__ARSPACE_TEST_HOOKS__) window.__ARSPACE_TEST_HOOKS__.measure = { corners, handle };
  render();
  return handle;
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#6c8cff';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0b1020';
  g.font = 'bold 36px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sprite.scale.set(0.09, 0.09, 0.09);
  return sprite;
}

function buildOverlay() {
  const root = document.createElement('div');
  root.className = 'xr-overlay';
  root.hidden = true;
  root.innerHTML = `
    <div class="xr-top">
      <p class="xr-title">${escapeHtml('AutoGrid · Room scan')}</p>
      <div class="xr-progress" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="xr-status" role="status" aria-live="polite" data-status>Starting AR…</p>
      <p class="xr-readout" data-readout></p>
      <p class="xr-note" data-nooverlay hidden>Tap the screen at each corner. The scan finishes after the fourth.</p>
    </div>
    <div class="xr-bottom">
      <div class="xr-row">
        <button type="button" class="xr-btn xr-btn--primary" data-capture>Capture Corner 1</button>
        <button type="button" class="xr-btn xr-btn--primary" data-finish hidden>${icon('check', 18)} Finish Scan</button>
      </div>
      <div class="xr-row">
        <button type="button" class="xr-btn xr-btn--ghost" data-undo>Undo Last Corner</button>
        <button type="button" class="xr-btn xr-btn--ghost" data-clear>${icon('reset', 16)} Reset Scan</button>
        <button type="button" class="xr-btn xr-btn--ghost" data-exit>${icon('x', 16)} Exit</button>
      </div>
    </div>`;
  const q = (s) => root.querySelector(s);
  return {
    root,
    status: q('[data-status]'),
    readout: q('[data-readout]'),
    noOverlay: q('[data-nooverlay]'),
    progress: [...root.querySelectorAll('.xr-progress span')],
    capture: q('[data-capture]'),
    finish: q('[data-finish]'),
    undo: q('[data-undo]'),
    clear: q('[data-clear]'),
    exit: q('[data-exit]'),
  };
}
