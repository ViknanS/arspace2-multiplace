// Unit tests for the SmartFit geometry engine. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWalkway,
  boundaryCheck,
  findOverlaps,
  overlap,
  rectOf,
  rotationFix,
  unionArea,
} from '../src/smartfit/geometry.js';
import { analyzeLayout } from '../src/smartfit/analysis.js';

const room = { width: 400, length: 300 }; // 4 m × 3 m demo room
const chair = { id: 'c', name: 'Chair', w: 83, d: 57, rot: 0, x: 200, y: 150 };
const sofa = { id: 's', name: 'Sofa', w: 219, d: 102, rot: 0, x: 200, y: 60 };
const table = { id: 't', name: 'Coffee table', w: 100, d: 55, rot: 0, x: 200, y: 130 };
const entry = { x: 50, y: 255 };
const dest = { x: 350, y: 45 };

test('1. a chair fits inside an empty room', () => {
  const b = boundaryCheck(chair, room);
  assert.equal(b.inside, true);
  assert.deepEqual(b.out, { left: 0, right: 0, top: 0, bottom: 0 });
});

test('2. a sofa wider than the room is reported with the exact overhang', () => {
  const small = { width: 200, length: 300 };
  const b = boundaryCheck({ ...sofa, x: 100, y: 150 }, small);
  assert.equal(b.inside, false);
  assert.equal(b.out.left, 9.5);
  assert.equal(b.out.right, 9.5);
  assert.equal(b.fitsAsIs, false);
  assert.equal(b.fitsRotated, true); // 102 wide × 219 long fits 200 × 300
  const res = analyzeLayout(small, [{ ...sofa, x: 100, y: 150 }], { entry: { x: 50, y: 270 }, dest: { x: 150, y: 30 }, clearance: 80 });
  assert.ok(res.issues.some((i) => /extends 10 cm past the left wall/.test(i.text)));
  assert.ok(res.recs.some((r) => /Rotate the Sofa by 90°/.test(r.text)));
});

test('2b. an item too big in both orientations recommends a smaller piece', () => {
  const tiny = { width: 180, length: 90 };
  const res = analyzeLayout(tiny, [{ ...sofa, x: 90, y: 45 }], { entry: { x: 20, y: 45 }, dest: { x: 160, y: 45 }, clearance: 80 });
  assert.ok(res.recs.some((r) => /Consider a smaller sofa/.test(r.text)));
});

test('3. overlapping rectangles: depth, width and separation are measured', () => {
  const o = overlap(sofa, table);
  // sofa y 9..111, table y 102.5..157.5 -> 8.5 cm deep; x overlap = table width 100
  assert.ok(o);
  assert.equal(o.depth, 8.5);
  assert.equal(o.width, 100);
  assert.equal(o.separation, 8.5);
  assert.equal(findOverlaps([sofa, table, chair]).length, 2); // table/chair also overlap
});

test('3b. touching edges are not an overlap', () => {
  const a = { id: 'a', w: 100, d: 100, rot: 0, x: 50, y: 50 };
  const b = { id: 'b', w: 100, d: 100, rot: 0, x: 150, y: 50 };
  assert.equal(overlap(a, b), null);
});

test('4. rotating an item by 90° can resolve a collision', () => {
  // A bookshelf lying along x hits a cabinet; turned, it slides between.
  const r = { width: 300, length: 300 };
  const shelf = { id: 'b', name: 'Bookshelf', w: 160, d: 40, rot: 0, x: 150, y: 150 };
  const left = { id: 'l', name: 'Cabinet', w: 60, d: 60, rot: 0, x: 60, y: 150 };
  assert.ok(overlap(shelf, left));
  const fix = rotationFix(shelf, [shelf, left], r);
  assert.ok(fix, 'rotation should resolve it');
  assert.equal(fix.item.rot, 90);
  assert.equal(overlap(fix.item, left), null);
  assert.deepEqual(rectOf(fix.item), { left: 130, right: 170, top: 70, bottom: 230 });
});

test('5. the walking route is blocked by a wall-to-wall row of furniture', () => {
  const r = { width: 400, length: 300 };
  const row = [
    { id: 'a', name: 'A', w: 200, d: 60, rot: 0, x: 100, y: 150 },
    { id: 'b', name: 'B', w: 200, d: 60, rot: 0, x: 300, y: 150 },
  ];
  const w = analyzeWalkway(r, row, entry, dest, { clearance: 80 });
  assert.equal(w.status, 'blocked');
  assert.equal(w.path.length, 0);
});

test('6. a valid walking route is found and respects the clearance', () => {
  const w = analyzeWalkway(room, [sofa], entry, dest, { clearance: 80 });
  assert.equal(w.status, 'clear');
  assert.ok(w.path.length >= 2);
  assert.ok(w.bottleneck >= 80);
  // every route point keeps at least half the clearance from the sofa
  for (const p of w.path) {
    const r = rectOf(sofa);
    const dx = Math.max(r.left - p.x, 0, p.x - r.right);
    const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
    assert.ok(Math.hypot(dx, dy) >= 40 - 0.01);
  }
});

test('6b. a narrow gap gives a restricted route with its measured width', () => {
  const r = { width: 400, length: 300 };
  // row across the room leaving a 60 cm gap at the right wall
  const row = [{ id: 'a', name: 'Sideboard', w: 340, d: 50, rot: 0, x: 170, y: 150 }];
  const w = analyzeWalkway(r, row, entry, dest, { clearance: 80 });
  assert.equal(w.status, 'restricted');
  assert.ok(Math.abs(w.bottleneck - 60) <= 5, `bottleneck ${w.bottleneck}`);
  const res = analyzeLayout(r, row, { entry, dest, clearance: 80 });
  assert.equal(res.overall, 'amber');
  assert.ok(res.issues.some((i) => /narrows to about \d+ cm/.test(i.text)));
});

test('6c. lowering the clearance turns the same gap into a clear route', () => {
  const r = { width: 400, length: 300 };
  const row = [{ id: 'a', name: 'Sideboard', w: 340, d: 50, rot: 0, x: 170, y: 150 }];
  assert.equal(analyzeWalkway(r, row, entry, dest, { clearance: 55 }).status, 'clear');
});

test('7. editing furniture and room dimensions changes the result', () => {
  const big = { ...chair, w: 450 };
  assert.equal(boundaryCheck(big, room).inside, false);
  assert.equal(boundaryCheck(big, { width: 500, length: 300 }).fitsAsIs, true);
});

test('union area does not double count overlaps and is clipped to the room', () => {
  const a = { id: 'a', w: 100, d: 100, rot: 0, x: 50, y: 50 };
  const b = { id: 'b', w: 100, d: 100, rot: 0, x: 100, y: 100 };
  assert.equal(unionArea([a, b], room), 100 * 100 * 2 - 50 * 50);
  const out = { id: 'o', w: 100, d: 100, rot: 0, x: 0, y: 0 };
  assert.equal(unionArea([out], room), 50 * 50);
});

test('entry inside furniture is reported as blocked', () => {
  const w = analyzeWalkway(room, [{ id: 'x', w: 100, d: 100, rot: 0, x: 50, y: 250 }], entry, dest, { clearance: 80 });
  assert.equal(w.status, 'blocked');
  assert.equal(w.blockedEnd, 'entry');
});
