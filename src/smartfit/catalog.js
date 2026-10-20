import { PRODUCTS } from '../data/products.js';

/**
 * Furniture available in SmartFit: every product that stands on the floor,
 * taken from the shared catalog (src/data/products.js) so there is one source
 * of truth. Footprints are either measured from the 3D model's bounding box
 * ('model') or the designed size of an ARSpace procedural model ('designed').
 * Neither is verified manufacturer data, and every size can be edited on the plan.
 */
export const FIT_ITEMS = PRODUCTS.filter((p) => p.floor && p.footprint).map((p) => ({
  kind: p.id,
  name: p.name,
  w: p.footprint.w,
  d: p.footprint.d,
  h: p.footprint.h,
  source: p.dimsSource === 'designed' ? 'designed' : 'model',
  productId: p.id,
  thumb: p.thumb,
  category: p.category,
}));

export const SOURCE_LABEL = {
  model: 'Measured from 3D model',
  designed: 'Designed size of 3D model',
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
