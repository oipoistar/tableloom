<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Value } from '../core/model';
import { clone, uid, textValue, validateDataValue } from '../core/model';
const props = defineProps<{ modelValue: Value[]; depth?: number }>();
const emit = defineEmits<{ 'update:modelValue': [Value[]] }>();
const newField = ref(''),
  expanded = ref(''),
  error = ref('');
const records = computed(() =>
  props.modelValue.map((v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : { value: v })),
);
const columns = computed(() => [...new Set(records.value.flatMap(Object.keys))].filter((k) => k !== 'id'));
function update(index: number, key: string, value: Value) {
  const rows = clone(records.value);
  rows[index]![key] = value;
  emit('update:modelValue', rows);
}
function change(index: number, key: string, event: Event) {
  const input = event.target as HTMLInputElement,
    old = records.value[index]?.[key];
  update(
    index,
    key,
    typeof old === 'number' ? Number(input.value) : typeof old === 'boolean' ? input.checked : input.value,
  );
}
function changeObject(index: number, key: string, event: Event) {
  try {
    const value = validateDataValue(JSON.parse((event.target as HTMLTextAreaElement).value));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Enter a JSON object');
    update(index, key, value);
    error.value = '';
  } catch (e) {
    error.value = 'Invalid child data: ' + (e as Error).message;
  }
}
function addField() {
  const key = newField.value.trim();
  if (!/^[a-zA-Z][\w]*$/.test(key) || ['id', 'constructor', 'prototype', '__proto__'].includes(key)) return;
  emit(
    'update:modelValue',
    records.value.map((row) => ({ ...clone(row), [key]: '' })),
  );
  newField.value = '';
}
function add() {
  emit('update:modelValue', [
    ...clone(records.value),
    Object.fromEntries([
      ['id', uid('child')],
      ...columns.value.map((k) => [k, k === 'value' ? 0 : '']),
    ]) as Value,
  ]);
}
</script>
<template>
  <div class="structured-editor">
    <p v-if="error" role="alert" class="error-text">{{ error }}</p>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Child ID</th>
            <th v-for="key in columns" :key="key">{{ key }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, index) in records" :key="String(row.id ?? index)"
            ><tr>
              <td class="mono">
                <small>{{ String(row.id ?? 'assigned on save').slice(-12) }}</small>
              </td>
              <td v-for="key in columns" :key="key">
                <button
                  v-if="Array.isArray(row[key])"
                  class="list-cell"
                  @click="expanded = expanded === index + '/' + key ? '' : index + '/' + key"
                >
                  {{ (row[key] as Value[]).length }} children</button
                ><textarea
                  v-else-if="row[key] && typeof row[key] === 'object'"
                  :value="textValue(row[key])"
                  aria-label="Nested object JSON"
                  @change="changeObject(index, key, $event)"
                ></textarea
                ><input
                  v-else-if="typeof row[key] === 'boolean'"
                  type="checkbox"
                  :checked="!!row[key]"
                  :aria-label="key"
                  @change="change(index, key, $event)"
                /><input
                  v-else
                  :type="typeof row[key] === 'number' ? 'number' : 'text'"
                  :value="row[key]"
                  :aria-label="`Child ${index + 1} ${key}`"
                  @change="change(index, key, $event)"
                />
              </td>
              <td>
                <button
                  class="text-button danger"
                  @click="
                    emit(
                      'update:modelValue',
                      modelValue.filter((_, i) => i !== index),
                    )
                  "
                >
                  Remove
                </button>
              </td>
            </tr>
            <tr v-if="expanded.startsWith(index + '/') && (depth ?? 0) < 8">
              <td :colspan="columns.length + 2">
                <StructuredEditor
                  :model-value="row[expanded.split('/')[1]!] as Value[]"
                  :depth="(depth ?? 0) + 1"
                  @update:model-value="update(index, expanded.split('/')[1]!, $event)"
                />
              </td></tr
          ></template>
        </tbody>
      </table>
    </div>
    <div class="inline top-gap">
      <button class="button" @click="add">Add child record</button
      ><input
        v-model="newField"
        placeholder="New child field"
        aria-label="New child field"
        @keydown.enter="addField"
      /><button class="button" :disabled="!records.length || !newField" @click="addField">Add field</button>
    </div>
  </div>
</template>
