/**
 * Fix Position state machine (pure, no DOM, no WebXR) so it can be unit tested.
 *
 * States
 *   initializing      session is starting
 *   scanning          no surface under the reticle yet
 *   surface           a floor/table hit-test result is available
 *   preview           object shown, follows the reticle
 *   fixed             object locked to a tracked world position
 *   repositioning     unlocked again, follows the reticle until fixed
 *   tracking-limited  device tracking lost; resumes the previous state
 *   unsupported       runtime lacks a required feature
 *   error             something failed; session should end
 *   ended             session closed
 */

export const STATES = [
  'initializing',
  'scanning',
  'surface',
  'preview',
  'fixed',
  'repositioning',
  'tracking-limited',
  'unsupported',
  'error',
  'ended',
];

export const MESSAGES = {
  initializing: 'Starting AR…',
  scanning: 'Move your phone slowly to scan the floor.',
  surface: 'Surface Detected — Ready to Place.',
  preview: 'Aim to move the object. Press Fix Position when it is where you want it.',
  fixed: 'Position fixed. Walk around it: it stays where you placed it.',
  repositioning: 'Repositioning. Aim at the new spot and press Fix Position.',
  'tracking-limited': 'Tracking limited. Move slowly and point at a well-lit, textured area.',
  unsupported: 'This AR runtime is missing a required feature (hit testing).',
  error: 'AR stopped because of an error.',
  ended: 'AR session ended.',
};

export function initialState() {
  return { state: 'initializing', hasHit: false, resume: null };
}

const ACTIVE = new Set(['scanning', 'surface', 'preview', 'fixed', 'repositioning']);

/** Apply an event; returns the next context (never mutates). */
export function transition(ctx, event) {
  const s = ctx.state;
  const next = { ...ctx };

  if (event.type === 'END') return { ...next, state: 'ended', resume: null };
  if (s === 'ended') return ctx;
  if (event.type === 'ERROR') return { ...next, state: 'error', resume: null };
  if (event.type === 'UNSUPPORTED') return { ...next, state: 'unsupported', resume: null };

  if (event.type === 'TRACKING_LOST') {
    return ACTIVE.has(s) ? { ...next, state: 'tracking-limited', resume: s, hasHit: false } : ctx;
  }
  if (event.type === 'TRACKING_RESTORED') {
    return s === 'tracking-limited' ? { ...next, state: ctx.resume ?? 'scanning', resume: null } : ctx;
  }

  switch (event.type) {
    case 'SESSION_STARTED':
      return s === 'initializing' ? { ...next, state: 'scanning' } : ctx;

    case 'HIT': {
      next.hasHit = Boolean(event.found);
      if (s === 'scanning' && event.found) next.state = 'surface';
      else if (s === 'surface' && !event.found) next.state = 'scanning';
      return next;
    }

    case 'PLACE':
      return s === 'surface' && ctx.hasHit ? { ...next, state: 'preview' } : ctx;

    case 'FIX':
      return (s === 'preview' || s === 'repositioning') && ctx.hasHit ? { ...next, state: 'fixed' } : ctx;

    case 'UNLOCK':
      return s === 'fixed' ? { ...next, state: 'repositioning' } : ctx;

    case 'RESET':
      return ['preview', 'fixed', 'repositioning', 'surface'].includes(s)
        ? { ...next, state: ctx.hasHit ? 'surface' : 'scanning' }
        : ctx;

    default:
      return ctx;
  }
}

/** Which controls are enabled in a state. */
export function allowedActions(ctx) {
  const s = ctx.state;
  return {
    place: s === 'surface' && ctx.hasHit,
    fix: (s === 'preview' || s === 'repositioning') && ctx.hasHit,
    unlock: s === 'fixed',
    reset: ['preview', 'fixed', 'repositioning'].includes(s),
    rotate: ['preview', 'fixed', 'repositioning'].includes(s),
    exit: s !== 'ended',
  };
}

/** Does the object follow the reticle in this state? */
export function followsReticle(state) {
  return state === 'preview' || state === 'repositioning';
}

/** Is the object visible in this state? (tracking-limited keeps whatever it had) */
export function objectVisible(ctx) {
  const s = ctx.state === 'tracking-limited' ? ctx.resume : ctx.state;
  return ['preview', 'fixed', 'repositioning'].includes(s);
}

/**
 * What a single screen tap does when DOM Overlay buttons are not available
 * (the in-scene fallback): place → fix → unlock → fix …
 */
export function tapAction(ctx) {
  switch (ctx.state) {
    case 'surface':
      return 'PLACE';
    case 'preview':
    case 'repositioning':
      return 'FIX';
    case 'fixed':
      return 'UNLOCK';
    default:
      return null;
  }
}
