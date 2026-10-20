// Export the shared product catalog (src/data/products.js) as JSON for the
// native iOS app, so the website, SmartFit and the iPhone app list the same
// furniture with the same dimensions.
//   node tools/export-ios-catalog.mjs  ->  ios/ARSpaceMultiPlace/ARSpaceMultiPlace/catalog.json
import { writeFileSync } from 'node:fs';
import { CATEGORIES, PRODUCTS } from '../src/data/products.js';

const out = new URL('../ios/ARSpaceMultiPlace/ARSpaceMultiPlace/catalog.json', import.meta.url);
const data = {
  generatedFrom: 'src/data/products.js',
  units: { footprint: 'centimetres', wallHeight: 'metres' },
  categories: CATEGORIES.filter((c) => c.id !== 'all'),
  products: PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    placement: p.placement === 'wall' ? 'wall' : 'floor',
    floorStanding: Boolean(p.floor),
    footprint: p.footprint,
    dimsSource: p.dimsSource,
    wallHeight: p.wallHeight ?? null,
    summary: p.summary,
    source: p.source,
    model: `${p.id}.usdz`,
    thumbnail: `${p.id}.png`,
  })),
};
writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
console.log(`wrote ${data.products.length} products to ${out.pathname}`);
