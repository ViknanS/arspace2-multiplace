/**
 * AutoGrid room measurement geometry (pure, unit tested).
 *
 * Input: four floor points captured with WebXR hit testing, in the session's
 * reference space: metres, Y up, gravity aligned. The floor plan uses the
 * horizontal plane, so each point (x, y, z) is projected to (x, z) and the
 * vertical component is only used to check the points are on one level.
 */

export const LIMITS = {
  minRoom: 1.5, // m, same range SmartFit accepts
  maxRoom: 15,
  minEdge: 0.5, // m, anything shorter is not a plausible room wall
  duplicate: 0.15, // m, two corners closer than this are the same point
  heightWarn: 0.05, // m
  heightError: 0.15, // m
  angleTolerance: 10, // degrees from 90 for "rectangular"
  sideTolerance: 0.1, // 10 % difference between opposite sides
  sideToleranceAbs: 0.15, // or 15 cm, whichever is larger
};

export const NOT_RECTANGULAR_MESSAGE =
  'This room does not closely match a rectangle. Please review the measured points or use an approximate rectangular floor plan.';

export function distance3(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function distance2(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Project 3D XR points onto the horizontal floor plane: (x, y, z) → (x, z). */
export function projectToFloor(points) {
  const heights = points.map((p) => p.y);
  const mean = heights.reduce((s, h) => s + h, 0) / (heights.length || 1);
  return {
    points: points.map((p) => ({ x: p.x, y: p.z })),
    meanHeight: mean,
    heightRange: heights.length ? Math.max(...heights) - Math.min(...heights) : 0,
  };
}

/** Shoelace formula. Positive for one winding, negative for the other. */
export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonArea(poly) {
  return Math.abs(signedArea(poly));
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Do segments p1-p2 and p3-p4 properly cross? */
export function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Interior angle at vertex i of a polygon, in degrees. */
export function interiorAngle(poly, i) {
  const p = poly[i];
  const a = poly[(i + poly.length - 1) % poly.length];
  const b = poly[(i + 1) % poly.length];
  const v1 = { x: a.x - p.x, y: a.y - p.y };
  const v2 = { x: b.x - p.x, y: b.y - p.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/**
 * Rotate/translate the outline so corner 1 is at the origin and the first
 * edge runs along +x. Returns centimetres for drawing on the floor plan.
 */
export function normalizeOutline(poly) {
  const o = poly[0];
  const ang = Math.atan2(poly[1].y - o.y, poly[1].x - o.x);
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  let pts = poly.map((p) => {
    const x = p.x - o.x;
    const y = p.y - o.y;
    return { x: x * c - y * s, y: x * s + y * c };
  });
  // keep the room "below" the first wall on screen (y grows downwards)
  if (signedArea(pts) < 0) pts = pts.map((p) => ({ x: p.x, y: -p.y }));
  const cm = (v) => Math.round(v * 1000) / 10 || 0; // `|| 0` turns -0 into 0
  return pts.map((p) => ({ x: cm(p.x), y: cm(p.y) }));
}

/**
 * Validate four captured corners and measure the room.
 * @param {{x,y,z}[]} points3  corners in capture order around the room
 */
export function analyzeCorners(points3) {
  const errors = [];
  const warnings = [];
  const result = { ok: false, rectangular: false, errors, warnings };

  if (!Array.isArray(points3) || points3.length !== 4) {
    errors.push(`Capture exactly four corners (you have ${points3?.length ?? 0}).`);
    return result;
  }
  if (points3.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))) {
    errors.push('One of the captured points is invalid. Retake the scan.');
    return result;
  }

  const { points: poly, heightRange } = projectToFloor(points3);
  result.heightRange = heightRange;

  // duplicates
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const d = distance2(poly[i], poly[j]);
      if (d < LIMITS.duplicate) {
        errors.push(`Corners ${i + 1} and ${j + 1} are only ${Math.round(d * 100)} cm apart. Capture four different corners.`);
      }
    }
  }

  const edges = poly.map((p, i) => distance2(p, poly[(i + 1) % 4]));
  result.edges = edges;
  edges.forEach((e, i) => {
    if (e < LIMITS.minEdge && e >= LIMITS.duplicate) {
      errors.push(`The edge from corner ${i + 1} to ${((i + 1) % 4) + 1} is only ${Math.round(e * 100)} cm, too short for a room wall.`);
    }
  });

  if (heightRange > LIMITS.heightError) {
    errors.push(
      `The corners differ in height by ${Math.round(heightRange * 100)} cm, so they are not all on the floor. Aim at the floor right at each corner.`,
    );
  } else if (heightRange > LIMITS.heightWarn) {
    warnings.push(`The corners differ in height by ${Math.round(heightRange * 100)} cm. Check each point was on the floor.`);
  }

  if (segmentsIntersect(poly[0], poly[1], poly[2], poly[3]) || segmentsIntersect(poly[1], poly[2], poly[3], poly[0])) {
    errors.push('The outline crosses itself. Capture the corners in order as you go around the room, not diagonally.');
  } else {
    const signs = poly.map((_, i) => Math.sign(cross(poly[i], poly[(i + 1) % 4], poly[(i + 2) % 4])));
    if (!signs.every((s) => s === signs[0])) {
      errors.push('The corners are not in order around the room (the outline folds inwards). Retake them going around the walls.');
    }
  }

  const area = polygonArea(poly);
  result.area = area;
  if (area < 1) errors.push(`The measured area is only ${area.toFixed(2)} m², which is not a plausible room.`);

  const angles = poly.map((_, i) => interiorAngle(poly, i));
  result.angles = angles;

  const width = (edges[0] + edges[2]) / 2;
  const length = (edges[1] + edges[3]) / 2;
  result.width = width;
  result.length = length;

  if (!errors.length) {
    for (const [label, v] of [
      ['width', width],
      ['length', length],
    ]) {
      if (v < LIMITS.minRoom || v > LIMITS.maxRoom) {
        errors.push(`The measured ${label} of ${v.toFixed(2)} m is outside the supported ${LIMITS.minRoom}–${LIMITS.maxRoom} m range.`);
      }
    }
  }

  const sideOk = (a, b) => Math.abs(a - b) <= Math.max(LIMITS.sideToleranceAbs, LIMITS.sideTolerance * Math.max(a, b));
  const anglesOk = angles.every((a) => Math.abs(a - 90) <= LIMITS.angleTolerance);
  result.rectangular = !errors.length && anglesOk && sideOk(edges[0], edges[2]) && sideOk(edges[1], edges[3]);
  if (!errors.length && !result.rectangular) warnings.push(NOT_RECTANGULAR_MESSAGE);

  result.outline = errors.length ? null : normalizeOutline(poly);
  result.ok = errors.length === 0;
  return result;
}
