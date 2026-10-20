// Catalog data. Every entry points at a real glTF 2.0 binary (.glb) file in /public/models.
// Sources and licences are listed in ATTRIBUTIONS.md.

const base = import.meta.env.BASE_URL; // keeps asset paths correct on Netlify, Vercel and GitHub Pages

export const CATEGORIES = [
  { id: 'all', label: 'All objects' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'decor', label: 'Decor' },
];

export const PRODUCTS = [
  {
    id: 'chair',
    // footprint measured from the .glb bounding box (not manufacturer data)
    footprint: { w: 83, d: 57, h: 69 },
    name: 'Modern Accent Chair',
    category: 'furniture',
    model: `${base}models/chair.glb`,
    thumb: `${base}thumbs/chair.webp`,
    fileSize: '4.1 MB',
    summary: 'An armless mid-century lounge chair with tufted velvet upholstery and tapered wooden legs.',
    description:
      'Explore this modern chair in 3D and preview how it could look in your living room. The model includes two velvet finishes you can switch between before opening AR.',
    placement: 'floor',
    cameraOrbit: '35deg 75deg auto',
    featured: true,
  },
  {
    id: 'sofa',
    // footprint measured from the .glb bounding box (not manufacturer data)
    footprint: { w: 219, d: 102, h: 79 },
    name: 'Curved Velvet Sofa',
    category: 'furniture',
    model: `${base}models/sofa.glb`,
    thumb: `${base}thumbs/sofa.webp`,
    fileSize: '3.1 MB',
    summary: 'A long curved sofa in plush velvet on slim metal legs, in five fabric colours.',
    description:
      'At over two metres wide, a sofa is the hardest thing to judge from a photo. Place it on your floor in AR to see how much of the wall it fills and how much walking space is left.',
    placement: 'floor',
    cameraOrbit: '30deg 75deg auto',
    featured: false,
  },
  {
    id: 'barn-lamp',
    name: 'Copper Barn Wall Light',
    category: 'lighting',
    model: `${base}models/barn-lamp.glb`,
    thumb: `${base}thumbs/barn-lamp.webp`,
    fileSize: '7.8 MB',
    summary: 'An industrial wall-mounted barn light with a brushed copper shade and exposed bulb.',
    description:
      'The brushed copper uses an anisotropic material, so its highlights stretch and move as you orbit the camera, like real brushed metal. This is a wall fitting, but ARSpace places objects on horizontal surfaces, so in AR set it on a table or shelf to judge its size.',
    placement: 'floor',
    cameraOrbit: '25deg 70deg auto',
    featured: true,
  },
  {
    id: 'glass-lamp',
    name: 'Table Lamp with Glass Base',
    category: 'lighting',
    model: `${base}models/glass-lamp.glb`,
    thumb: `${base}thumbs/glass-lamp.webp`,
    fileSize: '4.1 MB',
    summary: 'A drum-shade table lamp on a clear glass globe base, with an iridescent lining inside the shade.',
    description:
      'Tilt the camera to look into the shade and the iridescent lining shifts colour with the angle. Place it on a side table or desk in AR to judge its height against your furniture.',
    placement: 'floor',
    cameraOrbit: '30deg 70deg auto',
    featured: false,
  },
  {
    id: 'vase',
    name: 'Glass Vases with Flowers',
    category: 'decor',
    model: `${base}models/vase.glb`,
    thumb: `${base}thumbs/vase.webp`,
    fileSize: '1.8 MB',
    summary: 'A pair of clear glass vases holding small pink flowers, sized for a tabletop.',
    description:
      'A small tabletop piece. In AR, aim at a well-lit table or shelf and move the phone slowly until the surface is detected.',
    placement: 'floor',
    cameraOrbit: '20deg 70deg auto',
    featured: true,
  },
  {
    id: 'plant',
    // footprint measured from the .glb bounding box (not manufacturer data)
    footprint: { w: 70, d: 66, h: 84 },
    name: 'Potted Plant',
    category: 'decor',
    model: `${base}models/plant.glb`,
    thumb: `${base}thumbs/plant.webp`,
    fileSize: '5.8 MB',
    summary: 'A leafy indoor plant in a terracotta pot, with leaves that let light pass through.',
    description:
      'Use the plant to try out corners and empty spots in a room. Its leaves use a translucent material, and at 84 cm tall it reads well on the floor next to a sofa or chair.',
    placement: 'floor',
    cameraOrbit: '30deg 75deg auto',
    featured: false,
  },
];

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
