import { icon } from '../utils/icons.js';

const LINKS = [
  { href: '#/', label: 'Home', match: (r) => r === 'home' },
  { href: '#/collection', label: 'Collection', match: (r) => r === 'collection' || r === 'product' },
  { href: '#/autogrid', label: 'AutoGrid', match: (r) => r === 'autogrid' },
  { href: '#/smartfit', label: 'SmartFit', match: (r) => r === 'smartfit' },
  { href: '#/multiplace', label: 'MultiPlace', match: (r) => r === 'multiplace' },
  { href: '#/upload', label: 'Your model', match: (r) => r === 'upload' },
];

export function renderNavbar(root) {
  root.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <nav class="nav" aria-label="Main">
      <a class="brand" href="#/" aria-label="ARSpace home">
        <span class="brand__mark" aria-hidden="true"></span>
        <span class="brand__name">ARSpace</span>
      </a>
      <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Open menu">
        ${icon('menu', 22)}
      </button>
      <ul class="nav__links" id="nav-links">
        ${LINKS.map((l) => `<li><a href="${l.href}" data-nav>${l.label}</a></li>`).join('')}
      </ul>
    </nav>`;

  const toggle = root.querySelector('.nav__toggle');
  const list = root.querySelector('.nav__links');
  const setOpen = (open) => {
    list.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    toggle.innerHTML = icon(open ? 'x' : 'menu', 22);
  };
  toggle.addEventListener('click', () => setOpen(!list.classList.contains('is-open')));
  list.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && list.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
}

/** Highlight the link for the current route. */
export function updateNavbar(root, routeName) {
  root.querySelectorAll('[data-nav]').forEach((a, i) => {
    const active = LINKS[i].match(routeName);
    a.classList.toggle('is-active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
