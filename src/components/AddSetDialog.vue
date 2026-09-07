<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Kind } from '../core/model';
import { addSet } from '../store';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
const emit = defineEmits<{ close: [] }>();
const kind = ref<Kind>('card');
const name = ref('Action cards');
const width = ref(63);
const height = ref(88);
const step = ref(1);
const kinds: { id: Kind; name: string; icon: string; size: [number, number]; description: string }[] = [
  { id: 'card', name: 'Cards', icon: 'Copy', size: [63, 88], description: 'Decks, actions, encounters' },
  { id: 'token', name: 'Tokens', icon: 'Circle', size: [20, 20], description: 'Resources and counters' },
  { id: 'hex', name: 'Hex tiles', icon: 'Hexagon', size: [50, 44], description: 'Modular terrain and maps' },
  {
    id: 'tile',
    name: 'Square tiles',
    icon: 'Square',
    size: [50, 50],
    description: 'Rooms, puzzles and grids',
  },
  { id: 'board', name: 'Board', icon: 'Grid3X3', size: [297, 210], description: 'A shared playing surface' },
  {
    id: 'aid',
    name: 'Player aid',
    icon: 'FileText',
    size: [140, 100],
    description: 'Turn summaries and tableaux',
  },
  {
    id: 'standee',
    name: 'Standees',
    icon: 'Users',
    size: [25, 55],
    description: 'Characters with folding bases',
  },
  { id: 'box', name: 'Packaging', icon: 'Package', size: [260, 180], description: 'Cut and fold templates' },
];
const valid = computed(
  () =>
    name.value.trim() && width.value > 0 && height.value > 0 && width.value <= 5000 && height.value <= 5000,
);
function pick(k: (typeof kinds)[number]) {
  kind.value = k.id;
  name.value = k.name;
  width.value = k.size[0];
  height.value = k.size[1];
}
function finish() {
  if (valid.value) {
    addSet(name.value, kind.value, width.value, height.value);
    emit('close');
  }
}
</script>
<template>
  <Modal title="Add a component set" @close="emit('close')"
    ><p class="muted">Start with the physical piece. Layout and content come next.</p>
    <div class="step-indicator">
      <span :class="{ active: step === 1 }">1 · Kind</span><Icon name="ChevronRight" /><span
        :class="{ active: step === 2 }"
        >2 · Size & name</span
      >
    </div>
    <div v-if="step === 1" class="kind-grid">
      <button
        v-for="k in kinds"
        :key="k.id"
        :class="['kind-option', { selected: kind === k.id }]"
        @click="pick(k)"
      >
        <Icon :name="k.icon" :size="24" /><strong>{{ k.name }}</strong
        ><small>{{ k.description }}</small>
      </button>
    </div>
    <div v-else class="stack">
      <label>Set name<input v-model="name" autofocus /></label>
      <div class="form-grid">
        <label>Width · mm<input v-model.number="width" type="number" min="1" max="5000" /></label
        ><label>Height · mm<input v-model.number="height" type="number" min="1" max="5000" /></label>
      </div>
      <div class="size-preview">
        <div
          :style="{
            width: `${Math.min(180, (180 * width) / height)}px`,
            height: `${Math.min(180, (180 * height) / width)}px`,
            borderRadius: kind === 'token' ? '50%' : '6px',
            clipPath: kind === 'hex' ? 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)' : undefined,
          }"
        >
          {{ width }} × {{ height }} mm
        </div>
      </div>
      <p class="muted">
        Starts with a name field, rules text, and quantity. You can add fields and a paired back at any time.
      </p>
    </div>
    <template #footer
      ><button class="button" @click="step === 1 ? emit('close') : step--">
        {{ step === 1 ? 'Cancel' : 'Back' }}</button
      ><button v-if="step === 1" class="button primary" @click="step = 2">
        Next <Icon name="ArrowRight" /></button
      ><button v-else class="button primary" :disabled="!valid" @click="finish">
        Add & open on canvas
      </button></template
    ></Modal
  >
</template>
