import { createViewer } from '../components/ModelViewer.js';
import { escapeHtml, formatMetres } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const MAX_MB = 50;

/**
 * Local preview of the user's own .glb file. The file never leaves the device:
 * it is read into a temporary blob: URL that is revoked when replaced or when
 * the user leaves the page. AR is deliberately not offered here, because
 * Scene Viewer and AR Quick Look cannot open blob: URLs.
 */
export function renderUpload(main, { signal }) {
  let objectUrl = null;
  const release = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };
  signal.addEventListener('abort', release);

  main.innerHTML = `
    <section class="page-head container">
      <h1>Preview your own model</h1>
      <p class="lede">Open a .glb file from your device to inspect it in the same 3D viewer. The file stays on your device and is never uploaded.</p>
    </section>
    <section class="container upload">
      <label class="drop" data-drop>
        <input type="file" accept=".glb,model/gltf-binary" data-file class="visually-hidden" tabindex="-1" />
        ${icon('upload', 30)}
        <span class="drop__title">Choose a .glb file or drop it here</span>
        <span class="drop__note">Binary glTF 2.0 only, up to ${MAX_MB} MB. Images (JPG, PNG) can't be turned into 3D models here.</span>
      </label>
      <p class="upload__error" role="alert" data-error hidden></p>
      <div class="upload__result" data-result hidden>
        <div class="upload__viewer" data-viewer></div>
        <div class="upload__info">
          <h2 data-name></h2>
          <dl class="specs">
            <div><dt>File size</dt><dd data-size></dd></div>
            <div><dt>Size from 3D file</dt><dd data-dims>Measuring…</dd></div>
          </dl>
          <label class="switch">
            <input type="checkbox" data-autorotate checked />
            <span class="switch__track" aria-hidden="true"></span>
            <span>Auto-rotate</span>
          </label>
          <p class="notice">${icon('info', 16)}<span>AR isn't available for local files. Phone AR viewers can only open models hosted at a public https address, so add your model to <code>public/models</code> and the catalog to place it in AR.</span></p>
          <button type="button" class="btn btn--ghost btn--small" data-clear>${icon('x', 16)} Remove model</button>
        </div>
      </div>
    </section>`;

  const $ = (s) => main.querySelector(s);
  const input = $('[data-file]');
  const drop = $('[data-drop]');
  const errorEl = $('[data-error]');
  const result = $('[data-result]');

  const showError = (msg) => {
    errorEl.innerHTML = `${icon('alert', 18)} ${escapeHtml(msg)}`;
    errorEl.hidden = false;
  };

  async function handleFile(file) {
    errorEl.hidden = true;
    if (!file) return;
    if (!/\.glb$/i.test(file.name)) {
      return showError(`“${file.name}” isn't a .glb file. Export your model as binary glTF (.glb) and try again.`);
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return showError(`This file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB so the preview stays responsive.`);
    }
    if (file.size < 20) return showError('This file is empty or too small to be a 3D model.');
    // Every valid GLB starts with the ASCII magic bytes "glTF".
    const magic = new TextDecoder().decode(await file.slice(0, 4).arrayBuffer());
    if (magic !== 'glTF') {
      return showError('This file has a .glb name but its contents are not a binary glTF model. It may be corrupted or renamed.');
    }

    release();
    objectUrl = URL.createObjectURL(file);
    result.hidden = false;
    $('[data-name]').textContent = file.name;
    $('[data-size]').textContent = `${(file.size / 1048576).toFixed(2)} MB`;
    $('[data-dims]').textContent = 'Measuring…';
    $('[data-autorotate]').checked = true;

    // a fresh controller per file so listeners from the previous model are dropped
    fileController?.abort();
    fileController = new AbortController();
    const fileSignal = AbortSignal.any ? AbortSignal.any([signal, fileController.signal]) : signal;
    const { viewer } = createViewer(
      $('[data-viewer]'),
      {
        src: objectUrl,
        alt: `Your uploaded model ${file.name}`,
        ar: false,
        cameraOrbit: '30deg 75deg auto',
        onLoad: (v) => {
          const d = v.getDimensions();
          $('[data-dims]').textContent = `${formatMetres(d.x)} wide × ${formatMetres(d.z)} deep × ${formatMetres(d.y)} high`;
        },
        onError: () => ($('[data-dims]').textContent = 'Unavailable'),
      },
      fileSignal,
    );
    currentViewer = viewer;
  }

  let fileController = null;
  let currentViewer = null;

  input.addEventListener('change', () => handleFile(input.files[0]), { signal });
  $('[data-autorotate]').addEventListener(
    'change',
    (e) => currentViewer?.toggleAttribute('auto-rotate', e.target.checked),
    { signal },
  );
  $('[data-clear]').addEventListener(
    'click',
    () => {
      fileController?.abort();
      $('[data-viewer]').innerHTML = '';
      release();
      result.hidden = true;
      input.value = '';
      drop.focus();
    },
    { signal },
  );

  ['dragenter', 'dragover'].forEach((t) =>
    drop.addEventListener(
      t,
      (e) => {
        e.preventDefault();
        drop.classList.add('is-over');
      },
      { signal },
    ),
  );
  ['dragleave', 'drop'].forEach((t) =>
    drop.addEventListener(t, () => drop.classList.remove('is-over'), { signal }),
  );
  drop.addEventListener(
    'drop',
    (e) => {
      e.preventDefault();
      handleFile(e.dataTransfer?.files?.[0]);
    },
    { signal },
  );
  drop.setAttribute('tabindex', '0');
  drop.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    },
    { signal },
  );
}
