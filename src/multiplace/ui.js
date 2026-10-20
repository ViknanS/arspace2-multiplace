/**
 * Shared MultiPlace UI pieces used both inside the AR overlay and in the 3D
 * composer: the horizontal object picker and the "Objects in room" panel.
 */
import { CATEGORIES, PRODUCTS, getProduct } from '../data/products.js';
import { stateLabel } from './objectManager.js';
import { escapeHtml } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/**
 * Horizontal, swipeable furniture carousel with search and category chips.
 * Tapping an item adds a new instance of it; "Add another" adds one more copy
 * of the highlighted item, so duplicates are one tap away.
 * @param {HTMLElement} root
 * @param {{ onPick: (productId) => void, signal?: AbortSignal }} opts
 */
export function renderPicker(root, { onPick, signal }) {
  let category = 'all';
  let query = '';
  root.classList.add('mp-picker');
  root.innerHTML = `
    <div class="mp-picker__bar">
      <label class="mp-search">
        <span class="visually-hidden">Search furniture</span>
        <input type="search" data-search placeholder="Search furniture" autocomplete="off" enterkeyhint="search" />
      </label>
      <button type="button" class="mp-addsel" data-add-selected hidden>+ Add another</button>
    </div>
    <div class="mp-picker__cats" role="group" aria-label="Filter objects by category">
      ${CATEGORIES.map(
        (c) => `<button type="button" class="mp-chip" data-cat="${c.id}" aria-pressed="${c.id === 'all'}">${escapeHtml(c.label)}</button>`,
      ).join('')}
    </div>
    <div class="mp-picker__row">
      <button type="button" class="mp-picker__arrow" data-scroll="-1" aria-label="Scroll left">${icon('arrowLeft', 18)}</button>
      <div class="mp-picker__strip" data-strip role="listbox" aria-label="Furniture to add"></div>
      <button type="button" class="mp-picker__arrow mp-picker__arrow--right" data-scroll="1" aria-label="Scroll right">${icon('arrowLeft', 18)}</button>
    </div>`;
  const strip = root.querySelector('[data-strip]');
  const search = root.querySelector('[data-search]');
  const addSel = root.querySelector('[data-add-selected]');
  let selected = null;

  function matches(p) {
    if (category !== 'all' && p.category !== category) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.category.includes(q) || p.id.includes(q);
  }

  function drawAdd() {
    const p = selected && getProduct(selected);
    addSel.hidden = !p;
    if (p) addSel.textContent = `+ Add another ${p.name}`;
  }

  function draw() {
    const items = PRODUCTS.filter(matches);
    drawAdd();
    if (!items.length) {
      strip.innerHTML = `<p class="mp-nomatch">No furniture matches “${escapeHtml(query)}”.</p>`;
      return;
    }
    strip.innerHTML = items
      .map(
        (p) => `
        <button type="button" class="mp-item${p.id === selected ? ' is-selected' : ''}" role="option" aria-selected="${p.id === selected}" data-product="${p.id}">
          <img src="${p.thumb}" alt="" width="68" height="68" loading="lazy" decoding="async" />
          <span>${escapeHtml(p.name)}</span>${p.placement === 'wall' ? '<em class="mp-item__tag">Wall</em>' : ''}
        </button>`,
      )
      .join('');
  }

  const opt = signal ? { signal } : undefined;
  root.querySelector('.mp-picker__cats').addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      category = b.dataset.cat;
      root.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
      strip.scrollTo({ left: 0 });
    },
    opt,
  );
  strip.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-product]');
      if (!b) return;
      selected = b.dataset.product;
      strip.querySelectorAll('.mp-item').forEach((x) => {
        x.classList.toggle('is-selected', x === b);
        x.setAttribute('aria-selected', String(x === b));
      });
      drawAdd();
      onPick(selected);
    },
    opt,
  );
  search.addEventListener(
    'input',
    () => {
      query = search.value.trim();
      draw();
      strip.scrollTo({ left: 0 });
    },
    opt,
  );
  // keep typing inside the search box from reaching page shortcuts (Delete, R, L)
  search.addEventListener('keydown', (e) => e.stopPropagation(), opt);
  addSel.addEventListener('click', () => selected && onPick(selected), opt);
  root.querySelectorAll('[data-scroll]').forEach((b) =>
    b.addEventListener('click', () => strip.scrollBy({ left: Number(b.dataset.scroll) * strip.clientWidth * 0.8, behavior: 'smooth' }), opt),
  );
  draw();
  return {
    setSelected(id) {
      if (selected === id) return;
      selected = id;
      strip.querySelectorAll('.mp-item').forEach((x) => {
        const on = x.dataset.product === id;
        x.classList.toggle('is-selected', on);
        x.setAttribute('aria-selected', String(on));
      });
      drawAdd();
    },
  };
}

/** HTML rows for the "Objects in room" panel. */
export function objectRowsHTML(manager) {
  const list = manager.list();
  if (!list.length) return `<li class="mp-empty">No objects yet. Pick one from the bar below.</li>`;
  return list
    .map((o) => {
      const p = getProduct(o.productId);
      const sel = o.instanceId === manager.selectedId;
      return `
        <li class="mp-row${sel ? ' is-selected' : ''}" data-row="${o.instanceId}">
          <button type="button" class="mp-row__name" data-act="select" data-id="${o.instanceId}">
            <strong>${escapeHtml(p?.name ?? o.productId)}</strong>
            <span>${o.instanceId} · <em class="mp-state mp-state--${o.state}">${stateLabel(o.state)}</em>${o.surface === 'wall' ? ' · wall' : ''}</span>
          </button>
          <div class="mp-row__btns">
            ${
              o.state === 'locked'
                ? `<button type="button" class="mp-mini" data-act="unlock" data-id="${o.instanceId}">Unlock</button>`
                : o.state === 'placed'
                  ? `<button type="button" class="mp-mini" data-act="lock" data-id="${o.instanceId}">Lock</button>`
                  : ''
            }
            <button type="button" class="mp-mini mp-mini--danger" data-act="remove" data-id="${o.instanceId}" aria-label="Remove ${escapeHtml(o.instanceId)}">${icon('x', 14)}</button>
          </div>
        </li>`;
    })
    .join('');
}
