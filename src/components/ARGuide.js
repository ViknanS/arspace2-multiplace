import qrcode from 'qrcode-generator';
import { icon } from '../utils/icons.js';
import { escapeHtml, toast } from '../utils/dom.js';
import {
  getPlatform,
  guideDismissed,
  isLocalHost,
  likelyRuntime,
  setGuideDismissed,
  unsupportedReason,
} from '../utils/arSupport.js';

let dialog;

function getDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'modal';
  dialog.addEventListener('click', (e) => {
    // click on the backdrop closes the dialog
    if (e.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/** Dialog shown when the device or browser cannot start AR. */
export function showUnsupportedDialog(productName) {
  const d = getDialog();
  const pageUrl = location.href.replace(/[?&]ar=1/, '');
  const canShowQR = getPlatform() === 'desktop' && !isLocalHost();
  d.innerHTML = `
    <form method="dialog" class="modal__inner">
      <button class="modal__close" value="close" aria-label="Close">${icon('x', 20)}</button>
      <div class="modal__icon">${icon('phone', 26)}</div>
      <h2>AR isn't available on this device</h2>
      <p>AR mode is not available on this device or browser. You can still explore ${
        productName ? `the ${escapeHtml(productName)}` : 'this object'
      } in the interactive 3D viewer.</p>
      <p class="muted">${escapeHtml(unsupportedReason())}</p>
      ${
        canShowQR
          ? `<div class="qr">
               <div class="qr__code">${qrSvg(pageUrl)}</div>
               <p>Scan with your phone's camera to open this object there, then tap <strong>View in AR</strong>.</p>
             </div>`
          : getPlatform() === 'desktop'
            ? `<p class="muted">You're running ARSpace locally. To try AR, deploy it (for example to Netlify) and open the https link on your phone.</p>`
            : ''
      }
      <div class="modal__actions">
        <button class="btn btn--primary" value="close">Keep exploring in 3D</button>
      </div>
    </form>`;
  d.showModal();
}

/**
 * First-time onboarding guide. `onStart` runs directly inside the Start button's
 * click handler so the browser still treats the AR launch as a user gesture.
 */
function showGuide(onStart) {
  return new Promise((resolve) => {
    const d = getDialog();
    const runtime = likelyRuntime();
    d.innerHTML = `
      <form method="dialog" class="modal__inner">
        <button class="modal__close" value="cancel" aria-label="Close">${icon('x', 20)}</button>
        <div class="modal__icon">${icon('scan', 26)}</div>
        <h2>How to place an object</h2>
        <ol class="steps-list">
          <li>Tap <strong>Start AR</strong> below. ${
            runtime ? `Your phone will open ${runtime}, which may appear as a separate screen.` : ''
          }</li>
          <li>Allow camera access if your phone asks for it.</li>
          <li>Point the camera at the floor or a table and move the phone slowly from side to side until a surface is detected.</li>
          <li>Tap or wait for the object to land on the surface.</li>
          <li>Drag with one finger to move it, twist with two fingers to rotate, and pinch to resize where your phone supports it.</li>
        </ol>
        <p class="muted small">Works best in a well-lit room on a textured surface. Plain white or shiny floors are harder for phones to detect. The controls from this page are not shown inside your phone's AR view; close AR to return here.</p>
        <label class="check">
          <input type="checkbox" name="dismiss" /> Don't show this guide again
        </label>
        <div class="modal__actions">
          <button class="btn btn--ghost" value="cancel">Not now</button>
          <button class="btn btn--primary" value="start" autofocus>${icon('scan', 18)} Start AR</button>
        </div>
      </form>`;
    const startBtn = d.querySelector('[value=start]');
    startBtn.addEventListener('click', () => {
      if (d.querySelector('[name=dismiss]').checked) setGuideDismissed(true);
      onStart?.();
    });
    d.addEventListener('close', () => resolve(d.returnValue === 'start'), { once: true });
    d.returnValue = '';
    d.showModal();
  });
}

/**
 * The single entry point for "View in AR". Never silently does nothing:
 * it either launches AR, explains why AR is unavailable, or reports an error.
 */
export async function launchAR(viewer, { productName, forceGuide = false } = {}) {
  if (!viewer || !viewer.loaded) {
    toast('The 3D model is still loading. AR will be ready as soon as it finishes.');
    return;
  }
  if (!viewer.canActivateAR) {
    showUnsupportedDialog(productName);
    return;
  }
  const start = async () => {
    try {
      // activateAR() must be called from a user's tap; both call sites are click handlers.
      await viewer.activateAR();
    } catch (err) {
      console.error('AR launch failed', err);
      toast('Your phone could not start AR. Check camera permission for this browser and try again.', 'error', 8000);
    }
  };
  if (forceGuide || !guideDismissed()) {
    await showGuide(start);
    return;
  }
  start();
}
