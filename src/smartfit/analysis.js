/**
 * SmartFit layout analysis and rule-based recommendations.
 *
 * Every message here comes from a measurement made by geometry.js on the room
 * plan the user entered. Nothing is guessed, and no AI model is involved: each
 * rule is a plain if/then check that can be read and explained.
 */
import {
  analyzeWalkway,
  boundaryCheck,
  clampIntoRoom,
  findOverlaps,
  footprintSize,
  isValidPlacement,
  pointRectDistance,
  rectOf,
  rotated,
  rotationFix,
  unionArea,
} from './geometry.js';

export function fmtLen(cm) {
  const v = Math.round(cm);
  return v >= 100 ? `${(v / 100).toFixed(2)} m` : `${v} cm`;
}
const fmtArea = (cm2) => `${(cm2 / 10000).toFixed(2)} m²`;
const roundUp5 = (v) => Math.ceil(v / 5) * 5;

function directionText(dx, dy) {
  const parts = [];
  if (Math.abs(dx) >= 0.5) parts.push(`${fmtLen(Math.abs(dx))} ${dx < 0 ? 'left' : 'right'}`);
  if (Math.abs(dy) >= 0.5) parts.push(`${fmtLen(Math.abs(dy))} ${dy < 0 ? 'up' : 'down'} on the plan`);
  return parts.join(' and ');
}

/**
 * @param room   { width, length } in cm
 * @param items  placed furniture (see geometry.js)
 * @param opts   { entry, dest, clearance, minPassable }
 */
export function analyzeLayout(room, items, opts) {
  const { entry, dest, clearance = 80, minPassable = 45 } = opts;
  const issues = []; // { severity: 'error' | 'warn', ids: [], text }
  const recs = []; // { text, ids }
  const itemState = Object.fromEntries(items.map((i) => [i.id, 'ok']));
  const mark = (id, sev) => {
    if (sev === 'error' || itemState[id] === 'ok') itemState[id] = sev;
  };
  const name = (i) => i.name;
  const suggested = new Set();

  // 1. Boundary check ------------------------------------------------------
  for (const item of items) {
    const b = boundaryCheck(item, room);
    if (b.inside) continue;
    const { w, d } = footprintSize(item);
    if (!b.fitsAtAll) {
      issues.push({
        severity: 'error',
        ids: [item.id],
        text: `The ${name(item)} (${fmtLen(item.w)} × ${fmtLen(item.d)}) is larger than this room in both orientations.`,
      });
      recs.push({
        ids: [item.id],
        text: `Consider a smaller ${name(item).toLowerCase()}: this room can take at most ${fmtLen(
          Math.max(room.width, room.length),
        )} × ${fmtLen(Math.min(room.width, room.length))}.`,
      });
      mark(item.id, 'error');
      suggested.add(item.id);
      continue;
    }
    const sides = Object.entries(b.out)
      .filter(([, v]) => v > 0.5)
      .map(([side, v]) => `${fmtLen(v)} past the ${side} wall`);
    issues.push({
      severity: 'error',
      ids: [item.id],
      text: `The ${name(item)} extends ${sides.join(' and ')}.`,
    });
    mark(item.id, 'error');
    if (!b.fitsAsIs && b.fitsRotated) {
      const fix = rotationFix(item, items, room);
      recs.push({
        ids: [item.id],
        text: fix
          ? `Rotate the ${name(item)} by 90°${fix.moved ? ` and move it ${directionText(fix.dx, fix.dy)}` : ''}: its ${fmtLen(
              w,
            )} side does not fit along this wall, but it fits the other way.`
          : `Rotate the ${name(item)} by 90°; it is ${fmtLen(w)} wide here but fits the room the other way round. Then make space for it.`,
      });
    } else {
      const moved = clampIntoRoom(item, room);
      const ok = isValidPlacement(moved, items, room);
      recs.push({
        ids: [item.id],
        text: `Move the ${name(item)} ${directionText(moved.x - item.x, moved.y - item.y)} to bring it inside the walls${
          ok ? '.' : ', then clear space around it (it would touch other furniture there).'
        }`,
      });
    }
    suggested.add(item.id);
  }

  // 2. Overlaps --------------------------------------------------------------
  const overlaps = findOverlaps(items);
  for (const o of overlaps) {
    issues.push({
      severity: 'error',
      ids: [o.a.id, o.b.id],
      text: `The ${name(o.a)} overlaps the ${name(o.b)} by ${fmtLen(o.separation)} (overlap area ${fmtLen(o.width)} × ${fmtLen(
        o.depth,
      )}).`,
    });
    mark(o.a.id, 'error');
    mark(o.b.id, 'error');
    const fixA = rotationFix(o.a, items, room);
    const fixB = rotationFix(o.b, items, room);
    const fix = fixB ? [o.b, fixB] : fixA ? [o.a, fixA] : null;
    if (fix) {
      const [it, f] = fix;
      recs.push({
        ids: [it.id],
        text: `Rotating the ${name(it)} by 90°${f.moved ? ` and moving it ${directionText(f.dx, f.dy)}` : ''} would remove the overlap with the ${name(
          it === o.a ? o.b : o.a,
        )}.`,
      });
    } else {
      // push the smaller item out along the axis with the smaller overlap
      const [mover, other] = rectArea(o.a) <= rectArea(o.b) ? [o.a, o.b] : [o.b, o.a];
      const along = o.width <= o.depth ? 'x' : 'y';
      const sign = Math.sign(mover[along] - other[along]) || 1;
      const amt = (along === 'x' ? o.width : o.depth) + 0.5;
      recs.push({
        ids: [mover.id],
        text: `Move the ${name(mover)} ${directionText(along === 'x' ? sign * amt : 0, along === 'y' ? sign * amt : 0)} to separate it from the ${name(
          other,
        )}.`,
      });
    }
  }

  // 3. Doorway ---------------------------------------------------------------
  for (const item of items) {
    const dEntry = pointRectDistance(entry.x, entry.y, rectOf(item));
    if (dEntry < clearance) {
      const sev = dEntry === 0 ? 'error' : 'warn';
      issues.push({
        severity: sev,
        ids: [item.id],
        text:
          dEntry === 0
            ? `The ${name(item)} covers the entry point.`
            : `The ${name(item)} is ${fmtLen(dEntry)} from the entry point, less than your ${fmtLen(clearance)} clearance.`,
      });
      mark(item.id, sev);
      recs.push({
        ids: [item.id],
        text: `Move the ${name(item)} at least ${fmtLen(roundUp5(clearance - dEntry))} further away from the doorway.`,
      });
    }
  }

  // 4. Walkway ---------------------------------------------------------------
  const walk = analyzeWalkway(room, items, entry, dest, { clearance, minPassable });
  if (walk.status === 'restricted') {
    const near = obstaclesNear(walk.narrowest, items, room, walk.cell);
    issues.push({
      severity: 'warn',
      ids: near.items.map((i) => i.id),
      text: `The walking route narrows to about ${fmtLen(walk.bottleneck)}${near.label ? ` ${near.label}` : ''}, below your ${fmtLen(
        clearance,
      )} clearance.`,
    });
    near.items.forEach((i) => mark(i.id, 'warn'));
    if (near.items.length) {
      recs.push({
        ids: near.items.map((i) => i.id),
        text: `Move the ${near.items.map(name).join(' or the ')} about ${fmtLen(
          roundUp5(clearance - walk.bottleneck),
        )} to widen the narrowest point to ${fmtLen(clearance)}.`,
      });
    }
  } else if (walk.status === 'blocked') {
    issues.push({
      severity: 'error',
      ids: [],
      text: walk.blockedEnd
        ? `The ${walk.blockedEnd} point is inside a piece of furniture, so no route can start there.`
        : `No walking route at least ${fmtLen(minPassable)} wide connects the entry and the destination.`,
    });
    if (walk.blockedEnd) {
      const pt = walk.blockedEnd === 'entry' ? entry : dest;
      for (const item of items) {
        if (pointRectDistance(pt.x, pt.y, rectOf(item)) === 0) {
          recs.push({ ids: [item.id], text: `Move the ${name(item)} off the ${walk.blockedEnd} point, or drag the ${walk.blockedEnd} marker to free floor.` });
        }
      }
    }
    // what-if checks: does rotating or removing one item open a route?
    for (const item of walk.blockedEnd ? [] : items) {
      const turned = rotated(item);
      if (isValidPlacement(turned, items, room)) {
        const w2 = analyzeWalkway(room, items.map((i) => (i.id === item.id ? turned : i)), entry, dest, { clearance, minPassable });
        if (w2.status === 'clear') {
          mark(item.id, 'warn');
          recs.push({ ids: [item.id], text: `Rotating the ${name(item)} by 90° opens a clear ${fmtLen(clearance)} route.` });
          continue;
        }
      }
      const w3 = analyzeWalkway(room, items.filter((i) => i.id !== item.id), entry, dest, { clearance, minPassable });
      if (w3.status !== 'blocked') {
        mark(item.id, 'warn');
        recs.push({
          ids: [item.id],
          text: `The ${name(item)} is blocking the route. Moving it elsewhere would leave a ${w3.status === 'clear' ? 'clear' : 'narrow'} path.`,
        });
      }
    }
  }

  // 5. Totals ----------------------------------------------------------------
  const roomArea = room.width * room.length;
  const footprint = unionArea(items, room);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warn').length;
  const collisionCount = overlaps.length + items.filter((i) => !boundaryCheck(i, room).inside).length;
  const overall = errors ? 'red' : warnings ? 'amber' : 'green';

  if (!issues.length && items.length) {
    recs.push({
      ids: [],
      text: `This layout works: every piece fits, nothing overlaps, and the route keeps at least ${fmtLen(walk.bottleneck)} of width.`,
    });
  }

  return {
    issues,
    recs: dedupe(recs),
    itemState,
    walk,
    overlaps,
    metrics: {
      roomArea,
      footprint,
      free: roomArea - footprint,
      collisionCount,
      fmt: { roomArea: fmtArea(roomArea), footprint: fmtArea(footprint), free: fmtArea(roomArea - footprint) },
    },
    overall,
  };
}

function rectArea(item) {
  const { w, d } = footprintSize(item);
  return w * d;
}

function dedupe(recs) {
  const seen = new Set();
  return recs.filter((r) => (seen.has(r.text) ? false : seen.add(r.text)));
}

/** Which furniture and walls form the narrowest point of the route. */
function obstaclesNear(pt, items, room, cell) {
  if (!pt) return { items: [], label: '' };
  const half = pt.width / 2 + cell * 1.5;
  const near = items.filter((i) => pointRectDistance(pt.x, pt.y, rectOf(i)) <= half);
  const wall = Math.min(pt.x, room.width - pt.x, pt.y, room.length - pt.y) <= half;
  const names = near.map((i) => `the ${i.name}`);
  if (wall) names.push('the wall');
  return { items: near, label: names.length ? `between ${names.slice(0, 2).join(' and ')}` : '' };
}
