import { GRID_SPACINGS, describeGrid, generateGrid } from '../autogrid/gridGenerator.js';
import { NOT_RECTANGULAR_MESSAGE, analyzeCorners } from '../autogrid/roomGeometry.js';
import { ROOM_RANGE, createPlan, planStore, resizePlan } from '../autogrid/roomPlanState.js';
import { isUnsaved, renderPlanManager, sourceLabel } from '../components/PlanManager.js';
import { detectWebXRAR, webxrUnavailableText } from '../ar/capability.js';
import { rectOf } from '../smartfit/geometry.js';
import { escapeHtml, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const ZOOM = { min: 1, max: 4, step: 1.5 };

/**
 * AutoGrid — measure a room (AR corner capture where WebXR allows, or manual
 * entry everywhere), generate a proportional floor grid, and hand the room to
 * SmartFit through the shared room plan.
 */
export function renderAutoGrid(main, { signal }) {
  const store = planStore();
  let plan = store.get() ?? createPlan({ name: 'My room' });
  if (!store.get()) store.set(plan);
  const view = { zoom: 1, cx: null, cy: null };
  let scan = null; // last AR scan analysis, shown until used or dismissed
  let measureModule = null;

  main.innerHTML = `
    <section class="page-head container">
      <h1>Design From Real Measurements.</h1>
      <p class="lede">Measure your room, generate a proportional floor plan, and discover exactly how your furniture fits.</p>
    </section>

    <div class="container ag">
      <div class="ag__main">
        <div class="sf__plan-card ag__preview-card">
          <div class="sf__toolbar">
            <div class="segmented ag__spacing" role="group" aria-label="Grid spacing">
              ${GRID_SPACINGS.map(
                (g) => `<button type="button" class="segmented__btn" data-spacing="${g}" aria-pressed="false">${g === 100 ? '1 m' : `${g} cm`}</button>`,
              ).join('')}
            </div>
            <label class="switch switch--small">
              <input type="checkbox" data-showgrid />
              <span class="switch__track" aria-hidden="true"></span>
              <span>Show grid</span>
            </label>
            <div class="ag__zoom">
              <button type="button" class="icon-btn" data-zoom="out" aria-label="Zoom out">−</button>
              <button type="button" class="icon-btn" data-zoom="in" aria-label="Zoom in">+</button>
              <button type="button" class="btn btn--ghost btn--small" data-zoom="reset">${icon('reset', 14)} Reset view</button>
            </div>
          </div>
          <svg class="plan ag__svg" data-preview role="img" aria-label="Floor grid preview"></svg>
          <p class="sf__hint" data-panhint>${icon('hand', 16)} Zoom in to pan by dragging the plan.</p>
          <div class="ag__info" data-info aria-live="polite"></div>
          <div class="ag__cta">
            <a class="btn btn--primary btn--large" href="#/smartfit" data-open-smartfit>${icon('ruler', 20)} Open in SmartFit</a>
            <button type="button" class="btn btn--ghost btn--large" data-edit>${icon('layers', 18)} Edit dimensions</button>
          </div>
        </div>
      </div>

      <aside class="sf__side">
        <section class="sf-card" aria-labelledby="ag-measure-title">
          <h2 id="ag-measure-title" class="sf-card__title">Measure the room</h2>
          <div class="ag-option" data-scan-option>
            <div class="ag-option__head">
              <strong>${icon('scan', 18)} Scan With AR</strong>
              <span class="sf-tag sf-tag--model">Android · WebXR</span>
            </div>
            <p class="small muted" data-scan-text>Checking whether this browser supports WebXR AR…</p>
            <button type="button" class="btn btn--primary btn--small" data-scan hidden>${icon('scan', 16)} Start Scan</button>
          </div>
          <div class="ag-option">
            <div class="ag-option__head"><strong>${icon('ruler', 18)} Enter Measurements</strong><span class="sf-tag sf-tag--demo">Any device</span></div>
            <p class="small muted">Use a tape measure, a laser measure or your phone's measuring app, then type the floor size.</p>
            <div class="sf-fields">
              <label class="field"><span>Width (m)</span><input type="number" inputmode="decimal" step="0.01" min="${ROOM_RANGE.min}" max="${ROOM_RANGE.max}" data-dim="w" /></label>
              <label class="field"><span>Length (m)</span><input type="number" inputmode="decimal" step="0.01" min="${ROOM_RANGE.min}" max="${ROOM_RANGE.max}" data-dim="l" /></label>
            </div>
            <p class="field-error" data-dim-error role="alert" hidden></p>
            <button type="button" class="btn btn--primary btn--small" data-generate>${icon('layers', 16)} Generate grid</button>
          </div>
        </section>

        <section class="sf-card ag-result" data-result hidden aria-live="polite"></section>

        <section class="sf-card" data-pm aria-label="Room plans"></section>

        <section class="sf-card sf-note">
          <h2 class="sf-card__title">${icon('info', 18)} About the measurements</h2>
          <p>AR measurements come from your phone's tracking of the floor. They are approximate, typically within a few centimetres in good light, and can drift on shiny, plain or dark floors. Always check the numbers and correct them if needed.</p>
          <p>On iPhone, Safari doesn't offer the WebXR tools needed for in-browser scanning, so enter your measurements instead. ARSpace does not import data from other apps automatically.</p>
        </section>
      </aside>
    </div>`;

  const $ = (s) => main.querySelector(s);
  const svg = $('[data-preview]');
  const wIn = $('[data-dim="w"]');
  const lIn = $('[data-dim="l"]');
  const dimErr = $('[data-dim-error]');
  const resultBox = $('[data-result]');

  // ------------------------------------------------------------ plan helpers

  function commit(next) {
    plan = next;
    store.set(plan);
    draw();
    planManager.refresh();
  }

  function applyPlan(next) {
    scan = null;
    resultBox.hidden = true;
    view.zoom = 1;
    commit(next);
    fillInputs();
  }

  function fillInputs() {
    wIn.value = plan.dimensions.widthMeters.toFixed(2);
    lIn.value = plan.dimensions.lengthMeters.toFixed(2);
    dimErr.hidden = true;
    [wIn, lIn].forEach((i) => i.removeAttribute('aria-invalid'));
  }

  function readDims() {
    const bad = [];
    const vals = [wIn, lIn].map((inp, k) => {
      const v = Number(String(inp.value).replace(',', '.'));
      const ok = inp.value.trim() !== '' && Number.isFinite(v) && v >= ROOM_RANGE.min && v <= ROOM_RANGE.max;
      inp.toggleAttribute('aria-invalid', !ok);
      if (!ok) bad.push(k ? 'length' : 'width');
      return Math.round(v * 100) / 100;
    });
    if (bad.length) {
      dimErr.textContent = `Enter a ${bad.join(' and ')} between ${ROOM_RANGE.min} and ${ROOM_RANGE.max} m.`;
      dimErr.hidden = false;
      return null;
    }
    dimErr.hidden = true;
    return vals;
  }

  // ------------------------------------------------------------- preview

  function draw() {
    const W = plan.dimensions.widthMeters * 100;
    const L = plan.dimensions.lengthMeters * 100;
    const spacing = plan.grid.spacingMeters * 100;
    let grid = null;
    try {
      grid = generateGrid(W, L, spacing);
    } catch (err) {
      grid = null;
      toast(err.message, 'error');
    }
    const M = Math.max(W, L) * 0.09;
    const fs = Math.max(W, L) / 34;
    const full = { x: -M, y: -M, w: W + 2 * M, h: L + 2 * M };
    if (view.cx === null || view.zoom === 1) {
      view.cx = W / 2;
      view.cy = L / 2;
    }
    const vw = full.w / view.zoom;
    const vh = full.h / view.zoom;
    view.cx = Math.min(full.x + full.w - vw / 2, Math.max(full.x + vw / 2, view.cx));
    view.cy = Math.min(full.y + full.h - vh / 2, Math.max(full.y + vh / 2, view.cy));
    svg.setAttribute('viewBox', `${view.cx - vw / 2} ${view.cy - vh / 2} ${vw} ${vh}`);
    svg.classList.toggle('is-zoomed', view.zoom > 1);
    $('[data-panhint]').hidden = view.zoom === 1;

    const parts = [`<defs><pattern id="ag-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" class="ag-hatch" /></pattern></defs>`];
    parts.push(`<rect class="plan__room" x="0" y="0" width="${W}" height="${L}" />`);
    if (grid && plan.grid.visible) {
      if (grid.partialColWidth) {
        parts.push(`<rect class="ag-partial" x="${grid.fullCols * spacing}" y="0" width="${grid.partialColWidth}" height="${L}" fill="url(#ag-hatch)" />`);
      }
      if (grid.partialRowLength) {
        parts.push(`<rect class="ag-partial" x="0" y="${grid.fullRows * spacing}" width="${W}" height="${grid.partialRowLength}" fill="url(#ag-hatch)" />`);
      }
      grid.xLines.forEach((x) => parts.push(`<line class="${x % 100 ? 'plan__grid' : 'plan__grid plan__grid--m'}" x1="${x}" y1="0" x2="${x}" y2="${L}" />`));
      grid.yLines.forEach((y) => parts.push(`<line class="${y % 100 ? 'plan__grid' : 'plan__grid plan__grid--m'}" x1="0" y1="${y}" x2="${W}" y2="${y}" />`));
      for (let x = 0; x <= W + 0.01; x += 100) parts.push(`<text class="plan__tick" x="${x}" y="${-fs * 0.5}" font-size="${fs * 0.75}" text-anchor="middle">${x / 100}</text>`);
      for (let y = 100; y <= L + 0.01; y += 100) parts.push(`<text class="plan__tick" x="${-fs * 0.45}" y="${y + fs * 0.28}" font-size="${fs * 0.75}" text-anchor="end">${y / 100}</text>`);
    }
    // measured outline when the room is only approximately rectangular
    if (plan.scan?.outlineCm && !plan.scan.rectangular) {
      const pts = plan.scan.outlineCm.map((p) => `${p.x},${p.y}`).join(' ');
      parts.push(`<polygon class="ag-outline" points="${pts}" />`);
    }
    // furniture already in the plan
    for (const f of plan.furniture) {
      const r = rectOf({ w: f.widthMeters * 100, d: f.depthMeters * 100, rot: f.rotationDeg, x: f.xMeters * 100, y: f.yMeters * 100 });
      parts.push(`<rect class="ag-furn" x="${r.left}" y="${r.top}" width="${r.right - r.left}" height="${r.bottom - r.top}" rx="4" />`);
    }
    // dimension labels
    parts.push(
      `<text class="ag-dim" x="${W / 2}" y="${L + fs * 1.5}" font-size="${fs}" text-anchor="middle">${(W / 100).toFixed(2)} m</text>`,
      `<text class="ag-dim" x="${W + fs * 1.4}" y="${L / 2}" font-size="${fs}" text-anchor="middle" transform="rotate(90 ${W + fs * 1.4} ${L / 2})">${(L / 100).toFixed(2)} m</text>`,
    );
    svg.innerHTML = parts.join('');

    main.querySelectorAll('[data-spacing]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.spacing) === spacing)));
    $('[data-showgrid]').checked = plan.grid.visible;

    const areaM2 = (W * L) / 10000;
    $('[data-info]').innerHTML = `
      <div class="sf-stats">
        <div class="sf-stat"><span>Room</span><strong>${(W / 100).toFixed(2)} × ${(L / 100).toFixed(2)} m</strong><em>${escapeHtml(sourceLabel(plan.measurementSource))}</em></div>
        <div class="sf-stat"><span>Estimated area</span><strong>${areaM2.toFixed(2)} m²</strong><em>${plan.scan ? `AR outline: ${plan.scan.areaSquareMeters.toFixed(2)} m²` : 'width × length'}</em></div>
        <div class="sf-stat"><span>Grid spacing</span><strong>${spacing === 100 ? '1 m' : `${spacing} cm`}</strong><em>${grid ? `${grid.cols} × ${grid.rows} = ${grid.cells} cells` : 'unavailable'}</em></div>
        <div class="sf-stat"><span>Furniture in plan</span><strong>${plan.furniture.length}</strong><em>${escapeHtml(plan.name)}${isUnsaved(plan) ? ' · unsaved' : ''}</em></div>
      </div>
      ${grid ? `<p class="small muted ag__griddesc">${escapeHtml(describeGrid(grid))}.</p>` : ''}`;
  }

  // ----------------------------------------------------------- controls

  $('[data-generate]').addEventListener(
    'click',
    () => {
      const dims = readDims();
      if (!dims) return;
      const [w, l] = dims;
      const outside = plan.furniture.filter((f) => f.xMeters > w || f.yMeters > l).length;
      commit({ ...resizePlan(plan, w, l, 'manual'), scan: null });
      toast(
        `Grid generated for ${w.toFixed(2)} × ${l.toFixed(2)} m.${outside ? ` ${outside} piece${outside === 1 ? ' is' : 's are'} now outside the walls; SmartFit will flag ${outside === 1 ? 'it' : 'them'}.` : ''}`,
        'success',
        4000,
      );
    },
    { signal },
  );
  [wIn, lIn].forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && $('[data-generate]').click(), { signal }));

  $('[data-edit]').addEventListener(
    'click',
    () => {
      fillInputs();
      wIn.focus();
      wIn.select();
      wIn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    { signal },
  );

  main.querySelector('.ag__spacing').addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-spacing]');
      if (!b) return;
      commit({ ...plan, grid: { ...plan.grid, spacingMeters: Number(b.dataset.spacing) / 100 } });
    },
    { signal },
  );
  $('[data-showgrid]').addEventListener(
    'change',
    (e) => commit({ ...plan, grid: { ...plan.grid, visible: e.target.checked } }),
    { signal },
  );

  main.querySelector('.ag__zoom').addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-zoom]');
      if (!b) return;
      if (b.dataset.zoom === 'in') view.zoom = Math.min(ZOOM.max, view.zoom * ZOOM.step);
      if (b.dataset.zoom === 'out') view.zoom = Math.max(ZOOM.min, view.zoom / ZOOM.step);
      if (b.dataset.zoom === 'reset') view.zoom = 1;
      if (view.zoom < 1.01) view.zoom = 1;
      draw();
    },
    { signal },
  );

  // pan by dragging when zoomed in
  let pan = null;
  svg.addEventListener(
    'pointerdown',
    (e) => {
      if (view.zoom === 1) return;
      const ctm = svg.getScreenCTM();
      pan = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, scale: ctm.a };
      svg.setPointerCapture(e.pointerId);
    },
    { signal },
  );
  svg.addEventListener(
    'pointermove',
    (e) => {
      if (!pan) return;
      view.cx = pan.cx - (e.clientX - pan.x) / pan.scale;
      view.cy = pan.cy - (e.clientY - pan.y) / pan.scale;
      draw();
    },
    { signal },
  );
  const endPan = () => (pan = null);
  svg.addEventListener('pointerup', endPan, { signal });
  svg.addEventListener('pointercancel', endPan, { signal });

  // ------------------------------------------------------------ AR scan

  const scanBtn = $('[data-scan]');
  const scanText = $('[data-scan-text]');
  detectWebXRAR().then((r) => {
    if (signal.aborted) return;
    if (r.supported) {
      measureModule = import('../ar/measureSession.js');
      scanText.textContent =
        'Stand in the room, point at each floor corner in turn and capture all four. Works in Chrome on ARCore-supported Android phones.';
      scanBtn.hidden = false;
    } else {
      $('[data-scan-option]').classList.add('is-disabled');
      scanText.textContent = webxrUnavailableText(r.reason, 'AR room scanning');
    }
  });

  scanBtn.addEventListener(
    'click',
    async () => {
      if (!measureModule) return;
      const m = await measureModule;
      m.startMeasure({
        onFinish: (points) => showScanResult(points),
        onError: (msg) => toast(msg, 'error', 9000),
      });
    },
    { signal },
  );

  function showScanResult(points) {
    if (signal.aborted) return;
    scan = analyzeCorners(points);
    const r = scan;
    const fmt = (m) => `${m.toFixed(2)} m`;
    const edgeList = r.edges
      ? `<ol class="ag-edges">${r.edges.map((e, i) => `<li>Corner ${i + 1} → ${((i + 1) % 4) + 1}: <strong>${fmt(e)}</strong></li>`).join('')}</ol>`
      : '';
    const status = !r.ok ? 'red' : r.rectangular ? 'green' : 'amber';
    resultBox.innerHTML = `
      <h2 class="sf-card__title">${icon('scan', 18)} Scan result</h2>
      <div class="sf-banner sf-banner--${status}">
        <strong>${!r.ok ? 'These points can’t be used' : r.rectangular ? 'Rectangular room measured' : 'Not quite rectangular'}</strong>
        <span>${
          !r.ok
            ? 'Fix the problems below by retaking the scan, or enter the measurements yourself.'
            : r.rectangular
              ? `About ${fmt(r.width)} × ${fmt(r.length)} (averages of opposite walls). Approximate: check before relying on it.`
              : escapeHtml(NOT_RECTANGULAR_MESSAGE)
        }</span>
      </div>
      ${r.errors.length ? `<ul class="sf-issues">${r.errors.map((e) => `<li class="sf-issue sf-issue--error">${icon('alert', 16)}<span>${escapeHtml(e)}</span></li>`).join('')}</ul>` : ''}
      ${
        r.ok
          ? `${edgeList}
             <dl class="specs specs--compact">
               <div><dt>Outline area (shoelace)</dt><dd>${r.area.toFixed(2)} m²</dd></div>
               <div><dt>Corner angles</dt><dd>${r.angles.map((a) => `${Math.round(a)}°`).join(', ')}</dd></div>
               <div><dt>Height difference</dt><dd>${Math.round(r.heightRange * 100)} cm</dd></div>
             </dl>`
          : ''
      }
      ${r.warnings.filter((w) => w !== NOT_RECTANGULAR_MESSAGE).map((w) => `<p class="small muted">${escapeHtml(w)}</p>`).join('')}
      <div class="sf-sel__actions">
        ${r.ok && r.rectangular ? `<button type="button" class="btn btn--primary btn--small" data-use>${icon('check', 16)} Use these measurements</button>` : ''}
        ${r.ok && !r.rectangular ? `<button type="button" class="btn btn--primary btn--small" data-approx>${icon('check', 16)} Confirm approximation</button>` : ''}
        ${r.ok ? `<button type="button" class="btn btn--ghost btn--small" data-editscan>Edit dimensions</button>` : ''}
        <button type="button" class="btn btn--ghost btn--small" data-retake>${icon('reset', 16)} Retake scan</button>
      </div>`;
    resultBox.hidden = false;
    resultBox.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  resultBox.addEventListener(
    'click',
    (e) => {
      if (!scan) return;
      const round = (v) => Math.round(v * 100) / 100;
      const meta = scan.ok
        ? { edgesMeters: scan.edges.map(round), areaSquareMeters: round(scan.area), rectangular: scan.rectangular, outlineCm: scan.outline }
        : null;
      if (e.target.closest('[data-use]') || e.target.closest('[data-approx]')) {
        const approx = Boolean(e.target.closest('[data-approx]'));
        commit({ ...resizePlan(plan, round(scan.width), round(scan.length), approx ? 'ar-approx' : 'ar-scan'), scan: meta });
        fillInputs();
        resultBox.hidden = true;
        toast(
          approx
            ? 'Using an approximate rectangle. The measured outline stays on the preview for reference.'
            : 'Measurements applied. Your grid and SmartFit now use this room.',
          'success',
          4500,
        );
      } else if (e.target.closest('[data-editscan]')) {
        wIn.value = round(scan.width).toFixed(2);
        lIn.value = round(scan.length).toFixed(2);
        wIn.focus();
        toast('Adjust the numbers, then press Generate grid.', 'info', 3500);
      } else if (e.target.closest('[data-retake]')) {
        resultBox.hidden = true;
        scan = null;
        scanBtn.click();
      }
    },
    { signal },
  );

  // -------------------------------------------------------------- start

  const planManager = renderPlanManager($('[data-pm]'), { getPlan: () => plan, applyPlan, signal });
  fillInputs();
  draw();
}
