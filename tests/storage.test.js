// Room plan persistence tests (in-memory storage stand-in). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, createPlanStore, validatePlan } from '../src/autogrid/roomPlanState.js';
import { StorageError, createPlanLibrary, exportPlanJSON, importPlanJSON } from '../src/autogrid/planStorage.js';

function memoryStorage({ quota = Infinity } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > quota) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
    raw: m,
  };
}

const sample = () => {
  const p = createPlan({ name: 'Living room', widthMeters: 4.2, lengthMeters: 3.5 });
  p.furniture.push({
    id: 'f1', kind: 'sofa', name: 'Curved Velvet Sofa', widthMeters: 2.19, depthMeters: 1.02, heightMeters: 0.79,
    rotationDeg: 0, xMeters: 1.3, yMeters: 0.56, source: 'model', productId: 'sofa',
  });
  return p;
};

test('save, list, get and load back an identical plan', () => {
  const lib = createPlanLibrary(memoryStorage());
  const p = sample();
  assert.equal(lib.save(p).status, 'saved');
  const back = lib.get(p.id);
  assert.equal(back.name, 'Living room');
  assert.deepEqual(back.dimensions, { widthMeters: 4.2, lengthMeters: 3.5 });
  assert.deepEqual(back.furniture, p.furniture);
  assert.deepEqual(back.entryPoint, p.entryPoint);
  assert.equal(back.preferredClearanceMeters, 0.8);
  assert.equal(back.grid.spacingMeters, 0.5);
  assert.equal(lib.list().length, 1);
});

test('saving the same plan again updates it in place', () => {
  const lib = createPlanLibrary(memoryStorage());
  const p = sample();
  lib.save(p);
  lib.save({ ...p, dimensions: { widthMeters: 5, lengthMeters: 3.5 } });
  assert.equal(lib.list().length, 1);
  assert.equal(lib.get(p.id).dimensions.widthMeters, 5);
});

test('a different plan with the same name is not overwritten without consent', () => {
  const lib = createPlanLibrary(memoryStorage());
  const a = sample();
  lib.save(a);
  const b = { ...sample(), name: 'living ROOM' };
  const r = lib.save(b);
  assert.equal(r.status, 'name-taken');
  assert.equal(lib.list().length, 1);
  assert.equal(lib.save(b, { overwrite: true }).status, 'saved');
  assert.equal(lib.list().length, 1);
  assert.equal(lib.list()[0].id, b.id);
});

test('rename and delete', () => {
  const lib = createPlanLibrary(memoryStorage());
  const a = sample();
  const b = { ...sample(), name: 'Bedroom' };
  lib.save(a);
  lib.save(b);
  lib.rename(a.id, 'Lounge');
  assert.equal(lib.get(a.id).name, 'Lounge');
  assert.throws(() => lib.rename(a.id, 'bedroom'), StorageError);
  assert.throws(() => lib.rename(a.id, '   '), StorageError);
  assert.equal(lib.remove(b.id), true);
  assert.equal(lib.remove(b.id), false);
  assert.equal(lib.list().length, 1);
});

test('corrupted storage does not crash and is preserved before overwriting', () => {
  const st = memoryStorage();
  st.setItem('arspace.plans', '{not json');
  const lib = createPlanLibrary(st);
  assert.deepEqual(lib.list(), []);
  assert.equal(lib.status().corrupt, true);
  lib.save(sample());
  assert.equal(lib.list().length, 1);
  assert.ok(st.keys().some((k) => k.startsWith('arspace.plans.corrupt-')));
});

test('invalid entries inside an otherwise valid list are skipped', () => {
  const st = memoryStorage();
  st.setItem('arspace.plans', JSON.stringify([sample(), { schemaVersion: 1, dimensions: { widthMeters: 99, lengthMeters: 3 } }, 'x']));
  const lib = createPlanLibrary(st);
  assert.equal(lib.list().length, 1);
  assert.equal(lib.status().dropped, 2);
});

test('storage quota errors become a clear message', () => {
  const lib = createPlanLibrary(memoryStorage({ quota: 50 }));
  assert.throws(() => lib.save(sample()), /storage is full/);
});

test('no storage available (private mode) is reported, not thrown on read', () => {
  const lib = createPlanLibrary(null);
  assert.deepEqual(lib.list(), []);
  assert.equal(lib.status().unavailable, true);
  assert.throws(() => lib.save(sample()), StorageError);
});

test('validation rejects bad dimensions and versions, normalises the rest', () => {
  assert.equal(validatePlan(null).ok, false);
  assert.equal(validatePlan({ schemaVersion: 2, dimensions: { widthMeters: 4, lengthMeters: 3 } }).ok, false);
  assert.equal(validatePlan({ schemaVersion: 1, dimensions: { widthMeters: 0.5, lengthMeters: 3 } }).ok, false);
  const v = validatePlan({
    schemaVersion: 1,
    dimensions: { widthMeters: 4, lengthMeters: 3 },
    grid: { spacingMeters: 0.3 },
    furniture: [{ name: 'Box', widthMeters: 1, depthMeters: 1, xMeters: 9, yMeters: 1 }, { name: 'bad' }],
    entryPoint: { xMeters: -5, yMeters: 1 },
    preferredClearanceMeters: 3,
  });
  assert.equal(v.ok, true);
  assert.equal(v.plan.grid.spacingMeters, 0.5); // unsupported spacing -> default
  assert.equal(v.plan.furniture.length, 1); // incomplete item skipped
  assert.equal(v.plan.furniture[0].xMeters, 4); // clamped into the room
  assert.equal(v.plan.entryPoint.xMeters, 0.05);
  assert.equal(v.plan.preferredClearanceMeters, 1.5);
  assert.ok(v.errors.some((e) => /item 2/.test(e)));
});

test('export -> import round trip gets a new id and keeps the content', () => {
  const p = sample();
  const { plan } = importPlanJSON(exportPlanJSON(p));
  assert.notEqual(plan.id, p.id);
  assert.equal(plan.name, p.name);
  assert.deepEqual(plan.furniture, p.furniture);
  assert.throws(() => importPlanJSON('nope'), /not valid JSON/);
  assert.throws(() => importPlanJSON('{"schemaVersion":1}'), /can't be opened/);
});

test('working plan store persists across instances and ignores corruption', () => {
  const st = memoryStorage();
  const a = createPlanStore(st);
  const p = sample();
  a.set(p);
  const b = createPlanStore(st);
  assert.equal(b.get().id, p.id);
  st.setItem('arspace.workingPlan', '{{{');
  assert.equal(createPlanStore(st).get(), null);
});
