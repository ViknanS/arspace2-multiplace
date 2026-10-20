/**
 * Surface classification for a WebXR hit-test pose (pure, unit tested).
 *
 * A hit-test result's pose has its +Y axis along the detected surface's
 * normal. Upward normals are floors / tabletops; near-horizontal normals are
 * walls. For a wall, `yaw` is the rotation about world Y that turns an
 * object's +Z (its front) to face out of the wall.
 */

export const FLOOR_MIN_UP = 0.8; // cos ≈ 37°: still counts as a horizontal surface
export const WALL_MAX_UP = 0.35; // |cos| ≤ ~20° from vertical counts as a wall

/**
 * @param {ArrayLike<number>} m  column-major 4×4 pose matrix (XRRigidTransform.matrix)
 * @returns {{ kind: 'floor'|'wall'|'ceiling'|'slope', position: {x,y,z}, normal: {x,y,z}, yaw: number }}
 */
export function classifyHitMatrix(m) {
  const position = { x: m[12], y: m[13], z: m[14] };
  const len = Math.hypot(m[4], m[5], m[6]) || 1;
  const normal = { x: m[4] / len, y: m[5] / len, z: m[6] / len };
  let kind = 'slope';
  if (normal.y >= FLOOR_MIN_UP) kind = 'floor';
  else if (normal.y <= -FLOOR_MIN_UP) kind = 'ceiling';
  else if (Math.abs(normal.y) <= WALL_MAX_UP) kind = 'wall';
  const yaw = kind === 'wall' ? Math.atan2(normal.x, normal.z) : 0;
  return { kind, position, normal, yaw };
}

/** Does a classified surface suit an object of this surface type? */
export function suits(surface, objectSurface) {
  if (!surface) return false;
  return objectSurface === 'wall' ? surface.kind === 'wall' : surface.kind === 'floor';
}
