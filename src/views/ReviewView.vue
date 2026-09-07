<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import Icon from '../components/Icon.vue';
import ComponentPreview from '../components/ComponentPreview.vue';
import Modal from '../components/Modal.vue';
import {
  project,
  currentSet,
  currentRow,
  issues,
  changes,
  filter,
  baseline,
  baselineId,
  side,
  view,
  selectSet,
  selectRow,
  elementId,
  locale,
} from '../store';
import { outputImpacts } from '../core/revision';
import type { Issue } from '../core/model';
const affectedOutputs = computed(() => outputImpacts(project.value).filter((o) => o.changed > 0));
const search = ref('');
const compareId = ref<string>();
const viewport = ref<HTMLElement>();
const scroll = ref(0);
const width = ref(900);
const height = ref(700);
let observer: ResizeObserver;
const setIssues = computed(() => issues.value.filter((i) => i.setId === currentSet.value?.id));
const issueRows = computed(() => new Set(setIssues.value.map((i) => i.rowId)));
const changedRows = computed(
  () =>
    new Set(
      changes.value
        .filter((c) => c.setId === currentSet.value?.id && c.kind !== 'removed')
        .map((c) => c.rowId),
    ),
);
const rows = computed(() =>
  (currentSet.value?.rows ?? []).filter(
    (r) =>
      (filter.value === 'all' ||
        (filter.value === 'issues' && issueRows.value.has(r.id)) ||
        (filter.value === 'changed' && changedRows.value.has(r.id))) &&
      String(r.name).toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const columns = computed(() => Math.max(1, Math.floor((width.value - 32) / 175)));
const rowHeight = 300;
const start = computed(() => Math.max(0, Math.floor(scroll.value / rowHeight) - 1));
const end = computed(() => Math.ceil((scroll.value + height.value) / rowHeight) + 1);
const visible = computed(() => rows.value.slice(start.value * columns.value, end.value * columns.value));
const totalHeight = computed(() => Math.ceil(rows.value.length / columns.value) * rowHeight);
const comparison = computed(() => {
  if (!baseline.value || !currentSet.value || !compareId.value) return;
  const oldSet = baseline.value.data.sets.find((s) => s.id === currentSet.value!.id);
  return {
    oldSet,
    oldRow: oldSet?.rows.find((r) => r.id === compareId.value),
    newRow: currentSet.value.rows.find((r) => r.id === compareId.value),
    change: changes.value.find((c) => c.rowId === compareId.value),
  };
});
function openIssue(issue: Issue) {
  if (issue.setId) selectSet(issue.setId);
  if (issue.rowId) selectRow(issue.rowId);
  side.value = issue.back ? 'back' : 'front';
  if (issue.elementId) elementId.value = issue.elementId;
  view.value = issue.elementId ? 'design' : 'data';
}
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    width.value = entries[0]!.contentRect.width;
    height.value = entries[0]!.contentRect.height;
  });
  if (viewport.value) observer.observe(viewport.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <div class="review-layout">
    <aside class="preflight-panel">
      <div class="inline spread">
        <h3>Preflight</h3>
        <span class="eyebrow">LOCAL CHECKS</span>
      </div>
      <div class="issue-counts">
        <div class="error-count">
          <strong>{{ setIssues.filter((i) => i.severity === 'error').length }}</strong
          ><small>to fix</small>
        </div>
        <div class="warning-count">
          <strong>{{ setIssues.filter((i) => i.severity === 'warning').length }}</strong
          ><small>warnings</small>
        </div>
        <div class="ready-count">
          <strong>{{ (currentSet?.rows.length ?? 0) - issueRows.size }}</strong
          ><small>ready</small>
        </div>
      </div>
      <div class="issue-list">
        <button v-for="issue in setIssues" :key="issue.id" class="issue-item" @click="openIssue(issue)">
          <Icon
            :name="issue.severity === 'error' ? 'CircleAlert' : 'AlertTriangle'"
            :size="15"
            :class="issue.severity === 'error' ? 'error-text' : 'warning-text'"
          />
          <div>
            <strong>{{ issue.message }}</strong
            ><small>{{ currentSet?.rows.find((r) => r.id === issue.rowId)?.name }}</small>
            <p>{{ issue.detail }}</p>
            <span>Open source <Icon name="ArrowUpRight" :size="12" /></span>
          </div>
        </button>
        <div v-if="!setIssues.length" class="all-clear">
          <Icon name="CheckCircle2" :size="30" />
          <h3>Ready for the table.</h3>
          <p>No issues detected in this set.</p>
        </div>
      </div>
      <div class="revision-summary">
        <div v-if="affectedOutputs.length" class="top-gap">
          <div class="eyebrow">OUTPUTS TO REFRESH</div>
          <div v-for="output in affectedOutputs.slice(0, 5)" :key="output.id" class="context-stat">
            <span>{{ output.name }}</span
            ><strong>{{ output.changed }} changed</strong>
          </div>
        </div>
        <div class="eyebrow">SINCE {{ baseline?.name ?? 'LAST VERSION' }}</div>
        <div class="context-stat">
          <span>Changed components</span><strong>{{ changedRows.size }}</strong>
        </div>
        <div class="context-stat">
          <span>Removed components</span
          ><strong>{{
            changes.filter((c) => c.setId === currentSet?.id && c.kind === 'removed').length
          }}</strong>
        </div>
        <button class="button full" @click="view = 'export'">
          Prepare next version<Icon name="ArrowRight" />
        </button>
      </div>
    </aside>
    <main class="review-main">
      <div class="review-toolbar">
        <div class="segmented">
          <button
            v-for="f in ['all', 'issues', 'changed'] as const"
            :key="f"
            :class="{ active: filter === f }"
            @click="
              filter = f;
              scroll = 0;
              viewport?.scrollTo(0, 0);
            "
          >
            {{ f === 'all' ? 'All' : f === 'issues' ? 'With issues' : 'Changed'
            }}<span>{{
              f === 'all' ? currentSet?.rows.length : f === 'issues' ? issueRows.size : changedRows.size
            }}</span>
          </button>
        </div>
        <div class="segmented">
          <button :class="{ active: side === 'front' }" @click="side = 'front'">Fronts</button
          ><button
            :class="{ active: side === 'back' }"
            :disabled="!currentSet?.backTemplateId"
            @click="side = 'back'"
          >
            Backs
          </button>
        </div>
        <div class="grow"></div>
        <select v-model="baselineId" aria-label="Compare with version">
          <option value="">Latest saved version</option>
          <option v-for="s in project.snapshots" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div class="review-subbar">
        <span>{{ rows.length }} designs · {{ currentSet?.name }}</span>
        <div class="search-field">
          <Icon name="Search" :size="14" /><input
            v-model="search"
            placeholder="Find a component…"
            aria-label="Find a component"
          />
        </div>
      </div>
      <div ref="viewport" class="review-viewport" @scroll="scroll = ($event.target as HTMLElement).scrollTop">
        <div :style="{ height: totalHeight + 'px', position: 'relative' }">
          <div
            class="review-grid"
            :style="{
              gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
              transform: `translateY(${start * rowHeight}px)`,
            }"
          >
            <div v-for="row in visible" :key="row.id" class="review-card">
              <button
                class="review-card-preview"
                :class="{ selected: currentRow?.id === row.id, hasIssue: issueRows.has(row.id) }"
                @click="selectRow(row.id)"
                @dblclick="
                  selectRow(row.id);
                  view = 'design';
                "
              >
                <span v-if="changedRows.has(row.id)" class="change-badge">Changed</span
                ><ComponentPreview
                  :doc="project"
                  :set="currentSet!"
                  :row="row"
                  :back="side === 'back'"
                  :locale="locale"
                />
              </button>
              <div class="inline spread">
                <button
                  class="card-caption"
                  @click="
                    selectRow(row.id);
                    view = 'design';
                  "
                >
                  {{ row.name }}</button
                ><span>× {{ row.qty ?? 1 }}</span>
              </div>
              <button v-if="changedRows.has(row.id)" class="text-button small" @click="compareId = row.id">
                Compare changes<Icon name="Columns2" :size="12" />
              </button>
            </div>
          </div>
        </div>
        <div v-if="!rows.length" class="empty-state">
          <Icon name="CheckCircle2" :size="32" />
          <h3>
            {{ filter === 'changed' ? 'No changes since this version.' : 'No components match this view.' }}
          </h3>
        </div>
      </div>
    </main>
    <Modal
      v-if="compareId && comparison"
      title="Compare component versions"
      wide
      @close="compareId = undefined"
      ><div class="comparison-grid">
        <div>
          <div class="eyebrow">{{ baseline?.name }}</div>
          <ComponentPreview
            v-if="comparison.oldSet && comparison.oldRow"
            :doc="baseline!.data"
            :set="comparison.oldSet"
            :row="comparison.oldRow"
          />
          <p v-else>Component did not exist in this version.</p>
        </div>
        <div>
          <div class="eyebrow">CURRENT VERSION</div>
          <ComponentPreview
            v-if="comparison.newRow"
            :doc="project"
            :set="currentSet!"
            :row="comparison.newRow"
          />
        </div>
      </div>
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>Now</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in comparison.change?.fields" :key="f">
            <td>{{ f }}</td>
            <td>{{ comparison.oldRow?.[f] }}</td>
            <td>{{ comparison.newRow?.[f] }}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted">
        Change type: {{ comparison.change?.kind }}. Shared layout, symbols, and terminology are included in
        the comparison.
      </p></Modal
    >
  </div>
</template>
