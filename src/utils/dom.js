export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer;

/** Short status message in the corner of the screen. kind: 'info' | 'error' | 'success' */
export function toast(message, kind = 'info', duration = 5000) {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  region.innerHTML = `<div class="toast toast--${kind}">${escapeHtml(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (region.innerHTML = ''), duration);
}

export function formatMetres(m) {
  if (!Number.isFinite(m)) return '–';
  return m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`;
}
