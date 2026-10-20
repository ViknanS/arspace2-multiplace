// MultiPlace: the 20-step acceptance scenario at the data level, wall
// placement, duplicate and undo. Run with: npm test
// These tests prove the scene-management logic; they are NOT proof that world
// tracking works on a phone (see DEVICE_TESTING.md for physical tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createObjectManager, UNDO_LIMIT } from '../src/multiplace/objectManager.js';
import { classifyHitMatrix, suits } from '../src/multiplace/surface.js';
import { parseArrangement, toArrangement } from '../src/multiplace/arrangement.js';

const P = (x, z, y = 0) => ({ x, y, z });

// column-major 4×4 pose with +Y along `n` (a hit-test result on a surface with normal n)
function poseWithNormal(n, pos) {
  const l = Math.hypot(n.x, n.y, n.z);
  const y = { x: n.x / l, y: n.y / l, z: n.z / l };
  const ref = Math.abs(y.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let x = { x: ref.y * y.z - ref.z * y.y, y: ref.z * y.x - ref.x * y.z, z: ref.x * y.y - ref.y * y.x };
  const xl = Math.hypot(x.x, x.y, x.z);
  x = { x: x.x / xl, y: x.y / xl, z: x.z / xl };
  const z = { x: x.y * y.z - x.z * y.y, y: x.z * y.x - x.x * y.z, z: x.x * y.y - x.y * y.x };
  return [x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, pos.x, pos.y, pos.z, 1];
}

test('acceptance scenario steps 1-17 and 20: lamp, chair, table, duplicate, delete', () => {
  const m = createObjectManager();
  const lamp = m.add('floor-lamp'); // 1 place a lamp
  m.follow(P(0, -1.5));
  m.place(lamp.instanceId);
  assert.ok(m.lock(lamp.instanceId)); // 2 lock it
  const chair = m.add('chair'); // 3 add a chair
  assert.equal(m.get(lamp.instanceId).state, 'locked'); // 4 lamp still exists
  m.follow(P(0.8, -1.6));
  m.place(chair.instanceId);
  assert.ok(m.lock(chair.instanceId)); // 5 lock the chair
  const table = m.add('coffee-table'); // 6 add a table
  m.follow(P(0.3, -0.8));
  m.place(table.instanceId);
  m.lock(table.instanceId);
  assert.equal(m.count, 3); // 7 all three coexist
  assert.equal(new Set(m.list().map((o) => o.instanceId)).size, 3);
  const before = JSON.stringify(m.list().map((o) => o.position));
  m.follow(P(9, 9)); // 8 camera/reticle moves: no follower, nothing moves
  assert.equal(JSON.stringify(m.list().map((o) => o.position)), before); // 9
  m.select(chair.instanceId); // 10 select only the chair
  assert.ok(m.unlock(chair.instanceId)); // 11 unlock it
  assert.equal(m.get(lamp.instanceId).state, 'locked');
  assert.equal(m.get(table.instanceId).state, 'locked');
  assert.ok(m.move(chair.instanceId)); // 12 move it
  m.follow(P(1.5, -2));
  m.place(chair.instanceId);
  assert.ok(m.lock(chair.instanceId)); // 13 lock again
  assert.deepEqual(m.get(chair.instanceId).position, P(1.5, -2));
  assert.deepEqual(m.get(lamp.instanceId).position, P(0, -1.5)); // 14 lamp and table unaffected
  assert.deepEqual(m.get(table.instanceId).position, P(0.3, -0.8));
  const lamp2 = m.duplicate(lamp.instanceId, { offset: 0.5 }); // 15 duplicate the lamp
  assert.equal(lamp2.productId, 'floor-lamp');
  assert.notEqual(lamp2.instanceId, lamp.instanceId);
  assert.equal(lamp2.state, 'placed'); // the copy is editable; the original stays locked
  assert.equal(m.get(lamp.instanceId).state, 'locked');
  assert.ok(Math.abs(Math.hypot(lamp2.position.x - lamp.position.x, lamp2.position.z - lamp.position.z) - 0.5) < 1e-9);
  assert.ok(m.remove(lamp.instanceId)); // 16 delete one lamp
  assert.ok(m.get(lamp2.instanceId)); // 17 the other remains
  assert.equal(m.count, 3);
  assert.equal(m.clear().length, 3); // 20 exit/cleanup removes all
});

test('step 18: a wall lamp follows a vertical surface and faces out of it', () => {
  const wallHit = classifyHitMatrix(poseWithNormal({ x: 0, y: 0, z: 1 }, P(0.2, -2, 1.6)));
  assert.equal(wallHit.kind, 'wall');
  assert.ok(Math.abs(wallHit.yaw) < 1e-9); // wall facing +Z: object front faces +Z
  const side = classifyHitMatrix(poseWithNormal({ x: -1, y: 0, z: 0 }, P(2, 0, 1)));
  assert.equal(side.kind, 'wall');
  assert.ok(Math.abs(side.yaw + Math.PI / 2) < 1e-9);
  const floorHit = classifyHitMatrix(poseWithNormal({ x: 0, y: 1, z: 0 }, P(0, -1)));
  assert.equal(floorHit.kind, 'floor');
  assert.equal(classifyHitMatrix(poseWithNormal({ x: 0, y: -1, z: 0 }, P(0, -1, 2.5))).kind, 'ceiling');
  assert.equal(classifyHitMatrix(poseWithNormal({ x: 0, y: 0.6, z: 0.8 }, P(0, -1))).kind, 'slope');
  // wall items need a wall, floor items need a floor
  assert.equal(suits(wallHit, 'wall'), true);
  assert.equal(suits(floorHit, 'wall'), false);
  assert.equal(suits(wallHit, 'floor'), false);
  assert.equal(suits(null, 'floor'), false);

  const m = createObjectManager();
  const wl = m.add('barn-lamp', { surface: 'wall' });
  assert.equal(wl.surface, 'wall');
  m.follow(side.position, { rotationY: side.yaw });
  assert.deepEqual(m.get(wl.instanceId).position, side.position);
  assert.ok(Math.abs(m.get(wl.instanceId).rotationY - (3 * Math.PI) / 2) < 1e-9); // -90° normalised
  assert.equal(m.rotate(wl.instanceId, 0.3), false); // can't spin a wall item into the wall
  m.place(wl.instanceId, wallHit.position, { rotationY: wallHit.yaw });
  assert.equal(m.get(wl.instanceId).rotationY, 0);
  assert.ok(m.lock(wl.instanceId));
  // a floor item ignores wall yaw
  const chair = m.add('chair');
  m.follow(P(1, -1), { rotationY: 1.2 });
  assert.equal(m.get(chair.instanceId).rotationY, 0);
  // duplicating a wall item slides along the wall (offset perpendicular to its normal)
  m.place(chair.instanceId);
  const dup = m.duplicate(wl.instanceId, { offset: 0.4 });
  assert.equal(dup.surface, 'wall');
  assert.equal(dup.position.y, wallHit.position.y);
  assert.ok(Math.abs(dup.position.z - wallHit.position.z) < 1e-9);
  assert.ok(Math.abs(dup.position.x - (wallHit.position.x + 0.4)) < 1e-9);
});

test('undo reverses add, place, lock, move, remove, duplicate and clear', () => {
  const m = createObjectManager();
  assert.equal(m.canUndo, false);
  const a = m.add('chair');
  m.follow(P(1, 1));
  m.place(a.instanceId);
  m.lock(a.instanceId);
  const events = [];
  m.onChange((e) => events.push(e));
  m.undo(); // undo lock
  assert.equal(m.get(a.instanceId).state, 'placed');
  assert.deepEqual(events.at(-1), { type: 'restore', added: [], removed: [], changed: [a.instanceId] });
  m.lock(a.instanceId);
  m.remove(a.instanceId);
  assert.equal(m.count, 0);
  m.undo(); // undo remove
  assert.equal(m.get(a.instanceId).state, 'locked');
  assert.deepEqual(events.at(-1).added, [a.instanceId]);
  const d = m.duplicate(a.instanceId);
  m.undo(); // undo duplicate
  assert.equal(m.get(d.instanceId), null);
  assert.deepEqual(events.at(-1).removed, [d.instanceId]);
  const d2 = m.duplicate(a.instanceId);
  assert.notEqual(d2.instanceId, d.instanceId); // IDs are never reused after undo
  m.clear();
  m.undo(); // undo clear brings everything back
  assert.equal(m.count, 2);
  m.unlock(a.instanceId);
  m.move(a.instanceId);
  m.follow(P(3, 3));
  m.place(a.instanceId);
  m.undo(); // undo place: back to moving
  assert.equal(m.get(a.instanceId).state, 'moving');
  m.undo(); // undo move: back where it was
  assert.deepEqual(m.get(a.instanceId).position, P(1, 1));
  assert.equal(m.get(a.instanceId).state, 'placed');
});

test('undo history is bounded and drags are one step via checkpoint()', () => {
  const m = createObjectManager();
  const a = m.add('stool', { state: 'placed' });
  for (let i = 0; i < UNDO_LIMIT + 10; i++) m.rotate(a.instanceId, 0.1);
  let n = 0;
  while (m.undo()) n++;
  assert.equal(n, UNDO_LIMIT);
  m.checkpoint();
  for (let i = 1; i <= 20; i++) m.setPosition(a.instanceId, P(i * 0.1, 0));
  m.undo();
  assert.equal(m.get(a.instanceId).position.x, 0);
  assert.equal(m.setScale(a.instanceId, 1), false); // no-op edits don't add undo steps
});

test('arrangements keep wall items on the wall', () => {
  const m = createObjectManager();
  const c = m.add('chair', { state: 'placed', position: P(1, 1, 0.02) });
  const p = m.add('wall-painting', { state: 'locked', surface: 'wall', position: P(1, 0, 1.52), rotationY: 0 });
  const arr = toArrangement(m.list(), { recenter: false });
  const wp = arr.objects.find((o) => o.instanceId === p.instanceId);
  assert.equal(wp.surface, 'wall');
  assert.equal(wp.position.y, 1.5); // relative to the floor (the chair's y)
  assert.equal(arr.objects.find((o) => o.instanceId === c.instanceId).surface, 'floor');
  const back = parseArrangement(JSON.parse(JSON.stringify(arr)), ['chair', 'wall-painting']);
  assert.equal(back.objects[1].surface, 'wall');
});

test('wall items are real wall models (back at z = 0, facing +Z) with USDZ twins for iOS', () => {
  // products.js uses import.meta.env (Vite), so read its source in Node
  const src = readFileSync(new URL('../src/data/products.js', import.meta.url), 'utf8');
  const block = (id) => src.split('P({').find((b) => b.includes(`id: '${id}'`)) ?? '';
  for (const id of ['barn-lamp', 'wall-painting', 'wall-clock']) assert.match(block(id), /placement: 'wall'/, `${id} should be a wall item`);
  for (const id of ['chair', 'sofa', 'coffee-table']) assert.doesNotMatch(block(id), /placement: 'wall'/);
  const bounds = JSON.parse(readFileSync(new URL('../ios/ARSpaceMultiPlace/ARSpaceMultiPlace/Models/bounds.json', import.meta.url)));
  for (const id of ['barn-lamp', 'wall-painting', 'wall-clock']) {
    assert.ok(Math.abs(bounds[id].min[2]) < 0.002, `${id} back should sit at z = 0`);
    assert.ok(bounds[id].max[2] > 0.02, `${id} should face +Z`);
  }
  const ids = [...src.matchAll(/^\s+id: '([\w-]+)',/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 15);
  for (const id of ids) {
    const f = new URL(`../ios/ARSpaceMultiPlace/ARSpaceMultiPlace/Models/${id}.usdz`, import.meta.url);
    assert.ok(existsSync(f), `${id}.usdz missing`);
    assert.equal(readFileSync(f).subarray(0, 2).toString('latin1'), 'PK', `${id}.usdz is not a zip package`);
    assert.ok(bounds[id], `${id} missing from bounds.json`);
  }
});

test('the iOS app catalog is in sync with the website catalog', async () => {
  const { PRODUCTS, surfaceOf } = await import('../src/data/products.js');
  const ios = JSON.parse(readFileSync(new URL('../ios/ARSpaceMultiPlace/ARSpaceMultiPlace/catalog.json', import.meta.url)));
  assert.equal(ios.products.length, PRODUCTS.length, 'run npm run ios:catalog');
  for (const p of PRODUCTS) {
    const q = ios.products.find((x) => x.id === p.id);
    assert.ok(q, `${p.id} missing from catalog.json (run npm run ios:catalog)`);
    assert.equal(q.name, p.name);
    assert.deepEqual(q.footprint, p.footprint);
    assert.equal(q.placement, surfaceOf(p));
    assert.ok(existsSync(new URL(`../ios/ARSpaceMultiPlace/ARSpaceMultiPlace/Thumbnails/${p.id}.png`, import.meta.url)));
  }
});
