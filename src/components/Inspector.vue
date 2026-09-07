<script setup lang="ts">
import { ref, shallowRef, computed } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import {
  project,
  currentSet,
  currentRow,
  currentTemplate,
  currentElement,
  elements,
  elementId,
  scope,
  inspectorTab,
  units,
  editElement,
  resetOverride,
  updateField,
  commit,
  notify,
  reportError,
  addSnapshot,
  restoreSnapshot,
  baselineId,
  deleteElement,
} from '../store';
import { elementContent } from '../core/layout';
import { matchesRule, evaluateFormula } from '../core/rules';
import { generateRows } from '../core/generators';
import { uid, clone } from '../core/model';
import type { Element, Rule, Scalar } from '../core/model';
import { importAsset } from '../core/assets';
const comment = ref('');
const commentTarget = computed(
  () => `${currentSet.value?.id}/${currentRow.value?.id}/${currentElement.value?.id}`,
);
function addComment() {
  if (!comment.value.trim()) return;
  if (
    commit('Comment on element', (p) =>
      p.notes.push({
        id: uid('note'),
        target: commentTarget.value,
        session: 'Design review',
        category: 'layout',
        text: comment.value,
        resolved: false,
        createdAt: new Date().toISOString(),
      }),
    )
  )
    comment.value = '';
}
const content = computed(() =>
  currentElement.value && currentRow.value
    ? elementContent(currentElement.value, currentRow.value, project.value)
    : '',
);
const source = computed(() =>
  currentElement.value?.formula ? 'formula' : currentElement.value?.binding ? 'field' : 'fixed',
);
const local = computed(() => !!currentSet.value?.overrides[currentRow.value?.id ?? '']?.[elementId.value]);
const assetSearch = ref('');
const filteredAssets = computed(() =>
  project.value.assets.filter((a) => a.name.toLowerCase().includes(assetSearch.value.toLowerCase())),
);
const versionName = ref('');
const restore = ref<string>();
const dims = ref('suit: Sun, Moon, Star\nrank: 1, 2, 3');
const exclusion = ref('[]');
const generatorPreview = shallowRef<ReturnType<typeof generateRows>>();
const generatorError = ref('');
const factor = computed(() => (units.value === 'mm' ? 1 : 1 / 25.4));
function numeric(key: keyof Element, event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  editElement({ [key]: ['x', 'y', 'w', 'h', 'gap', 'padding'].includes(key) ? value / factor.value : value });
}
function changeSource(value: string) {
  editElement(
    value === 'field'
      ? { binding: currentSet.value?.fields[0]?.key, formula: undefined }
      : value === 'formula'
        ? { formula: 'salt + reed + clay', binding: undefined }
        : { text: content.value, binding: undefined, formula: undefined },
  );
}
function changeContent(value: string) {
  if (currentElement.value?.binding) updateField(currentElement.value.binding, value);
  else editElement({ text: value });
}
function updateRule(patch: Partial<Rule>) {
  editElement({
    visibleWhen: { mode: 'all', conditions: [], ...currentElement.value?.visibleWhen, ...patch },
  });
}
function ruleField(index: number, key: string, value: unknown) {
  const rule = clone<Rule>(currentElement.value?.visibleWhen ?? { mode: 'all', conditions: [] });
  Object.assign(rule.conditions[index]!, { [key]: value });
  editElement({ visibleWhen: rule });
}
async function upload(event: Event, relink?: string) {
  const files = (event.target as HTMLInputElement).files;
  if (!files) return;
  try {
    for (const file of files) {
      const asset = await importAsset(file);
      const existing = project.value.assets.find((a) => a.hash === asset.hash);
      if (existing && !relink) {
        notify(`${file.name} is already in the library`);
        continue;
      }
      commit(relink ? 'Relink artwork' : 'Import artwork', (p) => {
        if (relink) {
          const i = p.assets.findIndex((a) => a.id === relink);
          p.assets[i] = { ...asset, id: relink };
        } else p.assets.push(asset);
      });
    }
  } catch (e) {
    reportError(e);
  }
}
async function watchArtwork() {
  if (!window.tableloom) {
    notify('Open the desktop app to watch externally edited artwork.');
    return;
  }
  try {
    const file = await window.tableloom.watchAsset();
    if (!file) return;
    const name = file.path.split(/[\\/]/).at(-1)!;
    const ext = name.split('.').at(-1)!.toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
    const asset = await importAsset(new File([new Uint8Array(file.data)], name, { type: mime }));
    asset.sourcePath = file.path;
    const existing = project.value.assets.find((a) => a.hash === asset.hash);
    commit('Watch artwork', (p) => {
      if (existing) p.assets.find((a) => a.id === existing.id)!.sourcePath = file.path;
      else p.assets.push(asset);
    });
    notify('Artwork linked. External saves update this project with undo support.');
  } catch (e) {
    reportError(e);
  }
}
function useAsset(id: string) {
  if (!currentElement.value || currentElement.value.type !== 'image') {
    notify('Select an image element on the canvas first.');
    return;
  }
  if (currentElement.value.binding) updateField(currentElement.value.binding, id);
  else editElement({ imageId: id });
}
function generate(preview = true) {
  try {
    const dimensions = dims.value
      .split('\n')
      .filter((s) => s.trim())
      .map((line) => {
        const colon = line.indexOf(':');
        if (colon < 0) throw new Error('Use field: value, value for each dimension.');
        return {
          field: line.slice(0, colon).trim(),
          values: line
            .slice(colon + 1)
            .split(',')
            .map((v) => {
              const t = v.trim();
              return t !== '' && Number.isFinite(Number(t)) ? Number(t) : t;
            }),
        };
      });
    const exclusions = JSON.parse(exclusion.value);
    if (!Array.isArray(exclusions)) throw new Error('Exclusions must be an array.');
    const g = { dimensions, exclusions, seed: 42 };
    const rows = generateRows(g, currentSet.value?.rows);
    generatorPreview.value = rows;
    generatorError.value = '';
    if (!preview && currentSet.value) {
      commit('Generate components', (p) => {
        const set = p.sets.find((s) => s.id === currentSet.value!.id)!;
        set.generator = g;
        set.rows = rows;
        for (const d of dimensions)
          if (!set.fields.some((f) => f.key === d.field))
            set.fields.push({ key: d.field, type: typeof d.values[0] === 'number' ? 'number' : 'text' });
      });
      notify(`Generated ${rows.length} components`);
    }
  } catch (e) {
    generatorError.value = (e as Error).message;
  }
}
function reorder(id: string, delta: number) {
  if (!currentTemplate.value) return;
  commit('Reorder layer', (p) => {
    const list = p.templates.find((t) => t.id === currentTemplate.value!.id)!.elements;
    const index = list.findIndex((e) => e.id === id);
    if (index + delta < 0 || index + delta >= list.length) return;
    [list[index], list[index + delta]] = [list[index + delta]!, list[index]!];
  });
}
function duplicate() {
  if (!currentElement.value || !currentTemplate.value) return;
  const el = clone(currentElement.value);
  el.id = uid('el');
  el.name += ' copy';
  el.x += 2;
  el.y += 2;
  commit('Duplicate element', (p) =>
    p.templates.find((t) => t.id === currentTemplate.value!.id)!.elements.push(el),
  );
  elementId.value = el.id;
}
function snapshot(kind: 'snapshot' | 'experiment') {
  addSnapshot(
    versionName.value.trim() ||
      `${kind === 'experiment' ? 'Experiment' : 'Version'} ${project.value.snapshots.length + 1}`,
    kind,
  );
  versionName.value = '';
}
const layerList = computed(() => {
  const result: (Element & { depth: number })[] = [];
  const walk = (items: Element[], depth = 0) => {
    for (const e of [...items].reverse()) {
      result.push({ ...e, depth });
      if (depth < 12) walk(e.children ?? [], depth + 1);
    }
  };
  walk(elements.value);
  return result;
});
</script>
<template>
  <aside class="inspector">
    <nav class="inspector-tabs" aria-label="Inspector panels">
      <button
        v-for="tab in [
          { id: 'element', icon: 'SlidersHorizontal', label: 'Layout' },
          { id: 'assets', icon: 'Image', label: 'Assets' },
          { id: 'automation', icon: 'Workflow', label: 'Automate' },
          { id: 'history', icon: 'GitBranch', label: 'Versions' },
        ]"
        :key="tab.id"
        :class="{ active: inspectorTab === tab.id }"
        @click="inspectorTab = tab.id as typeof inspectorTab"
      >
        <Icon :name="tab.icon" :size="15" /><span>{{ tab.label }}</span>
      </button>
    </nav>
    <div class="inspector-scroll">
      <template v-if="inspectorTab === 'element'"
        ><template v-if="currentElement"
          ><div class="inspector-title">
            <div class="element-type">
              <Icon
                :name="
                  currentElement.type === 'text'
                    ? 'Type'
                    : currentElement.type === 'image'
                      ? 'Image'
                      : 'Square'
                "
                :size="19"
              />
            </div>
            <div>
              <input
                class="title-input"
                :value="currentElement.name"
                aria-label="Element name"
                @change="editElement({ name: ($event.target as HTMLInputElement).value })"
              /><small>{{ currentElement.type }} · {{ currentTemplate?.name }}</small
              ><small v-if="currentTemplate?.parentId"
                >Linked variant ·
                {{ project.templates.find((t) => t.id === currentTemplate?.parentId)?.name }}</small
              >
            </div>
            <button class="icon-button small" title="Duplicate element" @click="duplicate">
              <Icon name="Copy" :size="14" />
            </button>
          </div>
          <section
            v-if="['text', 'image', 'symbol', 'repeater'].includes(currentElement.type)"
            class="inspector-section"
          >
            <div class="section-label">CONTENT<small>Where does this come from?</small></div>
            <div class="segmented full">
              <button
                v-for="s in ['fixed', 'field', 'formula']"
                :key="s"
                :class="{ active: source === s }"
                @click="changeSource(s)"
              >
                {{ s === 'fixed' ? 'Fixed' : s === 'field' ? 'Field' : 'Formula' }}
              </button>
            </div>
            <label v-if="source === 'field'" class="binding-select"
              ><Icon name="Link" :size="14" /><select
                :value="currentElement.binding"
                aria-label="Bound field"
                @change="editElement({ binding: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="f in currentSet?.fields" :key="f.key" :value="f.key">
                  {{ f.key }} · {{ f.type }}
                </option>
              </select></label
            ><template v-if="source === 'formula'"
              ><label
                >Expression<input
                  class="mono"
                  :value="currentElement.formula"
                  @change="editElement({ formula: ($event.target as HTMLInputElement).value })"
              /></label>
              <p class="muted">
                {{
                  currentRow
                    ? evaluateFormula(currentElement.formula ?? '', currentRow, project).error ||
                      'Result: ' + content
                    : ''
                }}
              </p>
              <p class="muted" v-if="currentRow">
                Inputs:
                {{
                  evaluateFormula(currentElement.formula ?? '', currentRow, project)
                    .dependencies.map(
                      (d) => d + ' = ' + String(currentRow?.[d] ?? project.variables[d] ?? 'missing'),
                    )
                    .join(', ')
                }}
              </p></template
            ><template v-if="currentElement.type === 'text' && source !== 'formula'"
              ><label
                >{{ source === 'field' ? 'Value on this component' : 'Text'
                }}<textarea
                  :value="
                    source === 'field'
                      ? String(currentRow?.[currentElement.binding!] ?? '')
                      : currentElement.text
                  "
                  rows="4"
                  @change="changeContent(($event.target as HTMLTextAreaElement).value)"
                ></textarea></label
              ><small class="muted">**bold**, *italic*, [icon:salt], [term:harvest]</small></template
            >
            <div v-else class="value-preview">
              <small>Sample · {{ currentRow?.name }}</small
              ><span>{{ content || 'No value' }}</span>
            </div>
          </section>
          <section class="inspector-section">
            <div class="section-label">APPEARANCE</div>
            <label
              >Shared style<select
                :value="currentElement.styleId ?? ''"
                @change="editElement({ styleId: ($event.target as HTMLSelectElement).value || undefined })"
              >
                <option value="">Local appearance</option>
                <option v-for="(_, id) in project.styles" :key="id" :value="id">{{ id }}</option>
              </select></label
            ><template v-if="currentElement.type === 'text'"
              ><label
                >Font<select
                  :value="currentElement.font"
                  @change="editElement({ font: ($event.target as HTMLSelectElement).value })"
                >
                  <option>Source Sans 3</option>
                  <option>Alegreya</option>
                  <option>Stardos Stencil</option>
                </select></label
              >
              <div class="form-grid">
                <label
                  >Size · pt<input
                    :value="currentElement.fontSize"
                    type="number"
                    min="1"
                    max="300"
                    step=".5"
                    @change="numeric('fontSize', $event)" /></label
                ><label
                  >Line height<input
                    :value="currentElement.lineHeight"
                    type="number"
                    min=".5"
                    max="4"
                    step=".05"
                    @change="numeric('lineHeight', $event)"
                /></label>
              </div>
              <label class="inline"
                ><input
                  type="checkbox"
                  :checked="currentElement.shrinkToFit"
                  @change="editElement({ shrinkToFit: ($event.target as HTMLInputElement).checked })"
                />Fit text within its box</label
              >
              <label v-if="currentElement.shrinkToFit"
                >Minimum font size<input
                  type="number"
                  :value="currentElement.minFontSize ?? 7"
                  min="1"
                  max="300"
                  step=".5"
                  @change="numeric('minFontSize', $event)"
              /></label>
              <label
                >Text case<select
                  :value="currentElement.textCase ?? 'original'"
                  @change="
                    editElement({
                      textCase: ($event.target as HTMLSelectElement).value as 'original' | 'upper' | 'lower',
                    })
                  "
                >
                  <option value="original">As written</option>
                  <option value="upper">UPPERCASE</option>
                  <option value="lower">lowercase</option>
                </select></label
              >
              <div class="inline">
                <button
                  :class="['icon-button bordered', { active: currentElement.bold }]"
                  title="Bold"
                  @click="editElement({ bold: !currentElement.bold })"
                >
                  <Icon name="Bold" /></button
                ><button
                  :class="['icon-button bordered', { active: currentElement.italic }]"
                  title="Italic"
                  @click="editElement({ italic: !currentElement.italic })"
                >
                  <Icon name="Italic" /></button
                ><input
                  type="color"
                  :value="currentElement.color"
                  aria-label="Text color"
                  @input="editElement({ color: ($event.target as HTMLInputElement).value })"
                /><select
                  :value="currentElement.align"
                  aria-label="Text alignment"
                  @change="
                    editElement({ align: ($event.target as HTMLSelectElement).value as Element['align'] })
                  "
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div class="form-grid">
                <label
                  >Inline icon scale<input
                    :value="currentElement.iconScale ?? 1"
                    type="number"
                    min=".25"
                    max="4"
                    step=".1"
                    @change="numeric('iconScale', $event)" /></label
                ><label
                  >Icon baseline · mm<input
                    :value="currentElement.iconBaseline ?? 0"
                    type="number"
                    step=".1"
                    @change="numeric('iconBaseline', $event)"
                /></label>
              </div>
              <label class="checkbox-label"
                ><input
                  type="checkbox"
                  :checked="currentElement.autoHeight"
                  @change="editElement({ autoHeight: ($event.target as HTMLInputElement).checked })"
                />Height follows content</label
              ></template
            ><template v-else-if="currentElement.type === 'image'"
              ><button class="button full" @click="inspectorTab = 'assets'">
                <Icon name="Image" />Choose artwork</button
              ><label
                >Fit<select
                  :value="currentElement.fit ?? 'cover'"
                  @change="
                    editElement({ fit: ($event.target as HTMLSelectElement).value as 'cover' | 'contain' })
                  "
                >
                  <option value="cover">Fill & crop</option>
                  <option value="contain">Fit entire image</option>
                </select></label
              >
              <div class="form-grid">
                <label
                  >Focal X<input
                    :value="currentElement.focalX ?? 0.5"
                    type="number"
                    min="0"
                    max="1"
                    step=".1"
                    @change="numeric('focalX', $event)" /></label
                ><label
                  >Focal Y<input
                    :value="currentElement.focalY ?? 0.5"
                    type="number"
                    min="0"
                    max="1"
                    step=".1"
                    @change="numeric('focalY', $event)"
                /></label></div></template
            ><template v-else
              ><div class="form-grid">
                <label
                  >Fill<input
                    type="color"
                    :value="currentElement.fill ?? '#d5ddc7'"
                    @input="editElement({ fill: ($event.target as HTMLInputElement).value })" /></label
                ><label
                  >Stroke<input
                    type="color"
                    :value="currentElement.stroke ?? '#7b896d'"
                    @input="editElement({ stroke: ($event.target as HTMLInputElement).value })"
                /></label>
              </div>
              <label v-if="currentElement.type === 'path'"
                >SVG path<textarea
                  :value="currentElement.path"
                  @change="editElement({ path: ($event.target as HTMLTextAreaElement).value })"
                ></textarea></label
              ><label v-if="currentElement.type === 'symbol'"
                >Symbol<select
                  :value="currentElement.symbolId"
                  @change="editElement({ symbolId: ($event.target as HTMLSelectElement).value })"
                >
                  <option v-for="s in project.symbols" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select></label
              >
              <div v-if="currentElement.type === 'grid'" class="form-grid">
                <label
                  >Columns<input
                    :value="currentElement.columns ?? 5"
                    type="number"
                    min="1"
                    max="100"
                    @change="numeric('columns', $event)" /></label
                ><label
                  >Rows<input
                    :value="currentElement.rows ?? 5"
                    type="number"
                    min="1"
                    max="100"
                    @change="numeric('rows', $event)" /></label
                ><label
                  >Cell shape<select
                    :value="currentElement.cellShape ?? 'square'"
                    @change="
                      editElement({
                        cellShape: ($event.target as HTMLSelectElement).value as 'square' | 'hex',
                      })
                    "
                  >
                    <option>square</option>
                    <option>hex</option>
                  </select></label
                >
              </div></template
            ><label
              >Opacity<input
                :value="currentElement.opacity ?? 1"
                type="range"
                min="0"
                max="1"
                step=".05"
                @change="numeric('opacity', $event)"
            /></label>
            <div v-if="local" class="override-notice">
              <Icon name="GitBranch" :size="14" /><span>Local override</span
              ><button class="text-button" @click="resetOverride">Reset</button>
            </div>
          </section>
          <section class="inspector-section">
            <div class="section-label">
              POSITION & SIZE<small>{{ units }} · from trim edge</small>
            </div>
            <div class="form-grid">
              <label v-for="key in ['x', 'y', 'w', 'h'] as const" :key="key"
                >{{ key.toUpperCase()
                }}<input
                  :value="(currentElement[key] * factor).toFixed(2)"
                  type="number"
                  step=".5"
                  :disabled="scope === 'style'"
                  @change="numeric(key, $event)" /></label
              ><label
                >Rotation · °<input
                  :value="currentElement.rotation ?? 0"
                  type="number"
                  step="1"
                  @change="numeric('rotation', $event)" /></label
              ><label
                >Corner · mm<input
                  :value="currentElement.radius ?? 0"
                  type="number"
                  min="0"
                  step=".5"
                  @change="numeric('radius', $event)"
              /></label>
            </div>
            <label class="checkbox-label"
              ><input
                :checked="currentElement.keepAspect"
                type="checkbox"
                @change="editElement({ keepAspect: ($event.target as HTMLInputElement).checked })"
              />Lock aspect ratio</label
            >
            <div v-if="currentElement.autoHeight" class="form-grid">
              <label
                >Minimum height<input
                  :value="currentElement.minHeight ?? 1"
                  type="number"
                  min="1"
                  @change="numeric('minHeight', $event)" /></label
              ><label
                >Maximum height<input
                  :value="currentElement.maxHeight ?? currentElement.h"
                  type="number"
                  min="1"
                  @change="numeric('maxHeight', $event)"
              /></label>
            </div>
            <label
              >Production layer<select
                :value="currentElement.layer ?? 'art'"
                @change="
                  editElement({ layer: ($event.target as HTMLSelectElement).value as Element['layer'] })
                "
              >
                <option>art</option>
                <option>cut</option>
                <option>fold</option>
                <option>finish</option>
              </select></label
            >
          </section>
          <section class="inspector-section">
            <div class="section-label">
              VISIBILITY<button
                class="text-button"
                @click="
                  updateRule({
                    conditions: [
                      ...(currentElement.visibleWhen?.conditions ?? []),
                      { field: currentSet?.fields[0]?.key ?? 'name', op: 'notEmpty', value: '' },
                    ],
                  })
                "
              >
                + Condition
              </button>
            </div>
            <template v-if="currentElement.visibleWhen?.conditions.length"
              ><label
                >Match<select
                  :value="currentElement.visibleWhen.mode"
                  @change="updateRule({ mode: ($event.target as HTMLSelectElement).value as 'all' | 'any' })"
                >
                  <option value="all">All conditions</option>
                  <option value="any">Any condition</option>
                </select></label
              >
              <div
                v-for="(condition, index) in currentElement.visibleWhen.conditions"
                :key="index"
                class="condition-row"
              >
                <select
                  :value="condition.field"
                  aria-label="Condition field"
                  @change="ruleField(index, 'field', ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="f in currentSet?.fields" :key="f.key">{{ f.key }}</option></select
                ><select
                  :value="condition.op"
                  aria-label="Condition operator"
                  @change="ruleField(index, 'op', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="eq">equals</option>
                  <option value="neq">does not equal</option>
                  <option value="gt">greater than</option>
                  <option value="gte">at least</option>
                  <option value="lt">less than</option>
                  <option value="contains">contains</option>
                  <option value="empty">is empty</option>
                  <option value="notEmpty">has a value</option></select
                ><input
                  :value="condition.value"
                  aria-label="Condition value"
                  @change="ruleField(index, 'value', ($event.target as HTMLInputElement).value)"
                /><button
                  class="icon-button small"
                  title="Remove condition"
                  @click="
                    updateRule({
                      conditions: currentElement.visibleWhen!.conditions.filter((_, i) => i !== index),
                    })
                  "
                >
                  <Icon name="X" :size="13" />
                </button>
              </div>
              <span
                class="tag"
                :class="currentRow && matchesRule(currentElement.visibleWhen, currentRow) ? 'green' : 'amber'"
                >{{
                  currentRow && matchesRule(currentElement.visibleWhen, currentRow) ? 'Visible' : 'Hidden'
                }}
                on this component</span
              ></template
            >
            <p v-else class="muted">
              Always visible. Conditions can hide an element using the component’s data.
            </p>
          </section>
          <section class="inspector-section">
            <div class="section-label">CONDITIONAL APPEARANCE</div>
            <p class="muted">
              Use the same conditions above to change color while keeping the element visible.
            </p>
            <div class="form-grid">
              <label
                >Text color<input
                  type="color"
                  :value="currentElement.styleWhen?.color ?? '#47714b'"
                  @change="
                    editElement({
                      styleWhen: {
                        mode: currentElement.visibleWhen?.mode ?? 'all',
                        conditions: clone(currentElement.visibleWhen?.conditions ?? []),
                        color: ($event.target as HTMLInputElement).value,
                      },
                      visibleWhen: undefined,
                    })
                  " /></label
              ><label
                >Fill color<input
                  type="color"
                  :value="currentElement.styleWhen?.fill ?? '#d5ddc7'"
                  @change="
                    editElement({
                      styleWhen: {
                        mode: currentElement.visibleWhen?.mode ?? 'all',
                        conditions: clone(currentElement.visibleWhen?.conditions ?? []),
                        fill: ($event.target as HTMLInputElement).value,
                      },
                      visibleWhen: undefined,
                    })
                  "
              /></label>
            </div>
            <p v-if="currentElement.styleWhen" class="muted">
              {{
                currentElement.styleWhen.conditions
                  .map((c) => c.field + ' ' + c.op + ' ' + c.value)
                  .join(', ') || 'Always applied'
              }}
            </p>
            <button
              v-if="currentElement.styleWhen"
              class="text-button"
              @click="editElement({ styleWhen: undefined })"
            >
              Remove style rule
            </button>
          </section></template
        >
        <div v-else class="inspector-empty">
          <Icon name="MousePointer2" :size="28" />
          <h3>Select something to shape it.</h3>
          <p>Choose an element on the canvas or in the layers below.</p>
          <template v-if="currentTemplate"
            ><div class="form-grid">
              <label
                >Width · mm<input
                  :value="currentTemplate.width"
                  type="number"
                  @change="
                    commit('Resize template', (p) => {
                      p.templates.find((t) => t.id === currentTemplate!.id)!.width = Math.max(
                        1,
                        Number(($event.target as HTMLInputElement).value),
                      );
                    })
                  " /></label
              ><label
                >Height · mm<input
                  :value="currentTemplate.height"
                  type="number"
                  @change="
                    commit('Resize template', (p) => {
                      p.templates.find((t) => t.id === currentTemplate!.id)!.height = Math.max(
                        1,
                        Number(($event.target as HTMLInputElement).value),
                      );
                    })
                  "
              /></label></div
          ></template>
        </div>
        <section v-if="currentElement" class="inspector-section">
          <h3>Element comments</h3>
          <p
            v-for="n in project.notes.filter((n) => n.target === commentTarget)"
            :key="n.id"
            class="info-box"
          >
            {{ n.text }}
          </p>
          <textarea
            v-model="comment"
            rows="2"
            placeholder="Comment on this element"
            aria-label="Element comment"
          ></textarea
          ><button class="button full" :disabled="!comment.trim()" @click="addComment">Add comment</button>
        </section>
        <section class="inspector-section">
          <div class="section-label">
            LAYERS<small>{{ elements.length }}</small>
          </div>
          <div v-for="e in layerList" :key="e.id" :class="['layer-row', { active: elementId === e.id }]">
            <button
              class="layer-name"
              :style="{ paddingLeft: e.depth * 12 + 'px' }"
              @click="elementId = e.id"
            >
              <Icon
                :name="
                  e.type === 'text'
                    ? 'Type'
                    : e.type === 'image'
                      ? 'Image'
                      : e.type === 'group'
                        ? 'Layers'
                        : 'Square'
                "
                :size="13"
              />{{ e.name }}</button
            ><button class="icon-button tiny" title="Move layer up" @click="reorder(e.id, 1)">
              <Icon name="ChevronLeft" :size="12" style="transform: rotate(90deg)" /></button
            ><button
              class="icon-button tiny"
              :title="e.hidden ? 'Show layer' : 'Hide layer'"
              @click="
                elementId = e.id;
                editElement({ hidden: !e.hidden });
              "
            >
              <Icon :name="e.hidden ? 'EyeOff' : 'Eye'" :size="13" /></button
            ><button
              class="icon-button tiny"
              :title="e.locked ? 'Unlock layer' : 'Lock layer'"
              @click="
                elementId = e.id;
                editElement({ locked: !e.locked });
              "
            >
              <Icon :name="e.locked ? 'Lock' : 'Unlock'" :size="12" />
            </button>
          </div>
          <button v-if="currentElement" class="text-button danger" @click="deleteElement">
            <Icon name="Trash2" :size="13" />Delete selected element
          </button>
        </section></template
      ><template v-else-if="inspectorTab === 'assets'"
        ><section class="inspector-section">
          <h3>Project artwork</h3>
          <p class="muted">Original files travel with your project.</p>
          <label class="button primary full upload-button"
            ><Icon name="Upload" />Import artwork<input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              multiple
              @change="upload($event)" /></label
          ><button class="button full" @click="watchArtwork">Watch external artwork</button
          ><input v-model="assetSearch" placeholder="Find artwork…" aria-label="Search artwork" />
          <div
            class="asset-grid"
            @dragover.prevent
            @drop.prevent="upload({ target: { files: $event.dataTransfer?.files } } as unknown as Event)"
          >
            <div v-for="asset in filteredAssets" :key="asset.id" class="asset-card">
              <button
                draggable="true"
                @dragstart="$event.dataTransfer?.setData('application/tableloom-asset', asset.id)"
                :title="`Use ${asset.name}`"
                @click="useAsset(asset.id)"
              >
                <img :src="asset.data" :alt="asset.name" loading="lazy" /></button
              ><strong :title="asset.name">{{ asset.name }}</strong
              ><small>{{
                asset.mime === 'image/svg+xml' ? 'Vector original' : `${asset.width} × ${asset.height}`
              }}</small
              ><label class="text-button upload-button"
                >Relink<input type="file" accept="image/*" @change="upload($event, asset.id)"
              /></label>
            </div>
          </div></section></template
      ><template v-else-if="inspectorTab === 'automation'"
        ><section class="inspector-section">
          <h3>Component generator</h3>
          <p class="muted">
            Make every combination. Matching variants keep their content and local overrides.
          </p>
          <label>One dimension per line<textarea v-model="dims" rows="5" class="mono"></textarea></label
          ><label
            >Excluded combinations<textarea
              v-model="exclusion"
              rows="2"
              class="mono"
              placeholder='[{"suit":"Sun","rank":3}]'
            ></textarea>
          </label>
          <div class="inline">
            <button class="button" @click="generate(true)">Preview</button
            ><button class="button primary" :disabled="!currentSet" @click="generate(false)">Generate</button>
          </div>
          <p v-if="generatorError" class="error-text">{{ generatorError }}</p>
          <template v-if="generatorPreview"
            ><strong>{{ generatorPreview.length }} components</strong>
            <div class="value-preview" v-for="r in generatorPreview.slice(0, 5)" :key="r.id">
              {{ r.name }}
            </div></template
          >
        </section>
        <section
          v-if="currentElement && ['group', 'repeater'].includes(currentElement.type)"
          class="inspector-section"
        >
          <h3>Responsive block</h3>
          <label
            >Reusable block<select
              :value="currentElement.blockId ?? ''"
              @change="editElement({ blockId: ($event.target as HTMLSelectElement).value || undefined })"
            >
              <option value="">Local children</option>
              <option v-for="b in project.blocks" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select></label
          ><label
            >Cross-axis alignment<select
              :value="currentElement.flowAlign ?? 'start'"
              @change="
                editElement({ flowAlign: ($event.target as HTMLSelectElement).value as Element['flowAlign'] })
              "
            >
              <option>start</option>
              <option>center</option>
              <option>end</option>
            </select></label
          ><label
            >Flow<select
              :value="currentElement.layout ?? 'absolute'"
              @change="
                editElement({ layout: ($event.target as HTMLSelectElement).value as Element['layout'] })
              "
            >
              <option value="absolute">Positioned</option>
              <option value="vertical">Vertical stack</option>
              <option value="horizontal">Horizontal, wrapping</option>
              <option value="grid">Grid, wrapping</option>
            </select></label
          >
          <div class="form-grid">
            <label
              >Gap · {{ units
              }}<input
                :value="currentElement.gap ?? 1"
                type="number"
                @change="numeric('gap', $event)" /></label
            ><label
              >Padding · {{ units
              }}<input
                :value="currentElement.padding ?? 0"
                type="number"
                @change="numeric('padding', $event)"
            /></label>
          </div>
        </section>
        <section class="inspector-section">
          <h3>Save a reusable block</h3>
          <p class="muted">Turn the selected element into a building block for another layout.</p>
          <button
            class="button full"
            :disabled="!currentElement"
            @click="
              commit('Create block', (p) =>
                p.blocks.push({
                  id: uid('block'),
                  name: currentElement!.name,
                  elements: [{ ...clone(currentElement!), x: 0, y: 0 }],
                }),
              );
              notify('Block added to this project');
            "
          >
            <Icon name="Package" />Save selected as block
          </button>
        </section>
        <section class="inspector-section">
          <h3>Template variation</h3>
          <p class="muted">Create a related layout that inherits future changes.</p>
          <button
            class="button full"
            :disabled="!currentTemplate || !currentSet"
            @click="
              commit('Create template variant', (p) => {
                const t = {
                  ...clone(currentTemplate!),
                  id: uid('tpl'),
                  name: currentTemplate!.name + ' variant',
                  parentId: currentTemplate!.id,
                  elements: [],
                };
                p.templates.push(t);
                p.sets.find((s) => s.id === currentSet!.id)!.templateId = t.id;
              });
              notify('Linked variant created');
            "
          >
            <Icon name="GitBranch" />Create linked variant
          </button>
        </section></template
      ><template v-else
        ><section class="inspector-section">
          <h3>Versions & experiments</h3>
          <p class="muted">Keep a starting point, try a change, and compare what happened.</p>
          <input v-model="versionName" placeholder="Name this version…" aria-label="Version name" /><button
            class="button primary full"
            @click="snapshot('snapshot')"
          >
            <Icon name="Save" />Save snapshot</button
          ><button class="button full" @click="snapshot('experiment')">
            <Icon name="GitBranch" />Start an experiment
          </button>
        </section>
        <section class="inspector-section">
          <div v-for="s in [...project.snapshots].reverse()" :key="s.id" class="snapshot-item">
            <div class="inline">
              <Icon
                :name="s.kind === 'experiment' ? 'GitBranch' : s.kind === 'release' ? 'Package' : 'Clock'"
              /><strong>{{ s.name }}</strong>
            </div>
            <small>{{ new Date(s.createdAt).toLocaleString() }} · {{ s.kind }}</small>
            <div class="inline">
              <button
                class="text-button"
                @click="
                  baselineId = s.id;
                  notify('Comparison baseline updated');
                "
              >
                Compare from here</button
              ><button class="text-button" @click="restore = s.id">
                {{ s.kind === 'experiment' ? 'Discard experiment changes' : 'Restore' }}</button
              ><button
                v-if="s.kind === 'experiment'"
                class="text-button"
                @click="
                  addSnapshot(s.name + ' · kept');
                  notify('Experiment saved as a named version');
                "
              >
                Keep experiment
              </button>
            </div>
          </div>
        </section></template
      >
    </div>
    <Modal v-if="restore" title="Restore this version?" @close="restore = undefined"
      ><p>The current document will be replaced with the saved version. You can undo this operation.</p>
      <template #footer
        ><button class="button" @click="restore = undefined">Cancel</button
        ><button
          class="button primary"
          @click="
            restoreSnapshot(restore!);
            restore = undefined;
          "
        >
          Restore version
        </button></template
      ></Modal
    >
  </aside>
</template>
