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
 */

export const SCALE_LIMITS = { min: 0.5, max: 1.5 };
const FOLLOWING = new Set(['preview', 'moving']);

const pad3 = (n) => String(n).padStart(3, '0');
const clampScale = (s) => Math.min(SCALE_LIMITS.max, Math.max(SCALE_LIMITS.min, s));

export function createObjectManager() {
  const objects = new Map(); // instanceId -> object (insertion order = creation order)
  const counters = new Map(); // productId -> last number used
  const listeners = new Set();
  let selectedId = null;

  const emit = (type, detail = {}) => listeners.forEach((fn) => fn({ type, ...detail }));
  const vec = (p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0, z: Number(p?.z) || 0 });

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
    add(productId, { position, rotationY = 0, scale = 1, state = 'preview' } = {}) {
      if (!productId || typeof productId !== 'string') throw new TypeError('productId is required');
      settleFollower();
      const obj = {
        instanceId: nextId(productId),
        productId,
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

    /** Follow-mode update from the reticle (only the follower moves). */
    follow(position) {
      const f = follower();
      if (!f) return null;
      f.position = vec(position);
      return f;
    },

    /** Put the following object down at its current (or given) position. */
    place(id, position) {
      const o = objects.get(id);
      if (!o || !FOLLOWING.has(o.state)) return false;
      if (position) o.position = vec(position);
      o.lastPosition = { ...o.position };
      o.state = 'placed';
      emit('update', { id });
      return true;
    },

    lock(id) {
      const o = objects.get(id);
      if (!o || o.state !== 'placed') return false;
      o.state = 'locked';
      emit('update', { id });
      return true;
    },

    unlock(id) {
      const o = objects.get(id);
      if (!o || o.state !== 'locked') return false;
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
      if (!o || o.state === 'locked') return false;
      o.rotationY = (((o.rotationY + deltaRad) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      emit('update', { id });
      return true;
    },

    setRotation(id, rad) {
      const o = objects.get(id);
      if (!o || o.state === 'locked') return false;
      o.rotationY = ((Number(rad) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      emit('update', { id });
      return true;
    },

    setScale(id, s) {
      const o = objects.get(id);
      if (!o || o.state === 'locked') return false;
      o.scale = clampScale(Number(s) || 1);
      emit('update', { id });
      return true;
    },

    /** Directly set a position (composer drag). Locked objects refuse. */
    setPosition(id, position) {
      const o = objects.get(id);
      if (!o || o.state === 'locked') return false;
      o.position = vec(position);
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
      o.rotationY = 0;
      o.scale = 1;
      emit('update', { id });
      return true;
    },

    remove(id) {
      if (!objects.delete(id)) return false;
      if (selectedId === id) selectedId = null;
      emit('remove', { id });
      return true;
    },

    clear() {
      const ids = [...objects.keys()];
      objects.clear();
      selectedId = null;
      emit('clear', { ids });
      return ids;
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
