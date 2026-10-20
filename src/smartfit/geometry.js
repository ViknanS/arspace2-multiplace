/**
 * SmartFit geometry engine.
 *
 * Pure functions, no DOM: the same code runs in the browser and in the Node
 * unit tests (tests/geometry.test.js).
 *
 * Coordinate system (top-down floor plan), all values in centimetres:
 *   x runs along the room WIDTH, left wall x = 0, right wall x = room.width
 *   y runs along the room LENGTH, top wall y = 0, bottom wall y = room.length
 *
 * A piece of furniture is { id, name, w, d, rot, x, y }:
 *   w, d   width and depth of the item as designed (cm)
 *   rot    0 or 90 (degrees, rotation about the vertical axis)
 *   x, y   centre of the item on the plan (cm)
 * Its footprint is an axis-aligned rectangle; rotating by 90° swaps w and d.
 */

const EPS = 0.01; // cm; touching edges do not count as an overlap

// ---------------------------------------------------------------- rectangles

/** Footprint size after rotation. */
export function footprintSize(item) {
  const turned = ((item.rot ?? 0) / 90) % 2 === 1;
  return turned ? { w: item.d, d: item.w } : { w: item.w, d: item.d };
}

/** Axis-aligned footprint rectangle { left, top, right, bottom }. */
export function rectOf(item) {
  const { w, d } = footprintSize(item);
  return {
    left: item.x - w / 2,
    right: item.x + w / 2,
    top: item.y - d / 2,
    bottom: item.y + d / 2,
  };
}

export function rotated(item) {
  return { ...item, rot: ((item.rot ?? 0) + 90) % 180 };
}

export function rectArea(r) {
  return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
}

// ------------------------------------------------------------ boundary check

/**
 * How far an item sticks out past each wall (cm, 0 if it does not).
 * Also reports whether it can fit the room at all in either orientation.
 */
export function boundaryCheck(item, room) {
  const r = rectOf(item);
  const out = {
    left: Math.max(0, -r.left),
    right: Math.max(0, r.right - room.width),
    top: Math.max(0, -r.top),
    bottom: Math.max(0, r.bottom - room.length),
  };
  const { w, d } = footprintSize(item);
  const fitsAsIs = w <= room.width + EPS && d <= room.length + EPS;
  const fitsRotated = d <= room.width + EPS && w <= room.length + EPS;
  const inside = Object.values(out).every((v) => v <= EPS);
  return { inside, out, fitsAsIs, fitsRotated, fitsAtAll: fitsAsIs || fitsRotated };
}

/** Move an item the minimum distance needed to bring it inside the room (if it can fit). */
export function clampIntoRoom(item, room) {
  const { w, d } = footprintSize(item);
  const clampAxis = (c, size, max) => (size > max ? max / 2 : Math.min(Math.max(c, size / 2), max - size / 2));
  return { ...item, x: clampAxis(item.x, w, room.width), y: clampAxis(item.y, d, room.length) };
}

// ------------------------------------------------------------- overlap check

/**
 * Overlap between two items. Returns null if they don't overlap, otherwise
 * { width, depth, area, separation } where `separation` is the shortest
 * distance one item must move (along x or y) to stop overlapping.
 */
export function overlap(a, b) {
  const ra = rectOf(a);
  const rb = rectOf(b);
  const width = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
  const depth = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
  if (width <= EPS || depth <= EPS) return null;
  return { width, depth, area: width * depth, separation: Math.min(width, depth) };
}

/** Every overlapping pair in a layout. */
export function findOverlaps(items) {
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const o = overlap(items[i], items[j]);
      if (o) pairs.push({ a: items[i], b: items[j], ...o });
    }
  }
  return pairs;
}

/** True if `item` is inside the room and overlaps nothing else in `others`. */
export function isValidPlacement(item, others, room) {
  return boundaryCheck(item, room).inside && others.every((o) => o.id === item.id || !overlap(item, o));
}

/**
 * Can rotating this item by 90° remove its problems?
 * Tries (1) rotating about its current centre, then (2) rotating and nudging
 * it back inside the walls by the smallest amount.
 */
export function rotationFix(item, items, room) {
  const others = items.filter((o) => o.id !== item.id);
  const turned = rotated(item);
  if (isValidPlacement(turned, others, room)) return { item: turned, moved: false };
  const nudged = clampIntoRoom(turned, room);
  if (isValidPlacement(nudged, others, room)) {
    return { item: nudged, moved: true, dx: nudged.x - item.x, dy: nudged.y - item.y };
  }
  return null;
}

// --------------------------------------------------------------------- areas

/**
 * Exact area covered by the union of all footprints, clipped to the room
 * (so overlapping pieces are not double counted). Uses coordinate
 * compression: split the room at every rectangle edge and add up the cells
 * that are covered.
 */
export function unionArea(items, room) {
  const rects = items
    .map(rectOf)
    .map((r) => ({
      left: Math.max(0, r.left),
      right: Math.min(room.width, r.right),
      top: Math.max(0, r.top),
      bottom: Math.min(room.length, r.bottom),
    }))
    .filter((r) => r.right > r.left && r.bottom > r.top);
  if (!rects.length) return 0;
  const xs = [...new Set(rects.flatMap((r) => [r.left, r.right]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.top, r.bottom]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j < ys.length - 1; j++) {
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (rects.some((r) => cx > r.left && cx < r.right && cy > r.top && cy < r.bottom)) {
        area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
    }
  }
  return area;
}

/** Shortest distance from a point to a rectangle (0 if the point is inside). */
export function pointRectDistance(px, py, r) {
  const dx = Math.max(r.left - px, 0, px - r.right);
  const dy = Math.max(r.top - py, 0, py - r.bottom);
  return Math.hypot(dx, dy);
}

// --------------------------------------------------------------- walkability

/**
 * Clearance-based walkability analysis.
 *
 * 1. The room is divided into square cells (`cell` cm, default 5 cm).
 * 2. For every cell we compute the distance from its centre to the nearest
 *    obstacle: a wall or a furniture footprint. A person walking through that
 *    cell has a passage roughly 2 × distance wide.
 * 3. A "widest path" search (Dijkstra variant that maximises the smallest
 *    distance along the route) finds the route from entry to destination whose
 *    narrowest point is as wide as possible. That narrowest width is the
 *    bottleneck.
 * 4. Status:
 *      clear       bottleneck ≥ required clearance
 *      restricted  route exists but bottleneck is between `minPassable` and the clearance
 *      blocked     no route at least `minPassable` wide
 * 5. For display, an A* search finds the shortest route through cells that
 *    are wide enough (clearance, or the bottleneck when restricted).
 */
export function analyzeWalkway(room, items, entry, dest, opts = {}) {
  const cell = opts.cell ?? 5;
  const clearance = opts.clearance ?? 80;
  const minPassable = Math.min(opts.minPassable ?? 45, clearance);
  const nx = Math.max(1, Math.ceil(room.width / cell));
  const ny = Math.max(1, Math.ceil(room.length / cell));
  const rects = items.map(rectOf);
  const dist = new Float32Array(nx * ny);

  for (let j = 0; j < ny; j++) {
    const cy = Math.min((j + 0.5) * cell, room.length);
    for (let i = 0; i < nx; i++) {
      const cx = Math.min((i + 0.5) * cell, room.width);
      let d = Math.min(cx, room.width - cx, cy, room.length - cy); // walls
      for (const r of rects) {
        const rd = pointRectDistance(cx, cy, r);
        if (rd < d) d = rd;
        if (d === 0) break;
      }
      dist[j * nx + i] = d;
    }
  }

  const toCell = (p) => [
    Math.min(nx - 1, Math.max(0, Math.floor(p.x / cell))),
    Math.min(ny - 1, Math.max(0, Math.floor(p.y / cell))),
  ];
  const [si, sj] = toCell(entry);
  const [ti, tj] = toCell(dest);
  const start = sj * nx + si;
  const goal = tj * nx + ti;

  const base = { cell, nx, ny, clearance, minPassable, dist };
  const blockedEnd =
    dist[start] === 0 ? 'entry' : dist[goal] === 0 ? 'destination' : null;
  if (blockedEnd) {
    return { ...base, status: 'blocked', bottleneck: 0, path: [], narrowest: null, blockedEnd };
  }

  // --- widest (maximin) path: bottleneck width between entry and destination
  const best = new Float32Array(nx * ny).fill(-1);
  const heap = new MaxHeap();
  best[start] = dist[start];
  heap.push(start, dist[start]);
  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  while (heap.size) {
    const [idx, val] = heap.pop();
    if (val < best[idx]) continue;
    if (idx === goal) break;
    const i = idx % nx;
    const j = (idx - i) / nx;
    for (const [di, dj] of DIRS) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      // no corner-cutting between two diagonal blockers
      if (di && dj && (dist[j * nx + a] === 0 || dist[b * nx + i] === 0)) continue;
      const n = b * nx + a;
      const v = Math.min(val, dist[n]);
      if (v > best[n]) {
        best[n] = v;
        heap.push(n, v);
      }
    }
  }
  const bottleneck = 2 * Math.max(0, best[goal]); // passage width in cm

  let status;
  if (bottleneck >= clearance - EPS) status = 'clear';
  else if (bottleneck >= minPassable - EPS) status = 'restricted';
  else status = 'blocked';

  let path = [];
  let narrowest = null;
  if (status !== 'blocked') {
    const need = Math.min(clearance, bottleneck) / 2 - EPS;
    const route = aStar(nx, ny, cell, dist, start, goal, need, DIRS);
    path = route.smooth;
    // narrowest point along the route (checked on every grid cell it crosses)
    for (const p of route.raw) {
      const w = 2 * dist[p.j * nx + p.i];
      if (!narrowest || w < narrowest.width) narrowest = { x: p.x, y: p.y, width: w };
    }
  }
  return { ...base, status, bottleneck, path, narrowest, blockedEnd: null };
}

function aStar(nx, ny, cell, dist, start, goal, need, DIRS) {
  const g = new Float64Array(nx * ny).fill(Infinity);
  const came = new Int32Array(nx * ny).fill(-1);
  const heap = new MaxHeap(); // store negative f for a min-heap
  const gi = goal % nx;
  const gj = (goal - gi) / nx;
  const h = (idx) => {
    const i = idx % nx;
    const j = (idx - i) / nx;
    return Math.hypot(i - gi, j - gj);
  };
  g[start] = 0;
  heap.push(start, -h(start));
  while (heap.size) {
    const [idx] = heap.pop();
    if (idx === goal) break;
    const i = idx % nx;
    const j = (idx - i) / nx;
    for (const [di, dj] of DIRS) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (dist[n] < need && n !== goal) continue;
      if (di && dj && (dist[j * nx + a] < need || dist[b * nx + i] < need)) continue;
      const cost = g[idx] + (di && dj ? Math.SQRT2 : 1);
      if (cost < g[n]) {
        g[n] = cost;
        came[n] = idx;
        heap.push(n, -(cost + h(n)));
      }
    }
  }
  if (g[goal] === Infinity) return { raw: [], smooth: [] };
  const cells = [];
  for (let c = goal; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => {
    const i = c % nx;
    const j = (c - i) / nx;
    return { i, j, x: (i + 0.5) * cell, y: (j + 0.5) * cell };
  });
  return { raw: pts, smooth: smoothPath(simplifyPath(pts), nx, dist, need) };
}

/**
 * String-pulling: replace grid zig-zags with straight segments wherever every
 * cell along the straight line still has the required clearance. This only
 * changes how the route is drawn; it never passes through a narrower cell.
 */
function smoothPath(pts, nx, dist, need) {
  if (pts.length < 3) return pts;
  const clearLine = (a, b) => {
    const steps = Math.max(Math.abs(b.i - a.i), Math.abs(b.j - a.j)) * 2;
    for (let s = 1; s < steps; s++) {
      const i = Math.round(a.i + ((b.i - a.i) * s) / steps);
      const j = Math.round(a.j + ((b.j - a.j) * s) / steps);
      if (dist[j * nx + i] < need) return false;
    }
    return true;
  };
  const out = [pts[0]];
  let k = 0;
  while (k < pts.length - 1) {
    let far = k + 1;
    for (let m = pts.length - 1; m > k + 1; m--) {
      if (clearLine(pts[k], pts[m])) {
        far = m;
        break;
      }
    }
    out.push(pts[far]);
    k = far;
  }
  return out;
}

/** Drop points that lie on a straight line between their neighbours. */
function simplifyPath(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = out[out.length - 1];
    const b = pts[k];
    const c = pts[k + 1];
    const cross = (b.i - a.i) * (c.j - b.j) - (b.j - a.j) * (c.i - b.i);
    const sameDir = Math.sign(b.i - a.i) === Math.sign(c.i - b.i) && Math.sign(b.j - a.j) === Math.sign(c.j - b.j);
    if (cross !== 0 || !sameDir) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

class MaxHeap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  get size() {
    return this.k.length;
  }
  push(key, val) {
    const { k, v } = this;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] >= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const { k, v } = this;
    const top = [k[0], v[0]];
    const lk = k.pop();
    const lv = v.pop();
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && v[l] > v[m]) m = l;
        if (r < k.length && v[r] > v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
