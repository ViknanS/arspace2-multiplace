import { escapeHtml } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const SLOW_LOAD_MS = 25000;

/**
 * Builds a <model-viewer> inside a stage with loading progress, error and
 * slow-network states. Returns the element plus a small controller.
 *
 * Every listener is registered with the page's AbortSignal, so when the user
 * switches objects or pages the old listeners are removed automatically and
 * no stale events can update the new page.
 */
export function createViewer(container, options, signal) {
  const {
    src,
    alt,
    poster,
    ar = true,
    arPlacement = 'floor',
    cameraOrbit = '30deg 75deg auto',
    autoRotate = true,
    interactive = true,
    loading = 'eager',
    onLoad,
    onError,
  } = options;

  container.innerHTML = `
    <div class="stage">
      <div class="stage__floor" aria-hidden="true"></div>
      <model-viewer
        src="${escapeHtml(src)}"
        alt="${escapeHtml(alt)}"
        ${poster ? `poster="${escapeHtml(poster)}"` : ''}
        loading="${loading}"
        reveal="auto"
        ${ar ? `ar ar-modes="webxr scene-viewer quick-look" ar-scale="auto" ar-placement="${arPlacement}"` : ''}
        ${interactive ? 'camera-controls touch-action="pan-y"' : 'disable-zoom disable-pan'}
        interaction-prompt="${interactive ? 'auto' : 'none'}"
        camera-orbit="${cameraOrbit}"
        min-camera-orbit="auto 15deg auto"
        max-camera-orbit="auto 100deg auto"
        ${autoRotate ? 'auto-rotate' : ''}
        auto-rotate-delay="1500"
        rotation-per-second="18deg"
        environment-image="neutral"
        exposure="1"
        shadow-intensity="1.1"
        shadow-softness="0.9"
        tone-mapping="neutral"
      >
        <div slot="progress-bar"></div>
        <button slot="ar-button" hidden aria-hidden="true" tabindex="-1"></button>
      </model-viewer>
      <div class="stage__loader" role="status" aria-live="polite">
        <div class="loader-ring" aria-hidden="true"></div>
        <p class="stage__loader-text">Loading 3D model… <span data-pct>0%</span></p>
        <div class="progress" aria-hidden="true"><span data-bar></span></div>
      </div>
      <div class="stage__error" role="alert" hidden></div>
    </div>`;

  const stage = container.querySelector('.stage');
  const viewer = stage.querySelector('model-viewer');
  const loader = stage.querySelector('.stage__loader');
  const pct = loader.querySelector('[data-pct]');
  const bar = loader.querySelector('[data-bar]');
  const errorBox = stage.querySelector('.stage__error');
  let slowTimer;
  let settled = false;

  function showError(title, detail, { retry = true } = {}) {
    settled = true;
    clearTimeout(slowTimer);
    loader.hidden = true;
    stage.classList.add('has-error');
    errorBox.hidden = false;
    errorBox.innerHTML = `
      ${icon('alert', 28)}
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(detail)}</p>
      ${retry ? `<button type="button" class="btn btn--ghost btn--small" data-retry>${icon('reset', 16)} Try again</button>` : ''}`;
    onError?.(title);
  }

  function startLoading() {
    settled = false;
    stage.classList.remove('has-error', 'is-loaded');
    errorBox.hidden = true;
    loader.hidden = false;
    loader.classList.remove('is-slow');
    pct.textContent = '0%';
    bar.style.transform = 'scaleX(0)';
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => {
      if (settled) return;
      loader.classList.add('is-slow');
      pct.textContent = navigator.onLine
        ? '— this is taking longer than usual. Large models can be slow on mobile data.'
        : '— you appear to be offline. Reconnect to finish loading.';
    }, SLOW_LOAD_MS);
  }

  viewer.addEventListener(
    'progress',
    (e) => {
      const p = Math.round((e.detail?.totalProgress ?? 0) * 100);
      if (!loader.classList.contains('is-slow')) pct.textContent = `${p}%`;
      bar.style.transform = `scaleX(${p / 100})`;
    },
    { signal },
  );

  viewer.addEventListener(
    'load',
    () => {
      settled = true;
      clearTimeout(slowTimer);
      loader.hidden = true;
      stage.classList.add('is-loaded');
      onLoad?.(viewer);
    },
    { signal },
  );

  viewer.addEventListener(
    'error',
    (e) => {
      const type = e.detail?.type;
      if (type === 'webglcontextlost') {
        showError(
          'The 3D view stopped',
          'Your device ran out of graphics memory. Close other tabs or apps and reload this page.',
        );
      } else if (!navigator.onLine) {
        showError('You are offline', 'The 3D model could not be downloaded. Reconnect to the internet and try again.');
      } else {
        showError(
          'This 3D model could not be displayed',
          'The file is missing, damaged or not a valid glTF/GLB model. Try again, or pick another object.',
        );
      }
    },
    { signal },
  );

  errorBox.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest('[data-retry]')) return;
      startLoading();
      // re-assigning src forces model-viewer to fetch the model again
      const current = viewer.getAttribute('src');
      viewer.removeAttribute('src');
      requestAnimationFrame(() => viewer.setAttribute('src', current));
    },
    { signal },
  );

  signal.addEventListener('abort', () => clearTimeout(slowTimer));

  // Before the model-viewer library itself has loaded, check the file exists so
  // a missing asset gives a clear message instead of an endless spinner.
  if (!src.startsWith('blob:')) {
    fetch(src, { method: 'HEAD', signal })
      .then((r) => {
        // dev servers answer unknown paths with index.html, so also check the type
        const isHtml = (r.headers.get('content-type') || '').includes('text/html');
        if (!r.ok || isHtml) showError('3D model not found', `The file ${src.split('/').pop()} is missing from the server (HTTP ${r.ok ? 404 : r.status}).`, { retry: false });
      })
      .catch(() => {});
  }

  startLoading();
  return { viewer, stage, showError, startLoading };
}
