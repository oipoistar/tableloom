<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import ComponentPreview from '../components/ComponentPreview.vue';
import PlaytestNotes from '../components/PlaytestNotes.vue';
import { project, currentSet, commit, notify, accessRole } from '../store';
import { uid, clone, quantity } from '../core/model';
import type { TableObject, TableZone } from '../core/model';
import { shuffle, seededRandom } from '../core/generators';
import {
  pieceSize,
  isCovered,
  zoneObjects,
  arrangeZone,
  movePieces,
  moveToZone,
  discardPieces,
  drawFromZone,
  shuffleZone,
  addTablePiece,
  dealPhase,
  restoreSetup,
  tableLog,
} from '../core/table';
const viewport = ref<HTMLElement>();
const zoom = ref(0.7),
  selected = ref<string[]>([]),
  dragging = ref<string[]>([]);
const offset = ref({ x: 0, y: 0 });
const showNotes = ref(false),
  showRules = ref(false),
  showSettings = ref(false),
  inspect = ref(false);
const showTools = ref(true);
const deckSetId = ref(currentSet.value?.id ?? '');
function toggleTools() {
  showTools.value = !showTools.value;
  showNotes.value = false;
  nextTick(fit);
}
const browsing = ref(''),
  revealPile = ref(false),
  search = ref('');
const seed = ref(project.value.table.seed),
  drawCount = ref(1),
  sides = ref(6);
const setupName = ref('My table setup'),
  zoneName = ref('Player area'),
  counterName = ref('Score');
const zoneKind = ref<TableZone['kind']>('area'),
  zoneArrangement = ref<TableZone['arrangement']>('fan');
const table = computed(() => project.value.table);
const width = computed(() => table.value.width ?? 1400),
  height = computed(() => table.value.height ?? 1000);
const canEdit = computed(() => !['viewer', 'commenter'].includes(accessRole.value));
const phase = computed(() => table.value.phases?.[table.value.phaseIndex ?? 0]);
const phaseRemaining = computed(() => table.value.objects.filter((o) => o.layoutId).length);
const objects = computed(() =>
  table.value.objects
    .map((o, index) => {
      const set = project.value.sets.find((s) => s.id === o.setId),
        row = set?.rows.find((r) => r.id === o.rowId);
      const zone = table.value.zones?.find((z) => z.id === o.zoneId);
      return { ...o, set, row, index, zone, size: pieceSize(project.value, o) };
    })
    .filter((o) => o.set && o.row),
);
const visibleObjects = computed(() =>
  objects.value.filter(
    (o) =>
      !o.zone || o.zone.arrangement !== 'stack' || zoneObjects(table.value, o.zone.id).at(-1)?.id === o.id,
  ),
);
const active = computed(() => objects.value.find((o) => o.id === selected.value[0]));
const activeZone = computed(() => table.value.zones?.find((z) => z.id === browsing.value));
const pileContents = computed(() => objects.value.filter((o) => o.zoneId === browsing.value).reverse());
function nameOf(o: { flipped: boolean; row?: Record<string, unknown> }) {
  return o.flipped ? 'Face-down piece' : String(o.row?.name ?? 'Piece');
}
function fit() {
  if (viewport.value) {
    zoom.value = Math.max(
      0.15,
      Math.min(
        1.25,
        (viewport.value.clientWidth - 28) / width.value,
        (viewport.value.clientHeight - 28) / height.value,
      ),
    );
    viewport.value.scrollTo(0, 0);
  }
}
function patch(patch: Partial<TableObject>) {
  commit('Update table pieces', (p) => {
    for (const o of p.table.objects) if (selected.value.includes(o.id)) Object.assign(o, patch);
  });
}
function flip() {
  commit('Flip table pieces', (p) => {
    for (const o of p.table.objects) if (selected.value.includes(o.id) && !o.locked) o.flipped = !o.flipped;
  });
}
function rotate() {
  commit('Rotate table pieces', (p) => {
    for (const o of p.table.objects)
      if (selected.value.includes(o.id) && !o.locked) o.rotation = (o.rotation + 90) % 360;
  });
}
function discard() {
  commit('Discard pieces', (p) => {
    const n = discardPieces(p, selected.value);
    tableLog(p.table, `Discarded ${n} piece(s).`);
  });
}
function send(zoneId: string) {
  commit('Move pieces to area', (p) => {
    const n = moveToZone(p, selected.value, zoneId);
    tableLog(p.table, `Moved ${n} piece(s) to ${p.table.zones?.find((z) => z.id === zoneId)?.name}.`);
  });
}
let stopDrag: (() => void) | undefined;
function move(e: PointerEvent, id: string) {
  if (e.button !== 0) return;
  const o = table.value.objects.find((o) => o.id === id)!;
  if (e.shiftKey) {
    selected.value = selected.value.includes(id)
      ? selected.value.filter((x) => x !== id)
      : [...selected.value, id];
    return;
  }
  if (!selected.value.includes(id))
    selected.value = o.group ? table.value.objects.filter((x) => x.group === o.group).map((x) => x.id) : [id];
  if (!canEdit.value || o.locked) return;
  if (isCovered(table.value, o)) {
    notify('This card is covered. Take the cards below it first.');
    return;
  }
  const ids = selected.value.filter((id) => {
    const o = table.value.objects.find((o) => o.id === id);
    return o && !o.locked && !isCovered(table.value, o);
  });
  const target = e.currentTarget as HTMLElement,
    sx = e.clientX,
    sy = e.clientY;
  let dx = 0,
    dy = 0;
  target.setPointerCapture(e.pointerId);
  const drag = (event: PointerEvent) => {
    dx = (event.clientX - sx) / zoom.value;
    dy = (event.clientY - sy) / zoom.value;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      dragging.value = ids;
      offset.value = { x: dx, y: dy };
    }
  };
  const cleanup = () => {
    target.removeEventListener('pointermove', drag);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', cancel);
    dragging.value = [];
    offset.value = { x: 0, y: 0 };
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    stopDrag = undefined;
  };
  const end = (event: PointerEvent) => {
    const moved = dragging.value.length > 0;
    cleanup();
    if (!moved) return;
    const rect = viewport.value!.getBoundingClientRect();
    const x = (event.clientX - rect.left + viewport.value!.scrollLeft - 14) / zoom.value,
      y = (event.clientY - rect.top + viewport.value!.scrollTop - 14) / zoom.value;
    const zone = [...(table.value.zones ?? [])]
      .reverse()
      .find((z) => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height);
    commit('Move table pieces', (p) => {
      movePieces(p, ids, dx, dy);
      if (zone && zone.arrangement !== 'free') moveToZone(p, ids, zone.id);
      else if (zone) for (const o of p.table.objects) if (ids.includes(o.id) && !o.locked) o.zoneId = zone.id;
    });
  };
  const cancel = () => cleanup();
  stopDrag = cleanup;
  target.addEventListener('pointermove', drag);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', cancel);
}
function keyboard(e: KeyboardEvent) {
  if (
    !canEdit.value ||
    showRules.value ||
    showSettings.value ||
    inspect.value ||
    browsing.value ||
    (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')
  )
    return;
  if (e.key === 'Escape') {
    stopDrag?.();
    selected.value = [];
  }
  if (!selected.value.length || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === 'f') flip();
  else if (e.key.toLowerCase() === 'r') rotate();
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    discard();
  } else if (e.key === 'Enter') inspect.value = true;
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const d = e.shiftKey ? 20 : 5;
    commit('Nudge table pieces', (p) =>
      movePieces(
        p,
        selected.value,
        e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0,
        e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0,
      ),
    );
  }
}
function loadDeck() {
  const set = project.value.sets.find((s) => s.id === deckSetId.value);
  if (!set) return;
  if (set.rows.reduce((n, r) => n + quantity(r), 0) > 100000) {
    notify('A test deck supports up to 100,000 pieces.');
    return;
  }
  commit('Prepare test deck', (p) => {
    p.table.deck = shuffle(
      set.rows.flatMap((r) =>
        Array.from({ length: quantity(r) }, (_, copy) => ({ setId: set.id, rowId: r.id, copy })),
      ),
      seed.value,
    );
    p.table.seed = seed.value;
  });
}
function draw() {
  const ids: string[] = [];
  commit('Draw cards', (p) => {
    p.table.deck.splice(0, Math.max(1, Math.min(30, drawCount.value))).forEach((c, i) => {
      const o = addTablePiece(p, c.setId, c.rowId, 40 + i * 120, 260);
      if (o) ids.push(o.id);
    });
  });
  selected.value = ids;
}
function nextPhase() {
  commit('Deal next phase', (p) => dealPhase(p, (p.table.phaseIndex ?? 0) + 1));
  selected.value = [];
}
function loadSetup(id: string) {
  commit('Load table setup', (p) => {
    const s = p.setups.find((s) => s.id === id);
    if (s) restoreSetup(p, s);
  });
  selected.value = [];
  nextTick(fit);
}
function addPiece(value: string) {
  if (!value) return;
  const [setId, rowId] = JSON.parse(value);
  commit('Add test piece', (p) => {
    const o = addTablePiece(p, setId, rowId);
    if (o) selected.value = [o.id];
  });
}
function adjustCounter(id: string, delta: number) {
  commit('Adjust table counter', (p) => {
    const c = p.table.counters?.find((c) => c.id === id);
    if (c) c.value = Math.max(c.min, Math.min(c.max, c.value + delta));
  });
}
function takeFromPile(zoneId: string) {
  commit('Draw from pile', (p) => {
    const id = drawFromZone(p, zoneId);
    if (id) selected.value = [id];
  });
}
function browsePile(zoneId: string) {
  browsing.value = zoneId;
  revealPile.value = false;
}
function retrieve(id: string) {
  commit('Retrieve from pile', (p) => {
    moveToZone(p, [id]);
    const o = p.table.objects.find((o) => o.id === id)!;
    o.flipped = false;
    o.x = width.value / 2 - 150;
    o.y = height.value / 2;
  });
  selected.value = [id];
  browsing.value = '';
}
function addZone() {
  commit('Add table area', (p) => {
    p.table.zones ??= [];
    p.table.zones.push({
      id: uid('zone'),
      name: zoneName.value || 'Area',
      kind: zoneKind.value,
      arrangement: zoneArrangement.value,
      x: 30,
      y: 30,
      width: zoneKind.value === 'area' ? 500 : 150,
      height: 210,
      color: '#839773',
      faceDown: zoneKind.value === 'pile',
    });
  });
}
function editZone(id: string, key: 'x' | 'y' | 'width' | 'height', value: number) {
  if (!Number.isFinite(value)) return;
  commit('Resize table area', (p) => {
    const z = p.table.zones?.find((z) => z.id === id);
    if (z) {
      z[key] = Math.max(key === 'width' || key === 'height' ? 40 : 0, Math.min(20000, value));
      arrangeZone(p, z);
    }
  });
}
function pass() {
  commit('Pass turn', (p) => {
    p.table.activePlayer = ((p.table.activePlayer ?? 0) + 1) % p.table.players!.length;
    p.table.turn = (p.table.turn ?? 1) + 1;
    tableLog(p.table, `Turn ${p.table.turn}: ${p.table.players![p.table.activePlayer]}.`);
  });
}
function saveSetup() {
  commit('Save table setup', (p) =>
    p.setups.push({ ...clone(p.table), id: uid('setup'), name: setupName.value.trim() || 'Table setup' }),
  );
  notify('Setup saved');
}
onMounted(() => {
  nextTick(fit);
  window.addEventListener('keydown', keyboard);
});
onBeforeUnmount(() => {
  stopDrag?.();
  window.removeEventListener('keydown', keyboard);
});
</script>
<template>
  <div class="playtest-workspace" :class="{ 'tools-hidden': !showTools && !showNotes }">
    <main class="playtest-main">
      <header class="playtest-heading">
        <div>
          <div class="eyebrow">THE PLAYTEST TABLE</div>
          <h2>{{ project.name }}</h2>
        </div>
        <div class="inline">
          <button class="button" @click="showRules = true"><Icon name="BookOpen" />How to play</button
          ><button class="button" @click="showNotes = !showNotes"><Icon name="MessageSquare" />Notes</button
          ><button class="text-button" @click="toggleTools">
            {{ showTools ? 'Hide tools' : 'Show tools' }}</button
          ><button class="icon-button" title="Table settings" @click="showSettings = true">
            <Icon name="Settings" />
          </button>
        </div>
      </header>
      <div class="playtest-toolbar">
        <span v-if="phase" class="phase-label"
          >{{ phase.name }} <small>{{ phaseRemaining }} remaining</small></span
        >
        <button
          v-if="table.phases?.length"
          class="text-button"
          :disabled="!canEdit || phaseRemaining > 0 || (table.phaseIndex ?? 0) >= table.phases.length - 1"
          @click="nextPhase"
        >
          Next phase →
        </button>
        <span v-if="table.players?.length" class="turn-label"
          >Turn {{ table.turn ?? 1 }} · {{ table.players[table.activePlayer ?? 0] }}</span
        ><button v-if="table.players?.length" class="text-button" :disabled="!canEdit" @click="pass">
          Pass turn
        </button>
        <div class="grow"></div>
        <button
          class="icon-button small"
          aria-label="Zoom out table"
          @click="zoom = Math.max(0.15, zoom - 0.1)"
        >
          <Icon name="Minus" :size="15" /></button
        ><span class="zoom-readout">{{ Math.round(zoom * 100) }}%</span
        ><button class="icon-button small" aria-label="Zoom in table" @click="zoom = Math.min(2, zoom + 0.1)">
          <Icon name="Plus" :size="15" /></button
        ><button class="text-button" @click="fit">Fit table</button>
      </div>
      <div v-if="table.counters?.length" class="table-counters">
        <div v-for="c in table.counters" :key="c.id" class="table-counter" :style="{ borderColor: c.color }">
          <span>{{ c.name }}</span
          ><button
            :disabled="!canEdit || c.value <= c.min"
            :aria-label="`Decrease ${c.name}`"
            @click="adjustCounter(c.id, -1)"
          >
            −</button
          ><strong>{{ c.value }}</strong
          ><button
            :disabled="!canEdit || c.value >= c.max"
            :aria-label="`Increase ${c.name}`"
            @click="adjustCounter(c.id, 1)"
          >
            +
          </button>
        </div>
      </div>
      <div ref="viewport" class="playtest-viewport" @pointerdown.self="selected = []">
        <div
          class="playtest-scroll-space"
          :style="{ width: width * zoom + 'px', height: height * zoom + 'px' }"
        >
          <div
            class="playtest-world"
            :style="{
              width: width + 'px',
              height: height + 'px',
              transform: `scale(${zoom})`,
              backgroundColor: table.background ?? '#dbe5d1',
            }"
            @pointerdown.self="selected = []"
          >
            <div v-if="!objects.length" class="table-watermark">
              TABLELOOM<span>Add components or load a saved setup to begin.</span>
            </div>
            <div
              v-for="z in table.zones"
              :key="z.id"
              class="play-zone"
              :class="[z.kind, { stack: z.arrangement === 'stack' }]"
              :style="{
                left: z.x + 'px',
                top: z.y + 'px',
                width: z.width + 'px',
                height: z.height + 'px',
                borderColor: z.color,
                '--zone-color': z.color,
              }"
            >
              <div class="play-zone-label">
                <span>{{ z.name }}</span
                ><b>{{ zoneObjects(table, z.id).length }}</b>
              </div>
              <div v-if="z.arrangement === 'stack'" class="pile-actions">
                <button
                  :disabled="!canEdit || !zoneObjects(table, z.id).length"
                  :aria-label="`Draw from ${z.name}`"
                  @click="takeFromPile(z.id)"
                >
                  Draw</button
                ><button :aria-label="`Browse ${z.name}`" @click="browsePile(z.id)">Browse</button>
              </div>
            </div>
            <button
              v-for="o in visibleObjects"
              :key="o.id"
              class="play-piece"
              :class="{
                selected: selected.includes(o.id),
                locked: o.locked,
                covered: isCovered(table, o),
                dragging: dragging.includes(o.id),
              }"
              :style="{
                left: o.x + (dragging.includes(o.id) ? offset.x : 0) + 'px',
                top: o.y + (dragging.includes(o.id) ? offset.y : 0) + 'px',
                width: o.size.width + 'px',
                height: o.size.height + 'px',
                transform: `rotate(${o.rotation}deg)`,
                zIndex: dragging.includes(o.id) ? 10000 : o.locked ? 1 : o.index + 3,
              }"
              :aria-label="`${nameOf(o)}${o.locked ? ', locked' : ''}${isCovered(table, o) ? ', covered' : ''}`"
              :title="`${nameOf(o)} · Double-click to inspect`"
              @pointerdown="move($event, o.id)"
              @dblclick="
                selected = [o.id];
                inspect = true;
              "
            >
              <div v-if="o.flipped && !o.set!.backTemplateId" class="generic-card-back">
                <span>TABLELOOM</span>
              </div>
              <ComponentPreview v-else :doc="project" :set="o.set!" :row="o.row!" :back="o.flipped" /><span
                v-if="isCovered(table, o)"
                class="covered-badge"
                >Covered</span
              >
            </button>
          </div>
        </div>
      </div>
      <footer class="playtest-status">
        <span
          >Drag to move · Shift-click multi-select · F flip · R rotate · Delete discard · Enter inspect</span
        ><span>{{ objects.length }} pieces · {{ selected.length }} selected</span>
      </footer>
    </main>
    <PlaytestNotes v-if="showNotes" :selected="selected[0] ?? ''" />
    <aside v-else-if="showTools" class="playtest-inspector">
      <section class="inspector-section selection-panel">
        <div class="inline spread">
          <h3>{{ active ? nameOf(active) : 'Your table, your rules' }}</h3>
          <span v-if="active?.locked" class="tag">Locked</span>
        </div>
        <template v-if="active"
          ><button class="selected-piece-preview" aria-label="Inspect selected piece" @click="inspect = true">
            <div v-if="active.flipped && !active.set!.backTemplateId" class="generic-card-back">
              Face down
            </div>
            <ComponentPreview
              v-else
              :doc="project"
              :set="active.set!"
              :row="active.row!"
              :back="active.flipped"
            />
          </button>
          <p v-if="isCovered(table, active)" class="muted">Take the cards below this one to uncover it.</p>
          <p v-else-if="active.flipped" class="muted">Face down. Flip to reveal its identity.</p>
          <p v-else class="piece-rules">{{ active.row?.rules }}</p>
          <div class="piece-actions">
            <button class="button" :disabled="!canEdit || active.locked" @click="flip">Flip</button
            ><button class="button" :disabled="!canEdit || active.locked" @click="rotate">Rotate</button
            ><button
              class="button"
              :disabled="!canEdit || active.locked || isCovered(table, active)"
              @click="discard"
            >
              Discard</button
            ><button class="button" :disabled="!canEdit" @click="patch({ locked: !active.locked })">
              {{ active.locked ? 'Unlock' : 'Lock' }}
            </button>
          </div>
          <label
            >Move selected to<select
              aria-label="Move selected to area"
              :disabled="!canEdit || active.locked || isCovered(table, active)"
              @change="
                send(($event.target as HTMLSelectElement).value);
                ($event.target as HTMLSelectElement).value = '';
              "
            >
              <option value="">Choose an area…</option>
              <option v-for="z in table.zones" :key="z.id" :value="z.id">{{ z.name }}</option>
            </select></label
          >
          <details>
            <summary>Size & grouping</summary>
            <label
              >Width on table<input
                type="number"
                aria-label="Piece width on table"
                :value="Math.round(active.size.width)"
                min="10"
                max="1500"
                :disabled="!canEdit || active.locked"
                @change="
                  patch({
                    width: Math.max(
                      10,
                      Math.min(1500, Number(($event.target as HTMLInputElement).value) || 110),
                    ),
                  })
                " /></label
            ><button
              class="text-button"
              :disabled="!canEdit || selected.length < 2"
              @click="patch({ group: uid('group') })"
            >
              Group selected</button
            ><button class="text-button" :disabled="!canEdit || !active.group" @click="patch({ group: '' })">
              Ungroup
            </button>
          </details>
        </template>
        <p v-else class="muted">
          Select a piece to inspect it. Drop cards into player areas or the discard pile. Boards stay locked
          until you unlock them.
        </p>
      </section>
      <section class="inspector-section">
        <h3>Components & decks</h3>
        <input
          v-model="search"
          placeholder="Find a component…"
          aria-label="Search available components"
        /><select
          aria-label="Add piece to table"
          :disabled="!canEdit"
          @change="
            addPiece(($event.target as HTMLSelectElement).value);
            ($event.target as HTMLSelectElement).value = '';
          "
        >
          <option value="">Add a piece…</option>
          <optgroup v-for="s in project.sets" :key="s.id" :label="s.name">
            <option
              v-for="r in s.rows
                .filter((r) => String(r.name).toLowerCase().includes(search.toLowerCase()))
                .slice(0, 70)"
              :key="r.id"
              :value="JSON.stringify([s.id, r.id])"
            >
              {{ r.name }}
            </option>
          </optgroup>
        </select>
        <details>
          <summary>Draw pile · {{ table.deck.length }} pieces</summary>
          <label
            >Component set<select v-model="deckSetId" aria-label="Draw pile component set">
              <option v-for="s in project.sets" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select></label
          >
          <p class="muted">Make a fresh copy of this set.</p>
          <label>Shuffle seed<input v-model.number="seed" type="number" /></label
          ><button class="button full" :disabled="!canEdit" @click="loadDeck">Load & shuffle</button>
          <div class="inline">
            <input
              v-model.number="drawCount"
              type="number"
              min="1"
              max="30"
              class="tiny-input"
              aria-label="Draw count"
            /><button class="button primary" :disabled="!canEdit || !table.deck.length" @click="draw">
              Draw {{ drawCount }}
            </button>
          </div>
        </details>
        <div class="inline dice-controls">
          <button
            class="die-button"
            aria-label="Roll die"
            :disabled="!canEdit"
            @click="
              commit('Roll die', (p) => {
                p.table.dice = [1 + Math.floor(seededRandom(p.table.seed++)() * sides)];
              })
            "
          >
            {{ table.dice[0] ?? 1 }}</button
          ><select v-model.number="sides" aria-label="Dice sides">
            <option v-for="n in [4, 6, 8, 10, 12, 20]" :key="n" :value="n">d{{ n }}</option></select
          ><span class="muted">Click to roll</span>
        </div>
      </section>
      <section class="inspector-section">
        <h3>Saved table setups</h3>
        <select
          aria-label="Load saved setup"
          :disabled="!canEdit"
          @change="
            loadSetup(($event.target as HTMLSelectElement).value);
            ($event.target as HTMLSelectElement).value = '';
          "
        >
          <option value="">Load a setup…</option>
          <option v-for="s in project.setups" :key="s.id" :value="s.id">{{ s.name }}</option></select
        ><small class="muted">Loading replaces the table. Undo restores your last position.</small>
        <div class="inline">
          <input v-model="setupName" aria-label="Setup name" /><button
            class="icon-button"
            aria-label="Save setup"
            :disabled="!canEdit"
            @click="saveSetup"
          >
            <Icon name="Save" />
          </button>
        </div>
      </section>
      <section v-if="table.log?.length" class="inspector-section">
        <h3>Table log</h3>
        <p v-for="(entry, i) in table.log.slice(-8).reverse()" :key="i" class="table-log-entry">
          {{ entry }}
        </p>
      </section>
    </aside>
    <Modal v-if="inspect && active" :title="nameOf(active)" @close="inspect = false"
      ><div class="inspect-piece">
        <div v-if="active.flipped && !active.set!.backTemplateId" class="generic-card-back">Face down</div>
        <ComponentPreview
          v-else
          :doc="project"
          :set="active.set!"
          :row="active.row!"
          :back="active.flipped"
        />
      </div>
      <p v-if="!active.flipped">{{ active.row?.rules }}</p>
      <p v-if="!active.flipped && active.row?.costText" class="muted">Cost: {{ active.row.costText }}</p>
      <template #footer
        ><button class="button" :disabled="!canEdit || active.locked" @click="flip">
          {{ active.flipped ? 'Reveal on table' : 'Turn face down' }}</button
        ><button class="button primary" @click="inspect = false">Back to table</button></template
      ></Modal
    >
    <Modal
      v-if="browsing && activeZone"
      :title="`${activeZone.name} · ${pileContents.length} pieces`"
      wide
      @close="browsing = ''"
      ><div class="inline">
        <label class="inline"
          ><input v-model="revealPile" type="checkbox" />Reveal face-down pieces for browsing</label
        ><button
          class="button"
          :disabled="!canEdit"
          @click="commit('Shuffle pile', (p) => shuffleZone(p, browsing, p.table.seed++))"
        >
          Shuffle pile
        </button>
      </div>
      <p v-if="!pileContents.length" class="muted">Drop pieces in this area to start a pile.</p>
      <div class="pile-browser">
        <article v-for="o in pileContents" :key="o.id">
          <div v-if="o.flipped && !revealPile && !o.set!.backTemplateId" class="generic-card-back">
            Face down
          </div>
          <ComponentPreview
            v-else
            :doc="project"
            :set="o.set!"
            :row="o.row!"
            :back="o.flipped && !revealPile"
          /><strong>{{ o.flipped && !revealPile ? 'Face-down piece' : o.row?.name }}</strong
          ><button class="button" :disabled="!canEdit" @click="retrieve(o.id)">Take to table</button>
        </article>
      </div></Modal
    >
    <Modal v-if="showRules" title="How to play at this table" wide @close="showRules = false"
      ><p class="manual-mode-note">
        Manual playtest · Tableloom moves and reveals pieces. Players resolve costs, effects, battles and
        victory conditions.
      </p>
      <article v-for="section in project.rulebook" :key="section.id" class="table-rule-section">
        <h3>{{ section.title }}</h3>
        <p>{{ section.text }}</p>
      </article>
      <article class="table-rule-section">
        <h3>Table controls</h3>
        <p>
          Drag pieces to move them. Drop cards into named areas to arrange them, or into a pile to stack them.
          Browse a pile to recover a discard or choose a token. Double-click to inspect. Use counters and Pass
          turn to track the game. Save a setup to keep an exact position. Undo and redo also work on table
          actions.
        </p>
      </article></Modal
    >
    <Modal v-if="showSettings" title="Set up your table" wide @close="showSettings = false">
      <div class="form-grid">
        <label
          >Table width<input
            type="number"
            :value="width"
            :disabled="!canEdit"
            @change="
              commit(
                'Resize table',
                (p) =>
                  (p.table.width = Math.max(
                    600,
                    Math.min(10000, Number(($event.target as HTMLInputElement).value) || 1400),
                  )),
              );
              nextTick(fit);
            " /></label
        ><label
          >Table height<input
            type="number"
            :value="height"
            :disabled="!canEdit"
            @change="
              commit(
                'Resize table',
                (p) =>
                  (p.table.height = Math.max(
                    400,
                    Math.min(10000, Number(($event.target as HTMLInputElement).value) || 1000),
                  )),
              );
              nextTick(fit);
            "
        /></label>
      </div>
      <h3>Areas & piles</h3>
      <div class="inline">
        <input v-model="zoneName" aria-label="New area name" /><select
          v-model="zoneKind"
          aria-label="New area kind"
        >
          <option value="area">Player area</option>
          <option value="pile">Face-down pile</option>
          <option value="discard">Discard pile</option></select
        ><select v-model="zoneArrangement" aria-label="New area arrangement">
          <option value="fan">Fan</option>
          <option value="stack">Stack</option>
          <option value="free">Free placement</option></select
        ><button class="button" :disabled="!canEdit" @click="addZone">Add area</button>
      </div>
      <div v-for="z in table.zones" :key="z.id" class="zone-editor">
        <strong>{{ z.name }}</strong
        ><label v-for="key in ['x', 'y', 'width', 'height'] as const" :key="key"
          >{{ key
          }}<input
            type="number"
            :value="z[key]"
            :disabled="!canEdit"
            @change="editZone(z.id, key, Number(($event.target as HTMLInputElement).value))" /></label
        ><button
          class="icon-button"
          :aria-label="`Remove ${z.name} area`"
          :disabled="!canEdit"
          @click="
            commit('Remove table area', (p) => {
              p.table.zones = p.table.zones?.filter((x) => x.id !== z.id);
              for (const o of p.table.objects) if (o.zoneId === z.id) delete o.zoneId;
            })
          "
        >
          <Icon name="X" :size="14" />
        </button>
      </div>
      <h3>Counters</h3>
      <div class="inline">
        <input v-model="counterName" aria-label="New counter name" /><button
          class="button"
          :disabled="!canEdit"
          @click="
            commit('Add counter', (p) => {
              p.table.counters ??= [];
              p.table.counters.push({
                id: uid('counter'),
                name: counterName || 'Score',
                value: 0,
                min: 0,
                max: 999,
                color: '#82966b',
              });
            })
          "
        >
          Add counter
        </button>
      </div>
    </Modal>
  </div>
</template>
