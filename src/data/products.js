// Catalog data — the single product source for the 3D viewer, the AR modes,
// SmartFit and MultiPlace. Every entry points at a real glTF 2.0 binary (.glb)
// file in /public/models. Sources and licences are listed in ATTRIBUTIONS.md.
//
// footprint: { w, d, h } in cm.
//   dimsSource 'model'    measured from the .glb bounding box (not manufacturer data)
//   dimsSource 'designed' the designed size of an ARSpace procedural model
// floor: true when the item stands on the floor and can be planned in SmartFit.
// placement: 'floor' for horizontal surfaces (floor or tabletop), 'wall' for
//   items that hang on a vertical surface (wall lights, paintings, clocks).
//   Wall models have their back at z = 0 and face +Z.
// wallHeight: suggested centre height (m) for wall items in the 3D composer.

// keeps asset paths correct on Netlify, Vercel and GitHub Pages (plain Node, used by tools/, has no import.meta.env)
const base = import.meta.env?.BASE_URL ?? './';

export const CATEGORIES = [
  { id: 'all', label: 'All objects' },
  { id: 'seating', label: 'Seating' },
  { id: 'tables', label: 'Tables' },
  { id: 'storage', label: 'Storage' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'decor', label: 'Decor' },
];

const KHRONOS = 'Khronos glTF Sample Assets';
const PROC = { name: 'ARSpace procedural model', license: 'CC0-1.0' };

const P = (o) => ({
  model: `${base}models/${o.id}.glb`,
  thumb: `${base}thumbs/${o.id}.webp`,
  placement: 'floor',
  cameraOrbit: '30deg 75deg auto',
  featured: false,
  floor: true,
  ...o,
});

export const PRODUCTS = [
  // ---------------------------------------------------------------- seating
  P({
    id: 'chair',
    name: 'Modern Accent Chair',
    category: 'seating',
    fileSize: '4.1 MB',
    footprint: { w: 83, d: 57, h: 69 },
    dimsSource: 'model',
    source: { name: `${KHRONOS}: SheenChair`, license: 'CC0-1.0' },
    summary: 'An armless mid-century lounge chair with tufted velvet upholstery and tapered wooden legs.',
    description:
      'Explore this modern chair in 3D and preview how it could look in your living room. The model includes two velvet finishes you can switch between before opening AR.',
    cameraOrbit: '35deg 75deg auto',
    featured: true,
  }),
  P({
    id: 'sofa',
    name: 'Curved Velvet Sofa',
    category: 'seating',
    fileSize: '3.1 MB',
    footprint: { w: 219, d: 102, h: 79 },
    dimsSource: 'model',
    source: { name: `${KHRONOS}: GlamVelvetSofa`, license: 'CC-BY-4.0' },
    summary: 'A long curved sofa in plush velvet on slim metal legs, in five fabric colours.',
    description:
      'At over two metres wide, a sofa is the hardest thing to judge from a photo. Place it on your floor in AR to see how much of the wall it fills and how much walking space is left.',
  }),
  P({
    id: 'silk-pouf',
    name: 'Silk Pouf',
    category: 'seating',
    fileSize: '4.6 MB',
    footprint: { w: 61, d: 61, h: 20 },
    dimsSource: 'model',
    source: { name: `${KHRONOS}: SpecularSilkPouf`, license: 'CC-BY-4.0' },
    summary: 'A low, round tufted pouf in shimmering silk, usable as a footrest or floor cushion.',
    description: 'A small, movable seat that is easy to slot in. Try it in front of a sofa or beside a chair.',
  }),
  P({
    id: 'stool',
    name: 'Wooden Stool',
    category: 'seating',
    fileSize: '42 KB',
    footprint: { w: 37, d: 37, h: 65 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'A round oak stool with splayed legs and a black metal footring.',
    description: 'A compact counter-height stool. Good for testing tight spaces such as kitchen corners.',
  }),

  // ----------------------------------------------------------------- tables
  P({
    id: 'coffee-table',
    name: 'Coffee Table',
    category: 'tables',
    fileSize: '20 KB',
    footprint: { w: 100, d: 55, h: 45 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'A rectangular oak coffee table with a lower shelf and slim black metal legs.',
    description: 'Place it in front of a sofa and check the knee room and the walking space around it.',
    featured: true,
  }),
  P({
    id: 'side-table',
    name: 'Round Side Table',
    category: 'tables',
    fileSize: '23 KB',
    footprint: { w: 45, d: 45, h: 55 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'A small walnut-top pedestal table on a weighted black base.',
    description: 'Fits beside a sofa or armchair. Its round top is easy to walk around.',
  }),
  P({
    id: 'dining-table',
    name: 'Dining Table',
    category: 'tables',
    fileSize: '14 KB',
    footprint: { w: 140, d: 80, h: 75 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'A four-seat walnut dining table with square legs.',
    description: 'Check whether a dining table leaves enough room to pull chairs out and walk behind them.',
  }),
  P({
    id: 'desk',
    name: 'Study Desk',
    category: 'tables',
    fileSize: '20 KB',
    footprint: { w: 120, d: 60, h: 75 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'An oak-top desk with a three-drawer pedestal and a modesty panel.',
    description: 'A typical home-office desk. Try it against a wall and check the space for the chair behind it.',
  }),

  // ---------------------------------------------------------------- storage
  P({
    id: 'bookshelf',
    name: 'Bookshelf',
    category: 'storage',
    fileSize: '107 KB',
    footprint: { w: 80, d: 30, h: 180 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'A tall five-shelf oak bookcase, partly filled with books.',
    description: 'At 1.8 m it is the tallest piece in the collection, useful for judging height in AR.',
  }),
  P({
    id: 'tv-unit',
    name: 'TV Console',
    category: 'storage',
    fileSize: '24 KB',
    footprint: { w: 160, d: 40, h: 50 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'A low walnut media console with two cabinet doors and an open centre shelf.',
    description: 'A long, low piece that usually sits opposite the sofa. Use SmartFit to keep the walkway in between.',
  }),
  P({
    id: 'storage-cabinet',
    name: 'Storage Cabinet',
    category: 'storage',
    fileSize: '15 KB',
    footprint: { w: 80, d: 48, h: 100 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'A sage-green two-door cabinet with brass handles on a black plinth.',
    description: 'A mid-height cabinet for hallways or living rooms. Check that its doors have room to open.',
  }),

  // --------------------------------------------------------------- lighting
  P({
    id: 'floor-lamp',
    name: 'Floor Lamp',
    category: 'lighting',
    fileSize: '29 KB',
    footprint: { w: 40, d: 40, h: 160 },
    dimsSource: 'designed',
    source: PROC,
    summary: 'A brass floor lamp with a linen drum shade and a round black base.',
    description: 'A reading lamp for the corner beside a chair. Place it with the chair in MultiPlace to try the pair.',
    featured: true,
  }),
  P({
    id: 'barn-lamp',
    name: 'Copper Barn Wall Light',
    category: 'lighting',
    fileSize: '7.8 MB',
    footprint: { w: 19, d: 23, h: 26 },
    dimsSource: 'model',
    floor: false,
    placement: 'wall',
    wallHeight: 1.9,
    source: { name: `${KHRONOS}: AnisotropyBarnLamp`, license: 'CC-BY-4.0' },
    summary: 'An industrial wall-mounted barn light with a brushed copper shade and exposed bulb.',
    description:
      'The brushed copper uses an anisotropic material, so its highlights stretch and move as you orbit the camera, like real brushed metal. It is a wall fitting: in AR, aim at a wall until the surface is detected and it mounts flat against it.',
    cameraOrbit: '25deg 70deg auto',
  }),
  P({
    id: 'glass-lamp',
    name: 'Table Lamp with Glass Base',
    category: 'lighting',
    fileSize: '4.1 MB',
    footprint: { w: 30, d: 30, h: 48 },
    dimsSource: 'model',
    floor: false,
    source: { name: `${KHRONOS}: IridescenceLamp`, license: 'CC-BY-4.0' },
    summary: 'A drum-shade table lamp on a clear glass globe base, with an iridescent lining inside the shade.',
    description:
      'Tilt the camera to look into the shade and the iridescent lining shifts colour with the angle. Place it on a side table or desk in AR to judge its height against your furniture.',
    cameraOrbit: '30deg 70deg auto',
  }),
  P({
    id: 'arc-lamp',
    name: 'Art Nouveau Arc Lamp',
    category: 'lighting',
    fileSize: '4.3 MB',
    footprint: { w: 113, d: 72, h: 186 },
    dimsSource: 'model',
    source: { name: `${KHRONOS}: LightsPunctualLamp`, license: 'CC-BY-4.0' },
    summary: 'A tall bronze arc lamp with a glass tulip shade; its bulb is modelled as a real light source.',
    description: 'At about 1.9 m tall it arches over a chair or sofa. Its size comes straight from the 3D file.',
  }),

  // ------------------------------------------------------------------ decor
  P({
    id: 'vase',
    name: 'Glass Vases with Flowers',
    category: 'decor',
    fileSize: '1.8 MB',
    footprint: { w: 22, d: 14, h: 20 },
    dimsSource: 'model',
    floor: false,
    source: { name: `${KHRONOS}: GlassVaseFlowers`, license: 'CC0-1.0' },
    summary: 'A pair of clear glass vases holding small pink flowers, sized for a tabletop.',
    description:
      'A small tabletop piece. In AR, aim at a well-lit table or shelf and move the phone slowly until the surface is detected.',
    cameraOrbit: '20deg 70deg auto',
    featured: true,
  }),
  P({
    id: 'plant',
    name: 'Potted Plant',
    category: 'decor',
    fileSize: '5.8 MB',
    footprint: { w: 70, d: 66, h: 84 },
    dimsSource: 'model',
    source: { name: `${KHRONOS}: DiffuseTransmissionPlant`, license: 'CC-BY-4.0' },
    summary: 'A leafy indoor plant in a terracotta pot, with leaves that let light pass through.',
    description:
      'Use the plant to try out corners and empty spots in a room. Its leaves use a translucent material, and at 84 cm tall it reads well on the floor next to a sofa or chair.',
  }),
  P({
    id: 'candle-holder',
    name: 'Glass Candle Holder',
    category: 'decor',
    fileSize: '2.7 MB',
    footprint: { w: 15, d: 15, h: 30 },
    dimsSource: 'model',
    floor: false,
    source: { name: `${KHRONOS}: GlassHurricaneCandleHolder`, license: 'CC-BY-4.0' },
    summary: 'A tall glass hurricane candle holder on a wooden base.',
    description: 'A tabletop accent. Place it on the coffee table or dining table in MultiPlace.',
  }),
  P({
    id: 'wall-painting',
    name: 'Framed Wall Painting',
    category: 'decor',
    fileSize: '24 KB',
    footprint: { w: 70, d: 4, h: 50 },
    dimsSource: 'designed',
    floor: false,
    placement: 'wall',
    wallHeight: 1.5,
    source: PROC,
    summary: 'An abstract painting in warm and deep-blue blocks, in a slim walnut frame.',
    description: 'A 70 × 50 cm canvas. In AR, aim at a wall: it hangs flat against the wall at the point you choose.',
    cameraOrbit: '0deg 85deg auto',
  }),
  P({
    id: 'wall-clock',
    name: 'Wall Clock',
    category: 'decor',
    fileSize: '56 KB',
    footprint: { w: 35, d: 5, h: 35 },
    dimsSource: 'designed',
    floor: false,
    placement: 'wall',
    wallHeight: 1.8,
    source: PROC,
    summary: 'A 35 cm round clock with a black rim, white face and brass centre pin.',
    description: 'A simple round wall clock. Use it to judge spacing above a sofa or desk.',
    cameraOrbit: '0deg 85deg auto',
  }),
  P({
    id: 'sculpture',
    name: 'Abstract Sculpture',
    category: 'decor',
    fileSize: '150 KB',
    footprint: { w: 30, d: 30, h: 55 },
    dimsSource: 'designed',
    floor: false,
    source: PROC,
    summary: 'A polished brass knot sculpture on a stone plinth.',
    description: 'A decorative statement piece for a sideboard, shelf or console.',
  }),
];

/** 'wall' for items that hang on a vertical surface, otherwise 'floor'. */
export function surfaceOf(product) {
  return product?.placement === 'wall' ? 'wall' : 'floor';
}

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
