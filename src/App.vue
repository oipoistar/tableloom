<script setup lang="ts">
import { connectionState, connectionRole } from './collaboration-client';
import { onMounted, onBeforeUnmount, ref } from 'vue';
import Icon from './components/Icon.vue';
import ProjectSidebar from './components/ProjectSidebar.vue';
import DesignCanvas from './components/DesignCanvas.vue';
import Inspector from './components/Inspector.vue';
import HomeView from './views/HomeView.vue';
import DataView from './views/DataView.vue';
import ReviewView from './views/ReviewView.vue';
import TestView from './views/TestView.vue';
import ExportView from './views/ExportView.vue';
import LibraryView from './views/LibraryView.vue';
import RulesView from './views/RulesView.vue';
import SettingsView from './views/SettingsView.vue';
import UpdateNotice from './components/UpdateNotice.vue';
import {
  project,
  view,
  newProjectDialog,
  issues,
  currentSet,
  currentRow,
  currentElement,
  elementId,
  saveState,
  toast,
  error,
  initialize,
  saveProjectFile,
  importProject,
  undo,
  redo,
  undoStack,
  redoStack,
  editElement,
  deleteElement,
  locale,
  flushSave,
  uiScale,
} from './store';
const loading = ref(true);
const tabs = [
  { id: 'design', label: 'Design' },
  { id: 'data', label: 'Data' },
  { id: 'review', label: 'Review' },
  { id: 'test', label: 'Test' },
  { id: 'export', label: 'Export' },
] as const;
function key(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const editable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveProjectFile();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    flushSave().then(() => {
      view.value = 'home';
      newProjectDialog.value = true;
    });
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    importProject();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editable) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if (!editable && view.value === 'design' && currentElement.value) {
    const step = e.shiftKey ? 5 : 0.5;
    const changes: Record<string, { x?: number; y?: number }> = {
      ArrowLeft: { x: currentElement.value.x - step },
      ArrowRight: { x: currentElement.value.x + step },
      ArrowUp: { y: currentElement.value.y - step },
      ArrowDown: { y: currentElement.value.y + step },
    };
    if (changes[e.key]) {
      e.preventDefault();
      editElement(changes[e.key]!);
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      deleteElement();
    }
  }
}
onMounted(async () => {
  document.documentElement.style.fontSize = `${(uiScale.value / 100) * 14}px`;
  await initialize();
  loading.value = false;
  window.addEventListener('keydown', key);
});
onBeforeUnmount(() => window.removeEventListener('keydown', key));
</script>
<template>
  <div v-if="loading" class="loading-screen">
    <span class="brand-mark"><i></i><i></i><i></i></span>
    <h2>Opening your workshop…</h2>
  </div>
  <template v-else
    ><HomeView v-if="view === 'home'" />
    <div v-else class="studio-layout">
      <header class="app-header">
        <button class="home-logo" title="Go to Tableloom home" aria-label="Home" @click="view = 'home'">
          <span class="brand-mark small"><i></i><i></i><i></i></span>
        </button>
        <div class="project-heading">
          <strong>{{ project.name }}</strong
          ><span>{{
            saveState === 'saving'
              ? 'Saving…'
              : saveState === 'error'
                ? 'Save needs attention'
                : 'All changes saved locally'
          }}</span>
        </div>
        <nav class="view-tabs" aria-label="Working views">
          <button v-for="t in tabs" :key="t.id" :class="{ active: view === t.id }" @click="view = t.id">
            {{ t.label
            }}<span v-if="t.id === 'review' && issues.length" class="badge">{{ issues.length }}</span>
          </button>
        </nav>
        <div class="header-actions">
          <select
            v-if="project.locales.length > 1"
            v-model="locale"
            aria-label="Preview language"
            class="compact"
          >
            <option v-for="l in project.locales" :key="l">{{ l }}</option></select
          ><span class="local-status"
            ><span class="status-dot"></span
            >{{ connectionState === 'connected' ? 'Shared · ' + connectionRole : 'Local workspace' }}</span
          ><button class="button" title="Save portable project (Ctrl S)" @click="saveProjectFile">
            <Icon name="Save" /><span>Save</span></button
          ><button class="button primary" @click="view = 'export'"><Icon name="Printer" />Print…</button>
        </div>
      </header>
      <div class="studio-body" :class="{ 'table-focused': view === 'test' }">
        <ProjectSidebar v-if="view !== 'test'" />
        <div class="view-container">
          <div v-if="view === 'design'" class="design-layout"><DesignCanvas /><Inspector /></div>
          <DataView v-else-if="view === 'data'" /><ReviewView v-else-if="view === 'review'" /><TestView
            v-else-if="view === 'test'"
          /><ExportView v-else-if="view === 'export'" /><LibraryView
            v-else-if="view === 'library'"
          /><RulesView v-else-if="view === 'rules'" /><SettingsView v-else-if="view === 'settings'" />
        </div>
      </div>
      <footer class="status-bar">
        <span
          >{{ currentSet?.name ?? 'Project' }}<span v-if="currentRow"> · {{ currentRow.name }}</span></span
        ><span class="status-center">{{ project.name }}.tableloom · open project format</span>
        <div class="inline">
          <button :disabled="!undoStack.length" :title="undoStack.at(-1)?.label ?? 'Undo'" @click="undo">
            <Icon name="Undo2" :size="13" />Undo {{ undoStack.length || '' }}</button
          ><button :disabled="!redoStack.length" title="Redo" @click="redo">
            <Icon name="Redo2" :size="13" /></button
          ><span
            class="status-dot"
            :class="{ amber: saveState === 'saving', red: saveState === 'error' }"
          ></span
          >{{ saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Save failed' }}
        </div>
      </footer>
    </div>
    <UpdateNotice />
    <Transition name="toast"
      ><div v-if="toast" class="toast-message" role="status" aria-live="polite">
        <Icon :name="toast === error ? 'AlertTriangle' : 'CheckCircle2'" /><span>{{ toast }}</span
        ><button class="icon-button small" aria-label="Dismiss notification" @click="toast = ''">
          <Icon name="X" :size="14" />
        </button></div></Transition
  ></template>
</template>
