import '@fontsource-variable/inter';
import './styles/main.css';
import { renderNavbar, updateNavbar } from './components/Navbar.js';
import { renderFooter } from './components/Footer.js';
import { renderHome } from './pages/Home.js';
import { renderCatalogPage } from './components/ProductCatalog.js';
import { renderProduct } from './pages/Product.js';
import { renderUpload } from './pages/Upload.js';
import { renderSmartFit } from './pages/SmartFit.js';
import { renderAutoGrid } from './pages/AutoGrid.js';
import { renderMultiPlace } from './pages/MultiPlace.js';
import { icon } from './utils/icons.js';
import { toast } from './utils/dom.js';

// Load the 3D/AR engine (model-viewer + three.js) as its own chunk so the page
// shell paints first. <model-viewer> tags upgrade automatically once it arrives.
import('@google/model-viewer').catch((err) => {
  console.error(err);
  toast('The 3D engine failed to load. Check your connection and reload the page.', 'error', 15000);
});

const header = document.getElementById('site-header');
const main = document.getElementById('main');
const footer = document.getElementById('site-footer');

renderNavbar(header);
renderFooter(footer);

let pageController = null;

/**
 * Hash routing keeps the site fully static: it works on Netlify, Vercel and
 * GitHub Pages with no server rewrite rules.
 *   #/                  home
 *   #/how-it-works      home, scrolled to the How it works section
 *   #/collection?...    catalog with filters
 *   #/product/:id       product details + 3D viewer + AR
 *   #/autogrid          AutoGrid room measurement + floor grid
 *   #/smartfit          SmartFit room planner (fit + walkway analysis)
 *   #/multiplace        MultiPlace multi-object AR + 3D room composer
 *   #/upload            local .glb preview
 */
function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  if (parts.length === 0) return { name: 'home', params };
  if (parts[0] === 'how-it-works') return { name: 'home', params, scrollTo: 'how-it-works' };
  if (parts[0] === 'collection') return { name: 'collection', params };
  if (parts[0] === 'product' && parts[1]) return { name: 'product', id: decodeURIComponent(parts[1]), params };
  if (parts[0] === 'upload') return { name: 'upload', params };
  if (parts[0] === 'smartfit') return { name: 'smartfit', params };
  if (parts[0] === 'autogrid') return { name: 'autogrid', params };
  if (parts[0] === 'multiplace') return { name: 'multiplace', params };
  return { name: 'notfound', params };
}

function render() {
  // model-viewer uses this hash when Android Scene Viewer can't open; it handles
  // that itself (fires ar-status "failed" and goes back), so ignore it here.
  if (location.hash.includes('model-viewer-no-ar-fallback')) return;

  const route = parseRoute();
  // Tear down the previous page: removes its listeners and timers. Its
  // <model-viewer> is removed from the DOM, which frees its GPU resources.
  pageController?.abort();
  pageController = new AbortController();
  const { signal } = pageController;

  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  main.innerHTML = '';
  updateNavbar(header, route.name);

  try {
    switch (route.name) {
      case 'home':
        renderHome(main, { signal, scrollTo: route.scrollTo });
        document.title = 'ARSpace — See it in your space';
        break;
      case 'collection':
        renderCatalogPage(main, { params: route.params, signal });
        document.title = 'Collection — ARSpace';
        break;
      case 'product':
        renderProduct(main, { id: route.id, params: route.params, signal });
        document.title = `${main.querySelector('h1')?.textContent ?? 'Object'} — ARSpace`;
        break;
      case 'autogrid':
        renderAutoGrid(main, { signal });
        document.title = 'AutoGrid — ARSpace';
        break;
      case 'multiplace':
        renderMultiPlace(main, { signal });
        document.title = 'MultiPlace — ARSpace';
        break;
      case 'smartfit':
        renderSmartFit(main, { params: route.params, signal });
        document.title = 'SmartFit — ARSpace';
        break;
      case 'upload':
        renderUpload(main, { signal });
        document.title = 'Preview your model — ARSpace';
        break;
      default:
        main.innerHTML = `
          <section class="container empty empty--page">
            ${icon('cube', 32)}
            <h1>Page not found</h1>
            <p>That link doesn't lead anywhere in ARSpace.</p>
            <a class="btn btn--primary" href="#/">Go to the home page</a>
          </section>`;
        document.title = 'Not found — ARSpace';
    }
  } catch (err) {
    console.error(err);
    main.innerHTML = `
      <section class="container empty empty--page">
        ${icon('alert', 32)}
        <h1>Something went wrong</h1>
        <p>This page failed to load. Reload the page, or go back to the collection.</p>
        <a class="btn btn--primary" href="#/collection">Open the collection</a>
      </section>`;
  }

  if (!route.scrollTo) window.scrollTo({ top: 0 });
  main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', render);
window.addEventListener('offline', () =>
  toast('You are offline. Models already loaded keep working; new ones need a connection.', 'error', 8000),
);
window.addEventListener('online', () => toast('Back online.', 'success', 2500));

render();
