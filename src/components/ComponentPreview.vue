<script setup lang="ts">
import { computed } from 'vue';
import type { DocumentState, ComponentSet, Row } from '../core/model';
import { renderComponent } from '../core/layout';
const props = defineProps<{
  doc: DocumentState;
  set: ComponentSet;
  row: Row;
  back?: boolean;
  guides?: boolean;
  locale?: string;
}>();
const svg = computed(() => {
  try {
    return renderComponent(props.doc, props.set, props.row, {
      back: props.back,
      guides: props.guides,
      locale: props.locale,
    });
  } catch {
    return '';
  }
});
</script>
<template><div class="component-preview" v-html="svg"></div></template>
