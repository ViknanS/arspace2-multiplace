// AutoGrid measurement geometry tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOT_RECTANGULAR_MESSAGE,
  analyzeCorners,
  distance3,
  interiorAngle,
  polygonArea,
  projectToFloor,
  segmentsIntersect,
} from '../src/autogrid/roomGeometry.js';

// XR space: metres, Y up. A 4 m × 3 m room on a floor 1.5 m below the start pose.
const Y = -1.5;
const rect = [
  { x: 0, y: Y, z: 0 },
  { x: 4, y: Y, z: 0 },
  { x: 4, y: Y, z: -3 },
  { x: 0, y: Y, z: -3 },
];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('Euclidean distance between known 3D points', () => {
  assert.equal(distance3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
  assert.ok(near(distance3({ x: 1, y: 2, z: 3 }, { x: 4, y: 6, z: 15 }), 13));
});

test('projection to the floor plane drops the vertical axis', () => {
  const pr = projectToFloor([
    { x: 1, y: -1.5, z: 2 },
    { x: 3, y: -1.4, z: -1 },
  ]);
  assert.deepEqual(pr.points, [
    { x: 1, y: 2 },
    { x: 3, y: -1 },
  ]);
  assert.ok(near(pr.heightRange, 0.1));
  // a 10 cm height difference must not inflate the floor length
  const a = { x: 0, y: -1.5, z: 0 };
  const b = { x: 2, y: -1.4, z: 0 };
  assert.ok(distance3(a, b) > 2);
  const [p, q] = projectToFloor([a, b]).points;
  assert.equal(Math.hypot(q.x - p.x, q.y - p.y), 2);
});

test('shoelace area, angles and intersection helpers', () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  assert.equal(polygonArea(sq), 12);
  assert.ok(near(interiorAngle(sq, 0), 90));
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }), true);
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), false);
});

test('a valid 4 × 3 m rectangular room', () => {
  const r = analyzeCorners(rect);
  assert.equal(r.ok, true);
  assert.equal(r.rectangular, true);
  assert.deepEqual(r.edges.map((e) => +e.toFixed(3)), [4, 3, 4, 3]);
  assert.ok(near(r.width, 4) && near(r.length, 3));
  assert.ok(near(r.area, 12));
  r.angles.forEach((a) => assert.ok(near(a, 90, 1e-6)));
  // outline normalised to centimetres with corner 1 at the origin
  assert.deepEqual(r.outline, [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ]);
});

test('a rotated room with realistic noise is still measured correctly', () => {
  const a = Math.PI / 5;
  const pts = rect.map((p, i) => ({
    x: p.x * Math.cos(a) - p.z * Math.sin(a) + [0.01, -0.02, 0.015, 0][i],
    y: Y + [0, 0.01, -0.01, 0.02][i],
    z: p.x * Math.sin(a) + p.z * Math.cos(a),
  }));
  const r = analyzeCorners(pts);
  assert.equal(r.ok, true);
  assert.equal(r.rectangular, true);
  assert.ok(Math.abs(r.width - 4) < 0.05 && Math.abs(r.length - 3) < 0.05);
  assert.ok(Math.abs(r.area - 12) < 0.3);
});

test('reverse capture order (clockwise) works the same', () => {
  const r = analyzeCorners([...rect].reverse());
  assert.equal(r.ok, true);
  assert.ok(near(r.area, 12));
});

test('duplicate corners are rejected', () => {
  const r = analyzeCorners([rect[0], { ...rect[0], x: 0.05 }, rect[2], rect[3]]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /Corners 1 and 2 are only 5 cm apart/.test(e)));
});

test('very short edges are rejected', () => {
  const r = analyzeCorners([rect[0], { x: 0.3, y: Y, z: 0 }, rect[2], rect[3]]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /too short/.test(e)));
});

test('self-intersecting (diagonal) order is rejected', () => {
  const r = analyzeCorners([rect[0], rect[2], rect[1], rect[3]]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /crosses itself/.test(e)));
});

test('a concave (out-of-order) outline is rejected', () => {
  const r = analyzeCorners([rect[0], rect[1], { x: 1, y: Y, z: -1 }, rect[3]]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not in order|folds inwards/.test(e)));
});

test('excessive height variation is rejected; small variation only warns', () => {
  const bad = analyzeCorners([rect[0], rect[1], { ...rect[2], y: Y + 0.4 }, rect[3]]);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /differ in height by 40 cm/.test(e)));
  const warn = analyzeCorners([rect[0], rect[1], { ...rect[2], y: Y + 0.08 }, rect[3]]);
  assert.equal(warn.ok, true);
  assert.ok(warn.warnings.some((w) => /8 cm/.test(w)));
});

test('a clearly non-rectangular room is flagged, not silently squared', () => {
  const trap = [rect[0], rect[1], { x: 3, y: Y, z: -3 }, { x: 1, y: Y, z: -3 }];
  const r = analyzeCorners(trap);
  assert.equal(r.ok, true);
  assert.equal(r.rectangular, false);
  assert.ok(r.warnings.includes(NOT_RECTANGULAR_MESSAGE));
  assert.ok(near(r.area, 9)); // true trapezoid area, not width × length
});

test('implausibly large rooms and wrong corner counts are rejected', () => {
  const huge = rect.map((p) => ({ ...p, x: p.x * 5 }));
  assert.equal(analyzeCorners(huge).ok, false);
  assert.equal(analyzeCorners(rect.slice(0, 3)).ok, false);
  assert.equal(analyzeCorners([...rect.slice(0, 3), { x: NaN, y: 0, z: 0 }]).ok, false);
});
