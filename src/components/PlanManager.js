import { createPlan } from '../autogrid/roomPlanState.js';
import { StorageError, createPlanLibrary, exportPlanJSON, importPlanJSON } from '../autogrid/planStorage.js';
import { escapeHtml, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const library = createPlanLibrary();

const SOURCE_TEXT = {
  manual: 'Entered manually',
  'ar-scan': 'Measured with AR',
  'ar-approx': 'AR scan, approximated',
  example: 'Example layout',
  import: 'Imported file',
};
export const sourceLabel = (s) => SOURCE_TEXT[s] ?? 'Entered manually';

/** Content comparison that ignores timestamps. */
function sameContent(a, b) {
  const strip = (p) => JSON.stringify({ ...p, updatedAt: null, name: null });
  return strip(a) === strip(b);
}

/** Has the working plan got changes that aren't in the saved library? */
export function isUnsaved(plan) {
  if (!plan) return false;
  const saved = library.get(plan.id);
  if (!saved) return plan.measurementSource !== 'example' && (plan.furniture.length > 0 || plan.measurementSource !== 'manual');
  return !sameContent(saved, plan);
}

/**
 * Save / load / rename / delete / new / export / import for room plans.
 * @param {HTMLElement} root
 * @param {{ getPlan: () => object, applyPlan: (plan) => void, signal: AbortSignal }} opts
 */
export function renderPlanManager(root, { getPlan, applyPlan, signal }) {
  root.innerHTML = `
    <h2 class="sf-card__title">${icon('layers', 18)} Room plans</h2>
    <div class="pm-save">
      <label class="field pm-name">
        <span>Plan name</span>
        <input type="text" maxlength="60" data-pm-name autocomplete="off" />
      </label>
      <button type="button" class="btn btn--primary btn--small" data-pm-save>Save plan</button>
    </div>
    <p class="pm-state small muted" data-pm-state></p>
    <div class="pm-actions">
      <button type="button" class="btn btn--ghost btn--small" data-pm-new>${icon('cube', 16)} New plan</button>
      <button type="button" class="btn btn--ghost btn--small" data-pm-export>${icon('upload', 16)} Export file</button>
      <label class="btn btn--ghost btn--small pm-import">
        ${icon('layers', 16)} Import file
        <input type="file" accept=".json,application/json" data-pm-import class="visually-hidden" />
      </label>
    </div>
    <p class="field-error" data-pm-warn role="alert" hidden></p>
    <h3 class="sf-sub">Saved in this browser</h3>
    <ul class="pm-list" data-pm-list></ul>
    <p class="small muted">Plans are stored on this device only. To move a plan to another phone or computer, export it and import the file there.</p>`;

  const $ = (s) => root.querySelector(s);
  const nameInput = $('[data-pm-name]');
  const listEl = $('[data-pm-list]');
  const warn = $('[data-pm-warn]');

  function refresh() {
    const plan = getPlan();
    if (!plan) return;
    if (document.activeElement !== nameInput) nameInput.value = plan.name;
    const unsaved = isUnsaved(plan);
    $('[data-pm-state]').textContent = library.get(plan.id)
      ? unsaved
        ? 'This plan has changes that are not saved yet.'
        : 'All changes saved.'
      : 'Not saved yet.';
    const st = library.status();
    if (st.unavailable) {
      warn.textContent = 'This browser is blocking local storage, so plans can only be exported as files.';
      warn.hidden = false;
    } else if (st.corrupt) {
      warn.textContent = 'Some saved data was unreadable and has been skipped. It is kept as a backup and will not be overwritten.';
      warn.hidden = false;
    } else warn.hidden = true;

    const plans = library.list();
    listEl.innerHTML = plans.length
      ? plans
          .map(
            (p) => `
          <li class="pm-item${p.id === plan.id ? ' is-current' : ''}">
            <div class="pm-item__text">
              <strong>${escapeHtml(p.name)}</strong>
              <span>${p.dimensions.widthMeters.toFixed(2)} × ${p.dimensions.lengthMeters.toFixed(2)} m · ${p.furniture.length} item${
                p.furniture.length === 1 ? '' : 's'
              } · ${escapeHtml(sourceLabel(p.measurementSource))}</span>
            </div>
            <div class="pm-item__btns">
              <button type="button" class="link-btn" data-load="${p.id}">Load</button>
              <button type="button" class="link-btn" data-rename="${p.id}">Rename</button>
              <button type="button" class="link-btn pm-del" data-delete="${p.id}">Delete</button>
            </div>
          </li>`,
          )
          .join('')
      : `<li class="pm-empty small muted">No saved plans yet.</li>`;
  }

  function guardUnsaved(action) {
    const plan = getPlan();
    if (!isUnsaved(plan)) return true;
    return window.confirm(`“${plan.name}” has unsaved changes. ${action} anyway? Unsaved changes will be lost.`);
  }

  $('[data-pm-save]').addEventListener(
    'click',
    () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.setAttribute('aria-invalid', 'true');
        toast('Enter a name for the plan first.', 'error');
        nameInput.focus();
        return;
      }
      nameInput.removeAttribute('aria-invalid');
      const plan = { ...getPlan(), name };
      try {
        let r = library.save(plan);
        if (r.status === 'name-taken') {
          if (!window.confirm(`A different plan is already saved as “${r.existing.name}”. Replace it with this one?`)) return;
          r = library.save(plan, { overwrite: true });
        }
        applyPlan(r.plan, { keepView: true });
        toast(`Saved “${r.plan.name}”.`, 'success', 2500);
      } catch (err) {
        toast(err instanceof StorageError ? err.message : 'The plan could not be saved.', 'error', 7000);
      }
      refresh();
    },
    { signal },
  );

  $('[data-pm-new]').addEventListener(
    'click',
    () => {
      if (!guardUnsaved('Start a new plan')) return;
      applyPlan(createPlan({ name: 'New room' }));
      toast('New 4 × 3 m plan. Enter your measurements or add furniture.', 'success', 3000);
      refresh();
    },
    { signal },
  );

  $('[data-pm-export]').addEventListener(
    'click',
    () => {
      const plan = getPlan();
      const blob = new Blob([exportPlanJSON(plan)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${plan.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'room-plan'}.arspace.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    { signal },
  );

  $('[data-pm-import]').addEventListener(
    'change',
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 1024 * 1024) {
        toast('That file is too large to be an ARSpace plan.', 'error');
        return;
      }
      try {
        const { plan, notes } = importPlanJSON(await file.text());
        if (!guardUnsaved('Open the imported plan')) return;
        applyPlan({ ...plan, measurementSource: plan.measurementSource === 'example' ? 'import' : plan.measurementSource });
        toast(`Opened “${plan.name}”${notes.length ? ` (${notes.length} item${notes.length === 1 ? '' : 's'} skipped)` : ''}. Save it to keep it here.`, 'success', 5000);
      } catch (err) {
        toast(err instanceof StorageError ? err.message : 'That file could not be read.', 'error', 7000);
      }
      refresh();
    },
    { signal },
  );

  listEl.addEventListener(
    'click',
    (e) => {
      const load = e.target.closest('[data-load]');
      const ren = e.target.closest('[data-rename]');
      const del = e.target.closest('[data-delete]');
      try {
        if (load) {
          const p = library.get(load.dataset.load);
          if (!p) return toast('That plan no longer exists.', 'error');
          if (p.id !== getPlan().id && !guardUnsaved(`Load “${p.name}”`)) return;
          applyPlan(p);
          toast(`Loaded “${p.name}”.`, 'success', 2500);
        } else if (ren) {
          const p = library.get(ren.dataset.rename);
          const name = window.prompt('New name for this plan', p?.name ?? '');
          if (name === null) return;
          const renamed = library.rename(ren.dataset.rename, name);
          if (renamed.id === getPlan().id) applyPlan({ ...getPlan(), name: renamed.name }, { keepView: true });
        } else if (del) {
          const p = library.get(del.dataset.delete);
          if (!p || !window.confirm(`Delete “${p.name}” from this browser? This cannot be undone.`)) return;
          library.remove(p.id);
          toast(`Deleted “${p.name}”.`, 'success', 2500);
        }
      } catch (err) {
        toast(err instanceof StorageError ? err.message : 'Something went wrong with that plan.', 'error', 6000);
      }
      refresh();
    },
    { signal },
  );

  refresh();
  return { refresh };
}
