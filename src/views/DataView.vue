<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import Icon from '../components/Icon.vue';
import StructuredEditor from '../components/StructuredEditor.vue';
import Modal from '../components/Modal.vue';
import ComponentPreview from '../components/ComponentPreview.vue';
import {
  project,
  sourceUpdates,
  currentSet,
  currentRow,
  rowId,
  selectRow,
  commit,
  updateField,
  addRow,
  duplicateRow,
  notify,
  reportError,
} from '../store';
import {
  parseDelimited,
  parseValue,
  exportDelimited,
  pasteCells,
  mergeRows,
  parseOds,
  exportRelatedData,
  parseRelatedData,
} from '../core/data';
import type { Row, Field, Value } from '../core/model';
import { clone, uid, quantity, textValue, parseProject } from '../core/model';
import { chooseFile, saveBytes } from '../persistence';
const listMode = ref<'table' | 'json'>('table');
const childRecords = shallowRef<Value[]>([]);
const textEncoder = new TextEncoder();
const search = ref('');
const sortKey = ref('');
const ascending = ref(true);
const page = ref(0);
const pageSize = 75;
const editingList = ref<string>();
const listText = ref('');
const newField = ref(false);
const fieldName = ref('');
const fieldType = ref<Field['type']>('text');
const importData = shallowRef<{ rows: Row[]; fields: Field[]; path?: string }>();
const importMode = ref<'merge' | 'replace'>('merge');
const find = ref('');
const replacement = ref('');
const replaceOpen = ref(false);
let unwatch: (() => void) | undefined;
const filtered = computed(() => {
  const rows = (currentSet.value?.rows ?? []).filter((r) =>
    Object.values(r).some((v) => textValue(v).toLowerCase().includes(search.value.toLowerCase())),
  );
  if (sortKey.value)
    rows.sort(
      (a, b) =>
        (typeof a[sortKey.value] === 'number' && typeof b[sortKey.value] === 'number'
          ? Number(a[sortKey.value]) - Number(b[sortKey.value])
          : textValue(a[sortKey.value]).localeCompare(textValue(b[sortKey.value]), undefined, {
              numeric: true,
            })) * (ascending.value ? 1 : -1),
    );
  return rows;
});
const visible = computed(() => filtered.value.slice(page.value * pageSize, (page.value + 1) * pageSize));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
function sort(key: string) {
  if (sortKey.value === key) ascending.value = !ascending.value;
  else {
    sortKey.value = key;
    ascending.value = true;
  }
  page.value = 0;
}
function cell(row: Row, f: Field, event: Event) {
  const value = (event.target as HTMLInputElement).value;
  try {
    const parsed = parseValue(value, f);
    commit(`Edit ${f.key}`, (p) => {
      p.sets.find((s) => s.id === currentSet.value!.id)!.rows.find((r) => r.id === row.id)![f.key] = parsed;
    });
  } catch (e) {
    reportError(e);
  }
}
function paste(e: ClipboardEvent, row: Row, column: number) {
  const text = e.clipboardData?.getData('text/plain');
  if (!text?.includes('\t') && !text?.includes('\n')) return;
  e.preventDefault();
  try {
    commit('Paste cells', (p) => {
      const set = p.sets.find((s) => s.id === currentSet.value!.id)!;
      set.rows = pasteCells(
        set.rows,
        set.fields,
        set.rows.findIndex((r) => r.id === row.id),
        column,
        text!,
      );
    });
  } catch (e) {
    reportError(e);
  }
}
async function loadData(bytes: Uint8Array, name: string, path?: string) {
  try {
    let parsed;
    if (name.toLowerCase().endsWith('.zip')) parsed = parseRelatedData(bytes);
    else if (name.endsWith('.ods')) parsed = parseOds(bytes);
    else if (name.endsWith('.json')) {
      const raw = JSON.parse(new TextDecoder().decode(bytes));
      const rows = (Array.isArray(raw) ? raw : raw.rows) as Row[];
      if (!Array.isArray(rows)) throw new Error('JSON must contain an array of records.');
      const normalized: Row[] = rows.map((r) => ({ ...r, id: r.id || uid('row') }));
      const keys = [...new Set(normalized.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'id');
      parsed = {
        rows: normalized,
        fields: keys.map(
          (key) =>
            currentSet.value?.fields.find((f) => f.key === key) ??
            ({
              key,
              type: Array.isArray(normalized[0]?.[key])
                ? 'list'
                : typeof normalized[0]?.[key] === 'number'
                  ? 'number'
                  : 'text',
            } as Field),
        ),
      };
    } else parsed = parseDelimited(new TextDecoder().decode(bytes), currentSet.value?.fields);
    importData.value = { ...parsed, path };
  } catch (e) {
    reportError(e);
  }
}
async function importFile() {
  const file = await chooseFile('.csv,.tsv,.json,.ods,.zip');
  if (file) await loadData(new Uint8Array(await file.arrayBuffer()), file.name);
}
async function connectSource() {
  if (!window.tableloom) {
    notify('Watched local files are available in the desktop app. You can import data here.');
    return;
  }
  try {
    const result = await window.tableloom.watchSource();
    if (result) await loadData(new Uint8Array(result.data), result.path, result.path);
  } catch (e) {
    reportError(e);
  }
}
function applyImport() {
  if (!importData.value || !currentSet.value) return;
  const data = importData.value;
  const applied = commit('Import data', (p) => {
    const set = p.sets.find((s) => s.id === currentSet.value!.id)!;
    set.rows = mergeRows(set.rows, data.rows, importMode.value);
    for (const f of data.fields) if (!set.fields.some((x) => x.key === f.key)) set.fields.push(f);
    if (data.path)
      set.source = {
        path: data.path,
        kind: data.path.endsWith('.ods') ? 'ods' : data.path.endsWith('.json') ? 'json' : 'csv',
        refreshedAt: new Date().toISOString(),
        mode: importMode.value,
      };
    parseProject({ ...clone(p), snapshots: [] });
  });
  if (!applied) return;
  notify(`${data.rows.length} records imported`);
  importData.value = undefined;
}
function addField() {
  if (
    !/^[a-zA-Z][\w]*$/.test(fieldName.value) ||
    ['id', 'constructor', 'prototype', '__proto__'].includes(fieldName.value) ||
    currentSet.value?.fields.some((f) => f.key === fieldName.value)
  ) {
    notify('Use a unique field name beginning with a letter.');
    return;
  }
  commit('Add field', (p) => {
    const set = p.sets.find((s) => s.id === currentSet.value!.id)!;
    set.fields.push({ key: fieldName.value, type: fieldType.value });
    for (const row of set.rows)
      row[fieldName.value] = fieldType.value === 'number' ? 0 : fieldType.value === 'list' ? [] : '';
  });
  newField.value = false;
  fieldName.value = '';
}
function openList(field: string) {
  editingList.value = field;
  childRecords.value = clone((currentRow.value?.[field] as Value[]) ?? []);
  listMode.value = 'table';
  listText.value = JSON.stringify(currentRow.value?.[field] ?? [], null, 2);
}
function saveList() {
  try {
    const value = listMode.value === 'table' ? clone(childRecords.value) : JSON.parse(listText.value);
    if (!Array.isArray(value)) throw new Error('Enter a JSON array of child records.');
    value.forEach((v) => {
      if (v && typeof v === 'object' && !Array.isArray(v) && !v.id) v.id = uid('child');
    });
    updateField(editingList.value!, value);
    editingList.value = undefined;
  } catch (e) {
    reportError(e);
  }
}
watch(
  [currentSet, sourceUpdates],
  () => {
    const source = currentSet.value?.source;
    if (!source) return;
    const data = sourceUpdates.value[source.path];
    if (data) {
      loadData(new Uint8Array(data.data), data.path, data.path);
      const next = { ...sourceUpdates.value };
      delete next[data.path];
      sourceUpdates.value = next;
    }
  },
  { immediate: true },
);
</script>
<template>
  <div v-if="currentSet" class="data-layout">
    <main class="data-main">
      <div class="view-heading">
        <div>
          <h2>{{ currentSet.name }}</h2>
          <p>
            {{ currentSet.rows.length }} records ·
            {{ currentSet.rows.reduce((n, r) => n + quantity(r), 0) }} printed pieces
          </p>
        </div>
        <div class="inline">
          <button class="button" @click="replaceOpen = true"><Icon name="RefreshCw" />Replace</button
          ><button class="button" @click="importFile"><Icon name="Upload" />Import data</button
          ><button class="button primary" @click="addRow"><Icon name="Plus" />Row</button>
        </div>
      </div>
      <div class="data-controls">
        <div class="search-field">
          <Icon name="Search" /><input
            v-model="search"
            placeholder="Search any field…"
            aria-label="Search components"
            @input="page = 0"
          />
        </div>
        <button class="text-button" @click="connectSource">
          <Icon name="Link" :size="14" />{{
            currentSet.source ? 'Reconnect source' : 'Watch a local file'
          }}</button
        ><button
          class="text-button"
          @click="
            saveBytes(
              textEncoder.encode(exportDelimited(currentSet!.rows, currentSet!.fields)),
              currentSet!.name + '.csv',
            )
          "
        >
          <Icon name="Download" :size="14" />CSV</button
        ><button
          class="text-button"
          @click="
            saveBytes(
              textEncoder.encode(JSON.stringify(currentSet!.rows, null, 2)),
              currentSet!.name + '.json',
            )
          "
        >
          JSON</button
        ><button
          class="text-button"
          :disabled="!currentSet.fields.some((f) => f.type === 'list')"
          @click="
            saveBytes(
              exportRelatedData(currentSet!.rows, currentSet!.fields),
              currentSet!.name + '-related-data.zip',
            )
          "
        >
          Related CSVs</button
        ><button class="text-button" @click="newField = true"><Icon name="Plus" :size="14" />Field</button>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="row-number">#</th>
              <th class="id-column">ID</th>
              <th v-for="f in currentSet.fields" :key="f.key">
                <button @click="sort(f.key)">
                  <small>{{ f.type === 'number' ? '#' : f.type === 'list' ? '[ ]' : 'T' }}</small
                  >{{ f.key
                  }}<Icon
                    v-if="sortKey === f.key"
                    name="ChevronDown"
                    :size="12"
                    :style="{ transform: ascending ? '' : 'rotate(180deg)' }"
                  />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in visible"
              :key="row.id"
              :class="{ selected: currentRow?.id === row.id }"
              @click="selectRow(row.id)"
            >
              <td class="row-number">{{ page * pageSize + i + 1 }}</td>
              <td class="id-column mono" :title="row.id">{{ row.id }}</td>
              <td
                v-for="(f, ci) in currentSet.fields"
                :key="f.key"
                :class="{ 'wide-cell': f.key === 'effect' }"
              >
                <button
                  v-if="f.type === 'list'"
                  class="list-cell"
                  @click="
                    selectRow(row.id);
                    openList(f.key);
                  "
                >
                  {{ Array.isArray(row[f.key]) ? (row[f.key] as Value[]).length : 0 }} items
                  <Icon name="ChevronRight" :size="12" /></button
                ><input
                  v-else
                  :value="textValue(row[f.key])"
                  :type="f.type === 'number' ? 'number' : 'text'"
                  :aria-label="`${row.name} ${f.key}`"
                  @focus="selectRow(row.id)"
                  @change="cell(row, f, $event)"
                  @paste="paste($event, row, ci)"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!visible.length" class="empty-state small">
          <Icon name="Search" />
          <p>No matching components.</p>
        </div>
      </div>
      <footer class="table-footer">
        <span
          >{{ filtered.length }} records<span v-if="currentSet.source">
            · {{ currentSet.source.path.split(/[\\/]/).at(-1) }} · refreshed
            {{ new Date(currentSet.source.refreshedAt!).toLocaleTimeString() }}</span
          ></span
        >
        <div class="inline">
          <button class="icon-button" :disabled="page === 0" title="Previous page" @click="page--">
            <Icon name="ChevronLeft" /></button
          ><span>{{ page + 1 }} / {{ pages }}</span
          ><button class="icon-button" :disabled="page >= pages - 1" title="Next page" @click="page++">
            <Icon name="ChevronRight" />
          </button>
        </div>
      </footer>
    </main>
    <aside v-if="currentRow" class="data-detail">
      <div class="data-mini-preview">
        <ComponentPreview :doc="project" :set="currentSet" :row="currentRow" />
      </div>
      <div class="detail-form">
        <div class="inline spread">
          <h3>{{ currentRow.name }}</h3>
          <button class="icon-button" title="Duplicate component" @click="duplicateRow">
            <Icon name="Copy" />
          </button>
        </div>
        <small class="mono muted">{{ currentRow.id }}</small
        ><label v-for="f in currentSet.fields" :key="f.key"
          >{{ f.key
          }}<button v-if="f.type === 'list'" class="button" @click="openList(f.key)">
            Edit {{ f.key }}<Icon name="List" /></button
          ><textarea
            v-else-if="f.key === 'effect'"
            :value="textValue(currentRow[f.key])"
            rows="4"
            @change="cell(currentRow, f, $event)"
          ></textarea
          ><input
            v-else
            :value="textValue(currentRow[f.key])"
            :type="f.type === 'number' ? 'number' : 'text'"
            @change="cell(currentRow, f, $event)"
        /></label>
      </div>
    </aside>
    <Modal v-if="newField" title="Add a data field" @close="newField = false"
      ><div class="stack">
        <label>Field name<input v-model="fieldName" placeholder="attack" /></label
        ><label
          >Type<select v-model="fieldType">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="list">List of child records</option>
            <option value="image">Artwork reference</option>
            <option value="boolean">True / false</option>
          </select></label
        >
      </div>
      <template #footer
        ><button class="button" @click="newField = false">Cancel</button
        ><button class="button primary" @click="addField">Add field</button></template
      ></Modal
    ><Modal v-if="editingList" :title="`Edit ${editingList}`" wide @close="editingList = undefined"
      ><p class="muted">Each item can have its own fields. Stable child IDs are assigned when you save.</p>
      <div class="segmented">
        <button
          :class="{ active: listMode === 'table' }"
          @click="
            () => {
              try {
                childRecords = JSON.parse(listText);
                listMode = 'table';
              } catch (e) {
                reportError(e);
              }
            }
          "
        >
          Child table</button
        ><button
          :class="{ active: listMode === 'json' }"
          @click="
            listText = JSON.stringify(childRecords, null, 2);
            listMode = 'json';
          "
        >
          JSON
        </button>
      </div>
      <StructuredEditor v-if="listMode === 'table'" v-model="childRecords" /><textarea
        v-else
        v-model="listText"
        class="code-area"
        rows="16"
        spellcheck="false"
      ></textarea
      ><template #footer
        ><button class="button" @click="editingList = undefined">Cancel</button
        ><button class="button primary" @click="saveList">Save child records</button></template
      ></Modal
    ><Modal v-if="importData" title="Review imported data" wide @close="importData = undefined"
      ><p>
        <strong>{{ importData.rows.length }} records</strong> · {{ importData.fields.length }} fields
      </p>
      <div class="segmented">
        <button :class="{ active: importMode === 'merge' }" @click="importMode = 'merge'">
          Merge by stable ID</button
        ><button :class="{ active: importMode === 'replace' }" @click="importMode = 'replace'">
          Replace all rows
        </button>
      </div>
      <p class="muted">
        {{
          importMode === 'merge'
            ? 'Matching IDs update existing components; new IDs create components. Other rows stay in the set.'
            : 'All current rows will be replaced by this import. You can undo the import.'
        }}
      </p>
      <pre class="import-preview">{{ JSON.stringify(importData.rows.slice(0, 3), null, 2) }}</pre>
      <template #footer
        ><button class="button" @click="importData = undefined">Cancel</button
        ><button class="button primary" @click="applyImport">Apply import</button></template
      ></Modal
    ><Modal v-if="replaceOpen" title="Find & replace in this set" @close="replaceOpen = false"
      ><div class="stack">
        <label>Find<input v-model="find" /></label><label>Replace with<input v-model="replacement" /></label>
        <p class="muted">
          Replaces exact text in text fields across all records in {{ currentSet.name }}. IDs and artwork
          references stay stable.
        </p>
      </div>
      <template #footer
        ><button class="button" @click="replaceOpen = false">Cancel</button
        ><button
          class="button primary"
          :disabled="!find"
          @click="
            commit('Replace text', (p) => {
              const s = p.sets.find((s) => s.id === currentSet!.id)!;
              for (const r of s.rows)
                for (const f of s.fields.filter((f) => f.type === 'text'))
                  if (typeof r[f.key] === 'string')
                    r[f.key] = (r[f.key] as string).split(find).join(replacement);
            });
            replaceOpen = false;
          "
        >
          Replace all
        </button></template
      ></Modal
    >
  </div>
  <div v-else class="empty-state">
    <h2>No component set yet</h2>
    <p>Add a set to begin editing its data.</p>
  </div>
</template>
