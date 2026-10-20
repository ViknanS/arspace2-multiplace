// MultiPlace object management, arrangement and catalog tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createObjectManager, SCALE_LIMITS } from '../src/multiplace/objectManager.js';
import { parseArrangement, toArrangement } from '../src/multiplace/arrangement.js';

const P = (x, z) => ({ x, y: 0, z });

test('the 16-step lamp / chair / table scenario', () => {
  const m = createObjectManager();
  // 1-2 add and lock a lamp
  const lamp = m.add('floor-lamp', { position: P(0, -1) });
  assert.equal(m.place(lamp.instanceId), true);
  assert.equal(m.lock(lamp.instanceId), true);
  // 3-4 add a chair; the lamp still exists and is still locked
  const chair = m.add('chair');
  m.follow(P(1, -1.5));
  assert.ok(m.get(lamp.instanceId));
  assert.equal(m.get(lamp.instanceId).state, 'locked');
  assert.deepEqual(m.get(lamp.instanceId).position, P(0, -1)); // did not jump to the chair
  // 5 lock the chair
  m.place(chair.instanceId);
  m.lock(chair.instanceId);
  // 6-7 add and lock a table; all three exist
  const table = m.add('coffee-table');
  m.follow(P(1, -0.5));
  m.place(table.instanceId);
  m.lock(table.instanceId);
  assert.equal(m.count, 3);
  // 8-10 select the lamp and unlock only it
  m.select(lamp.instanceId);
  assert.equal(m.unlock(lamp.instanceId), true);
  assert.equal(m.get(lamp.instanceId).state, 'placed');
  assert.equal(m.get(chair.instanceId).state, 'locked');
  assert.equal(m.get(table.instanceId).state, 'locked');
  // 11-12 move the lamp and lock it again
  assert.equal(m.move(lamp.instanceId), true);
  m.follow(P(-1, -2));
  m.place(lamp.instanceId);
  m.lock(lamp.instanceId);
  assert.deepEqual(m.get(lamp.instanceId).position, P(-1, -2));
  assert.deepEqual(m.get(chair.instanceId).position, P(1, -1.5));
  assert.deepEqual(m.get(table.instanceId).position, P(1, -0.5));
  // 13-14 remove the chair; lamp and table remain
  assert.equal(m.remove(chair.instanceId), true);
  assert.deepEqual(m.list().map((o) => o.productId), ['floor-lamp', 'coffee-table']);
  // 15-16 a second lamp gets its own unique ID
  const lamp2 = m.add('floor-lamp');
  assert.notEqual(lamp2.instanceId, lamp.instanceId);
  assert.equal(lamp.instanceId, 'floor-lamp-001');
  assert.equal(lamp2.instanceId, 'floor-lamp-002');
});

test('locked objects reject edits; unlocked ones are independent', () => {
  const m = createObjectManager();
  const a = m.add('chair', { position: P(0, 0) });
  m.place(a.instanceId);
  m.lock(a.instanceId);
  assert.equal(m.rotate(a.instanceId, 1), false);
  assert.equal(m.setScale(a.instanceId, 1.2), false);
  assert.equal(m.setPosition(a.instanceId, P(5, 5)), false);
  assert.equal(m.move(a.instanceId), false);
  const b = m.add('chair', { position: P(2, 0) });
  m.place(b.instanceId);
  m.rotate(b.instanceId, Math.PI / 2);
  m.setScale(b.instanceId, 1.2);
  assert.equal(m.get(a.instanceId).rotationY, 0);
  assert.equal(m.get(a.instanceId).scale, 1);
  assert.ok(Math.abs(m.get(b.instanceId).rotationY - Math.PI / 2) < 1e-9);
  assert.equal(m.get(b.instanceId).scale, 1.2);
});

test('scale is clamped to safe limits; reset restores true size', () => {
  const m = createObjectManager();
  const a = m.add('sofa');
  m.place(a.instanceId);
  m.setScale(a.instanceId, 9);
  assert.equal(m.get(a.instanceId).scale, SCALE_LIMITS.max);
  m.setScale(a.instanceId, 0.01);
  assert.equal(m.get(a.instanceId).scale, SCALE_LIMITS.min);
  m.rotate(a.instanceId, 1);
  m.resetObject(a.instanceId);
  assert.equal(m.get(a.instanceId).scale, 1);
  assert.equal(m.get(a.instanceId).rotationY, 0);
});

test('switching products discards only an unplaced preview', () => {
  const m = createObjectManager();
  const locked = m.add('chair');
  m.place(locked.instanceId);
  m.lock(locked.instanceId);
  const p1 = m.add('stool'); // preview, never placed
  const p2 = m.add('plant'); // switching product discards the stool preview
  assert.equal(m.get(p1.instanceId), null);
  assert.ok(m.get(p2.instanceId));
  assert.ok(m.get(locked.instanceId));
  assert.equal(m.count, 2);
});

test('only one object follows the reticle; others never move with it', () => {
  const m = createObjectManager();
  const a = m.add('chair');
  m.follow(P(1, 1));
  m.place(a.instanceId);
  const b = m.add('sofa');
  m.follow(P(3, 3));
  assert.deepEqual(m.get(a.instanceId).position, P(1, 1));
  assert.equal(m.follower().instanceId, b.instanceId);
  m.place(b.instanceId);
  assert.equal(m.follower(), null);
  m.follow(P(9, 9)); // nothing follows -> nothing moves
  assert.deepEqual(m.get(a.instanceId).position, P(1, 1));
  assert.deepEqual(m.get(b.instanceId).position, P(3, 3));
});

test('starting a new item while moving another puts the moved one back', () => {
  const m = createObjectManager();
  const a = m.add('chair', { position: P(1, 1) });
  m.place(a.instanceId);
  m.move(a.instanceId);
  m.follow(P(4, 4));
  m.add('stool');
  assert.equal(m.get(a.instanceId).state, 'placed');
  assert.deepEqual(m.get(a.instanceId).position, P(1, 1));
});

test('anchor pose updates move only that locked object', () => {
  const m = createObjectManager();
  const a = m.add('chair', { position: P(0, 0) });
  m.place(a.instanceId);
  m.lock(a.instanceId);
  const b = m.add('sofa', { position: P(2, 0), state: 'placed' });
  m.lock(b.instanceId);
  assert.equal(m.applyAnchorPose(a.instanceId, { x: 0.01, y: 0, z: 0 }), true);
  assert.equal(m.get(a.instanceId).position.x, 0.01);
  assert.equal(m.get(b.instanceId).position.x, 2);
  const c = m.add('stool', { position: P(5, 5), state: 'placed' });
  assert.equal(m.applyAnchorPose(c.instanceId, P(0, 0)), false); // not locked
});

test('remove one, clear all, select validation', () => {
  const m = createObjectManager();
  const ids = ['chair', 'chair', 'sofa'].map((p) => {
    const o = m.add(p, { state: 'placed' });
    return o.instanceId;
  });
  assert.deepEqual(ids, ['chair-001', 'chair-002', 'sofa-001']);
  m.remove('chair-001');
  assert.deepEqual(m.list().map((o) => o.instanceId), ['chair-002', 'sofa-001']);
  assert.equal(m.select('nope'), false);
  assert.deepEqual(m.clear(), ['chair-002', 'sofa-001']);
  assert.equal(m.count, 0);
  // IDs keep counting up after a clear so old exports never collide
  assert.equal(m.add('chair').instanceId, 'chair-003');
});

test('arrangement export is relative to the group centre and round-trips', () => {
  const m = createObjectManager();
  const a = m.add('chair', { position: { x: 10, y: -1.4, z: -2 }, state: 'placed' });
  m.lock(a.instanceId);
  m.add('sofa', { position: { x: 12, y: -1.4, z: -2 }, rotationY: 1.5, state: 'placed' });
  m.add('stool'); // unplaced preview is not exported
  const arr = toArrangement(m.list(), { source: 'ar' });
  assert.equal(arr.objects.length, 2);
  assert.deepEqual(arr.objects[0].position, { x: -1, y: 0, z: 0 });
  assert.deepEqual(arr.objects[1].position, { x: 1, y: 0, z: 0 });
  assert.equal(arr.objects[0].locked, true);
  const back = parseArrangement(JSON.parse(JSON.stringify(arr)), ['chair', 'sofa']);
  assert.equal(back.ok, true);
  assert.equal(back.objects.length, 2);
  assert.equal(back.objects[1].rotationY, 1.5);
  const bad = parseArrangement({ kind: 'arspace-arrangement', version: 1, objects: [{ productId: 'ufo', position: P(0, 0) }] }, ['chair']);
  assert.equal(bad.objects.length, 0);
  assert.equal(parseArrangement({ hello: 1 }, []).ok, false);
});

// ---------------------------------------------------------------- catalog

const src = readFileSync(new URL('../src/data/products.js', import.meta.url), 'utf8');
const ids = [...src.matchAll(/^\s{4}id: '([a-z0-9-]+)'/gm)].map((m) => m[1]);
const cats = [...src.matchAll(/category: '([a-z]+)'/g)].map((m) => m[1]);

test('catalog has at least 15 products with unique IDs', () => {
  assert.ok(ids.length >= 15, `only ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length);
});

test('every product has a real GLB file and a thumbnail', () => {
  for (const id of ids) {
    const glb = new URL(`../public/models/${id}.glb`, import.meta.url);
    assert.ok(existsSync(glb), `missing model for ${id}`);
    assert.equal(readFileSync(glb).subarray(0, 4).toString(), 'glTF', `${id} is not a GLB`);
    assert.ok(existsSync(new URL(`../public/thumbs/${id}.webp`, import.meta.url)), `missing thumbnail for ${id}`);
  }
});

test('every product declares a known category and footprint', () => {
  const known = ['seating', 'tables', 'storage', 'lighting', 'decor'];
  assert.equal(cats.length, ids.length);
  cats.forEach((c) => assert.ok(known.includes(c), c));
  const footprints = [...src.matchAll(/footprint: \{ w: (\d+), d: (\d+), h: (\d+) \}/g)];
  assert.equal(footprints.length, ids.length);
  footprints.forEach((f) => f.slice(1).forEach((v) => assert.ok(Number(v) > 0)));
});

test('no two products share the same 3D file (no renamed duplicates)', () => {
  const hashes = new Map();
  for (const id of ids) {
    const buf = readFileSync(new URL(`../public/models/${id}.glb`, import.meta.url));
    const key = `${buf.length}`;
    assert.ok(!hashes.has(key) || readFileSync(new URL(`../public/models/${hashes.get(key)}.glb`, import.meta.url)).compare(buf) !== 0, `${id} duplicates ${hashes.get(key)}`);
    hashes.set(key, id);
  }
});
