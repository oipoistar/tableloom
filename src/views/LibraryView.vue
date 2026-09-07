<script setup lang="ts">
import { ref, shallowRef, computed } from 'vue';
import Icon from '../components/Icon.vue';
import { project, commit, notify, reportError } from '../store';
import {
  builtinPackages,
  packagePreview,
  installPackage,
  bundleFiles,
  namespacedPackage,
} from '../core/packages';
import type { ResourcePackage } from '../core/model';
import { renderComponent } from '../core/layout';
import { clone } from '../core/model';
import { chooseFile, saveBytes } from '../persistence';
const packages = shallowRef(builtinPackages());
const search = ref('');
const selected = shallowRef<ResourcePackage>();
const filtered = computed(() =>
  packages.value.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const preview = computed(() => (selected.value ? packagePreview(project.value, selected.value) : null));
async function importPack() {
  try {
    const file = await chooseFile('.json');
    if (!file) return;
    const pack = JSON.parse(await file.text()) as ResourcePackage;
    packagePreview(project.value, pack);
    packages.value.push(pack);
    selected.value = pack;
  } catch (e) {
    reportError(e);
  }
}
async function exportPack() {
  const p: ResourcePackage = {
    id: `community.${project.value.id}`,
    name: project.value.name + ' resources',
    version: '1.0.0',
    license: 'CC-BY-4.0',
    description: project.value.description,
    minAppVersion: '0.1.0',
    dependencies: [],
    assets: clone(project.value.assets),
    styles: clone(project.value.styles),
    terms: clone(project.value.terms),
    templates: clone(project.value.templates),
    blocks: clone(project.value.blocks),
    symbols: clone(project.value.symbols),
    profiles: clone(project.value.profiles),
    fields: clone(project.value.sets[0]?.fields ?? []),
    sampleRows: clone(project.value.sets[0]?.rows.slice(0, 3) ?? []),
  };
  await saveBytes(
    new TextEncoder().encode(JSON.stringify(p, null, 2)),
    project.value.name + '-resources.json',
  );
}
const contentPreview = computed(() => {
  if (!selected.value) return '';
  try {
    const pack = namespacedPackage(selected.value);
    const doc = clone(project.value);
    installPackage(doc, selected.value);
    const template = pack.templates[0];
    if (!template) return '';
    const set = {
      id: 'package-preview',
      name: pack.name,
      kind: 'card' as const,
      templateId: template.id,
      fields: pack.fields,
      rows: pack.sampleRows,
      overrides: {},
    };
    return renderComponent(
      doc,
      set,
      project.value.sets[0]?.rows[0] ?? pack.sampleRows[0] ?? { id: 'preview', name: 'Your component' },
    );
  } catch {
    return '';
  }
});
function useTemplate(id: string) {
  if (!selected.value) return;
  const pack = namespacedPackage(selected.value);
  commit('Use resource template', (p) => {
    installPackage(p, selected.value!);
    const set = p.sets[0];
    if (set) {
      set.templateId = pack.id + ':' + id;
      const front = pack.templates.find((t) => t.id === set.templateId);
      const back = pack.templates.find(
        (t) => t.name.toLowerCase().includes('back') && t.width === front?.width && t.height === front.height,
      );
      if (back && back.id !== front?.id) set.backTemplateId = back.id;
    }
  });
  notify('Template applied to the first component set');
}
</script>
<template>
  <div class="library-layout">
    <main class="library-main">
      <div class="view-heading">
        <div>
          <div class="eyebrow">GOOD IDEAS ARE MEANT TO GROW</div>
          <h1>The resource shelf</h1>
          <p>Reusable pieces for the game you have in mind.</p>
        </div>
        <button class="button" @click="importPack"><Icon name="Upload" />Import package</button>
      </div>
      <div class="inline spread">
        <div class="search-field">
          <Icon name="Search" /><input
            v-model="search"
            placeholder="Try tiles, tokens, or actions…"
            aria-label="Find resources"
          />
        </div>
        <button class="text-button" @click="exportPack">
          <Icon name="Package" />Export this project’s resources
        </button>
      </div>
      <div class="library-grid">
        <button
          v-for="(p, i) in filtered"
          :key="p.id"
          :class="['resource-card', { selected: selected?.id === p.id }]"
          @click="selected = p"
        >
          <div
            class="resource-art"
            :style="{ background: ['#e0e7d7', '#eee1ca', '#dce6dc', '#e4e0ec', '#ece3c9', '#d9e5e7'][i % 6] }"
          >
            <Icon
              :name="
                p.blocks.length
                  ? 'Workflow'
                  : p.name.includes('Treasury')
                    ? 'Circle'
                    : p.name.includes('Wander')
                      ? 'Hexagon'
                      : 'Layers'
              "
              :size="52"
            />
          </div>
          <div>
            <span class="eyebrow">TABLELOOM ORIGINALS</span>
            <h3>{{ p.name }}</h3>
            <p>{{ p.description }}</p>
            <div class="inline spread">
              <span class="tag">{{ p.license }}</span
              ><small>v{{ p.version }}</small>
            </div>
          </div>
        </button>
      </div>
    </main>
    <aside class="library-detail">
      <template v-if="selected && preview"
        ><div class="eyebrow">RESOURCE PACKAGE</div>
        <h2>{{ selected.name }}</h2>
        <div v-if="contentPreview" class="data-mini-preview" v-html="contentPreview"></div>
        <small class="muted">Preview with the first component’s content</small>
        <p class="muted">{{ selected.description }}</p>
        <div class="context-stat">
          <span>Templates</span><strong>{{ preview.templates }}</strong>
        </div>
        <div class="context-stat">
          <span>Reusable blocks</span><strong>{{ preview.blocks }}</strong>
        </div>
        <div class="context-stat">
          <span>Symbols</span><strong>{{ preview.symbols }}</strong>
        </div>
        <div class="context-stat">
          <span>License</span><strong>{{ selected.license }}</strong>
        </div>
        <div class="context-stat">
          <span>Version</span><strong>{{ selected.version }}</strong>
        </div>
        <p v-if="preview.installed" class="info-box">
          Version {{ preview.installed }} is pinned in this project. Updates preserve locally modified
          resources.
        </p>
        <button
          class="button primary full"
          @click="
            commit('Install resource package', (p) => installPackage(p, selected!)) &&
            notify('Resources added to this project')
          "
        >
          <Icon name="Plus" />{{ preview.installed ? 'Apply package update' : 'Add to project' }}
        </button>
        <h3 class="top-gap">Included templates</h3>
        <div v-for="t in selected.templates" :key="t.id" class="snapshot-item">
          <strong>{{ t.name }}</strong
          ><small>{{ t.width }} × {{ t.height }} mm · {{ t.elements.length }} elements</small
          ><button class="text-button" @click="useTemplate(t.id)">Use with first set</button>
        </div></template
      >
      <div v-else class="empty-state small">
        <Icon name="Package" :size="36" />
        <h3>Find your next building block.</h3>
        <p>Select a package to see what’s inside.</p>
      </div>
    </aside>
  </div>
</template>
