// Helpers for working out what kind of AR (if any) this device can run.
// The authoritative check is <model-viewer>'s own `canActivateAR` property;
// these helpers only add context so we can explain the result to the user.

const GUIDE_KEY = 'arspace.arGuideDismissed';

export function getPlatform() {
  const ua = navigator.userAgent || '';
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || isIPadOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isSecureOrigin() {
  return window.isSecureContext === true;
}

export function isLocalHost() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

/** Which AR runtime model-viewer is most likely to use on this platform. */
export function likelyRuntime() {
  const platform = getPlatform();
  if (platform === 'ios') return 'AR Quick Look';
  if (platform === 'android') return 'WebXR or Google Scene Viewer';
  return null;
}

/**
 * Wait until a <model-viewer> element is upgraded, then read canActivateAR.
 * Resolves to true / false. Never rejects.
 */
export async function checkARSupport(viewer) {
  try {
    await customElements.whenDefined('model-viewer');
    // canActivateAR is computed asynchronously after the element connects
    // (WebXR support is an async query), so give it a moment to settle.
    for (let i = 0; i < 8; i++) {
      if (viewer.canActivateAR) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return Boolean(viewer.canActivateAR);
  } catch {
    return false;
  }
}

/** Plain-language reason AR is unavailable, for the compatibility dialog. */
export function unsupportedReason() {
  const platform = getPlatform();
  if (platform === 'desktop') {
    return 'Desktop and laptop browsers cannot place objects in a room because they have no motion-tracked camera. Open this page on an AR-capable phone or tablet.';
  }
  if (!isSecureOrigin()) {
    return 'AR on the web needs a secure (https://) connection. Open the deployed https link of ARSpace on this phone.';
  }
  if (platform === 'ios') {
    return 'This iPhone or iPad browser did not report AR Quick Look support. Try opening the page in Safari on a device running a recent version of iOS.';
  }
  return 'This browser did not report WebXR or Scene Viewer support. Try Google Chrome on an ARCore-supported Android phone with Google Play Services for AR installed.';
}

export function guideDismissed() {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGuideDismissed(value) {
  try {
    if (value) localStorage.setItem(GUIDE_KEY, '1');
    else localStorage.removeItem(GUIDE_KEY);
  } catch {
    /* storage unavailable (private mode) — the guide will simply show again */
  }
}
