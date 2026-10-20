/**
 * Shared MultiPlace UI pieces used both inside the AR overlay and in the 3D
 * composer: the horizontal object picker and the "Objects in room" panel.
 */
import { CATEGORIES, PRODUCTS, getProduct } from '../data/products.js';
import { stateLabel } from './objectManager.js';
import { escapeHtml } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/**
 * Horizontal, swipeable product picker with category chips.
 * @param {HTMLElement} root
 * @param {{ onPick: (productId) => void, signal?: AbortSignal }} opts
 */
export function renderPicker(root, { onPick, signal }) {
  let category = 'all';
  root.classList.add('mp-picker');
  root.innerHTML = `
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
  let selected = null;

  function draw() {
    const items = PRODUCTS.filter((p) => category === 'all' || p.category === category);
    strip.innerHTML = items
      .map(
        (p) => `
        <button type="button" class="mp-item${p.id === selected ? ' is-selected' : ''}" role="option" aria-selected="${p.id === selected}" data-product="${p.id}">
          <img src="${p.thumb}" alt="" width="64" height="64" loading="lazy" decoding="async" />
          <span>${escapeHtml(p.name)}</span>
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
      onPick(selected);
    },
    opt,
  );
  root.querySelectorAll('[data-scroll]').forEach((b) =>
    b.addEventListener('click', () => strip.scrollBy({ left: Number(b.dataset.scroll) * strip.clientWidth * 0.8, behavior: 'smooth' }), opt),
  );
  draw();
  return {
    setSelected(id) {
      selected = id;
      draw();
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
            <span>${o.instanceId} · <em class="mp-state mp-state--${o.state}">${stateLabel(o.state)}</em></span>
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
