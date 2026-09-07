<script setup lang="ts">
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import ComponentPreview from './ComponentPreview.vue';
import {
  project,
  selection,
  patchSelection,
  arrangeSelection,
  groupSelection,
  currentSet,
  currentRow,
  currentTemplate,
  elements,
  currentElement,
  elementId,
  scope,
  affectedCount,
  zoom,
  units,
  snap,
  guides,
  side,
  locale,
  editElement,
  updateField,
  addElement,
  selectRow,
} from '../store';
import { matchesRule } from '../core/rules';
import type { Element as LayoutElement } from '../core/model';
const factor = computed(() => (zoom.value / 100) * 3.7795275591),
  scale = computed(() => (units.value === 'mm' ? 1 : 1 / 25.4));
const temporary = ref<{ x: number; y: number; w: number; h: number }>();
const shown = computed(() =>
  elements.value.filter(
    (e) => !e.hidden && !e.locked && currentRow.value && matchesRule(e.visibleWhen, currentRow.value),
  ),
);
function startDrag(e: PointerEvent, el: LayoutElement, resize = false) {
  if (e.button !== 0 || el.locked) return;
  e.preventDefault();
  if (e.shiftKey) {
    selection.value = selection.value.includes(el.id)
      ? selection.value.filter((id) => id !== el.id)
      : [...selection.value, el.id];
    elementId.value = el.id;
    return;
  }
  if (!selection.value.includes(el.id)) selection.value = [el.id];
  elementId.value = el.id;
  const initial = { x: el.x, y: el.y, w: el.w, h: el.h },
    sx = e.clientX,
    sy = e.clientY,
    target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const move = (m: PointerEvent) => {
    const dx = (m.clientX - sx) / factor.value,
      dy = (m.clientY - sy) / factor.value;
    const round = (v: number) => (snap.value ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100);
    temporary.value = resize
      ? {
          ...initial,
          w: Math.max(1, round(initial.w + dx)),
          h: el.keepAspect
            ? Math.max(1, round(((initial.w + dx) * initial.h) / initial.w))
            : Math.max(1, round(initial.h + dy)),
        }
      : { ...initial, x: round(initial.x + dx), y: round(initial.y + dy) };
  };
  const end = (event: PointerEvent) => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    if (temporary.value && event.type !== 'pointercancel') {
      if (resize) editElement(temporary.value);
      else {
        const dx = temporary.value.x - initial.x,
          dy = temporary.value.y - initial.y;
        patchSelection(
          Object.fromEntries(
            elements.value
              .filter((e) => selection.value.includes(e.id))
              .map((e) => [e.id, { x: e.x + dx, y: e.y + dy }]),
          ),
        );
      }
    }
    temporary.value = undefined;
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end, { once: true });
  target.addEventListener('pointercancel', end, { once: true });
}
function boxStyle(e: LayoutElement) {
  const v = e.id === elementId.value && temporary.value ? temporary.value : e;
  return {
    left: v.x * factor.value + 'px',
    top: v.y * factor.value + 'px',
    width: v.w * factor.value + 'px',
    height: v.h * factor.value + 'px',
    transform: `rotate(${e.rotation ?? 0}deg)`,
  };
}
function bind(e: DragEvent, el: LayoutElement) {
  const asset = e.dataTransfer?.getData('application/tableloom-asset');
  if (asset && el.type === 'image') {
    elementId.value = el.id;
    if (el.binding) updateField(el.binding, asset);
    else editElement({ imageId: asset });
    return;
  }
  const field = e.dataTransfer?.getData('application/tableloom-field');
  if (field) {
    elementId.value = el.id;
    editElement({ binding: field, formula: undefined });
  }
}
function next(delta: number) {
  if (!currentSet.value || !currentRow.value) return;
  const rows = currentSet.value.rows;
  selectRow(
    rows[(rows.findIndex((r) => r.id === currentRow.value!.id) + delta + rows.length) % rows.length]!.id,
  );
}
const tools = [
  { name: 'MousePointer2', title: 'Select', type: null },
  { name: 'Type', title: 'Add text', type: 'text' },
  { name: 'Image', title: 'Add image', type: 'image' },
  { name: 'Square', title: 'Add rectangle', type: 'rect' },
  { name: 'Circle', title: 'Add ellipse', type: 'ellipse' },
  { name: 'Pentagon', title: 'Add path', type: 'path' },
  { name: 'Sparkles', title: 'Add symbol', type: 'symbol' },
  { name: 'Grid3X3', title: 'Add grid', type: 'grid' },
  { name: 'Workflow', title: 'Add repeater', type: 'repeater' },
];
</script>
<template>
  <div class="design-workarea">
    <div class="design-toolbar">
      <div class="tool-group">
        <button
          v-for="tool in tools"
          :key="tool.name"
          :title="tool.title"
          :aria-label="tool.title"
          class="icon-button"
          @click="tool.type && addElement(tool.type as LayoutElement['type'])"
        >
          <Icon :name="tool.name" />
        </button>
      </div>
      <div class="toolbar-divider"></div>
      <div class="scope-control">
        <button
          v-for="s in ['card', 'template', 'style'] as const"
          :key="s"
          :class="{ active: scope === s }"
          @click="scope = s"
        >
          {{ s === 'card' ? 'This component' : s === 'template' ? 'Template' : 'Shared style' }}
        </button>
      </div>
      <small class="muted scope-count">Affects {{ affectedCount }}</small>
      <div class="grow"></div>
      <button
        class="icon-button"
        :class="{ active: guides }"
        title="Toggle safe and trim guides"
        @click="guides = !guides"
      >
        <Icon name="Expand" /></button
      ><button
        class="icon-button"
        :class="{ active: snap }"
        title="Snap to 0.5 mm grid"
        @click="snap = !snap"
      >
        <Icon name="Grid3X3" /></button
      ><select v-model="units" aria-label="Measurement units" class="compact">
        <option>mm</option>
        <option>in</option>
      </select>
    </div>
    <div class="canvas-info">
      <div class="inline">
        <span class="eyebrow">{{ side === 'back' ? 'BACK' : 'FRONT' }}</span
        ><span>{{ currentTemplate?.name }}</span>
      </div>
      <div class="inline">
        <button class="icon-button small" title="Zoom out" @click="zoom = Math.max(25, zoom - 25)">
          <Icon name="Minus" :size="14" /></button
        ><select v-model.number="zoom" aria-label="Canvas zoom" class="zoom-select">
          <option v-for="z in [25, 50, 75, 100, 125, 150, 160, 175, 200, 250, 300]" :key="z" :value="z">
            {{ z }}%
          </option></select
        ><button class="icon-button small" title="Zoom in" @click="zoom = Math.min(300, zoom + 25)">
          <Icon name="Plus" :size="14" />
        </button>
      </div>
    </div>
    <div class="canvas-scroll">
      <div v-if="currentSet && currentRow && currentTemplate" class="canvas-surround">
        <div class="canvas-measure top">
          {{ (currentTemplate.width * scale).toFixed(units === 'mm' ? 1 : 2) }} {{ units }}
        </div>
        <div class="canvas-measure side">
          {{ (currentTemplate.height * scale).toFixed(units === 'mm' ? 1 : 2) }} {{ units }}
        </div>
        <div
          class="canvas-stage"
          :style="{
            width: currentTemplate.width * factor + 'px',
            height: currentTemplate.height * factor + 'px',
          }"
        >
          <div v-if="guides" class="ruler horizontal" aria-hidden="true">
            <span
              v-for="i in Math.floor(currentTemplate.width / 10) + 1"
              :key="i"
              :style="{ left: (i - 1) * 10 * factor + 'px' }"
              >{{ ((i - 1) * 10 * scale).toFixed(units === 'mm' ? 0 : 2) }}</span
            >
          </div>
          <div v-if="guides" class="ruler vertical" aria-hidden="true">
            <span
              v-for="i in Math.floor(currentTemplate.height / 10) + 1"
              :key="i"
              :style="{ top: (i - 1) * 10 * factor + 'px' }"
              >{{ ((i - 1) * 10 * scale).toFixed(units === 'mm' ? 0 : 2) }}</span
            >
          </div>
          <ComponentPreview
            :doc="project"
            :set="currentSet"
            :row="currentRow"
            :back="side === 'back'"
            :guides="guides"
            :locale="locale"
          />
          <button
            v-for="el in shown"
            :key="el.id"
            :class="['element-hit', { selected: selection.includes(el.id) }]"
            :style="boxStyle(el)"
            :aria-label="`Select ${el.name}`"
            @pointerdown="startDrag($event, el)"
            @keydown.enter="
              elementId = el.id;
              selection = [el.id];
            "
            @dragover.prevent
            @drop.prevent="bind($event, el)"
          >
            <template v-if="elementId === el.id"
              ><span class="element-badge"
                >{{ el.name }}<small v-if="el.binding"> · {{ el.binding }}</small></span
              ><span
                class="resize-handle"
                role="button"
                aria-label="Resize element"
                @pointerdown.stop="startDrag($event, el, true)"
              ></span
            ></template>
          </button>
        </div>
        <div class="canvas-caption">
          {{ currentTemplate.bleed }} mm bleed <span>·</span> {{ currentTemplate.safe }} mm safe area
          <span>·</span> {{ currentRow.id }}
        </div>
      </div>
      <div v-else class="empty-state">
        <Icon name="Layers" :size="40" />
        <h2>Your canvas is ready.</h2>
        <p>Add a component set from the sidebar to start designing.</p>
      </div>
    </div>
    <div v-if="currentRow && currentSet" class="canvas-bottom">
      <button class="icon-button" title="Previous component" @click="next(-1)">
        <Icon name="ChevronLeft" /></button
      ><select
        :value="currentRow.id"
        aria-label="Preview component"
        @change="selectRow(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="row in currentSet.rows" :key="row.id" :value="row.id">{{ row.name }}</option></select
      ><button class="icon-button" title="Next component" @click="next(1)">
        <Icon name="ChevronRight" />
      </button>
      <div class="grow"></div>
      <div class="segmented">
        <button :class="{ active: side === 'front' }" @click="side = 'front'">Front</button
        ><button
          :disabled="!currentSet.backTemplateId"
          :class="{ active: side === 'back' }"
          @click="side = 'back'"
        >
          Back
        </button>
      </div>
      <button
        v-for="a in ['left', 'center', 'right'] as const"
        :key="a"
        class="icon-button"
        :disabled="!currentElement"
        :title="`Align ${a}`"
        @click="arrangeSelection('x', a === 'left' ? 'start' : a === 'right' ? 'end' : 'center')"
      >
        <Icon :name="a === 'left' ? 'AlignLeft' : a === 'center' ? 'AlignCenter' : 'AlignRight'" />
      </button>
    </div>
    <div class="selection-tools">
      <small class="muted">{{ selection.length }} selected · Shift-click to add</small
      ><button class="text-button" :disabled="selection.length < 2" @click="groupSelection()">Group</button
      ><button class="text-button" :disabled="currentElement?.type !== 'group'" @click="groupSelection(true)">
        Ungroup</button
      ><button class="text-button" :disabled="!selection.length" @click="arrangeSelection('y', 'center')">
        Align vertically</button
      ><button
        class="text-button"
        :disabled="selection.length < 3"
        @click="arrangeSelection('x', 'distribute')"
      >
        Distribute ↔</button
      ><button
        class="text-button"
        :disabled="selection.length < 3"
        @click="arrangeSelection('y', 'distribute')"
      >
        Distribute ↕
      </button>
    </div>
    <div v-if="currentSet" class="field-drawer">
      <div class="inline spread">
        <span class="eyebrow">FIELDS</span><small class="muted">Drag a field onto text or artwork</small>
      </div>
      <div class="field-chips">
        <span
          v-for="f in currentSet.fields"
          :key="f.key"
          draggable="true"
          class="field-chip"
          @dragstart="$event.dataTransfer!.setData('application/tableloom-field', f.key)"
          ><span>{{ f.type === 'number' ? '#' : f.type === 'image' ? '▧' : 'T' }}</span
          >{{ f.key }}</span
        >
      </div>
    </div>
  </div>
</template>
