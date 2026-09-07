<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let previous: Element | null = null;
onMounted(() => {
  previous = document.activeElement;
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  (previous as HTMLElement)?.focus?.();
});
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      :class="['modal', { wide }]"
      @cancel.prevent="emit('close')"
      @click="
        (e) => {
          if (e.target === dialog) emit('close');
        }
      "
    >
      <header>
        <h2>{{ title }}</h2>
        <button class="icon-button" aria-label="Close dialog" @click="emit('close')">
          <Icon name="X" />
        </button>
      </header>
      <div class="modal-body"><slot /></div>
      <footer v-if="$slots.footer"><slot name="footer" /></footer></dialog
  ></Teleport>
</template>
