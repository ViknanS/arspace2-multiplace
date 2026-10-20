import {
  DEFAULT_CLEARANCE,
  DEFAULT_ROOM,
  FIT_ITEMS,
  ROOM_LIMITS,
  SCENARIOS,
  SOURCE_LABEL,
  defaultMarkers,
  fitItem,
} from '../smartfit/catalog.js';
import { analyzeLayout, fmtLen } from '../smartfit/analysis.js';
import { footprintSize, isValidPlacement, rectOf } from '../smartfit/geometry.js';
import { escapeHtml } from '../utils/dom.js';
import { GRID_SPACINGS, snapEdgeToGrid } from '../autogrid/gridGenerator.js';
import { createPlan, fromSmartFit, planStore, toSmartFit } from '../autogrid/roomPlanState.js';
import { isUnsaved, renderPlanManager, sourceLabel } from '../components/PlanManager.js';
import { icon } from '../utils/icons.js';

const SNAP = 5; // cm
const DIM_LIMITS = { min: 10, max: 600 }; // cm, per furniture side

/**
 * SmartFit — room planner with collision detection and a walking-clearance check.
 * All calculations run on the room plan the user enters here. The phone's AR
 * view is a separate visual preview; it does not send room geometry back.
 */
export function renderSmartFit(main, { params, signal }) {
  const state = {
    room: { ...DEFAULT_ROOM },
    clearance: DEFAULT_CLEARANCE,
    items: [],
    markers: defaultMarkers(DEFAULT_ROOM),
    selected: null,
    grid: true,
    gridSpacing: 50, // visual grid only; walkway analysis always uses its own 5 cm grid
    snap: false,
    scenario: 'fits',
    nextId: 1,
    plan: null, // the shared room plan this page is editing (see roomPlanState.js)
    baseline: null, // arrangement restored by "Reset arrangement"
  };
  const store = planStore();
  let planManager = null;
  let result = null;

  main.innerHTML = `
    <section class="page-head container">
      <h1>SmartFit</h1>
      <p class="lede">Enter your room, drop furniture onto the plan, and SmartFit checks whether everything fits and whether you can still walk from the door to the other side.</p>
      <p class="sf-planinfo" data-planinfo></p>
    </section>

    <div class="container sf">
      <div class="sf__plan-col">
        <div class="sf__plan-card">
          <div class="sf__toolbar">
            <label class="sf__select">
              <span class="visually-hidden">Load an example layout</span>
              <select data-scenario>
                <option value="">Load an example…</option>
                ${SCENARIOS.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')}
              </select>
            </label>
            <button type="button" class="btn btn--ghost btn--small" data-reset>${icon('reset', 16)} Reset arrangement</button>
            <button type="button" class="btn btn--ghost btn--small" data-clear>${icon('x', 16)} Clear plan</button>
            <div class="sf__gridctl">
              <label class="sf__select">
                <span class="visually-hidden">Grid spacing</span>
                <select data-spacing>
                  ${GRID_SPACINGS.map((g) => `<option value="${g}">${g === 100 ? '1 m' : `${g} cm`} grid</option>`).join('')}
                </select>
              </label>
              <label class="switch switch--small">
                <input type="checkbox" data-grid checked />
                <span class="switch__track" aria-hidden="true"></span>
                <span>Grid</span>
              </label>
              <label class="switch switch--small">
                <input type="checkbox" data-snap />
                <span class="switch__track" aria-hidden="true"></span>
                <span>Snap</span>
              </label>
            </div>
          </div>
          <svg class="plan" data-plan role="application" aria-label="Room floor plan. Select furniture and use arrow keys to move, R to rotate, Delete to remove." tabindex="0"></svg>
          <div class="sf__legend" aria-hidden="true">
            <span><i class="lg lg--ok"></i>Fits</span>
            <span><i class="lg lg--warn"></i>Warning</span>
            <span><i class="lg lg--err"></i>Collision</span>
            <span><i class="lg lg--path"></i>Walking route</span>
            <span><i class="lg lg--entry"></i>Entry</span>
            <span><i class="lg lg--dest"></i>Destination</span>
          </div>
          <p class="sf__hint">${icon('hand', 16)} Drag furniture and the Entry and Destination markers. With a piece selected: arrow keys move it (Shift for 25 cm), R rotates, Delete removes.</p>
        </div>

        <section class="sf-card sf-results" aria-labelledby="sf-results-title" aria-live="polite">
          <h2 id="sf-results-title" class="sf-card__title">Results</h2>
          <div data-results></div>
        </section>
      </div>

      <aside class="sf__side">
        <section class="sf-card" aria-labelledby="sf-room-title">
          <h2 id="sf-room-title" class="sf-card__title">Room</h2>
          <div class="sf-fields">
            <label class="field">
              <span>Width (m)</span>
              <input type="number" inputmode="decimal" step="0.05" min="${ROOM_LIMITS.min / 100}" max="${ROOM_LIMITS.max / 100}" data-room="width" />
            </label>
            <label class="field">
              <span>Length (m)</span>
              <input type="number" inputmode="decimal" step="0.05" min="${ROOM_LIMITS.min / 100}" max="${ROOM_LIMITS.max / 100}" data-room="length" />
            </label>
          </div>
          <p class="field-error" data-room-error role="alert" hidden></p>
          <div class="control">
            <div class="control__row">
              <label for="sf-clear">Walking clearance</label>
              <output for="sf-clear" data-clear-out></output>
            </div>
            <input id="sf-clear" type="range" min="45" max="150" step="5" data-clearance />
            <p class="control__note">Your planning preference for how wide a walkway should be. It is not a check against building or accessibility regulations.</p>
          </div>
        </section>

        <section class="sf-card" aria-labelledby="sf-sel-title" data-selected-card>
          <h2 id="sf-sel-title" class="sf-card__title">Selected item</h2>
          <div data-selected></div>
        </section>

        <section class="sf-card" aria-labelledby="sf-add-title">
          <h2 id="sf-add-title" class="sf-card__title">Add furniture</h2>
          <ul class="sf-list" data-add-list>
            ${FIT_ITEMS.map(
              (f) => `
              <li class="sf-list__item">
                ${
                  f.thumb
                    ? `<img src="${f.thumb}" alt="" width="48" height="48" loading="lazy" />`
                    : `<span class="sf-list__block" aria-hidden="true">${icon('layers', 20)}</span>`
                }
                <div class="sf-list__text">
                  <strong>${escapeHtml(f.name)}</strong>
                  <span>${f.w} × ${f.d} cm, ${f.h} cm high</span>
                  <span class="sf-tag sf-tag--${f.source}">${SOURCE_LABEL[f.source]}</span>
                </div>
                <div class="sf-list__actions">
                  <button type="button" class="btn btn--small btn--primary" data-add="${f.kind}" aria-label="Add ${escapeHtml(f.name)} to the plan">Add</button>
                  ${
                    f.productId
                      ? `<a class="sf-ar-link" href="#/product/${f.productId}?ar=1" aria-label="Preview ${escapeHtml(f.name)} in AR">${icon('scan', 15)} Preview in AR</a>`
                      : `<span class="sf-ar-link sf-ar-link--off">No 3D model</span>`
                  }
                </div>
              </li>`,
            ).join('')}
          </ul>
        </section>

        <section class="sf-card" data-pm aria-label="Room plans"></section>

        <section class="sf-card sf-note">
          <h2 class="sf-card__title">${icon('info', 18)} SmartFit and AR</h2>
          <p>SmartFit calculates fit and walkways from the room size and positions you enter on this plan. It does not scan your room.</p>
          <p>"Preview in AR" opens the phone's AR viewer so you can see the real object at true size in your room. That viewer doesn't send wall or furniture positions back to ARSpace, so the two are separate: use the plan to check the numbers, and AR to check the look.</p>
        </section>
      </aside>
    </div>`;

  const $ = (s) => main.querySelector(s);
  const svg = $('[data-plan]');
  const roomInputs = main.querySelectorAll('[data-room]');
  const roomError = $('[data-room-error]');
  const clearanceInput = $('[data-clearance]');
  const clearanceOut = $('[data-clear-out]');

  // ---------------------------------------------------------------- state ops

  function makeItem(kind, x, y, rot = 0) {
    const f = fitItem(kind);
    return { id: `f${state.nextId++}`, kind, name: f.name, w: f.w, d: f.d, h: f.h, rot, x, y, source: f.source, productId: f.productId };
  }

  function loadScenario(id) {
    const s = SCENARIOS.find((x) => x.id === id) ?? SCENARIOS[0];
    state.scenario = s.id;
    state.room = { ...s.room };
    state.markers = defaultMarkers(state.room);
    state.items = s.items.map(([kind, x, y, rot]) => makeItem(kind, x, y, rot));
    state.selected = null;
    state.plan = createPlan({ name: s.label, widthMeters: s.room.width / 100, lengthMeters: s.room.length / 100, source: 'example' });
    state.baseline = snapshot();
    syncRoomInputs();
    syncGridControls();
    update();
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({ room: state.room, items: state.items, markers: state.markers }));
  }

  /** Load a shared room plan (from AutoGrid, a saved plan, or an import). */
  function applyPlan(plan, { keepView = false } = {}) {
    const sf = toSmartFit(plan);
    state.plan = plan;
    state.room = sf.room;
    state.items = sf.items;
    state.markers = sf.markers;
    state.clearance = Math.min(150, Math.max(45, sf.clearance));
    state.grid = sf.grid.visible;
    state.gridSpacing = GRID_SPACINGS.includes(sf.grid.spacing) ? sf.grid.spacing : 50;
    state.snap = sf.grid.snap;
    state.nextId = state.items.length + 1;
    if (!keepView) {
      state.selected = null;
      state.baseline = snapshot();
    }
    clearanceInput.value = state.clearance;
    syncRoomInputs();
    syncGridControls();
    update();
  }

  /** Write the current state back into the shared plan (single source of truth). */
  function persist() {
    if (!state.plan) return;
    state.plan = fromSmartFit(
      {
        room: state.room,
        items: state.items,
        markers: state.markers,
        clearance: state.clearance,
        grid: { spacing: state.gridSpacing, visible: state.grid, snap: state.snap },
      },
      state.plan,
    );
    store.set(state.plan);
  }

  function syncGridControls() {
    $('[data-grid]').checked = state.grid;
    $('[data-snap]').checked = state.snap;
    $('[data-spacing]').value = String(state.gridSpacing);
  }

  function drawPlanInfo() {
    const p = state.plan;
    if (!p) return;
    $('[data-planinfo]').innerHTML = `${icon('ruler', 16)} <strong>${escapeHtml(p.name)}</strong> · ${(state.room.width / 100).toFixed(2)} × ${(
      state.room.length / 100
    ).toFixed(2)} m · ${escapeHtml(sourceLabel(p.measurementSource))}${isUnsaved(p) ? ' · <em>unsaved</em>' : ''} · <a class="link" href="#/autogrid">Measure or edit in AutoGrid</a>`;
  }

  /** First free spot (scanning a 10 cm grid), or the room centre if none. */
  function freeSpot(item) {
    const { w, d } = footprintSize(item);
    for (let y = d / 2; y <= state.room.length - d / 2; y += 10) {
      for (let x = w / 2; x <= state.room.width - w / 2; x += 10) {
        const cand = { ...item, x: snap(x), y: snap(y) };
        if (isValidPlacement(cand, state.items, state.room)) return cand;
      }
    }
    return { ...item, x: snap(state.room.width / 2), y: snap(state.room.length / 2) };
  }

  function addItem(kind) {
    const placed = freeSpot(makeItem(kind, 0, 0));
    state.items.push(placed);
    state.selected = placed.id;
    update();
    svg.focus({ preventScroll: true });
  }

  function selectedItem() {
    return state.items.find((i) => i.id === state.selected);
  }

  function patchSelected(patch) {
    const it = selectedItem();
    if (!it) return;
    Object.assign(it, patch);
    update();
  }

  function clampMarker(p) {
    return {
      x: Math.min(state.room.width - SNAP, Math.max(SNAP, snap(p.x))),
      y: Math.min(state.room.length - SNAP, Math.max(SNAP, snap(p.y))),
    };
  }

  // ------------------------------------------------------------ room inputs

  function syncRoomInputs() {
    roomInputs.forEach((inp) => (inp.value = (state.room[inp.dataset.room] / 100).toFixed(2)));
    roomError.hidden = true;
    roomInputs.forEach((inp) => inp.removeAttribute('aria-invalid'));
  }

  function applyRoom() {
    const vals = {};
    const problems = [];
    roomInputs.forEach((inp) => {
      const label = inp.dataset.room;
      const v = Number(String(inp.value).replace(',', '.'));
      const ok = inp.value.trim() !== '' && Number.isFinite(v) && v * 100 >= ROOM_LIMITS.min && v * 100 <= ROOM_LIMITS.max;
      inp.toggleAttribute('aria-invalid', !ok);
      if (!ok) problems.push(label);
      else vals[label] = Math.round(v * 100);
    });
    if (problems.length) {
      roomError.textContent = `Enter a ${problems.join(' and ')} between ${ROOM_LIMITS.min / 100} m and ${ROOM_LIMITS.max / 100} m. The plan keeps the last valid size.`;
      roomError.hidden = false;
      return;
    }
    roomError.hidden = true;
    state.room = { width: vals.width, length: vals.length };
    if (state.plan && state.plan.measurementSource !== 'example') state.plan = { ...state.plan, measurementSource: 'manual' };
    state.markers = { entry: clampMarker(state.markers.entry), dest: clampMarker(state.markers.dest) };
    update();
  }

  roomInputs.forEach((inp) => inp.addEventListener('change', applyRoom, { signal }));
  roomInputs.forEach((inp) =>
    inp.addEventListener('keydown', (e) => e.key === 'Enter' && applyRoom(), { signal }),
  );

  clearanceInput.value = state.clearance;
  clearanceInput.addEventListener(
    'input',
    () => {
      state.clearance = Number(clearanceInput.value);
      update();
    },
    { signal },
  );

  $('[data-scenario]').addEventListener(
    'change',
    (e) => {
      const id = e.target.value;
      e.target.value = '';
      if (!id) return;
      if (state.plan && isUnsaved(state.plan) && !window.confirm(`Load the example layout? It replaces “${state.plan.name}” on screen, and its unsaved changes will be lost.`)) return;
      loadScenario(id);
    },
    { signal },
  );
  $('[data-reset]').addEventListener(
    'click',
    () => {
      if (!state.baseline) return;
      const b = JSON.parse(JSON.stringify(state.baseline));
      state.room = b.room;
      state.items = b.items;
      state.markers = b.markers;
      state.selected = null;
      syncRoomInputs();
      update();
    },
    { signal },
  );
  $('[data-spacing]').addEventListener(
    'change',
    (e) => {
      state.gridSpacing = Number(e.target.value);
      update();
    },
    { signal },
  );
  $('[data-snap]').addEventListener(
    'change',
    (e) => {
      state.snap = e.target.checked;
      update();
    },
    { signal },
  );
  $('[data-clear]').addEventListener(
    'click',
    () => {
      state.items = [];
      state.selected = null;
      update();
    },
    { signal },
  );
  $('[data-grid]').addEventListener(
    'change',
    (e) => {
      state.grid = e.target.checked;
      drawPlan();
    },
    { signal },
  );
  $('[data-add-list]').addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-add]');
      if (b) addItem(b.dataset.add);
    },
    { signal },
  );

  // ------------------------------------------------------------- floor plan

  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  let drag = null;

  svg.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target.closest('[data-id], [data-marker]');
      if (!target) {
        if (state.selected) {
          state.selected = null;
          update();
        }
        return;
      }
      e.preventDefault();
      const p = svgPoint(e);
      if (target.dataset.marker) {
        const m = state.markers[target.dataset.marker];
        drag = { marker: target.dataset.marker, dx: p.x - m.x, dy: p.y - m.y };
      } else {
        const it = state.items.find((i) => i.id === target.dataset.id);
        state.selected = it.id;
        drag = { id: it.id, dx: p.x - it.x, dy: p.y - it.y, moved: false };
        // re-render on the next frame so the touched element is still in the
        // DOM when the matching touchstart arrives (see the touch handlers)
        requestAnimationFrame(() => !signal.aborted && update());
      }
      svg.setPointerCapture(e.pointerId);
      svg.focus({ preventScroll: true });
    },
    { signal },
  );

  // Touch: empty floor scrolls the page (CSS touch-action: pan-x pan-y), but a
  // drag that starts on furniture or a marker must not scroll. Browsers ignore
  // touch-action on SVG children, so cancel the scroll from a non-passive
  // touch listener instead.
  const onPiece = (e) => Boolean(e.target.closest?.('[data-id], [data-marker]'));
  svg.addEventListener('touchstart', (e) => onPiece(e) && e.preventDefault(), { passive: false, signal });
  svg.addEventListener('touchmove', (e) => drag && e.preventDefault(), { passive: false, signal });

  let rafPending = false;
  svg.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      const p = svgPoint(e);
      if (drag.marker) {
        state.markers[drag.marker] = clampMarker({ x: p.x - drag.dx, y: p.y - drag.dy });
      } else {
        const it = state.items.find((i) => i.id === drag.id);
        if (!it) return;
        // centre may move anywhere inside the room, so items can stick out
        // past a wall (which SmartFit then reports) but never get lost.
        const fp = footprintSize(it);
        const nx = state.snap ? snapEdgeToGrid(p.x - drag.dx, fp.w, state.gridSpacing) : snap(p.x - drag.dx);
        const ny = state.snap ? snapEdgeToGrid(p.y - drag.dy, fp.d, state.gridSpacing) : snap(p.y - drag.dy);
        it.x = Math.min(state.room.width, Math.max(0, nx));
        it.y = Math.min(state.room.length, Math.max(0, ny));
        drag.moved = true;
      }
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          if (!signal.aborted) update({ light: true });
        });
      }
    },
    { signal },
  );

  const endDrag = () => {
    if (!drag) return;
    drag = null;
    update();
  };
  svg.addEventListener('pointerup', endDrag, { signal });
  svg.addEventListener('pointercancel', endDrag, { signal });

  svg.addEventListener(
    'keydown',
    (e) => {
      const it = selectedItem();
      if (!it) return;
      const step = e.shiftKey ? 25 : SNAP;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        it.x = Math.min(state.room.width, Math.max(0, it.x + dx));
        it.y = Math.min(state.room.length, Math.max(0, it.y + dy));
        update();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        patchSelected({ rot: (it.rot + 90) % 180 });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelected();
      } else if (e.key === 'Escape') {
        state.selected = null;
        update();
      }
    },
    { signal },
  );

  function removeSelected() {
    state.items = state.items.filter((i) => i.id !== state.selected);
    state.selected = null;
    update();
  }

  function drawPlan() {
    const { width: W, length: L } = state.room;
    const M = Math.max(W, L) * 0.08;
    // label font size in cm units; larger on narrow screens so labels stay legible
    const narrow = (svg.clientWidth || 800) < 520;
    const fs = (Math.max(W, L) / 38) * (narrow ? 1.45 : 1);
    svg.setAttribute('viewBox', `${-M} ${-M} ${W + 2 * M} ${L + 2 * M}`);
    const parts = [];

    parts.push(`<rect class="plan__room" x="0" y="0" width="${W}" height="${L}" />`);

    if (state.grid) {
      const lines = [];
      const g = state.gridSpacing;
      for (let x = g; x < W - 0.05; x += g) lines.push(`<line class="${x % 100 ? 'plan__grid' : 'plan__grid plan__grid--m'}" x1="${x}" y1="0" x2="${x}" y2="${L}" />`);
      for (let y = g; y < L - 0.05; y += g) lines.push(`<line class="${y % 100 ? 'plan__grid' : 'plan__grid plan__grid--m'}" x1="0" y1="${y}" x2="${W}" y2="${y}" />`);
      parts.push(lines.join(''));
      const ticks = [];
      for (let x = 0; x <= W; x += 100) ticks.push(`<text class="plan__tick" x="${x}" y="${-fs * 0.6}" font-size="${fs * 0.8}" text-anchor="middle">${x / 100} m</text>`);
      for (let y = 100; y <= L; y += 100) ticks.push(`<text class="plan__tick" x="${-fs * 0.5}" y="${y + fs * 0.3}" font-size="${fs * 0.8}" text-anchor="end">${y / 100}</text>`);
      parts.push(ticks.join(''));
    } else {
      parts.push(
        `<text class="plan__tick" x="${W / 2}" y="${-fs * 0.6}" font-size="${fs}" text-anchor="middle">${(W / 100).toFixed(2)} m</text>`,
        `<text class="plan__tick" x="${-fs * 0.6}" y="${L / 2}" font-size="${fs}" text-anchor="middle" transform="rotate(-90 ${-fs * 0.6} ${L / 2})">${(L / 100).toFixed(2)} m</text>`,
      );
    }

    // walking route
    const walk = result?.walk;
    if (walk && walk.path.length > 1) {
      const pts = [state.markers.entry, ...walk.path.slice(1, -1), state.markers.dest].map((p) => `${p.x},${p.y}`).join(' ');
      parts.push(`<polyline class="plan__route plan__route--${walk.status}" points="${pts}" stroke-width="${fs * 0.3}" />`);
      if (walk.narrowest && walk.status === 'restricted') {
        const n = walk.narrowest;
        parts.push(
          `<circle class="plan__narrow" cx="${n.x}" cy="${n.y}" r="${n.width / 2}" />`,
          `<text class="plan__narrow-label" x="${n.x}" y="${n.y - n.width / 2 - fs * 0.4}" font-size="${fs * 0.8}" text-anchor="middle">${fmtLen(walk.bottleneck)}</text>`,
        );
      }
    }

    // furniture
    for (const it of state.items) {
      const r = rectOf(it);
      const w = r.right - r.left;
      const d = r.bottom - r.top;
      const st = result?.itemState[it.id] ?? 'ok';
      const sel = it.id === state.selected;
      const small = Math.min(w, d) < fs * 2.6;
      const label = `${escapeHtml(it.name)}, ${Math.round(it.w)} by ${Math.round(it.d)} centimetres${
        st === 'error' ? ', has a collision' : st === 'warn' ? ', has a warning' : ''
      }`;
      parts.push(`
        <g class="plan__item is-${st}${sel ? ' is-selected' : ''}" data-id="${it.id}" role="button" aria-label="${label}" aria-pressed="${sel}">
          <rect x="${r.left}" y="${r.top}" width="${w}" height="${d}" rx="${Math.min(6, w / 6, d / 6)}" />
          ${
            small
              ? `<text x="${it.x}" y="${it.y + fs * 0.3}" font-size="${fs * 0.75}" text-anchor="middle">${escapeHtml(shortName(it.name))}</text>`
              : `<text x="${it.x}" y="${it.y - fs * 0.15}" font-size="${fs * 0.85}" text-anchor="middle" class="plan__name">${escapeHtml(shortName(it.name))}</text>
                 <text x="${it.x}" y="${it.y + fs * 0.95}" font-size="${fs * 0.7}" text-anchor="middle" class="plan__dims">${Math.round(w)}×${Math.round(d)}</text>`
          }
        </g>`);
    }

    // markers
    const marker = (key, label, cls) => {
      const m = state.markers[key];
      return `<g class="plan__marker ${cls}" data-marker="${key}" role="button" aria-label="${label} marker">
        <circle cx="${m.x}" cy="${m.y}" r="${fs * 0.9}" />
        <text x="${m.x}" y="${m.y + fs * 0.32}" font-size="${fs * 0.85}" text-anchor="middle">${label[0]}</text>
        <text class="plan__marker-label" x="${m.x}" y="${m.y + fs * 2.1}" font-size="${fs * 0.75}" text-anchor="middle">${label}</text>
      </g>`;
    };
    parts.push(marker('entry', 'Entry', 'plan__marker--entry'), marker('dest', 'Destination', 'plan__marker--dest'));

    svg.innerHTML = parts.join('');
  }

  // --------------------------------------------------------- side panels

  function drawSelected() {
    const box = $('[data-selected]');
    const it = selectedItem();
    if (!it) {
      box.innerHTML = `<p class="muted small">Click or tap a piece of furniture on the plan to see its size, rotate it, edit its dimensions or remove it.</p>`;
      return;
    }
    const { w, d } = footprintSize(it);
    box.innerHTML = `
      <p class="sf-sel__name">${escapeHtml(it.name)} <span class="sf-tag sf-tag--${it.source}">${SOURCE_LABEL[it.source]}</span></p>
      <div class="sf-fields sf-fields--3">
        <label class="field"><span>Width (cm)</span><input type="number" min="${DIM_LIMITS.min}" max="${DIM_LIMITS.max}" step="1" value="${Math.round(it.w)}" data-dim="w" /></label>
        <label class="field"><span>Depth (cm)</span><input type="number" min="${DIM_LIMITS.min}" max="${DIM_LIMITS.max}" step="1" value="${Math.round(it.d)}" data-dim="d" /></label>
        <label class="field"><span>Height (cm)</span><input type="number" min="1" max="400" step="1" value="${Math.round(it.h)}" data-dim="h" /></label>
      </div>
      <p class="field-error" data-dim-error role="alert" hidden></p>
      <dl class="specs specs--compact">
        <div><dt>Footprint on plan</dt><dd>${Math.round(w)} × ${Math.round(d)} cm (${((w * d) / 10000).toFixed(2)} m²)</dd></div>
        <div><dt>Rotation</dt><dd>${it.rot}°</dd></div>
        <div><dt>Centre position</dt><dd>${fmtLen(it.x)} from left, ${fmtLen(it.y)} from top</dd></div>
      </dl>
      <div class="sf-sel__actions">
        <button type="button" class="btn btn--ghost btn--small" data-rotate>${icon('rotateRight', 16)} Rotate 90°</button>
        <button type="button" class="btn btn--ghost btn--small" data-remove>${icon('x', 16)} Remove</button>
        ${
          it.productId
            ? `<a class="btn btn--primary btn--small" href="#/product/${it.productId}?ar=1">${icon('scan', 16)} Preview in AR</a>`
            : ''
        }
      </div>`;
    box.querySelector('[data-rotate]').addEventListener('click', () => patchSelected({ rot: (it.rot + 90) % 180 }));
    box.querySelector('[data-remove]').addEventListener('click', removeSelected);
    const dimErr = box.querySelector('[data-dim-error]');
    box.querySelectorAll('[data-dim]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const key = inp.dataset.dim;
        const v = Number(inp.value);
        const lim = key === 'h' ? { min: 1, max: 400 } : DIM_LIMITS;
        if (!Number.isFinite(v) || v < lim.min || v > lim.max) {
          dimErr.textContent = `Enter a ${key === 'w' ? 'width' : key === 'd' ? 'depth' : 'height'} between ${lim.min} and ${lim.max} cm.`;
          dimErr.hidden = false;
          inp.setAttribute('aria-invalid', 'true');
          return;
        }
        patchSelected({ [key]: Math.round(v), source: it.source === 'model' ? 'edited' : it.source });
      }),
    );
  }

  function drawResults() {
    const r = result;
    const box = $('[data-results]');
    const { width: W, length: L } = state.room;
    const walk = r.walk;
    const walkLabel = {
      clear: 'Clear path available',
      restricted: 'Restricted pathway',
      blocked: 'No path available',
    }[walk.status];
    const walkTone = { clear: 'green', restricted: 'amber', blocked: 'red' }[walk.status];
    const walkDetail = walk.blockedEnd
      ? `The ${walk.blockedEnd} marker is inside furniture.`
      : walk.status === 'blocked'
        ? `No gap of at least ${fmtLen(walk.minPassable)} between entry and destination.`
        : `Narrowest point about ${fmtLen(walk.bottleneck)} (you set ${fmtLen(state.clearance)}).`;
    const overall = {
      green: ['Layout works', 'Everything fits and you can walk through at your chosen clearance.'],
      amber: ['Works, with warnings', 'Nothing collides, but some spaces are tighter than your clearance.'],
      red: ['Problems found', 'Fix the collisions or the blocked route listed below.'],
    }[r.overall];
    const empty = state.items.length === 0;

    box.innerHTML = `
      ${
        empty
          ? `<div class="sf-banner sf-banner--neutral"><strong>The plan is empty.</strong><span>Add furniture from the list, or load an example layout above the plan.</span></div>`
          : `<div class="sf-banner sf-banner--${r.overall}"><strong>${overall[0]}</strong><span>${overall[1]}</span></div>`
      }
      <div class="sf-stats">
        <div class="sf-stat"><span>Room</span><strong>${(W / 100).toFixed(2)} × ${(L / 100).toFixed(2)} m</strong><em>${r.metrics.fmt.roomArea}</em></div>
        <div class="sf-stat"><span>Furniture footprint</span><strong>${r.metrics.fmt.footprint}</strong><em>${Math.round((r.metrics.footprint / r.metrics.roomArea) * 100)}% of the floor</em></div>
        <div class="sf-stat"><span>Free floor</span><strong>${r.metrics.fmt.free}</strong><em>unoccupied area inside the walls</em></div>
        <div class="sf-stat sf-stat--${r.metrics.collisionCount ? 'red' : 'green'}"><span>Collision warnings</span><strong>${r.metrics.collisionCount}</strong><em>${
          r.metrics.collisionCount ? 'overlaps or items past a wall' : 'no overlaps, all inside'
        }</em></div>
        <div class="sf-stat sf-stat--wide sf-stat--${walkTone}"><span>Walking route</span><strong>${walkLabel}</strong><em>${walkDetail}</em></div>
      </div>
      ${
        r.issues.length
          ? `<h3 class="sf-sub">Issues</h3>
             <ul class="sf-issues">${r.issues
               .map((i) => `<li class="sf-issue sf-issue--${i.severity}">${icon(i.severity === 'error' ? 'alert' : 'info', 16)}<span>${escapeHtml(i.text)}</span></li>`)
               .join('')}</ul>`
          : ''
      }
      ${
        r.recs.length
          ? `<h3 class="sf-sub">Recommended adjustments</h3>
             <ul class="sf-recs">${r.recs.map((x) => `<li>${icon('check', 16)}<span>${escapeHtml(x.text)}</span></li>`).join('')}</ul>`
          : ''
      }
      <p class="sf-foot">How this is measured: furniture is treated as rectangles on the plan. Overlaps and wall overhangs are exact. Walkway widths are measured on a ${walk.cell} cm grid, so they are accurate to about ±${walk.cell} cm. A route narrower than ${fmtLen(
        walk.minPassable,
      )} counts as no path. Clearance is your own planning preference, not a building or accessibility code check.</p>`;
  }

  function update({ light = false } = {}) {
    result = analyzeLayout(state.room, state.items, {
      entry: state.markers.entry,
      dest: state.markers.dest,
      clearance: state.clearance,
    });
    clearanceOut.textContent = `${state.clearance} cm`;
    drawPlan();
    if (!light) {
      drawSelected();
      drawResults();
      persist();
      drawPlanInfo();
      planManager?.refresh();
    }
  }

  // --------------------------------------------------------------- start

  const existing = store.get();
  if (existing) applyPlan(existing);
  else loadScenario('fits');
  planManager = renderPlanManager($('[data-pm]'), {
    getPlan: () => state.plan,
    applyPlan: (plan, opts) => applyPlan(plan, opts),
    signal,
  });
  const add = params.get('add');
  if (add && fitItem(add)) {
    history.replaceState(null, '', '#/smartfit');
    addItem(add);
  }
}

function snap(v) {
  return Math.round(v / SNAP) * SNAP;
}

function shortName(name) {
  return name.replace(/^(Modern Accent|Curved Velvet|Potted)\s+/i, '');
}
