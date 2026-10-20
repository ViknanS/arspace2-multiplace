import { PRODUCTS, categoryLabel, getProduct } from '../data/products.js';
import { createViewer } from '../components/ModelViewer.js';
import { launchAR } from '../components/ARGuide.js';
import { checkARSupport, getPlatform, likelyRuntime } from '../utils/arSupport.js';
import { escapeHtml, formatMetres, prefersReducedMotion, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { detectWebXRAR, webxrUnavailableText } from '../ar/capability.js';

const SCALE_MIN = 50;
const SCALE_MAX = 150;

export function renderProduct(main, { id, params, signal }) {
  const p = getProduct(id);
  if (!p) {
    main.innerHTML = `
      <section class="container empty empty--page">
        ${icon('cube', 32)}
        <h1>Object not found</h1>
        <p>There's no object called “${escapeHtml(id)}” in the collection.</p>
        <a class="btn btn--primary" href="#/collection">Browse the collection</a>
      </section>`;
    return;
  }

  const autoRotateDefault = !prefersReducedMotion();
  const others = PRODUCTS.filter((o) => o.id !== p.id);

  main.innerHTML = `
    <div class="container product">
      <a class="back" href="#/collection">${icon('arrowLeft', 18)} Collection</a>
      <div class="product__layout">
        <div class="product__viewer" data-viewer></div>

        <div class="product__panel">
          <p class="product__category">${escapeHtml(categoryLabel(p.category))}</p>
          <h1 class="product__title">${escapeHtml(p.name)}</h1>
          <p class="product__desc">${escapeHtml(p.description)}</p>

          <div class="ar-block">
            <button type="button" class="btn btn--primary btn--large btn--block ar-btn" data-ar data-state="loading" aria-describedby="ar-hint">
              <span data-ar-label>${icon('scan', 20)} Model loading…</span>
            </button>
            <p class="ar-block__hint" id="ar-hint" data-ar-hint>Checking AR availability…</p>
            <label class="switch">
              <input type="checkbox" data-true-scale />
              <span class="switch__track" aria-hidden="true"></span>
              <span>Lock to true size in AR <span class="muted">(turns off pinch-to-resize)</span></span>
            </label>
          </div>

          <div class="fix-block" data-fix-block>
            <div class="fix-block__head">
              <h2>Fix Position</h2>
              <span class="sf-tag sf-tag--model">WebXR</span>
            </div>
            <p class="fix-block__text" data-fix-text>Checking whether this browser supports WebXR AR…</p>
            <button type="button" class="btn btn--ghost btn--block" data-fix-start hidden>${icon('scan', 18)} Place with Fix Position</button>
          </div>

          <dl class="specs">
            <div><dt>Format</dt><dd>GLB (binary glTF 2.0), ${escapeHtml(p.fileSize)}</dd></div>
            <div><dt>Size from 3D file</dt><dd data-dims>Measuring…</dd></div>
          </dl>

          <div class="controls" aria-label="3D controls">
            <fieldset class="control" data-variants hidden>
              <legend>Finish</legend>
              <div class="chips" data-variant-list></div>
            </fieldset>

            <div class="control">
              <div class="control__row">
                <label for="rot">Rotation</label>
                <output for="rot" data-rot-out>0°</output>
              </div>
              <div class="control__slider">
                <button type="button" class="icon-btn" data-rot-step="-45" aria-label="Rotate 45 degrees left">${icon('rotateLeft', 18)}</button>
                <input id="rot" type="range" min="0" max="359" step="1" value="0" data-rot />
                <button type="button" class="icon-btn" data-rot-step="45" aria-label="Rotate 45 degrees right">${icon('rotateRight', 18)}</button>
              </div>
            </div>

            <div class="control">
              <div class="control__row">
                <label for="scale">Preview size</label>
                <output for="scale" data-scale-out>100%</output>
              </div>
              <input id="scale" type="range" min="${SCALE_MIN}" max="${SCALE_MAX}" step="5" value="100" data-scale />
              <p class="control__note">Changes the on-screen preview only. Real-world size in AR comes from the 3D file.</p>
            </div>

            <div class="control control--inline">
              <label class="switch">
                <input type="checkbox" data-autorotate ${autoRotateDefault ? 'checked' : ''} />
                <span class="switch__track" aria-hidden="true"></span>
                <span>Auto-rotate</span>
              </label>
              <button type="button" class="btn btn--ghost btn--small" data-reset>${icon('reset', 16)} Reset view</button>
            </div>
          </div>

          <ul class="tips">
            <li>${icon('hand', 16)} Drag to rotate. Scroll or pinch to zoom. Right-drag or two-finger drag to pan.</li>
            <li>${icon('phone', 16)} Open AR on a supported mobile device.</li>
            <li>${icon('info', 16)} <button type="button" class="link-btn" data-guide>How to place an object in AR</button></li>
            ${p.floor ? `<li>${icon('ruler', 16)} <a class="link" href="#/smartfit?add=${p.id}">Check if it fits your room in SmartFit</a></li>` : ''}
            <li>${icon('layers', 16)} <a class="link" href="#/multiplace">Arrange it with other pieces in MultiPlace</a></li>
          </ul>
        </div>
      </div>

      <section class="others" aria-labelledby="others-title">
        <h2 id="others-title" class="section-title section-title--small">Try another object</h2>
        <div class="others__strip">
          ${others
            .map(
              (o) => `<a class="mini" href="#/product/${o.id}">
                <img src="${o.thumb}" alt="" width="96" height="96" loading="lazy" decoding="async" />
                <span>${escapeHtml(o.name)}</span></a>`,
            )
            .join('')}
        </div>
      </section>
    </div>`;

  const $ = (sel) => main.querySelector(sel);
  const arBtn = $('[data-ar]');
  const arLabel = $('[data-ar-label]');
  const arHint = $('[data-ar-hint]');
  const rot = $('[data-rot]');
  const rotOut = $('[data-rot-out]');
  const scale = $('[data-scale]');
  const scaleOut = $('[data-scale-out]');
  const autoRotate = $('[data-autorotate]');
  const trueScale = $('[data-true-scale]');
  const dims = $('[data-dims]');
  let arSupported = null;

  function setAR(state) {
    arBtn.dataset.state = state;
    const labels = {
      loading: `${icon('scan', 20)} Model loading…`,
      checking: `${icon('scan', 20)} Checking AR availability…`,
      ready: `${icon('scan', 20)} View in my room`,
      unsupported: `${icon('phone', 20)} AR not supported here`,
      error: `${icon('alert', 20)} AR unavailable — model failed`,
    };
    arLabel.innerHTML = labels[state];
    arBtn.disabled = state === 'error';
    const hints = {
      loading: 'AR becomes available once the model has loaded.',
      checking: 'Checking AR availability…',
      ready: `Opens ${likelyRuntime() ?? 'AR'} on this device. Point your camera at the floor or a table.`,
      unsupported:
        getPlatform() === 'desktop'
          ? 'Computers cannot place objects in a room. Tap the button to get a link for your phone.'
          : "This browser didn't report AR support. Tap the button for details.",
      error: 'Fix the model loading problem above first.',
    };
    arHint.textContent = hints[state];
  }

  const { viewer } = createViewer(
    $('[data-viewer]'),
    {
      src: p.model,
      alt: `3D model of the ${p.name}`,
      poster: p.thumb,
      cameraOrbit: p.cameraOrbit,
      autoRotate: autoRotateDefault,
      arPlacement: p.placement,
      onLoad: async (v) => {
        // Real dimensions straight from the model's bounding box (metres, scale 1).
        const d = v.getDimensions();
        dims.textContent = `${formatMetres(d.x)} wide × ${formatMetres(d.z)} deep × ${formatMetres(d.y)} high`;
        setupVariants(v);
        setAR('checking');
        arSupported = await checkARSupport(v);
        if (!signal.aborted) setAR(arSupported ? 'ready' : 'unsupported');
        if (params.get('ar') === '1') {
          history.replaceState(null, '', `#/product/${p.id}`);
          arBtn.focus();
          arBtn.classList.add('pulse');
          if (!arSupported) launchAR(v, { productName: p.name });
        }
      },
      onError: () => {
        setAR('error');
        dims.textContent = 'Unavailable';
      },
    },
    signal,
  );

  function setupVariants(v) {
    const variants = v.availableVariants || [];
    if (!variants.length) return;
    const box = $('[data-variants]');
    const list = $('[data-variant-list]');
    const current = v.variantName ?? variants[0];
    list.innerHTML = variants
      .map(
        (name) =>
          `<button type="button" class="chip" data-variant="${escapeHtml(name)}" aria-pressed="${name === current}">${escapeHtml(prettyVariant(name))}</button>`,
      )
      .join('');
    box.hidden = false;
    list.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('[data-variant]');
        if (!btn) return;
        v.variantName = btn.dataset.variant;
        list.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
      },
      { signal },
    );
  }

  function applyRotation(deg) {
    const d = ((Math.round(deg) % 360) + 360) % 360;
    rot.value = d;
    rotOut.textContent = `${d}°`;
    // orientation is "roll pitch yaw"; yaw spins the model around its vertical axis
    viewer.setAttribute('orientation', `0deg 0deg ${d}deg`);
  }

  function applyScale(pct) {
    const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number(pct))) / 100;
    scale.value = Math.round(s * 100);
    scaleOut.textContent = `${Math.round(s * 100)}%`;
    viewer.setAttribute('scale', `${s} ${s} ${s}`);
  }

  rot.addEventListener('input', () => applyRotation(rot.value), { signal });
  main.querySelectorAll('[data-rot-step]').forEach((b) =>
    b.addEventListener('click', () => applyRotation(Number(rot.value) + Number(b.dataset.rotStep)), { signal }),
  );
  scale.addEventListener('input', () => applyScale(scale.value), { signal });

  autoRotate.addEventListener(
    'change',
    () => viewer.toggleAttribute('auto-rotate', autoRotate.checked),
    { signal },
  );
  trueScale.addEventListener(
    'change',
    () => viewer.setAttribute('ar-scale', trueScale.checked ? 'fixed' : 'auto'),
    { signal },
  );

  $('[data-reset]').addEventListener(
    'click',
    () => {
      applyRotation(0);
      applyScale(100);
      viewer.cameraOrbit = p.cameraOrbit;
      viewer.cameraTarget = 'auto auto auto';
      viewer.fieldOfView = 'auto';
      viewer.resetTurntableRotation?.(0);
      viewer.jumpCameraToGoal?.();
      toast('View reset to the original size and angle.', 'success', 2500);
    },
    { signal },
  );

  arBtn.addEventListener(
    'click',
    () => {
      arBtn.classList.remove('pulse');
      launchAR(viewer, { productName: p.name });
    },
    { signal },
  );
  $('[data-guide]').addEventListener(
    'click',
    () => launchAR(viewer, { productName: p.name, forceGuide: true }),
    { signal },
  );

  viewer.addEventListener(
    'ar-status',
    (e) => {
      const s = e.detail?.status;
      if (s === 'session-started') arHint.textContent = 'AR session running. Scan the floor slowly to place the object.';
      if (s === 'object-placed') arHint.textContent = 'Placed. Drag to move it, twist with two fingers to rotate.';
      if (s === 'not-presenting' && arSupported) setAR('ready');
      if (s === 'failed') {
        setAR('ready');
        toast(
          'AR could not start. Camera access may have been blocked, or this phone lacks the AR service (Google Play Services for AR on Android).',
          'error',
          9000,
        );
      }
    },
    { signal },
  );
  viewer.addEventListener(
    'ar-tracking',
    (e) => {
      if (e.detail?.status === 'not-tracking') arHint.textContent = 'Tracking lost. Move the phone slowly over a well-lit, textured surface.';
    },
    { signal },
  );

  // --- Fix Position (custom WebXR) -------------------------------------
  const fixText = $('[data-fix-text]');
  const fixBtn = $('[data-fix-start]');
  let fixModule = null;
  detectWebXRAR().then((r) => {
    if (signal.aborted) return;
    if (r.supported && p.placement === 'wall') {
      // Fix Position places on the floor; a wall item must not be stood on the floor by mistake
      fixText.innerHTML =
        'This is a wall item. Fix Position places objects on the floor, so use <a class="link" href="#/multiplace">MultiPlace AR</a>, which hangs wall items on a detected wall, or View in my room.';
    } else if (r.supported) {
      // preload so the click handler can request the session immediately
      fixModule = import('../ar/placementSession.js');
      fixText.textContent =
        'Place the object on your floor, press Fix Position to lock it to that spot, then walk around it. Unlock to move it, Reset to start over.';
      fixBtn.hidden = false;
    } else {
      fixText.textContent = `${webxrUnavailableText(r.reason, 'Fix Position controls')}${
        getPlatform() === 'android' ? ' View in my room still works here: the native viewer keeps the object where you place it.' : ''
      }`;
    }
  });
  fixBtn.addEventListener(
    'click',
    async () => {
      if (!fixModule) return;
      const m = await fixModule;
      m.startFixPosition({ name: p.name, model: p.model });
    },
    { signal },
  );

  applyRotation(0);
  applyScale(100);
}

function prettyVariant(name) {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
