/**
 * MultiPlace arrangement export/import (pure, unit tested).
 *
 * An arrangement records which products are placed and how they sit relative
 * to each other. Positions from an AR session are stored relative to the
 * group's centre on the floor, because session coordinates mean nothing once
 * the session ends. Reopening AR does NOT restore objects to the same physical
 * spots; that would need spatial relocalisation, which isn't implemented.
 */

export const ARRANGEMENT_VERSION = 1;

/**
 * @param {Array} objects   manager.list()
 * @param {{ recenter?: boolean, planId?: string|null, source?: 'ar'|'composer' }} opts
 */
export function toArrangement(objects, { recenter = true, planId = null, source = 'composer' } = {}) {
  const placed = objects.filter((o) => o.state !== 'preview');
  const cx = recenter && placed.length ? placed.reduce((s, o) => s + o.position.x, 0) / placed.length : 0;
  const cz = recenter && placed.length ? placed.reduce((s, o) => s + o.position.z, 0) / placed.length : 0;
  const floorY = placed.length ? Math.min(...placed.map((o) => o.position.y)) : 0;
  const r = (v) => Math.round(v * 1000) / 1000;
  return {
    kind: 'arspace-arrangement',
    version: ARRANGEMENT_VERSION,
    source,
    planId,
    units: 'meters',
    relativeTo: recenter ? 'group-centre' : 'room-origin',
    createdAt: new Date().toISOString(),
    objects: placed.map((o) => ({
      instanceId: o.instanceId,
      productId: o.productId,
      position: { x: r(o.position.x - cx), y: r(o.position.y - floorY), z: r(o.position.z - cz) },
      rotationY: r(o.rotationY),
      scale: r(o.scale),
      locked: o.state === 'locked',
    })),
  };
}

/**
 * Validate an arrangement (from a file). Unknown products are skipped.
 * @returns {{ ok, objects, errors }}
 */
export function parseArrangement(data, knownProductIds) {
  const errors = [];
  if (!data || data.kind !== 'arspace-arrangement' || data.version !== ARRANGEMENT_VERSION || !Array.isArray(data.objects)) {
    return { ok: false, objects: [], errors: ['This is not an ARSpace MultiPlace arrangement file.'] };
  }
  const known = new Set(knownProductIds);
  const objects = [];
  data.objects.forEach((o, i) => {
    const p = o?.position;
    const valid = o && known.has(o.productId) && p && [p.x, p.y, p.z].every(Number.isFinite) && Number.isFinite(o.rotationY ?? 0);
    if (!valid) {
      errors.push(`Object ${i + 1} was skipped (unknown product or invalid position).`);
      return;
    }
    objects.push({
      productId: o.productId,
      position: { x: p.x, y: p.y, z: p.z },
      rotationY: o.rotationY ?? 0,
      scale: Number.isFinite(o.scale) ? o.scale : 1,
      locked: Boolean(o.locked),
    });
  });
  return { ok: true, objects, errors, relativeTo: data.relativeTo };
}
