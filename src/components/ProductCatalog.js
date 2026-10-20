import { CATEGORIES, PRODUCTS } from '../data/products.js';
import { productCardHTML } from './ProductCard.js';
import { escapeHtml } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getPlatform } from '../utils/arSupport.js';

/** Full collection page: category filter + name search, both applied together. */
export function renderCatalogPage(main, { params, signal }) {
  const initialCategory = CATEGORIES.some((c) => c.id === params.get('category'))
    ? params.get('category')
    : 'all';
  const state = { category: initialCategory, query: params.get('q') ?? '' };
  // Desktop browsers can never launch AR, so say so on the cards up front.
  const arAvailable = getPlatform() === 'desktop' ? false : undefined;

  main.innerHTML = `
    <section class="page-head container">
      <h1>The collection</h1>
      <p class="lede">Six real 3D models. Open any of them to rotate, resize and recolour it, then place it in your room on an AR-capable phone.</p>
    </section>
    <section class="container catalog" aria-label="Catalog">
      <div class="catalog__toolbar">
        <div class="segmented" role="group" aria-label="Filter by category">
          ${CATEGORIES.map((c) => {
            const count = c.id === 'all' ? PRODUCTS.length : PRODUCTS.filter((p) => p.category === c.id).length;
            return `<button type="button" class="segmented__btn" data-category="${c.id}" aria-pressed="${c.id === state.category}">
              ${c.label} <span class="segmented__count">${count}</span></button>`;
          }).join('')}
        </div>
        <label class="search">
          ${icon('search', 18)}
          <span class="visually-hidden">Search objects by name</span>
          <input type="search" placeholder="Search by name" autocomplete="off" value="${escapeHtml(state.query)}" />
        </label>
      </div>
      <p class="catalog__count" aria-live="polite"></p>
      <div class="grid"></div>
    </section>`;

  const grid = main.querySelector('.grid');
  const count = main.querySelector('.catalog__count');
  const input = main.querySelector('.search input');
  const buttons = [...main.querySelectorAll('.segmented__btn')];

  function update() {
    const q = state.query.trim().toLowerCase();
    const results = PRODUCTS.filter(
      (p) =>
        (state.category === 'all' || p.category === state.category) &&
        (!q || p.name.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q)),
    );
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.category === state.category)));

    if (results.length === 0) {
      grid.innerHTML = `
        <div class="empty">
          ${icon('search', 28)}
          <h2>No objects match “${escapeHtml(state.query)}”</h2>
          <p>Try another name, or clear the search to see everything in ${escapeHtml(
            CATEGORIES.find((c) => c.id === state.category).label.toLowerCase(),
          )}.</p>
          <button type="button" class="btn btn--ghost" data-clear>Clear search and filters</button>
        </div>`;
    } else {
      grid.innerHTML = results.map((p) => productCardHTML(p, { arAvailable })).join('');
    }
    count.textContent = `Showing ${results.length} of ${PRODUCTS.length} objects`;

    // keep the filter in the URL so it survives reloads and can be shared
    const sp = new URLSearchParams();
    if (state.category !== 'all') sp.set('category', state.category);
    if (state.query) sp.set('q', state.query);
    const next = `#/collection${sp.toString() ? `?${sp}` : ''}`;
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  main.querySelector('.segmented').addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      state.category = btn.dataset.category;
      update();
    },
    { signal },
  );
  input.addEventListener(
    'input',
    () => {
      state.query = input.value;
      update();
    },
    { signal },
  );
  grid.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest('[data-clear]')) return;
      state.query = '';
      state.category = 'all';
      input.value = '';
      update();
      input.focus();
    },
    { signal },
  );

  update();
}
