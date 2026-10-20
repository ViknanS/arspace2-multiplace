/**
 * MultiPlace — PlacedObjectManager (pure data, no three.js, unit tested).
 *
 * Holds every furniture instance in a scene. Each instance has its own ID,
 * transform and lock state, so locking, moving or removing one never touches
 * another. The AR session and the 3D composer both drive this same manager
 * and mirror its data onto three.js objects.
 *
 * Instance states
 *   preview  new object, never placed; follows the reticle / pointer
 *   placed   standing at a position; editable (rotate, resize, move, lock)
 *   moving   an existing object being repositioned; follows the reticle
 *   locked   fixed in place; only Unlock or Remove change it
 *
 * Positions are metres in the scene's coordinate space (the XR reference space
 * in AR, the room floor in the composer). rotationY is radians.
 *
 * surface 'floor' objects stand on a horizontal surface (floor or tabletop);
 * surface 'wall' objects hang on a vertical surface: their position is the
 * point on the wall and rotationY is the direction the wall faces, so they
 * can't be spun freely (that would turn them into the wall).
 *
 * Undo: every editing command records a snapshot first (up to UNDO_LIMIT).
 * Instance IDs are never reused, even after an undo.
 */

export const SCALE_LIMITS = { min: 0.5, max: 1.5 };
export const UNDO_LIMIT = 30;
const FOLLOWING = new Set(['preview', 'moving']);

const pad3 = (n) => String(n).padStart(3, '0');
const norm = (r) => (((r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
const clampScale = (s) => Math.min(SCALE_LIMITS.max, Math.max(SCALE_LIMITS.min, s));

export function createObjectManager() {
  const objects = new Map(); // instanceId -> object (insertion order = creation order)
  const counters = new Map(); // productId -> last number used
  const listeners = new Set();
  const history = []; // snapshots for undo
  let selectedId = null;

  const emit = (type, detail = {}) => listeners.forEach((fn) => fn({ type, ...detail }));
  const vec = (p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0, z: Number(p?.z) || 0 });

  const copy = (o) => ({ ...o, position: { ...o.position }, lastPosition: { ...o.lastPosition } });
  function record() {
    history.push({ objects: [...objects.values()].map(copy), selectedId });
    if (history.length > UNDO_LIMIT) history.shift();
  }

  function nextId(productId) {
    const n = (counters.get(productId) ?? 0) + 1;
    counters.set(productId, n);
    return `${productId}-${pad3(n)}`;
  }

  /** The single object currently following the reticle, if any. */
  function follower() {
    for (const o of objects.values()) if (FOLLOWING.has(o.state)) return o;
    return null;
  }

  /**
   * Stop whatever is following: an unplaced preview is discarded, a moving
   * object goes back to where it was. Placed and locked objects are untouched.
   */
  function settleFollower() {
    const f = follower();
    if (!f) return null;
    if (f.state === 'preview') {
      objects.delete(f.instanceId);
      if (selectedId === f.instanceId) selectedId = null;
      emit('remove', { id: f.instanceId, reason: 'discarded-preview' });
      return f.instanceId;
    }
    f.position = { ...f.lastPosition };
    f.state = 'placed';
    emit('update', { id: f.instanceId });
    return null;
  }

  const api = {
    /** Start placing a new instance of a product. Other objects are untouched. */
    add(productId, { position, rotationY = 0, scale = 1, state = 'preview', surface = 'floor' } = {}) {
      if (!productId || typeof productId !== 'string') throw new TypeError('productId is required');
      settleFollower();
      record();
      const obj = {
        instanceId: nextId(productId),
        productId,
        surface: surface === 'wall' ? 'wall' : 'floor',
        position: vec(position),
        rotationY: Number(rotationY) || 0,
        scale: clampScale(Number(scale) || 1),
        state: ['preview', 'placed', 'locked'].includes(state) ? state : 'preview',
        lastPosition: vec(position),
        visible: true,
        createdAt: objects.size,
      };
      objects.set(obj.instanceId, obj);
      selectedId = obj.instanceId;
      emit('add', { id: obj.instanceId });
      return obj;
    },

    get: (id) => objects.get(id) ?? null,
    list: () => [...objects.values()],
    get count() {
      return objects.size;
    },
    get selectedId() {
      return selectedId;
    },
    selected: () => (selectedId ? objects.get(selectedId) ?? null : null),
    follower,

    select(id) {
      if (id !== null && !objects.has(id)) return false;
      // selecting another object finishes any half-done move/preview first
      const f = follower();
      if (f && f.instanceId !== id) settleFollower();
      selectedId = id;
      emit('select', { id });
      return true;
    },

    /** Follow-mode update from the reticle (only the follower moves). Wall items also take the wall's facing. */
    follow(position, { rotationY } = {}) {
      const f = follower();
      if (!f) return null;
      f.position = vec(position);
      if (f.surface === 'wall' && Number.isFinite(rotationY)) f.rotationY = norm(rotationY);
      return f;
    },

    /** Put the following object down at its current (or given) position. */
    place(id, position, { rotationY } = {}) {
      const o = objects.get(id);
      if (!o || !FOLLOWING.has(o.state)) return false;
      record();
      if (position) o.position = vec(position);
      if (o.surface === 'wall' && Number.isFinite(rotationY)) o.rotationY = norm(rotationY);
      o.lastPosition = { ...o.position };
      o.state = 'placed';
      emit('update', { id });
      return true;
    },

    lock(id) {
      const o = objects.get(id);
      if (!o || o.state !== 'placed') return false;
      record();
      o.state = 'locked';
      emit('update', { id });
      return true;
    },

    unlock(id) {
      const o = objects.get(id);
      if (!o || o.state !== 'locked') return false;
      record();
      o.state = 'placed';
      emit('update', { id });
      return true;
    },

    /** Pick a placed object back up to reposition it. Locked objects must be unlocked first. */
    move(id) {
      const o = objects.get(id);
      if (!o || o.state !== 'placed') return false;
      const f = follower();
      if (f && f.instanceId !== id) settleFollower();
      record();
      o.lastPosition = { ...o.position };
      o.state = 'moving';
      selectedId = id;
      emit('update', { id });
      return true;
    },

    /** Cancel a move (back to last position) or discard an unplaced preview. */
    cancel() {
      return settleFollower();
    },

    rotate(id, deltaRad) {
      const o = objects.get(id);
      if (!o || o.state === 'locked' || o.surface === 'wall') return false;
      record();
      o.rotationY = norm(o.rotationY + deltaRad);
      emit('update', { id });
      return true;
    },

    setRotation(id, rad) {
      const o = objects.get(id);
      if (!o || o.state === 'locked') return false;
      record();
      o.rotationY = norm(Number(rad));
      emit('update', { id });
      return true;
    },

    setScale(id, s) {
      const o = objects.get(id);
      if (!o || o.state === 'locked') return false;
      const next = clampScale(Number(s) || 1);
      if (next === o.scale) return false;
      record();
      o.scale = next;
      emit('update', { id });
      return true;
    },

    /**
     * Directly set a position (composer drag). Locked objects refuse. Not
     * recorded for undo on its own: call checkpoint() once when a drag starts.
     */
    setPosition(id, position, { rotationY } = {}) {
      const o = objects.get(id);
      if (!o || o.state === 'locked') return false;
      o.position = vec(position);
      if (Number.isFinite(rotationY)) o.rotationY = norm(rotationY);
      if (o.state === 'placed') o.lastPosition = { ...o.position };
      emit('update', { id });
      return true;
    },

    /**
     * Pose correction for a locked object from its spatial anchor. This is the
     * only way a locked object's position changes, and it never affects others.
     */
    applyAnchorPose(id, position) {
      const o = objects.get(id);
      if (!o || o.state !== 'locked') return false;
      o.position = vec(position);
      o.lastPosition = { ...o.position };
      return true;
    },

    /** Restore true size and default rotation (not position). */
    resetObject(id) {
      const o = objects.get(id);
      if (!o || o.state === 'locked') return false;
      record();
      if (o.surface !== 'wall') o.rotationY = 0;
      o.scale = 1;
      emit('update', { id });
      return true;
    },

    /**
     * Copy an object as a new, independent, unlocked instance placed beside
     * it (offset to its right, along the floor or along the wall).
     */
    duplicate(id, { offset = 0.4 } = {}) {
      const o = objects.get(id);
      if (!o || FOLLOWING.has(o.state)) return null;
      record();
      const right = { x: Math.cos(o.rotationY), z: -Math.sin(o.rotationY) };
      const position = { x: o.position.x + right.x * offset, y: o.position.y, z: o.position.z + right.z * offset };
      const dup = {
        ...copy(o),
        instanceId: nextId(o.productId),
        position,
        lastPosition: { ...position },
        state: 'placed',
        createdAt: objects.size,
      };
      objects.set(dup.instanceId, dup);
      selectedId = dup.instanceId;
      emit('add', { id: dup.instanceId, duplicateOf: id });
      return dup;
    },

    remove(id) {
      if (!objects.has(id)) return false;
      record();
      objects.delete(id);
      if (selectedId === id) selectedId = null;
      emit('remove', { id });
      return true;
    },

    clear() {
      if (objects.size) record();
      const ids = [...objects.keys()];
      objects.clear();
      selectedId = null;
      emit('clear', { ids });
      return ids;
    },

    /** Record an undo point before a series of unrecorded edits (e.g. a drag). */
    checkpoint() {
      record();
    },

    get canUndo() {
      return history.length > 0;
    },

    /**
     * Undo the last editing command. Emits 'restore' with the IDs that were
     * added back, removed, or changed, so the scene can rebuild exactly those.
     */
    undo() {
      const snap = history.pop();
      if (!snap) return false;
      const before = new Map([...objects].map(([id, o]) => [id, copy(o)]));
      objects.clear();
      snap.objects.forEach((o) => objects.set(o.instanceId, copy(o)));
      selectedId = snap.selectedId && objects.has(snap.selectedId) ? snap.selectedId : null;
      const added = [...objects.keys()].filter((id) => !before.has(id));
      const removed = [...before.keys()].filter((id) => !objects.has(id));
      const changed = [...objects.keys()].filter((id) => before.has(id) && JSON.stringify(before.get(id)) !== JSON.stringify(objects.get(id)));
      emit('restore', { added, removed, changed });
      return true;
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}

/** Short status text for a list or panel. */
export function stateLabel(state) {
  return { preview: 'Placing', placed: 'Placed', moving: 'Moving', locked: 'Locked' }[state] ?? state;
}
