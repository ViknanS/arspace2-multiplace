import { categoryLabel } from '../data/products.js';
import { escapeHtml } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/**
 * A catalog card. Thumbnails are real renders of each .glb (see README),
 * so the catalog page stays light instead of running six WebGL viewers at once.
 */
export function productCardHTML(p, { arAvailable } = {}) {
  const arLink =
    arAvailable === false
      ? `<span class="card__ar card__ar--off" title="AR needs a compatible phone">${icon('phone', 15)} AR on phone</span>`
      : `<a class="card__ar" href="#/product/${p.id}?ar=1">${icon('scan', 15)} View in AR</a>`;

  return `
    <article class="card" data-category="${p.category}">
      <a class="card__media" href="#/product/${p.id}" tabindex="-1" aria-hidden="true">
        <img src="${p.thumb}" alt="" width="480" height="480" loading="lazy" decoding="async"
             onerror="this.closest('.card__media').classList.add('is-missing')" />
        <span class="card__fallback">${icon('cube', 40)}</span>
      </a>
      <div class="card__body">
        <p class="card__category">${escapeHtml(categoryLabel(p.category))}</p>
        <h3 class="card__title"><a href="#/product/${p.id}">${escapeHtml(p.name)}</a></h3>
        <p class="card__summary">${escapeHtml(p.summary)}</p>
        <div class="card__actions">
          <a class="btn btn--small btn--primary" href="#/product/${p.id}">${icon('cube', 16)} View in 3D</a>
          ${arLink}
        </div>
      </div>
    </article>`;
}
