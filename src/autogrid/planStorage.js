/**
 * Saved room plans in localStorage (no backend). Every read is validated so
 * corrupted or hand-edited data can't crash the app.
 */
import { SCHEMA_VERSION, newPlanId, safeLocalStorage, validatePlan } from './roomPlanState.js';

const KEY = 'arspace.plans';

export class StorageError extends Error {}

export function createPlanLibrary(storage = safeLocalStorage(), key = KEY) {
  function readAll() {
    if (!storage) return { plans: [], corrupt: false, unavailable: true };
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      return { plans: [], corrupt: false, unavailable: true };
    }
    if (!raw) return { plans: [], corrupt: false };
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return { plans: [], corrupt: true, raw };
      const plans = [];
      let dropped = 0;
      for (const p of data) {
        const v = validatePlan(p);
        if (v.ok) plans.push(v.plan);
        else dropped++;
      }
      return { plans, corrupt: dropped > 0, dropped };
    } catch {
      return { plans: [], corrupt: true, raw };
    }
  }

  function writeAll(plans) {
    if (!storage) throw new StorageError('This browser is blocking local storage, so plans cannot be saved. Use Export instead.');
    const before = readAll();
    if (before.corrupt && before.raw) {
      // keep unreadable data instead of silently destroying it
      try {
        storage.setItem(`${key}.corrupt-${Date.now()}`, before.raw);
      } catch {
        /* ignore */
      }
    }
    try {
      storage.setItem(key, JSON.stringify(plans));
    } catch (err) {
      if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
        throw new StorageError('Browser storage is full. Delete an old plan or export this one as a file.');
      }
      throw new StorageError('The plan could not be saved in this browser.');
    }
  }

  return {
    status() {
      const r = readAll();
      return { corrupt: r.corrupt, unavailable: Boolean(r.unavailable), dropped: r.dropped ?? 0 };
    },
    list() {
      return readAll().plans.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },
    get(id) {
      return readAll().plans.find((p) => p.id === id) ?? null;
    },
    findByName(name) {
      const n = name.trim().toLowerCase();
      return readAll().plans.find((p) => p.name.trim().toLowerCase() === n) ?? null;
    },
    /**
     * Save a plan. If another plan already has the same name and a different id,
     * returns { status: 'name-taken', existing } unless `overwrite` is true.
     */
    save(plan, { overwrite = false } = {}) {
      const v = validatePlan(plan);
      if (!v.ok) throw new StorageError(v.errors[0]);
      const p = { ...v.plan, updatedAt: new Date().toISOString() };
      const plans = readAll().plans;
      const clash = plans.find((x) => x.id !== p.id && x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
      if (clash && !overwrite) return { status: 'name-taken', existing: clash };
      const kept = plans.filter((x) => x.id !== p.id && x !== clash);
      writeAll([p, ...kept]);
      return { status: 'saved', plan: p, replaced: clash ?? null };
    },
    rename(id, name) {
      const plans = readAll().plans;
      const p = plans.find((x) => x.id === id);
      if (!p) throw new StorageError('That plan no longer exists.');
      const clean = String(name).trim().slice(0, 60);
      if (!clean) throw new StorageError('Enter a name for the plan.');
      if (plans.some((x) => x.id !== id && x.name.trim().toLowerCase() === clean.toLowerCase())) {
        throw new StorageError(`A plan called “${clean}” already exists.`);
      }
      p.name = clean;
      p.updatedAt = new Date().toISOString();
      writeAll(plans);
      return p;
    },
    remove(id) {
      const plans = readAll().plans;
      const next = plans.filter((x) => x.id !== id);
      if (next.length === plans.length) return false;
      writeAll(next);
      return true;
    },
  };
}

/** Plan → pretty JSON text for a downloadable file. */
export function exportPlanJSON(plan) {
  return JSON.stringify({ ...plan, schemaVersion: SCHEMA_VERSION, exportedFrom: 'ARSpace' }, null, 2);
}

/**
 * JSON text → validated plan with a fresh id (so importing never silently
 * replaces an existing saved plan). Throws StorageError with a clear message.
 */
export function importPlanJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new StorageError('This file is not valid JSON, so it cannot be a saved ARSpace plan.');
  }
  const v = validatePlan(data);
  if (!v.ok) throw new StorageError(`This plan can't be opened: ${v.errors[0]}`);
  return { plan: { ...v.plan, id: newPlanId(), measurementSource: v.plan.measurementSource }, notes: v.errors };
}
