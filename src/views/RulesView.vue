<script setup lang="ts">
import { ref, computed } from 'vue';
import Icon from '../components/Icon.vue';
import ComponentPreview from '../components/ComponentPreview.vue';
import { project, commit, notify, reportError } from '../store';
import { uid, documentState, stableStringify, hashString } from '../core/model';
import { expandText } from '../core/rules';
import { xml, renderComponent, fontCSS } from '../core/layout';
import { saveBytes } from '../persistence';
const selected = ref(project.value.rulebook[0]?.id ?? '');
const section = computed(() => project.value.rulebook.find((s) => s.id === selected.value));
function add() {
  const id = uid('section');
  commit('Add rules section', (p) =>
    p.rulebook.push({ id, title: 'New section', text: 'Write your rules here.', componentIds: [] }),
  );
  selected.value = id;
}
function update(key: 'title' | 'text', event: Event) {
  commit('Edit rulebook', (p) => {
    p.rulebook.find((s) => s.id === selected.value)![key] = (event.target as HTMLInputElement).value;
  });
}
function illustrations(ids: string[]) {
  return project.value.sets.flatMap((set) =>
    set.rows.filter((row) => ids.includes(row.id)).map((row) => ({ set, row })),
  );
}
async function exportRules() {
  try {
    const body = project.value.rulebook
      .map(
        (s) =>
          `<section><h2>${xml(s.title)}</h2><p>${rich(s.text)}</p><div class="illustrations">${illustrations(
            s.componentIds,
          )
            .map(
              ({ set, row }) =>
                '<figure>' +
                renderComponent(project.value, set, row, { embedFonts: false }) +
                '<figcaption>' +
                xml(row.name) +
                '</figcaption></figure>',
            )
            .join('')}</div></section>`,
      )
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCSS()}@page{size:A4;margin:18mm}body{font-family:'Source Sans 3';color:#292c27;font-size:11pt;line-height:1.5}h1,h2{font-family:Alegreya}h1{font-size:32pt}h2{font-size:20pt}section{break-inside:avoid}.illustrations{display:flex;gap:8mm;flex-wrap:wrap}figure{margin:0}figcaption{font-size:9pt;color:#666}.illustrations svg{max-width:50mm;max-height:75mm}small{color:#777}</style></head><body><h1>${xml(project.value.name)}</h1><small>Rules · ${new Date().toLocaleDateString()} · revision ${hashString(stableStringify(documentState(project.value)))}</small>${body}</body></html>`;
    if (window.tableloom) await window.tableloom.exportPdf(html, project.value.name + '-rules.pdf', 210, 297);
    else await saveBytes(new TextEncoder().encode(html), project.value.name + '-rules.html');
    notify('Rulebook exported');
  } catch (e) {
    reportError(e);
  }
}
function rich(text: string) {
  return xml(expandText(text, { id: 'rules' }, project.value))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[ref:([^\]]+)\]/g, (_, id) => {
      const s = project.value.rulebook.find((s) => s.id === id);
      return s ? 'See ' + xml(s.title) : '[missing reference]';
    })
    .replaceAll('\n', '<br/>');
}
</script>
<template>
  <div class="rules-layout">
    <aside class="rules-nav">
      <div class="inline spread">
        <h3>Rulebook</h3>
        <button class="icon-button" title="Add section" @click="add"><Icon name="Plus" /></button>
      </div>
      <button
        v-for="(s, i) in project.rulebook"
        :key="s.id"
        :class="['nav-button', { active: selected === s.id }]"
        @click="selected = s.id"
      >
        <small>{{ String(i + 1).padStart(2, '0') }}</small
        >{{ s.title }}</button
      ><button class="button full top-gap" @click="exportRules">
        <Icon name="FileDown" />Export rulebook
      </button>
    </aside>
    <main class="rules-editor">
      <template v-if="section"
        ><div class="eyebrow">LINKED TO YOUR GAME</div>
        <small class="mono muted">Section ID: {{ section.id }}</small
        ><input
          class="rules-title"
          :value="section.title"
          aria-label="Section title"
          @change="update('title', $event)"
        /><textarea
          class="rules-text"
          :value="section.text"
          aria-label="Rules text"
          @change="update('text', $event)"
        ></textarea>
        <p class="muted">
          Use **bold**, *italic*, [term:harvest], or [ref:section-id] for linked references.
        </p>
        <div class="rule-illustrations">
          <div v-for="item in illustrations(section.componentIds)" :key="item.row.id">
            <ComponentPreview :doc="project" :set="item.set" :row="item.row" /><small>{{
              item.row.name
            }}</small>
          </div>
        </div>
        <label
          >Add a linked illustration<select
            @change="
              commit('Link component illustration', (p) => {
                const ids = p.rulebook.find((s) => s.id === section!.id)!.componentIds;
                const id = ($event.target as HTMLSelectElement).value;
                if (id && !ids.includes(id)) ids.push(id);
              })
            "
          >
            <option value="">Choose a component…</option>
            <optgroup v-for="set in project.sets" :key="set.id" :label="set.name">
              <option v-for="row in set.rows" :key="row.id" :value="row.id">{{ row.name }}</option>
            </optgroup>
          </select></label
        >
        <p class="muted">Illustrations update with the component’s layout and data.</p></template
      >
      <div v-else class="empty-state">
        <Icon name="BookOpen" :size="36" />
        <h2>The rules of your world.</h2>
        <button class="button primary" @click="add">Write the first section</button>
      </div>
    </main>
  </div>
</template>
