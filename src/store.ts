import { ref, computed, watch, shallowRef, type Ref } from 'vue';
import type { Project, ComponentSet, Row, Element, Snapshot, DocumentState, Field, Kind } from './core/model';
import {
  clone,
  uid,
  documentState,
  totalCopies,
  stableStringify,
  validateElementPatch,
  validateDataValue,
} from './core/model';
import { createStarter, emptyProject, addComponentSet, element } from './core/starters';
import { preflight, resolveTemplate, resolvedElements } from './core/layout';
import { arrangeElements, groupElements, ungroupElement } from './core/selection';
import { compareDocuments } from './core/revision';
import { encodeProject, decodeProject } from './core/packages';
import { persistProject, savedProjects, chooseFile, saveBytes } from './persistence';

export const sourceUpdates = shallowRef<Record<string, { path: string; data: number[] }>>({});
export const accessRole = ref<'owner' | 'editor' | 'commenter' | 'viewer'>('owner');
export const selection = ref<string[]>([]);
export const project = ref<unknown>(createStarter()) as Ref<Project>;
export const projects = ref([]) as Ref<Project[]>;
export const newProjectDialog = ref(false);
export const settingsTab = ref('general');
export const view = ref<
  'home' | 'design' | 'data' | 'review' | 'test' | 'export' | 'library' | 'rules' | 'settings'
>('home');
export const setId = ref('structures');
export const rowId = ref('STR-01');
export const elementId = ref('title');
export const scope = ref<'card' | 'template' | 'style'>('template');
export const side = ref<'front' | 'back'>('front');
export const locale = ref('en');
export const zoom = ref(160);
export const units = ref<'mm' | 'in'>('mm');
export const snap = ref(true);
export const guides = ref(true);
export const uiScale = ref(Number(localStorage.getItem('tableloom.uiScale')) || 100);
export const toast = ref('');
export const saveState = ref<'saved' | 'saving' | 'error'>('saved');
export const error = ref('');
export const projectPath = ref<string>();
export const filter = ref<'all' | 'issues' | 'changed'>('all');
export const baselineId = ref('');
export const inspectorTab = ref<'element' | 'assets' | 'automation' | 'history'>('element');
export const undoStack = ref([]) as Ref<{ label: string; data: DocumentState }[]>;
export const redoStack = ref([]) as Ref<{ label: string; data: DocumentState }[]>;
export const currentSet = computed(
  () => project.value.sets.find((s) => s.id === setId.value) ?? project.value.sets[0],
);
export const currentRow = computed(
  () => currentSet.value?.rows.find((r) => r.id === rowId.value) ?? currentSet.value?.rows[0],
);
export const currentTemplate = computed(() => {
  const set = currentSet.value;
  if (!set) return;
  try {
    return resolveTemplate(
      project.value,
      side.value === 'back' && set.backTemplateId ? set.backTemplateId : set.templateId,
    );
  } catch {
    return;
  }
});
export const elements = computed(() =>
  currentSet.value && currentRow.value
    ? resolvedElements(project.value, currentSet.value, currentRow.value, side.value === 'back')
    : [],
);
function findElement(list: Element[], id: string): Element | undefined {
  for (const e of list) {
    if (e.id === id) return e;
    const child = findElement(e.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}
export const currentElement = computed(() => findElement(elements.value, elementId.value));
export const issues = shallowRef<import('./core/model').Issue[]>([]);
export const preflightRunning = ref(false);
let preflightJob = 0;
let workerBusy = false;
let nextCheck: { id: number; doc: DocumentState; locale: string } | undefined;
const preflightWorker = new Worker(new URL('./preflight.worker.ts', import.meta.url), { type: 'module' });
const dispatchCheck = (job: { id: number; doc: DocumentState; locale: string }) => {
  workerBusy = true;
  preflightWorker.postMessage(job);
};
preflightWorker.onmessage = (e) => {
  workerBusy = false;
  if (e.data.id === preflightJob) {
    if (e.data.issues) issues.value = e.data.issues;
    else reportError(new Error(e.data.error));
  }
  if (nextCheck) {
    const job = nextCheck;
    nextCheck = undefined;
    dispatchCheck(job);
  } else preflightRunning.value = false;
};
preflightWorker.onerror = (event) => {
  workerBusy = false;
  preflightRunning.value = false;
  reportError(new Error(event.message || 'Preflight worker failed'));
};
let preflightTimer: ReturnType<typeof setTimeout>;
watch(
  [() => project.value.updatedAt, () => project.value.id, locale],
  () => {
    preflightRunning.value = true;
    const id = ++preflightJob;
    clearTimeout(preflightTimer);
    preflightTimer = setTimeout(() => {
      const job = { id, doc: documentState(project.value), locale: locale.value };
      if (workerBusy) nextCheck = job;
      else dispatchCheck(job);
    }, 100);
  },
  { immediate: true },
);
export const baseline = computed(
  () => project.value.snapshots.find((s) => s.id === baselineId.value) ?? project.value.snapshots.at(-1),
);
export const changes = computed(() =>
  baseline.value ? compareDocuments(baseline.value.data, project.value) : [],
);
export const affectedCount = computed(() => {
  if (scope.value === 'card') return 1;
  const tid = currentTemplate.value?.id;
  const style = currentElement.value?.styleId;
  if (scope.value === 'style' && !style) return 0;
  return project.value.sets.reduce((n, set) => {
    const matches = (id: string | undefined): boolean => {
      if (!id) return false;
      const t = project.value.templates.find((t) => t.id === id);
      if (!t) return false;
      if (scope.value === 'template') return t.id === tid || matches(t.parentId);
      return JSON.stringify(resolveTemplate(project.value, id)).includes('"styleId":"' + style + '"');
    };
    return n + (matches(set.templateId) || matches(set.backTemplateId) ? set.rows.length : 0);
  }, 0);
});
let toastTimer: ReturnType<typeof setTimeout>;
export function notify(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 5000);
}
export function reportError(e: unknown) {
  error.value = e instanceof Error ? e.message : String(e);
  notify(error.value);
}
let saveTimer: ReturnType<typeof setTimeout>;
let pending = Promise.resolve();
function enqueueSave(value: Project) {
  saveState.value = 'saving';
  pending = pending
    .catch(() => {})
    .then(() => persistProject(value))
    .then(() => {
      if (project.value.id === value.id && project.value.updatedAt === value.updatedAt)
        saveState.value = 'saved';
      const i = projects.value.findIndex((p) => p.id === value.id);
      if (i < 0) projects.value.unshift(value);
      else projects.value[i] = value;
    })
    .catch((e) => {
      saveState.value = 'error';
      reportError(e);
      throw e;
    });
  pending.catch(() => {});
  return pending;
}
export function scheduleSave() {
  saveState.value = 'saving';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => enqueueSave(clone(project.value)), 500);
}
export async function flushSave() {
  clearTimeout(saveTimer);
  await enqueueSave(clone(project.value));
}
export function commit(label: string, mutation: (p: Project) => void) {
  if (accessRole.value === 'viewer') {
    notify('This shared project is read-only for viewers.');
    return false;
  }
  const before = documentState(project.value);
  try {
    mutation(project.value);
    if (accessRole.value === 'commenter') {
      const after = documentState(project.value);
      if (stableStringify({ ...before, notes: [] }) !== stableStringify({ ...after, notes: [] }))
        throw new Error('Commenters can add and resolve observations. Editing needs an editor role.');
    }
  } catch (e) {
    Object.assign(project.value, before);
    reportError(e);
    return false;
  }
  undoStack.value.push({ label, data: before });
  let bytes = 0;
  const artwork = new Set<string>();
  for (let i = undoStack.value.length - 1; i >= 0; i--) {
    bytes +=
      JSON.stringify(undoStack.value[i]!.data, (_, v) => {
        if (typeof v === 'string' && v.startsWith('data:image/')) {
          if (!artwork.has(v)) {
            artwork.add(v);
            bytes += v.length * 2;
          }
          return '';
        }
        return v;
      }).length * 2;
    if ((bytes > 64_000_000 && i < undoStack.value.length - 1) || undoStack.value.length - i > 40) {
      undoStack.value.splice(0, i + 1);
      break;
    }
  }
  redoStack.value = [];
  project.value.updatedAt = new Date().toISOString();
  scheduleSave();
  return true;
}
export function undo() {
  if (['viewer', 'commenter'].includes(accessRole.value)) return;
  const entry = undoStack.value.pop();
  if (!entry) return;
  redoStack.value.push({ label: entry.label, data: documentState(project.value) });
  Object.assign(project.value, entry.data);
  project.value.updatedAt = new Date().toISOString();
  scheduleSave();
  notify(`Undid ${entry.label.toLowerCase()}`);
}
export function redo() {
  if (['viewer', 'commenter'].includes(accessRole.value)) return;
  const entry = redoStack.value.pop();
  if (!entry) return;
  undoStack.value.push({ label: entry.label, data: documentState(project.value) });
  Object.assign(project.value, entry.data);
  project.value.updatedAt = new Date().toISOString();
  scheduleSave();
}
export async function initialize() {
  window.tableloom?.beforeClose(async () => {
    try {
      await flushSave();
      await window.tableloom?.readyToClose();
    } catch (e) {
      reportError(e);
    }
  });
  window.tableloom?.onSourceChanged(async (data) => {
    const asset = project.value.assets.find((a) => a.sourcePath === data.path);
    if (asset) {
      try {
        const { importAsset } = await import('./core/assets');
        const updated = await importAsset(
          new File([new Uint8Array(data.data)], asset.name, { type: asset.mime }),
        );
        if (updated.hash !== asset.hash)
          commit('Refresh external artwork', (p) => {
            const index = p.assets.findIndex((a) => a.id === asset.id);
            if (index >= 0) p.assets[index] = { ...updated, id: asset.id, sourcePath: data.path };
          });
      } catch (e) {
        reportError(e);
      }
    } else {
      sourceUpdates.value = { ...sourceUpdates.value, [data.path]: data };
      notify('A watched data file changed. Open Data to review the update.');
    }
  });
  try {
    projects.value = await savedProjects();
    if (!projects.value.length) {
      projects.value = [clone(project.value)];
      await persistProject(clone(project.value));
    } else project.value = clone(projects.value[0]!);
    selectSet(project.value.sets[0]?.id ?? '');
  } catch (e) {
    reportError(e);
  }
}
export async function openProject(p: Project) {
  await flushSave();
  project.value = clone(projects.value.find((x) => x.id === p.id && x.updatedAt > p.updatedAt) ?? p);
  projectPath.value = undefined;
  undoStack.value = [];
  redoStack.value = [];
  locale.value = p.baseLocale;
  selectSet(p.sets[0]?.id ?? '');
  view.value = 'design';
}
export async function newProject(name: string, starter?: string) {
  await flushSave();
  const p = starter ? createStarter(starter) : emptyProject(name);
  p.name = name || p.name;
  project.value = p;
  projectPath.value = undefined;
  undoStack.value = [];
  redoStack.value = [];
  selectSet(p.sets[0]?.id ?? '');
  view.value = 'design';
  scheduleSave();
}
export function selectSet(id: string) {
  setId.value = id;
  const set = project.value.sets.find((s) => s.id === id);
  rowId.value = set?.rows[0]?.id ?? '';
  elementId.value = '';
  selection.value = [];
  side.value = 'front';
}
export function selectRow(id: string) {
  rowId.value = id;
}
export function updateField(key: string, value: Row[string]) {
  try {
    if (['id', '__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('This field is reserved');
    validateDataValue(value);
  } catch (e) {
    reportError(e);
    return;
  }
  if (!currentSet.value || !currentRow.value) return;
  const sid = currentSet.value.id,
    rid = currentRow.value.id;
  commit(`Edit ${key}`, (p) => {
    p.sets.find((s) => s.id === sid)!.rows.find((r) => r.id === rid)![key] = value;
  });
}
export function editElement(patch: Partial<Element>) {
  try {
    validateElementPatch(patch);
  } catch (e) {
    reportError(e);
    return;
  }
  if (!currentElement.value || !currentSet.value || !currentRow.value) return;
  const eid = currentElement.value.id,
    sid = currentSet.value.id,
    rid = currentRow.value.id;
  if (scope.value === 'style' && !currentElement.value.styleId) {
    notify('Link a shared style before editing its appearance.');
    return;
  }
  if (currentElement.value.locked && !('locked' in patch)) {
    notify('Unlock this element before editing.');
    return;
  }
  commit(`Edit ${currentElement.value.name}`, (p) => {
    const set = p.sets.find((s) => s.id === sid)!;
    if (scope.value === 'card') {
      set.overrides[rid] ??= {};
      set.overrides[rid]![eid] = { ...set.overrides[rid]![eid], ...patch };
    } else if (scope.value === 'style' && currentElement.value?.styleId) {
      const style = p.styles[currentElement.value.styleId]!;
      for (const key of ['font', 'fontSize', 'color', 'bold', 'italic', 'align', 'lineHeight'] as const)
        if (patch[key] !== undefined) (style as unknown as Record<string, unknown>)[key] = patch[key];
    } else {
      const template = p.templates.find(
        (t) => t.id === (side.value === 'back' ? set.backTemplateId : set.templateId),
      )!;
      const el = findElement(template.elements, eid);
      if (el) Object.assign(el, patch);
      else {
        const root = elements.value.find((e) => !!findElement([e], eid)) ?? currentElement.value!;
        const copy = clone(root);
        const materialize = (e: Element) => {
          delete e.blockId;
          e.children?.forEach(materialize);
        };
        materialize(copy);
        Object.assign(findElement([copy], eid)!, patch);
        template.elements = template.elements.filter((e) => e.id !== copy.id);
        template.elements.push(copy);
      }
    }
    if (patch.binding && !p.tasks.includes('binding')) p.tasks.push('binding');
  });
}
export function resetOverride() {
  if (!currentSet.value || !currentRow.value) return;
  commit('Reset local override', (p) => {
    delete p.sets.find((s) => s.id === currentSet.value!.id)!.overrides[currentRow.value!.id]?.[
      elementId.value
    ];
  });
}
export function addElement(type: Element['type']) {
  if (!currentTemplate.value) return;
  const el = element(type, {
    name: type === 'text' ? 'Text' : type,
    text: type === 'text' ? 'New text' : undefined,
    fill: ['rect', 'ellipse'].includes(type) ? '#d5ddc7' : undefined,
    stroke: type === 'grid' ? '#809075' : undefined,
  });
  commit('Add element', (p) =>
    p.templates.find((t) => t.id === currentTemplate.value!.id)!.elements.push(el),
  );
  elementId.value = el.id;
}
export function deleteElement() {
  if (!currentTemplate.value || !currentElement.value) return;
  if (currentElement.value.locked) {
    notify('Unlock this element before deleting.');
    return;
  }
  const eid = elementId.value;
  if (scope.value === 'card') {
    editElement({ hidden: true });
    return;
  }
  if (scope.value === 'style') {
    notify('Choose component or template scope to delete an element.');
    return;
  }
  commit('Delete element', (p) => {
    const t = p.templates.find((t) => t.id === currentTemplate.value!.id)!;
    const remove = (list: Element[]): Element[] =>
      list
        .filter((e) => e.id !== eid)
        .map((e) => ({ ...e, ...(e.children ? { children: remove(e.children) } : {}) }));
    const local = findElement(t.elements, eid);
    if (local) t.elements = remove(t.elements);
    else {
      const root = clone(elements.value.find((e) => !!findElement([e], eid))!);
      const materialize = (e: Element) => {
        delete e.blockId;
        e.children?.forEach(materialize);
      };
      materialize(root);
      t.elements = t.elements.filter((e) => e.id !== root.id);
      if (root.id === eid) t.elements.push({ ...root, hidden: true });
      else t.elements.push({ ...root, children: remove(root.children ?? []) });
    }
  });
  elementId.value = '';
  selection.value = [];
}
export function addSet(name: string, kind: Kind, width: number, height: number) {
  let id = '';
  commit('Add component set', (p) => {
    id = addComponentSet(p, name, kind, width, height).id;
  });
  selectSet(id);
}
export function addRow() {
  if (!currentSet.value) return;
  let id = '';
  commit('Add component', (p) => {
    const set = p.sets.find((s) => s.id === currentSet.value!.id)!;
    const row: Row = { id: uid('row'), name: 'New component', qty: 1 };
    for (const f of set.fields)
      if (!(f.key in row)) row[f.key] = f.type === 'number' ? 0 : f.type === 'list' ? [] : '';
    set.rows.push(row);
    id = row.id;
  });
  rowId.value = id;
}
export function duplicateRow() {
  if (!currentSet.value || !currentRow.value) return;
  const row = clone(currentRow.value);
  row.id = uid('row');
  row.name = `${row.name} copy`;
  commit('Duplicate component', (p) => {
    const set = p.sets.find((s) => s.id === currentSet.value!.id)!;
    set.rows.push(row);
    if (set.overrides[currentRow.value!.id])
      set.overrides[row.id] = clone(set.overrides[currentRow.value!.id]!);
  });
  rowId.value = row.id;
}
export function addSnapshot(name: string, kind: Snapshot['kind'] = 'snapshot') {
  if (['viewer', 'commenter'].includes(accessRole.value)) {
    notify('Creating versions needs an editor role.');
    return;
  }
  const s: Snapshot = {
    id: uid(kind),
    name,
    kind,
    createdAt: new Date().toISOString(),
    data: documentState(project.value),
  };
  project.value.snapshots.push(s);
  baselineId.value = s.id;
  scheduleSave();
  notify(`${name} saved`);
  return s;
}
export function restoreSnapshot(id: string) {
  const s = project.value.snapshots.find((s) => s.id === id);
  if (!s) return;
  commit(`Restore ${s.name}`, (p) => Object.assign(p, clone(s.data)));
  notify(`Restored ${s.name}`);
}
export async function saveProjectFile() {
  try {
    await flushSave();
    const bytes = encodeProject(project.value);
    if (window.tableloom) {
      const path = await window.tableloom.saveProject(
        [...bytes],
        `${project.value.name}.tableloom`,
        projectPath.value,
      );
      if (path) {
        projectPath.value = path;
        notify('Project saved');
      }
    } else {
      await saveBytes(bytes, `${project.value.name}.tableloom`);
      notify('Project package downloaded');
    }
  } catch (e) {
    reportError(e);
  }
}
export async function importProject() {
  try {
    if (window.tableloom) {
      const result = await window.tableloom.openProject();
      if (!result) return;
      await openProject(decodeProject(new Uint8Array(result.data)));
      projectPath.value = result.path;
    } else {
      const file = await chooseFile('.tableloom,.json');
      if (!file) return;
      await openProject(decodeProject(new Uint8Array(await file.arrayBuffer())));
    }
    scheduleSave();
  } catch (e) {
    reportError(e);
  }
}
watch(uiScale, (v) => {
  document.documentElement.style.fontSize = `${(v / 100) * 14}px`;
  localStorage.setItem('tableloom.uiScale', String(v));
});

watch(elementId, (id) => {
  if (id && !selection.value.includes(id)) selection.value = [id];
});

export function patchSelection(patches: Record<string, Partial<Element>>) {
  if (scope.value === 'style') {
    notify('Choose component or template scope to move elements.');
    return;
  }
  commit('Arrange elements', (p) => {
    const set = p.sets.find((s) => s.id === currentSet.value?.id);
    if (!set) return;
    const template = p.templates.find((t) => t.id === currentTemplate.value?.id)!;
    for (const [id, patch] of Object.entries(patches)) {
      validateElementPatch(patch);
      const resolved = findElement(elements.value, id);
      if (!resolved || resolved.locked) continue;
      if (scope.value === 'card') {
        const overrides = (set.overrides[currentRow.value!.id] ??= {});
        overrides[id] = { ...overrides[id], ...patch };
      } else {
        let el = findElement(template.elements, id);
        if (!el) {
          const parent = elements.value.find((e) => !!findElement([e], id));
          if (!parent) continue;
          const copy = clone(parent);
          const materialize = (e: Element) => {
            delete e.blockId;
            e.children?.forEach(materialize);
          };
          materialize(copy);
          template.elements = template.elements.filter((e) => e.id !== copy.id);
          template.elements.push(copy);
          el = findElement([copy], id);
        }
        if (el) Object.assign(el, patch);
      }
    }
  });
}
export function arrangeSelection(axis: 'x' | 'y', mode: 'start' | 'center' | 'end' | 'distribute') {
  const chosen = elements.value.filter((e) => selection.value.includes(e.id));
  const t = currentTemplate.value;
  if (!t) return;
  patchSelection(
    arrangeElements(
      chosen,
      axis,
      mode,
      chosen.length === 1
        ? { start: t.safe, size: (axis === 'x' ? t.width : t.height) - 2 * t.safe }
        : undefined,
    ),
  );
}
export function groupSelection(ungroup = false) {
  if (scope.value !== 'template') {
    notify('Choose Template scope to change groups.');
    return;
  }
  commit(ungroup ? 'Ungroup elements' : 'Group elements', (p) => {
    const t = p.templates.find((t) => t.id === currentTemplate.value?.id);
    if (!t) return;
    if (ungroup) t.elements = ungroupElement(elements.value, elementId.value);
    else {
      const result = groupElements(elements.value, selection.value);
      t.elements = result.elements;
      elementId.value = result.id;
      selection.value = [result.id];
    }
  });
}
