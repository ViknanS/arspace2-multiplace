import { PRODUCTS, getProduct } from '../data/products.js';
import { detectWebXRAR, webxrUnavailableText } from '../ar/capability.js';
import { objectRowsHTML, renderPicker } from '../multiplace/ui.js';
import { parseArrangement, toArrangement } from '../multiplace/arrangement.js';
import { createPlan, planStore } from '../autogrid/roomPlanState.js';
import { getPlatform } from '../utils/arSupport.js';
import { escapeHtml, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const ROT = Math.PI / 12;

/**
 * MultiPlace page: start multi-object WebXR AR (where supported) and the
 * camera-free 3D room composer (everywhere).
 */
export function renderMultiPlace(main, { signal }) {
  const store = planStore();
  const plan = store.get() ?? createPlan({ name: 'My room' });
  let lastAR = null; // arrangement from the most recent AR session
  let arModule = null;
  let arProduct = 'chair';

  main.innerHTML = `
    <section class="page-head container">
      <h1>MultiPlace</h1>
      <p class="mp-tagline">Place More. Lock Independently. Design Your Space.</p>
      <p class="lede">Put several pieces of furniture into one room, lock each one where you want it, and move any single piece without disturbing the rest.</p>
    </section>

    <div class="container mp">
      <section class="sf-card mp-ar" aria-labelledby="mp-ar-title">
        <div class="mp-ar__head">
          <h2 id="mp-ar-title" class="sf-card__title">${icon('scan', 18)} Multi-object AR</h2>
          <span class="sf-tag sf-tag--model">WebXR · one session</span>
        </div>
        <p class="small muted" data-ar-text>Checking whether this browser supports WebXR AR…</p>
        <div class="mp-ar__start" data-ar-start hidden>
          <label class="field">
            <span>Start with</span>
            <select data-ar-product>
              ${PRODUCTS.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
          <button type="button" class="btn btn--primary" data-ar-go>${icon('scan', 18)} Start MultiPlace AR</button>
        </div>
        <div class="mp-ar__result" data-ar-result hidden></div>
      </section>

      <section class="mp-composer" aria-labelledby="mp-comp-title">
        <div class="mp-composer__head">
          <div>
            <h2 id="mp-comp-title" class="section-title section-title--small">3D room composer</h2>
            <p class="small muted">An interactive 3D scene of your room, <strong>not camera AR</strong>. Works on every device, including iPhone. Drag to orbit, scroll or pinch to zoom, drag an unlocked object to move it.</p>
          </div>
          <p class="mp-room small" data-room></p>
        </div>
        <div class="mp-composer__body">
          <div class="mp-stage">
            <div class="mp-stage__canvas" data-canvas></div>
            <p class="mp-stage__loading small" data-loading hidden>Loading model…</p>
            <button type="button" class="btn btn--ghost btn--small mp-stage__cam" data-cam>${icon('reset', 14)} Reset camera</button>
          </div>
          <aside class="mp-side">
            <div class="sf-card">
              <h3 class="sf-card__title" data-sel-title>Nothing selected</h3>
              <p class="small muted" data-sel-hint>Pick an object below to add it, or click one in the room.</p>
              <div class="sf-sel__actions" data-sel-actions>
                <button type="button" class="btn btn--primary btn--small" data-c="lock">Lock Position</button>
                <button type="button" class="btn btn--ghost btn--small" data-c="unlock">Unlock</button>
                <button type="button" class="btn btn--ghost btn--small" data-c="rotl" aria-label="Rotate left 15 degrees">${icon('rotateLeft', 16)}</button>
                <button type="button" class="btn btn--ghost btn--small" data-c="rotr" aria-label="Rotate right 15 degrees">${icon('rotateRight', 16)}</button>
                <button type="button" class="btn btn--ghost btn--small" data-c="smaller" aria-label="Smaller">−</button>
                <span class="mp-scale" data-scale>–</span>
                <button type="button" class="btn btn--ghost btn--small" data-c="bigger" aria-label="Bigger">+</button>
                <button type="button" class="btn btn--ghost btn--small" data-c="reset">True size</button>
                <button type="button" class="btn btn--ghost btn--small mp-danger" data-c="remove">${icon('x', 14)} Remove</button>
              </div>
            </div>
            <div class="sf-card">
              <h3 class="sf-card__title" data-count>Objects in room (0)</h3>
              <ul class="mp-list mp-list--page" data-list></ul>
              <button type="button" class="btn btn--ghost btn--small mp-danger" data-clear>Clear entire room</button>
            </div>
            <div class="sf-card">
              <h3 class="sf-card__title">Arrangement</h3>
              <div class="sf-sel__actions">
                <button type="button" class="btn btn--ghost btn--small" data-export>${icon('upload', 14)} Export</button>
                <label class="btn btn--ghost btn--small pm-import">${icon('layers', 14)} Import<input type="file" accept=".json,application/json" class="visually-hidden" data-import /></label>
              </div>
              <div class="sf-sel__actions">
                <button type="button" class="btn btn--ghost btn--small" data-to-plan>${icon('ruler', 14)} Send to SmartFit plan</button>
                <button type="button" class="btn btn--ghost btn--small" data-from-plan>Load from SmartFit plan</button>
              </div>
              <p class="small muted">Arrangements store products, positions, rotations and sizes. Reopening AR does not put objects back at the same physical spots; that would need spatial relocalisation.</p>
            </div>
          </aside>
        </div>
        <div class="mp-picker-wrap" data-picker></div>
      </section>
    </div>`;

  const $ = (s) => main.querySelector(s);
  const W = plan.dimensions.widthMeters;
  const L = plan.dimensions.lengthMeters;
  $('[data-room]').innerHTML = `${icon('ruler', 14)} Room: <strong>${W.toFixed(2)} × ${L.toFixed(2)} m</strong> from “${escapeHtml(plan.name)}” · <a class="link" href="#/autogrid">change in AutoGrid</a>`;

  // three.js loads on demand so other pages stay light
  $('[data-loading]').hidden = false;
  $('[data-loading]').textContent = 'Loading the 3D engine…';
  import('../multiplace/composer.js')
    .then(({ createComposer }) => {
      if (signal.aborted) return;
      $('[data-loading]').textContent = 'Loading model…';
      setup(createComposer);
    })
    .catch(() => toast('The 3D engine failed to load. Check your connection and reload.', 'error', 10000));

  function setup(createComposer) {
    const composer = createComposer($('[data-canvas]'), {
      room: { width: W, length: L },
      signal,
      onChange: () => drawSide(),
      onError: (m) => toast(m, 'error', 6000),
    });
    const mgr = composer.manager;

    renderPicker($('[data-picker]'), {
      signal,
      onPick: (id) => {
        const o = composer.add(id);
        mgr.select(o.instanceId);
      },
    });

    function drawSide() {
      const sel = mgr.selected();
      const st = sel?.state;
      $('[data-sel-title]').textContent = sel ? getProduct(sel.productId)?.name ?? sel.productId : 'Nothing selected';
      $('[data-sel-hint]').textContent = sel
        ? `${sel.instanceId} · ${st === 'locked' ? 'Locked: unlock it to move, rotate or resize.' : 'Drag it in the room to move it.'}`
        : 'Pick an object below to add it, or click one in the room.';
      const btn = (k) => $(`[data-c="${k}"]`);
      btn('lock').hidden = st !== 'placed';
      btn('unlock').hidden = st !== 'locked';
      ['rotl', 'rotr', 'smaller', 'bigger', 'reset'].forEach((k) => (btn(k).disabled = !sel || st === 'locked'));
      btn('remove').disabled = !sel;
      $('[data-scale]').textContent = sel ? `${Math.round(sel.scale * 100)}%` : '–';
      $('[data-count]').textContent = `Objects in room (${mgr.count})`;
      $('[data-list]').innerHTML = objectRowsHTML(mgr).replace('Pick one from the bar below.', 'Pick one from the bar under the room.');
      $('[data-clear]').disabled = mgr.count === 0;
      $('[data-loading]').hidden = !mgr.list().some((o) => composer.isLoading(o.instanceId));
    }

    $('[data-sel-actions]').addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('[data-c]');
        const id = mgr.selectedId;
        if (!b || !id) return;
        const s = mgr.selected()?.scale ?? 1;
        ({
          lock: () => mgr.lock(id),
          unlock: () => mgr.unlock(id),
          rotl: () => mgr.rotate(id, ROT),
          rotr: () => mgr.rotate(id, -ROT),
          smaller: () => mgr.setScale(id, s - 0.1),
          bigger: () => mgr.setScale(id, s + 0.1),
          reset: () => mgr.resetObject(id),
          remove: () => mgr.remove(id),
        })[b.dataset.c]?.();
      },
      { signal },
    );
    $('[data-list]').addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const id = b.dataset.id;
        ({ select: () => mgr.select(id), lock: () => mgr.lock(id), unlock: () => mgr.unlock(id), remove: () => mgr.remove(id) })[b.dataset.act]?.();
      },
      { signal },
    );
    $('[data-clear]').addEventListener(
      'click',
      () => {
        if (mgr.count && window.confirm(`Remove all ${mgr.count} objects from the room?`)) mgr.clear();
      },
      { signal },
    );
    $('[data-cam]').addEventListener('click', () => composer.resetCamera(), { signal });

    // keyboard shortcuts for the selected object
    main.addEventListener(
      'keydown',
      (e) => {
        if (e.target.closest('input, select, textarea')) return;
        const id = mgr.selectedId;
        if (!id) return;
        if (e.key === 'Delete' || e.key === 'Backspace') mgr.remove(id);
        else if (e.key === 'r' || e.key === 'R') mgr.rotate(id, e.shiftKey ? ROT : -ROT);
        else if (e.key === 'l' || e.key === 'L') mgr.get(id)?.state === 'locked' ? mgr.unlock(id) : mgr.lock(id);
        else return;
        e.preventDefault();
      },
      { signal },
    );

    // ------------------------------------------------------ export / import

    $('[data-export]').addEventListener(
      'click',
      () => {
        if (!mgr.count) return toast('Add some objects first.', 'info');
        const data = toArrangement(mgr.list(), { recenter: false, planId: plan.id, source: 'composer' });
        download(`${plan.name.replace(/[^\w-]+/g, '-') || 'room'}.arrangement.json`, data);
      },
      { signal },
    );
    $('[data-import]').addEventListener(
      'change',
      async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          loadArrangement(JSON.parse(await file.text()));
        } catch {
          toast('That file is not valid JSON.', 'error');
        }
      },
      { signal },
    );

    function loadArrangement(data) {
      const r = parseArrangement(data, PRODUCTS.map((p) => p.id));
      if (!r.ok) return toast(r.errors[0], 'error', 6000);
      if (mgr.count && !window.confirm('Replace the objects currently in the room with this arrangement?')) return;
      mgr.clear();
      // group-centred arrangements (from AR) are placed around the room centre
      const ox = r.relativeTo === 'group-centre' ? composer.room.width / 2 : 0;
      const oz = r.relativeTo === 'group-centre' ? composer.room.length / 2 : 0;
      r.objects.forEach((o) =>
        composer.add(o.productId, { position: { x: o.position.x + ox, y: 0, z: o.position.z + oz }, rotationY: o.rotationY, scale: o.scale, locked: o.locked }),
      );
      toast(`Loaded ${r.objects.length} object${r.objects.length === 1 ? '' : 's'}${r.errors.length ? ` (${r.errors.length} skipped)` : ''}.`, 'success', 4000);
    }

    // ------------------------------------------------ SmartFit plan link

    $('[data-to-plan]').addEventListener(
      'click',
      () => {
        const floorObjs = mgr.list().filter((o) => getProduct(o.productId)?.floor);
        const skipped = mgr.count - floorObjs.length;
        if (!floorObjs.length) return toast('No floor-standing furniture to send. Tabletop and wall items stay in the composer.', 'info', 5000);
        const current = store.get() ?? plan;
        if (current.furniture.length && !window.confirm(`Replace the ${current.furniture.length} furniture item(s) in “${current.name}” with ${floorObjs.length} from the composer?`)) return;
        const furniture = floorObjs.map((o) => {
          const p = getProduct(o.productId);
          const quarter = Math.round(o.rotationY / (Math.PI / 2)) % 2 === 0 ? 0 : 90; // SmartFit plans use 0° or 90°
          return {
            id: o.instanceId,
            kind: p.id,
            name: p.name,
            widthMeters: +((p.footprint.w * o.scale) / 100).toFixed(4),
            depthMeters: +((p.footprint.d * o.scale) / 100).toFixed(4),
            heightMeters: +((p.footprint.h * o.scale) / 100).toFixed(4),
            rotationDeg: quarter,
            xMeters: +o.position.x.toFixed(4),
            yMeters: +o.position.z.toFixed(4),
            source: o.scale === 1 ? (p.dimsSource === 'designed' ? 'designed' : 'model') : 'edited',
            productId: p.id,
          };
        });
        store.set({ ...current, furniture, updatedAt: new Date().toISOString() });
        toast(
          `Sent ${furniture.length} piece${furniture.length === 1 ? '' : 's'} to SmartFit${skipped ? `; ${skipped} tabletop/wall item(s) stayed here` : ''}. Rotations are rounded to 0° or 90° for the plan.`,
          'success',
          6000,
        );
      },
      { signal },
    );
    $('[data-from-plan]').addEventListener(
      'click',
      () => {
        const p = store.get();
        if (!p || !p.furniture.length) return toast('The SmartFit plan has no furniture yet.', 'info');
        if (mgr.count && !window.confirm('Replace the objects in the composer with the furniture from the SmartFit plan?')) return;
        mgr.clear();
        let skipped = 0;
        for (const f of p.furniture) {
          const prod = getProduct(f.productId ?? f.kind);
          if (!prod) {
            skipped++;
            continue;
          }
          composer.add(prod.id, {
            position: { x: f.xMeters, y: 0, z: f.yMeters },
            rotationY: (f.rotationDeg * Math.PI) / 180,
            scale: Math.min(1.5, Math.max(0.5, (f.widthMeters * 100) / prod.footprint.w)),
          });
        }
        toast(`Loaded ${p.furniture.length - skipped} piece(s) from “${p.name}”${skipped ? `; ${skipped} without a 3D model were skipped` : ''}.`, 'success', 5000);
      },
      { signal },
    );

    // ------------------------------------------------------------- AR

    const arText = $('[data-ar-text]');
    detectWebXRAR().then((r) => {
      if (signal.aborted) return;
      if (r.supported) {
        arModule = import('../ar/multiPlaceSession.js');
        arText.textContent =
          'Opens one AR session. Pick items from the bar at the bottom of the camera view, place each one, and lock it. Locked objects stay where you put them while you add more.';
        $('[data-ar-start]').hidden = false;
      } else {
        const ios = getPlatform() === 'ios';
        arText.textContent = ios
          ? 'Multi-object camera AR needs WebXR, which Safari on iPhone and iPad does not provide, and AR Quick Look shows one model at a time. Use the 3D room composer below to arrange several objects, and open single items in AR Quick Look from their product pages.'
          : `${webxrUnavailableText(r.reason, 'Multi-object AR tools')} The 3D room composer below works here.`;
      }
    });
    $('[data-ar-product]').addEventListener('change', (e) => (arProduct = e.target.value), { signal });
    $('[data-ar-go]').addEventListener(
      'click',
      async () => {
        if (!arModule) return;
        const m = await arModule;
        composer.pause(); // one active renderer at a time
        const h = await m.startMultiPlace({
          initialProductId: arProduct,
          onEnd: (arrangement) => {
            composer.resume();
            if (signal.aborted) return;
            lastAR = arrangement;
            showARResult();
          },
          onError: (msg) => {
            composer.resume();
            toast(msg, 'error', 9000);
          },
        });
        if (!h) composer.resume();
      },
      { signal },
    );

    function showARResult() {
      const box = $('[data-ar-result]');
      const n = lastAR?.objects.length ?? 0;
      box.hidden = false;
      box.innerHTML = n
        ? `<p><strong>Last AR session: ${n} object${n === 1 ? '' : 's'}</strong> (${lastAR.objects.filter((o) => o.locked).length} locked).</p>
           <div class="sf-sel__actions">
             <button type="button" class="btn btn--ghost btn--small" data-ar-export>${icon('upload', 14)} Export arrangement</button>
             <button type="button" class="btn btn--ghost btn--small" data-ar-compose>Open in 3D composer</button>
           </div>`
        : '<p class="small muted">The AR session ended with no objects placed.</p>';
      box.querySelector('[data-ar-export]')?.addEventListener('click', () => download('ar-session.arrangement.json', lastAR));
      box.querySelector('[data-ar-compose]')?.addEventListener('click', () => {
        loadArrangement(lastAR);
        $('[data-canvas]').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    if (window.__ARSPACE_TEST_HOOKS__) window.__ARSPACE_TEST_HOOKS__.composer = composer;
    drawSide();
  }
}

function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
