<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';
import AddSetDialog from './AddSetDialog.vue';
import {
  project,
  settingsTab,
  currentSet,
  selectSet,
  view,
  inspectorTab,
  elementId,
  side,
  currentTemplate,
} from '../store';
import { totalCopies } from '../core/model';
const adding = ref(false);
const kindIcon: Record<string, string> = {
  card: 'Copy',
  token: 'Circle',
  hex: 'Hexagon',
  tile: 'Square',
  board: 'Grid3X3',
  aid: 'FileText',
  standee: 'Users',
  box: 'Package',
};
</script>
<template>
  <aside class="project-sidebar">
    <div class="sidebar-section">
      <div class="sidebar-heading">
        COMPONENTS<button class="icon-button small" title="Add component set" @click="adding = true">
          <Icon name="Plus" :size="14" />
        </button>
      </div>
      <button
        v-for="s in project.sets"
        :key="s.id"
        :class="['set-button', { active: currentSet?.id === s.id }]"
        @click="
          selectSet(s.id);
          if (!['design', 'data', 'review', 'test', 'export'].includes(view)) view = 'design';
        "
      >
        <Icon :name="kindIcon[s.kind] ?? 'Layers'" /><span>{{ s.name }}</span
        ><small>{{ totalCopies(s) }}</small></button
      ><button class="text-button add-set" @click="adding = true">
        <Icon name="Plus" :size="14" />Add component set
      </button>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">TEMPLATES</div>
      <button
        v-for="t in project.templates.filter((t) =>
          project.sets.some((s) => s.templateId === t.id || s.backTemplateId === t.id),
        )"
        :key="t.id"
        :class="['template-button', { active: currentTemplate?.id === t.id && view === 'design' }]"
        @click="
          selectSet(project.sets.find((s) => s.templateId === t.id || s.backTemplateId === t.id)!.id);
          side = currentSet?.backTemplateId === t.id ? 'back' : 'front';
          view = 'design';
        "
      >
        <span>{{ t.name }}</span
        ><small>{{ t.width }} × {{ t.height }}</small>
      </button>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">SHARED STYLES</div>
      <button
        v-for="(s, key) in project.styles"
        :key="key"
        class="style-button"
        @click="
          settingsTab = 'styles';
          view = 'settings';
        "
      >
        <span class="style-dot" :style="{ background: s.color }"></span>{{ key }}
      </button>
      <div class="sidebar-heading top-gap">SYMBOLS</div>
      <div class="symbols-row">
        <button
          v-for="s in project.symbols"
          :key="s.id"
          :title="s.name"
          @click="
            settingsTab = 'symbols';
            view = 'settings';
          "
        >
          <svg viewBox="0 0 24 24"><path :d="s.path" :fill="s.color" /></svg>
        </button>
      </div>
    </div>
    <div class="sidebar-section secondary-nav">
      <button class="nav-button" :class="{ active: view === 'library' }" @click="view = 'library'">
        <Icon name="Library" />Resource library</button
      ><button class="nav-button" :class="{ active: view === 'rules' }" @click="view = 'rules'">
        <Icon name="BookOpen" />Rulebook</button
      ><button
        class="nav-button"
        :class="{ active: inspectorTab === 'history' && view === 'design' }"
        @click="
          view = 'design';
          inspectorTab = 'history';
        "
      >
        <Icon name="GitBranch" />Versions & experiments</button
      ><button class="nav-button" :class="{ active: view === 'settings' }" @click="view = 'settings'">
        <Icon name="Settings" />Project settings
      </button>
    </div>
    <div class="first-session">
      <div class="inline spread">
        <strong>Your first prototype</strong><small>{{ project.tasks.length }} / 3</small>
      </div>
      <div class="progress-track">
        <span :style="{ width: `${Math.min(100, (project.tasks.length / 3) * 100)}%` }"></span>
      </div>
      <div
        v-for="(task, i) in ['Open a starter', 'Bind a field to a layout', 'Export a test version']"
        :key="task"
        class="onboarding-step"
      >
        <Icon
          :name="project.tasks.includes(['starter', 'binding', 'export'][i]!) ? 'CheckCircle2' : 'Circle'"
          :size="13"
        />{{ task }}
      </div>
    </div>
    <AddSetDialog v-if="adding" @close="adding = false" />
  </aside>
</template>
