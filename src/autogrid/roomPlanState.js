/**
 * The room plan: single source of truth shared by AutoGrid and SmartFit.
 *
 * Persistent schema (metres). SmartFit works in centimetres internally, so
 * toSmartFit()/fromSmartFit() convert at the boundary. XR session data
 * (anchors, poses) is never stored here.
 *
 * {
 *   id, name, schemaVersion: 1, measurementSource: 'manual'|'ar-scan'|'ar-approx'|'example'|'import',
 *   updatedAt,
 *   dimensions: { widthMeters, lengthMeters },
 *   grid: { spacingMeters: 0.25|0.5|1, visible: bool, snap: bool },
 *   furniture: [{ id, kind, name, widthMeters, depthMeters, heightMeters, rotationDeg: 0|90,
 *                 xMeters, yMeters, source, productId }],   // x/y = centre on the plan
 *   entryPoint: { xMeters, yMeters }, destinationPoint: { xMeters, yMeters },
 *   preferredClearanceMeters,
 *   scan: null | { edgesMeters: [4], areaSquareMeters, rectangular, outlineCm: [{x,y}] }
 * }
 */

export const SCHEMA_VERSION = 1;
export const ROOM_RANGE = { min: 1.5, max: 15 }; // metres
export const SPACINGS_M = [0.25, 0.5, 1];
export const CLEARANCE_RANGE = { min: 0.45, max: 1.5 };
const SOURCES = ['manual', 'ar-scan', 'ar-approx', 'example', 'import'];

const r1 = (v) => Math.round(v * 10) / 10; // 1 mm in cm units
const r4 = (v) => Math.round(v * 10000) / 10000;

export function newPlanId() {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Default markers 45 cm inside the walls (metres). */
export function defaultMarkersM(w, l) {
  return {
    entryPoint: { xMeters: Math.min(0.6, w / 2), yMeters: Math.max(l - 0.45, l / 2) },
    destinationPoint: { xMeters: Math.max(w - 0.6, w / 2), yMeters: Math.min(0.45, l / 2) },
  };
}

export function createPlan({ name = 'My room', widthMeters = 4, lengthMeters = 3, source = 'manual' } = {}) {
  return {
    id: newPlanId(),
    name,
    schemaVersion: SCHEMA_VERSION,
    measurementSource: source,
    updatedAt: new Date().toISOString(),
    dimensions: { widthMeters, lengthMeters },
    grid: { spacingMeters: 0.5, visible: true, snap: false },
    furniture: [],
    ...defaultMarkersM(widthMeters, lengthMeters),
    preferredClearanceMeters: 0.8,
    scan: null,
  };
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Check and normalise untrusted plan data (from storage or an imported file).
 * Returns { ok, plan, errors }. Never throws.
 */
export function validatePlan(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, plan: null, errors: ['The file does not contain a room plan.'] };
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`Unsupported plan version (${raw.schemaVersion ?? 'missing'}); this version of ARSpace reads version ${SCHEMA_VERSION}.`);
  }
  const w = raw.dimensions?.widthMeters;
  const l = raw.dimensions?.lengthMeters;
  for (const [label, v] of [
    ['width', w],
    ['length', l],
  ]) {
    if (!num(v) || v < ROOM_RANGE.min || v > ROOM_RANGE.max) {
      errors.push(`Room ${label} must be between ${ROOM_RANGE.min} and ${ROOM_RANGE.max} m.`);
    }
  }
  if (raw.furniture !== undefined && !Array.isArray(raw.furniture)) errors.push('Furniture must be a list.');
  if (errors.length) return { ok: false, plan: null, errors };

  const spacing = SPACINGS_M.includes(raw.grid?.spacingMeters) ? raw.grid.spacingMeters : 0.5;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const furniture = [];
  (raw.furniture ?? []).forEach((f, i) => {
    const ok =
      f &&
      typeof f.name === 'string' &&
      [f.widthMeters, f.depthMeters, f.xMeters, f.yMeters].every(num) &&
      f.widthMeters > 0 &&
      f.depthMeters > 0 &&
      f.widthMeters <= 6 &&
      f.depthMeters <= 6;
    if (!ok) {
      errors.push(`Furniture item ${i + 1} is incomplete and was skipped.`);
      return;
    }
    furniture.push({
      id: typeof f.id === 'string' ? f.id : `f${i + 1}`,
      kind: typeof f.kind === 'string' ? f.kind : 'custom',
      name: f.name.slice(0, 80),
      widthMeters: f.widthMeters,
      depthMeters: f.depthMeters,
      heightMeters: num(f.heightMeters) && f.heightMeters > 0 ? f.heightMeters : 0.75,
      rotationDeg: f.rotationDeg === 90 ? 90 : 0,
      xMeters: clamp(f.xMeters, 0, w),
      yMeters: clamp(f.yMeters, 0, l),
      source: ['model', 'designed', 'demo', 'edited'].includes(f.source) ? f.source : 'edited',
      productId: typeof f.productId === 'string' ? f.productId : undefined,
    });
  });
  const marker = (m, fallback) =>
    m && num(m.xMeters) && num(m.yMeters)
      ? { xMeters: clamp(m.xMeters, 0.05, w - 0.05), yMeters: clamp(m.yMeters, 0.05, l - 0.05) }
      : fallback;
  const defaults = defaultMarkersM(w, l);
  const plan = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newPlanId(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'Untitled room',
    schemaVersion: SCHEMA_VERSION,
    measurementSource: SOURCES.includes(raw.measurementSource) ? raw.measurementSource : 'manual',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    dimensions: { widthMeters: w, lengthMeters: l },
    grid: { spacingMeters: spacing, visible: raw.grid?.visible !== false, snap: raw.grid?.snap === true },
    furniture,
    entryPoint: marker(raw.entryPoint, defaults.entryPoint),
    destinationPoint: marker(raw.destinationPoint, defaults.destinationPoint),
    preferredClearanceMeters: num(raw.preferredClearanceMeters)
      ? clamp(raw.preferredClearanceMeters, CLEARANCE_RANGE.min, CLEARANCE_RANGE.max)
      : 0.8,
    scan: raw.scan && Array.isArray(raw.scan.edgesMeters) ? raw.scan : null,
  };
  return { ok: true, plan, errors }; // errors here are non-fatal notes
}

/** Plan (metres) → SmartFit working state (centimetres). */
export function toSmartFit(plan) {
  const cm = (m) => r1(m * 100);
  return {
    room: { width: cm(plan.dimensions.widthMeters), length: cm(plan.dimensions.lengthMeters) },
    clearance: Math.round(plan.preferredClearanceMeters * 100),
    grid: { spacing: cm(plan.grid.spacingMeters), visible: plan.grid.visible, snap: plan.grid.snap },
    markers: {
      entry: { x: cm(plan.entryPoint.xMeters), y: cm(plan.entryPoint.yMeters) },
      dest: { x: cm(plan.destinationPoint.xMeters), y: cm(plan.destinationPoint.yMeters) },
    },
    items: plan.furniture.map((f) => ({
      id: f.id,
      kind: f.kind,
      name: f.name,
      w: cm(f.widthMeters),
      d: cm(f.depthMeters),
      h: cm(f.heightMeters),
      rot: f.rotationDeg,
      x: cm(f.xMeters),
      y: cm(f.yMeters),
      source: f.source,
      productId: f.productId,
    })),
  };
}

/** SmartFit working state (cm) → plan (metres), keeping the plan's identity. */
export function fromSmartFit(state, base) {
  const m = (cm) => r4(cm / 100);
  return {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    dimensions: { widthMeters: m(state.room.width), lengthMeters: m(state.room.length) },
    grid: { spacingMeters: m(state.grid.spacing), visible: state.grid.visible, snap: state.grid.snap },
    preferredClearanceMeters: m(state.clearance),
    entryPoint: { xMeters: m(state.markers.entry.x), yMeters: m(state.markers.entry.y) },
    destinationPoint: { xMeters: m(state.markers.dest.x), yMeters: m(state.markers.dest.y) },
    furniture: state.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      name: i.name,
      widthMeters: m(i.w),
      depthMeters: m(i.d),
      heightMeters: m(i.h),
      rotationDeg: i.rot,
      xMeters: m(i.x),
      yMeters: m(i.y),
      source: i.source,
      productId: i.productId,
    })),
  };
}

/** Change room size, keeping furniture and pulling markers back inside. */
export function resizePlan(plan, widthMeters, lengthMeters, source) {
  const clamp = (v, hi) => Math.min(hi - 0.05, Math.max(0.05, v));
  return {
    ...plan,
    measurementSource: source ?? plan.measurementSource,
    updatedAt: new Date().toISOString(),
    dimensions: { widthMeters, lengthMeters },
    entryPoint: { xMeters: clamp(plan.entryPoint.xMeters, widthMeters), yMeters: clamp(plan.entryPoint.yMeters, lengthMeters) },
    destinationPoint: {
      xMeters: clamp(plan.destinationPoint.xMeters, widthMeters),
      yMeters: clamp(plan.destinationPoint.yMeters, lengthMeters),
    },
  };
}

/**
 * The working plan: the one plan both pages edit. Kept in memory and mirrored
 * to localStorage so it survives navigation and reloads.
 */
export function createPlanStore(storage = safeLocalStorage(), key = 'arspace.workingPlan') {
  let current = null;
  const listeners = new Set();
  return {
    get() {
      if (current) return current;
      try {
        const raw = storage?.getItem(key);
        if (raw) {
          const v = validatePlan(JSON.parse(raw));
          if (v.ok) current = v.plan;
        }
      } catch {
        /* corrupted working copy: ignore it, start fresh */
      }
      return current;
    },
    set(plan) {
      current = plan;
      try {
        storage?.setItem(key, JSON.stringify(plan));
      } catch {
        /* storage full or blocked: the plan still lives in memory this visit */
      }
      listeners.forEach((fn) => fn(plan));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    clear() {
      current = null;
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = '__arspace_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** App-wide working plan store (browser only). */
let shared = null;
export function planStore() {
  if (!shared) shared = createPlanStore();
  return shared;
}
