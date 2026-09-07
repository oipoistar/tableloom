<script setup lang="ts">
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import { project, currentSet, commit, addSnapshot } from '../store';
import { uid } from '../core/model';
import { missingCombinations } from '../core/generators';
import { statistics, drawProbability, feedbackSummary } from '../core/revision';
const props = defineProps<{ selected: string }>();
const objects = computed(() =>
  project.value.table.objects.map((o) => ({
    ...o,
    row: project.value.sets.find((s) => s.id === o.setId)?.rows.find((r) => r.id === o.rowId),
  })),
);
const metric = ref('');
const metricValue = ref<number>();
const feedback = computed(() => feedbackSummary(project.value.notes));
const note = ref('');
const category = ref('balance');
const session = ref('Session 1');
const matchType = ref('Building');
const probabilityDraws = ref(5);
const stats = computed(() => (currentSet.value ? statistics(currentSet.value) : null));
const probability = computed(() => {
  try {
    return stats.value
      ? drawProbability(
          stats.value.total,
          stats.value.types[matchType.value] ?? 0,
          Math.min(probabilityDraws.value, stats.value.total),
        ) * 100
      : 0;
  } catch {
    return 0;
  }
});
function saveNote() {
  if (!note.value.trim()) return;
  const object = objects.value.find((o) => o.id === props.selected);
  commit('Add playtest note', (p) =>
    p.notes.push({
      id: uid('note'),
      target: object?.rowId ?? currentSet.value?.id ?? 'game',
      session: session.value,
      category: category.value,
      text: note.value,
      resolved: false,
      metric: metric.value || undefined,
      value: metric.value && Number.isFinite(metricValue.value) ? metricValue.value : undefined,
      createdAt: new Date().toISOString(),
    }),
  );
  note.value = '';
}
</script>
<template>
  <aside class="test-notes">
    <section class="inspector-section">
      <div class="inline spread">
        <h3>Playtest release</h3>
        <Icon name="Package" />
      </div>
      <p class="muted">Freeze the exact version your group is testing.</p>
      <button
        class="button full"
        @click="addSnapshot(`Playtest ${new Date().toLocaleDateString()}`, 'release')"
      >
        Freeze this version
      </button>
    </section>
    <section class="inspector-section">
      <div class="inline spread">
        <h3>Observations</h3>
        <span class="count">{{ project.notes.filter((n) => !n.resolved).length }} open</span>
      </div>
      <label>Session<input v-model="session" /></label
      ><small class="muted"
        >On {{ objects.find((o) => o.id === selected)?.row?.name ?? currentSet?.name ?? 'this game' }}</small
      ><textarea
        v-model="note"
        rows="3"
        placeholder="What happened at the table?"
        aria-label="Playtest observation"
        @keydown.ctrl.enter="saveNote"
      ></textarea>
      <details>
        <summary>Record a numeric outcome</summary>
        <div class="form-grid">
          <label>Metric<input v-model="metric" placeholder="Turns to win" /></label
          ><label>Value<input v-model.number="metricValue" type="number" /></label>
        </div>
      </details>
      <div class="inline">
        <select v-model="category" aria-label="Observation category">
          <option>balance</option>
          <option>clarity</option>
          <option>fun</option>
          <option>pacing</option></select
        ><button class="button primary" :disabled="!note.trim()" @click="saveNote">Add note</button>
      </div>
      <article
        v-for="n in [...project.notes].reverse()"
        :key="n.id"
        :class="['playtest-note', { resolved: n.resolved }]"
      >
        <div class="inline spread">
          <span class="tag">{{ n.category }}</span
          ><button
            class="icon-button small"
            :title="n.resolved ? 'Reopen note' : 'Resolve note'"
            @click="
              commit('Resolve observation', (p) => {
                const target = p.notes.find((x) => x.id === n.id)!;
                target.resolved = !target.resolved;
              })
            "
          >
            <Icon :name="n.resolved ? 'CheckCircle2' : 'Circle'" :size="14" />
          </button>
        </div>
        <p>{{ n.text }}</p>
        <small
          >{{ n.session }} ·
          {{ project.sets.flatMap((s) => s.rows).find((r) => r.id === n.target)?.name ?? n.target }}</small
        ><label
          >Addressed in version<select
            :value="n.addressedIn ?? ''"
            @change="
              commit(
                'Link observation to revision',
                (p) =>
                  (p.notes.find((x) => x.id === n.id)!.addressedIn =
                    ($event.target as HTMLSelectElement).value || undefined),
              )
            "
          >
            <option value="">Not linked yet</option>
            <option v-for="s in project.snapshots" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select></label
        >
      </article>
    </section>
    <section class="inspector-section">
      <h3>Feedback across sessions</h3>
      <p
        v-for="g in feedback.observations.filter((g) => g.count > 1)"
        :key="g.category + g.target"
        class="muted"
      >
        {{ g.category }} · {{ g.count }} observations · {{ g.open }} open
      </p>
      <div v-for="m in feedback.metrics" :key="m.metric + m.session" class="context-stat">
        <span
          >{{ m.metric }}<small>{{ m.session }} · {{ m.values.length }} observations</small></span
        ><strong>{{ m.mean.toFixed(2) }}</strong>
      </div>
      <small v-if="feedback.metrics.length" class="muted"
        >Arithmetic means of recorded values; compare equivalent session conditions.</small
      >
    </section>
    <section v-if="stats" class="inspector-section">
      <h3>Deck statistics</h3>
      <p v-if="currentSet?.generator" class="muted">
        {{ missingCombinations(currentSet.generator, currentSet.rows).length }} missing generated
        combinations.
      </p>
      <p class="muted">{{ stats.total }} cards · average cost {{ stats.average.toFixed(1) }}</p>
      <div class="histogram">
        <div v-for="(count, cost) in stats.costs" :key="cost">
          <span>{{ count }}</span
          ><i
            :style="{ height: `${Math.max(5, (count / Math.max(...Object.values(stats.costs))) * 65)}px` }"
          ></i
          ><small>{{ cost }}</small>
        </div>
      </div>
      <small class="muted">Total resource cost</small>
      <div class="context-stat" v-for="(count, type) in stats.types" :key="type">
        <span>{{ type }}</span
        ><strong>{{ count }}</strong>
      </div>
      <label
        >Draw probability<select v-model="matchType">
          <option v-for="(_, type) in stats.types" :key="type">{{ type }}</option>
        </select></label
      ><label class="inline"
        >In a hand of<input
          v-model.number="probabilityDraws"
          type="number"
          min="0"
          :max="stats.total"
          class="tiny-input" /></label
      ><strong class="probability">{{ probability.toFixed(1) }}%</strong
      ><small class="muted"
        >At least one matching card, drawn without replacement from a shuffled full deck.</small
      >
      <p class="muted">
        {{ stats.duplicates.length }} groups share identical rules text. These counts describe the deck;
        balance still needs playtesting.
      </p>
    </section>
  </aside>
</template>
