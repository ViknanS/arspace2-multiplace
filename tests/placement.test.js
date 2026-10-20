// Fix Position state machine tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedActions,
  followsReticle,
  initialState,
  objectVisible,
  tapAction,
  transition,
} from '../src/ar/placementState.js';

const run = (events, start = initialState()) => events.reduce((c, e) => transition(c, e), start);
const E = {
  start: { type: 'SESSION_STARTED' },
  hit: { type: 'HIT', found: true },
  miss: { type: 'HIT', found: false },
  place: { type: 'PLACE' },
  fix: { type: 'FIX' },
  unlock: { type: 'UNLOCK' },
  reset: { type: 'RESET' },
  lost: { type: 'TRACKING_LOST' },
  back: { type: 'TRACKING_RESTORED' },
};

test('starts in initializing, then scans', () => {
  assert.equal(initialState().state, 'initializing');
  assert.equal(run([E.start]).state, 'scanning');
});

test('surface detection toggles scanning <-> surface', () => {
  assert.equal(run([E.start, E.hit]).state, 'surface');
  assert.equal(run([E.start, E.hit, E.miss]).state, 'scanning');
});

test('cannot place or fix without a surface', () => {
  const c = run([E.start, E.place, E.fix]);
  assert.equal(c.state, 'scanning');
  assert.equal(allowedActions(c).place, false);
});

test('place -> preview follows reticle; fix -> fixed stops following', () => {
  const p = run([E.start, E.hit, E.place]);
  assert.equal(p.state, 'preview');
  assert.equal(followsReticle(p.state), true);
  assert.equal(objectVisible(p), true);
  const f = transition(p, E.fix);
  assert.equal(f.state, 'fixed');
  assert.equal(followsReticle(f.state), false);
  assert.deepEqual(
    Object.entries(allowedActions(f)).filter(([, v]) => v).map(([k]) => k).sort(),
    ['exit', 'reset', 'rotate', 'unlock'],
  );
});

test('fix needs a current hit (no fixing into thin air)', () => {
  const c = run([E.start, E.hit, E.place, E.miss, E.fix]);
  assert.equal(c.state, 'preview');
  assert.equal(allowedActions(c).fix, false);
});

test('losing the surface while fixed keeps the object fixed', () => {
  const c = run([E.start, E.hit, E.place, E.fix, E.miss]);
  assert.equal(c.state, 'fixed');
});

test('unlock -> repositioning -> fix again', () => {
  const c = run([E.start, E.hit, E.place, E.fix, E.unlock]);
  assert.equal(c.state, 'repositioning');
  assert.equal(followsReticle(c.state), true);
  assert.equal(transition(c, E.fix).state, 'fixed');
});

test('reset is different from unlock: returns to scanning/surface and hides the object', () => {
  const c = run([E.start, E.hit, E.place, E.fix, E.reset]);
  assert.equal(c.state, 'surface');
  assert.equal(objectVisible(c), false);
  const d = run([E.start, E.hit, E.place, E.fix, E.miss, E.reset]);
  assert.equal(d.state, 'scanning');
});

test('tracking loss pauses and resumes the previous state', () => {
  const c = run([E.start, E.hit, E.place, E.fix, E.lost]);
  assert.equal(c.state, 'tracking-limited');
  assert.equal(objectVisible(c), true); // fixed object stays shown
  assert.equal(allowedActions(c).unlock, false);
  assert.equal(transition(c, E.back).state, 'fixed');
});

test('errors, unsupported and end are terminal-ish', () => {
  assert.equal(run([E.start, { type: 'ERROR' }]).state, 'error');
  assert.equal(run([{ type: 'UNSUPPORTED' }]).state, 'unsupported');
  const ended = run([E.start, E.hit, { type: 'END' }]);
  assert.equal(ended.state, 'ended');
  assert.equal(transition(ended, E.hit).state, 'ended');
});

test('tap fallback without DOM overlay: place -> fix -> unlock -> fix', () => {
  let c = run([E.start, E.hit]);
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const a = tapAction(c);
    seq.push(a);
    c = transition(c, { type: a });
  }
  assert.deepEqual(seq, ['PLACE', 'FIX', 'UNLOCK', 'FIX']);
  assert.equal(c.state, 'fixed');
});
