import { PRODUCTS, getProduct } from '../data/products.js';
import { productCardHTML } from '../components/ProductCard.js';
import { createViewer } from '../components/ModelViewer.js';
import { launchAR } from '../components/ARGuide.js';
import { checkARSupport, getPlatform, likelyRuntime } from '../utils/arSupport.js';
import { prefersReducedMotion } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

export function renderHome(main, { signal, scrollTo }) {
  const hero = getProduct('chair');
  const featured = PRODUCTS.filter((p) => p.featured);
  const desktop = getPlatform() === 'desktop';

  main.innerHTML = `
    <section class="hero container">
      <div class="hero__copy">
        <h1 class="hero__title">See it in<br />your space.</h1>
        <p class="hero__lede">Discover, customize, and visualize furniture and decor in your real environment using Augmented Reality.</p>
        <div class="hero__actions">
          <a class="btn btn--primary btn--large" href="#/collection">${icon('layers', 20)} Explore collection</a>
          <button type="button" class="btn btn--ghost btn--large" data-try-ar>${icon('scan', 20)} Try AR</button>
        </div>
        <p class="device-status" data-device-status>
          <span class="dot dot--pending" aria-hidden="true"></span> Checking what this device supports…
        </p>
      </div>
      <div class="hero__viewer" data-hero-viewer aria-label="Interactive 3D preview of the ${hero.name}"></div>
    </section>

    <section class="explain container" aria-labelledby="explain-title">
      <h2 id="explain-title" class="section-title">A photo shows a product. AR shows it in your room.</h2>
      <div class="explain__grid">
        <div class="explain__item">
          <h3>Product photo</h3>
          <p>One fixed angle, chosen by the seller, in a room that isn't yours. Size is a number on a spec sheet.</p>
        </div>
        <div class="explain__item">
          <h3>Interactive 3D</h3>
          <p>A real 3D model you can orbit, zoom and recolour from any angle, right in the browser on any device.</p>
        </div>
        <div class="explain__item explain__item--accent">
          <h3>Augmented reality</h3>
          <p>Your phone tracks the floor through its camera and anchors the model at true scale, so you can walk around it in your own room.</p>
        </div>
      </div>
    </section>

    <section class="how container" id="how-it-works" aria-labelledby="how-title">
      <h2 id="how-title" class="section-title">How it works</h2>
      <ol class="how__steps">
        <li><span class="how__num" aria-hidden="true">1</span><h3>Pick an object</h3><p>Browse furniture, lighting and decor in the collection.</p></li>
        <li><span class="how__num" aria-hidden="true">2</span><h3>Explore it in 3D</h3><p>Drag to orbit, scroll or pinch to zoom, then change its colour, angle and preview size.</p></li>
        <li><span class="how__num" aria-hidden="true">3</span><h3>Tap View in AR</h3><p>On a compatible phone, ARSpace hands the model to WebXR, Scene Viewer or AR Quick Look.</p></li>
        <li><span class="how__num" aria-hidden="true">4</span><h3>Place it in your room</h3><p>Scan the floor, let the object land, then move and rotate it with your fingers.</p></li>
      </ol>
    </section>

    <section class="fit-band container" aria-labelledby="fit-title">
      <div class="fit-band__inner">
        <div>
          <h2 id="fit-title" class="section-title">Will it fit, and can you still walk past it?</h2>
          <p class="lede">SmartFit lays your furniture out on a measured floor plan of your room. It flags pieces that overlap or stick out past a wall, finds the widest walking route from the door, and suggests specific fixes like rotating a table 90°.</p>
          <a class="btn btn--primary btn--large" href="#/smartfit">${icon('ruler', 20)} Open SmartFit</a>
        </div>
        <svg class="fit-band__art" viewBox="0 0 220 160" aria-hidden="true">
          <rect x="4" y="4" width="212" height="152" rx="6" class="fa-room" />
          <rect x="30" y="12" width="110" height="46" rx="5" class="fa-ok" />
          <rect x="60" y="74" width="54" height="28" rx="4" class="fa-err" />
          <rect x="96" y="66" width="40" height="26" rx="4" class="fa-err" />
          <rect x="170" y="70" width="34" height="46" rx="4" class="fa-ok" />
          <polyline points="24,140 150,128 156,62 196,24" class="fa-path" />
          <circle cx="24" cy="140" r="6" class="fa-entry" />
          <circle cx="196" cy="24" r="6" class="fa-dest" />
        </svg>
      </div>
    </section>

    <section class="featured container" aria-labelledby="featured-title">
      <div class="section-head">
        <h2 id="featured-title" class="section-title">Featured objects</h2>
        <a class="link" href="#/collection">See all ${PRODUCTS.length} objects</a>
      </div>
      <div class="grid">${featured.map((p) => productCardHTML(p, { arAvailable: desktop ? false : undefined })).join('')}</div>
    </section>`;

  const { viewer } = createViewer(
    main.querySelector('[data-hero-viewer]'),
    {
      src: hero.model,
      alt: `3D model of the ${hero.name}`,
      poster: hero.thumb,
      cameraOrbit: hero.cameraOrbit,
      autoRotate: !prefersReducedMotion(),
      arPlacement: hero.placement,
    },
    signal,
  );
  // keep page scrolling smooth on the landing page: orbit yes, zoom no
  viewer.setAttribute('disable-zoom', '');

  const status = main.querySelector('[data-device-status]');
  checkARSupport(viewer).then((ok) => {
    if (signal.aborted) return;
    status.innerHTML = ok
      ? `<span class="dot dot--ok" aria-hidden="true"></span> This device can place objects in AR using ${likelyRuntime() ?? 'WebXR'}.`
      : desktop
        ? `<span class="dot" aria-hidden="true"></span> On this computer you get the full 3D viewer. Open ARSpace on an AR-capable phone to place objects in your room.`
        : `<span class="dot" aria-hidden="true"></span> This browser didn't report AR support, so you'll get the 3D viewer. Try Chrome on Android or Safari on iPhone.`;
  });

  main.querySelector('[data-try-ar]').addEventListener(
    'click',
    () => launchAR(viewer, { productName: hero.name }),
    { signal },
  );

  if (scrollTo) {
    requestAnimationFrame(() => document.getElementById(scrollTo)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
  }
}
