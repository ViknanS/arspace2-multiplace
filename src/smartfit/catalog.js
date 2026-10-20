import { PRODUCTS } from '../data/products.js';

/**
 * Furniture available in SmartFit.
 *
 * - Catalog items: footprints measured from each 3D model's bounding box.
 *   These are the model's dimensions, not verified manufacturer specs.
 * - Planning blocks: simple rectangles with demonstration dimensions so a
 *   realistic room can be laid out. They have no 3D model, so no AR preview.
 * Every dimension can be edited once the item is on the plan.
 */
export const FIT_ITEMS = [
  ...PRODUCTS.filter((p) => p.footprint).map((p) => ({
    kind: p.id,
    name: p.name,
    w: p.footprint.w,
    d: p.footprint.d,
    h: p.footprint.h,
    source: 'model',
    productId: p.id,
    thumb: p.thumb,
  })),
  { kind: 'coffee-table', name: 'Coffee table', w: 100, d: 55, h: 45, source: 'demo' },
  { kind: 'side-table', name: 'Side table', w: 45, d: 45, h: 55, source: 'demo' },
  { kind: 'bookshelf', name: 'Bookshelf', w: 80, d: 30, h: 180, source: 'demo' },
  { kind: 'tv-unit', name: 'TV unit', w: 160, d: 40, h: 50, source: 'demo' },
  { kind: 'desk', name: 'Desk', w: 120, d: 60, h: 75, source: 'demo' },
];

export const SOURCE_LABEL = {
  model: 'Measured from 3D model',
  demo: 'Demo size, edit to match',
  edited: 'Size edited by you',
};

export function fitItem(kind) {
  return FIT_ITEMS.find((f) => f.kind === kind);
}

export const DEFAULT_ROOM = { width: 400, length: 300 }; // 4 m × 3 m demo room
export const DEFAULT_CLEARANCE = 80;
export const ROOM_LIMITS = { min: 150, max: 1500 }; // 1.5 m – 15 m per side

/** Default entry (door) and destination markers, 45 cm inside the walls. */
export function defaultMarkers(room) {
  return {
    entry: { x: Math.min(60, room.width / 2), y: Math.max(room.length - 45, room.length / 2) },
    dest: { x: Math.max(room.width - 60, room.width / 2), y: Math.min(45, room.length / 2) },
  };
}

/**
 * Ready-made layouts for demonstrations. Positions are item centres in cm.
 * [kind, x, y, rot]
 */
export const SCENARIOS = [
  {
    id: 'fits',
    label: 'Living room that fits',
    room: { width: 400, length: 300 },
    items: [
      ['sofa', 130, 56, 0],
      ['coffee-table', 160, 160, 0],
      ['chair', 330, 220, 90],
      ['plant', 365, 140, 0],
    ],
  },
  {
    id: 'too-wide',
    label: 'Sofa wider than the room',
    room: { width: 200, length: 300 },
    items: [['sofa', 100, 150, 0]],
  },
  {
    id: 'overlap',
    label: 'Furniture overlapping',
    room: { width: 400, length: 300 },
    items: [
      ['sofa', 130, 56, 0],
      ['coffee-table', 160, 120, 0],
      ['chair', 330, 220, 90],
      ['plant', 365, 140, 0],
    ],
  },
  {
    id: 'rotate',
    label: 'Fixed by rotating',
    room: { width: 400, length: 300 },
    items: [
      ['sofa', 130, 56, 0],
      ['desk', 340, 250, 0],
      ['bookshelf', 250, 250, 0],
      ['plant', 365, 140, 0],
    ],
  },
  {
    id: 'blocked',
    label: 'Walkway blocked',
    room: { width: 400, length: 300 },
    items: [
      ['sofa', 110, 110, 0],
      ['tv-unit', 310, 110, 0],
      ['plant', 360, 250, 0],
    ],
  },
];
