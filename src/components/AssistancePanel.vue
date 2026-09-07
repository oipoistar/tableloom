<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import { project, commit, notify, reportError } from '../store';
import { suggestCleanup, providerSuggestions } from '../core/assistance';
import type { Suggestion } from '../core/assistance';
import { applyOperations } from '../core/automation';
const suggestions = shallowRef<Suggestion[]>([]);
const selected = shallowRef<Suggestion>();
const endpoint = ref('');
const token = ref('');
const busy = ref(false);
function local() {
  suggestions.value = suggestCleanup(project.value);
  if (!suggestions.value.length) notify('No text cleanup suggestions for this project.');
}
async function provider() {
  busy.value = true;
  try {
    suggestions.value = await providerSuggestions(endpoint.value, project.value, token.value);
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}
function apply() {
  if (!selected.value) return;
  const result = applyOperations(project.value, selected.value.operations);
  commit(selected.value.title, (p) => Object.assign(p, result));
  suggestions.value = suggestions.value.filter((s) => s.id !== selected.value!.id);
  selected.value = undefined;
  notify('Suggested changes applied. Undo is available.');
}
</script>
<template>
  <section class="settings-card">
    <div class="inline spread">
      <h3>Optional assistance</h3>
      <Icon name="Sparkles" />
    </div>
    <p class="muted">
      Find wording and formatting changes, inspect their effects, then choose what to apply.
    </p>
    <button class="button" @click="local"><Icon name="WandSparkles" />Check wording on this device</button>
    <details>
      <summary>Use a local or remote model provider</summary>
      <div class="stack top-gap">
        <label
          >Tableloom-compatible provider URL<input
            v-model="endpoint"
            placeholder="http://127.0.0.1:8080/suggestions" /></label
        ><label>Access token, if required<input v-model="token" type="password" autocomplete="off" /></label>
        <p class="info-box">
          This sends the project name, component fields and rows, shared terms, and variables to the URL
          above. Artwork and saved versions are excluded. Review the destination before requesting
          suggestions.
        </p>
        <button class="button" :disabled="busy || !endpoint" @click="provider">
          {{ busy ? 'Requesting suggestions…' : 'Send selected project data & request suggestions' }}
        </button>
      </div>
    </details>
    <button v-for="s in suggestions" :key="s.id" class="suggestion-card" @click="selected = s">
      <strong>{{ s.title }}</strong>
      <p>{{ s.reason }}</p>
      <span class="text-button"
        >Review {{ s.operations.length }} changes<Icon name="ArrowRight" :size="13"
      /></span>
    </button>
  </section>
  <Modal v-if="selected" :title="selected.title" wide @close="selected = undefined"
    ><p>{{ selected.reason }}</p>
    <pre class="import-preview">{{ JSON.stringify(selected.operations, null, 2) }}</pre>
    <template #footer
      ><button class="button" @click="selected = undefined">Cancel</button
      ><button class="button primary" @click="apply">
        Apply {{ selected.operations.length }} changes
      </button></template
    ></Modal
  >
</template>
