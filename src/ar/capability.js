/**
 * Runtime detection of custom WebXR AR (immersive-ar).
 *
 * This decides whether ARSpace can offer its own in-camera controls
 * (Fix Position, AutoGrid corner capture). It never guesses from the device
 * name: it asks the browser. Native AR (Scene Viewer, AR Quick Look) is
 * detected separately by <model-viewer> and is unaffected by this check.
 */
import { getPlatform } from '../utils/arSupport.js';

let cached = null;

export function detectWebXRAR() {
  if (cached) return cached;
  cached = (async () => {
    if (!window.isSecureContext) {
      return { supported: false, reason: 'insecure' };
    }
    if (!('xr' in navigator) || !navigator.xr) {
      return { supported: false, reason: 'no-webxr' };
    }
    try {
      const ok = await navigator.xr.isSessionSupported('immersive-ar');
      return ok ? { supported: true, reason: 'ok' } : { supported: false, reason: 'no-immersive-ar' };
    } catch {
      return { supported: false, reason: 'blocked' };
    }
  })();
  return cached;
}

/** Reset the cached result (used by tests). */
export function resetXRDetection() {
  cached = null;
}

/** Plain-language explanation of why custom WebXR AR isn't offered here. */
export function webxrUnavailableText(reason, feature = 'These controls') {
  const platform = getPlatform();
  if (reason === 'insecure') {
    return `${feature} need a secure https:// page. Open the deployed https link of ARSpace.`;
  }
  if (platform === 'ios') {
    return `${feature} need WebXR AR, which Safari on iPhone and iPad doesn't provide. ${
      feature === 'Fix Position controls'
        ? 'Use View in my room instead: AR Quick Look keeps the object where you place it, and you can drag, rotate and pinch it.'
        : 'Enter your measurements instead, for example from a tape measure or the Measure app.'
    }`;
  }
  if (platform === 'desktop') {
    return `${feature} need an AR-capable phone or tablet with WebXR, such as Chrome on an ARCore-supported Android phone.`;
  }
  return `${feature} need WebXR AR, which this browser didn't report. Try Chrome on an ARCore-supported Android phone with Google Play Services for AR.`;
}
