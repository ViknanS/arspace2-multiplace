// AutoGrid -> SmartFit integration: shared plan conversion + existing analysis. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, fromSmartFit, resizePlan, toSmartFit } from '../src/autogrid/roomPlanState.js';
import { analyzeCorners } from '../src/autogrid/roomGeometry.js';
import { analyzeLayout } from '../src/smartfit/analysis.js';
import { analyzeWalkway } from '../src/smartfit/geometry.js';

test('AR-measured 4.2 × 3.5 m room reaches SmartFit without re-entry', () => {
  const Y = -1.4;
  const scan = analyzeCorners([
    { x: 0, y: Y, z: 0 },
    { x: 4.2, y: Y, z: 0 },
    { x: 4.2, y: Y, z: -3.5 },
    { x: 0, y: Y, z: -3.5 },
  ]);
  assert.equal(scan.ok && scan.rectangular, true);
  const plan = resizePlan(createPlan(), +scan.width.toFixed(2), +scan.length.toFixed(2), 'ar-scan');
  const sf = toSmartFit(plan);
  assert.deepEqual(sf.room, { width: 420, length: 350 });
  assert.equal((sf.room.width * sf.room.length) / 10000, 14.7);
  assert.equal(plan.measurementSource, 'ar-scan');
});

test('round trip plan -> SmartFit -> plan keeps furniture in metres', () => {
  const plan = createPlan({ widthMeters: 4, lengthMeters: 3 });
  const sf = toSmartFit(plan);
  sf.items.push({ id: 'c1', kind: 'chair', name: 'Chair', w: 83, d: 57, h: 69, rot: 90, x: 330, y: 220, source: 'model', productId: 'chair' });
  sf.room.width = 450;
  const back = fromSmartFit(sf, plan);
  assert.equal(back.id, plan.id);
  assert.equal(back.dimensions.widthMeters, 4.5);
  assert.deepEqual(
    { w: back.furniture[0].widthMeters, x: back.furniture[0].xMeters, r: back.furniture[0].rotationDeg },
    { w: 0.83, x: 3.3, r: 90 },
  );
  assert.deepEqual(toSmartFit(back).items[0], sf.items[0]);
});

test('existing collision and walkway analysis runs on a converted plan', () => {
  const plan = createPlan({ widthMeters: 4, lengthMeters: 3 });
  plan.furniture = [
    { id: 'a', kind: 'sofa', name: 'Sofa', widthMeters: 2.19, depthMeters: 1.02, heightMeters: 0.79, rotationDeg: 0, xMeters: 1.3, yMeters: 0.56, source: 'model' },
    { id: 'b', kind: 'coffee-table', name: 'Coffee table', widthMeters: 1, depthMeters: 0.55, heightMeters: 0.45, rotationDeg: 0, xMeters: 1.6, yMeters: 1.2, source: 'demo' },
  ];
  const sf = toSmartFit(plan);
  const res = analyzeLayout(sf.room, sf.items, { entry: sf.markers.entry, dest: sf.markers.dest, clearance: sf.clearance });
  assert.ok(res.issues.some((i) => /overlaps the Coffee table by 15 cm/.test(i.text)));
});

test('resizing keeps furniture and pulls markers inside the new walls', () => {
  const plan = createPlan({ widthMeters: 6, lengthMeters: 5 });
  plan.furniture.push({ id: 'x', name: 'Desk', widthMeters: 1.2, depthMeters: 0.6, xMeters: 5, yMeters: 4, rotationDeg: 0 });
  const small = resizePlan(plan, 2, 2, 'manual');
  assert.equal(small.furniture.length, 1);
  assert.ok(small.destinationPoint.xMeters <= 1.95 && small.entryPoint.yMeters <= 1.95);
});

test('walkway classification is consistent when clearance is at or below the 45 cm floor', () => {
  const room = { width: 400, length: 300 };
  // 55 cm gap at the right wall
  const row = [{ id: 'a', w: 345, d: 50, rot: 0, x: 172.5, y: 150 }];
  const e = { x: 50, y: 255 };
  const d = { x: 350, y: 45 };
  // clearance 45: minPassable becomes min(45, clearance) = 45 -> clear (no restricted band)
  assert.equal(analyzeWalkway(room, row, e, d, { clearance: 45 }).status, 'clear');
  // clearance 40 (below the floor): minPassable = 40, so the band never inverts
  const w = analyzeWalkway(room, row, e, d, { clearance: 40 });
  assert.equal(w.minPassable, 40);
  assert.equal(w.status, 'clear');
  // clearance 80: same gap is restricted
  assert.equal(analyzeWalkway(room, row, e, d, { clearance: 80 }).status, 'restricted');
});
