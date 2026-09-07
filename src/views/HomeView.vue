<script setup lang="ts">
import { ref, computed } from 'vue';
import Icon from '../components/Icon.vue';
import ComponentPreview from '../components/ComponentPreview.vue';
import Modal from '../components/Modal.vue';
import {
  projects,
  newProjectDialog as creating,
  project,
  openProject,
  newProject,
  importProject,
  view,
} from '../store';
import { starters } from '../core/starters';
import { totalCopies, APP_VERSION } from '../core/model';
const search = ref('');
const sort = ref('recent');
const name = ref('Untitled game');
const filtered = computed(() =>
  projects.value
    .filter((p) => p.name.toLowerCase().includes(search.value.toLowerCase()))
    .sort((a, b) =>
      sort.value === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt),
    ),
);
const recent = computed(() => projects.value[0]);
function create() {
  newProject(name.value);
  creating.value = false;
}
</script>
<template>
  <div class="home-layout">
    <aside class="home-rail">
      <div class="brand">
        <span class="brand-mark"><i></i><i></i><i></i></span>
        <div><strong>Tableloom</strong><small>Your tabletop workshop</small></div>
      </div>
      <button class="button primary full" @click="creating = true">
        <Icon name="Plus" />New project<span class="shortcut">Ctrl N</span></button
      ><button class="nav-button" @click="importProject">
        <Icon name="FolderOpen" />Open project<span class="shortcut">Ctrl O</span></button
      ><button class="nav-button active"><Icon name="Clock" />Recent projects</button
      ><a class="nav-button" href="#starters"><Icon name="Layers" />Starters<span class="count">6</span></a
      ><button class="nav-button" @click="view = 'library'"><Icon name="Library" />Resource library</button
      ><button class="nav-button" @click="view = 'settings'">
        <Icon name="Settings" />Preferences & help
      </button>
      <div class="ownership">
        <Icon name="FolderOpen" /><strong>Your files stay yours.</strong>
        <p>Create, save, and come back whenever you like. Your work lives on this device.</p>
        <span class="status-dot"></span>Offline ready
      </div>
      <div class="rail-version">TABLELOOM · {{ APP_VERSION }}</div>
    </aside>
    <main class="home-main">
      <div class="home-heading">
        <div>
          <div class="eyebrow">YOUR WORKSPACE</div>
          <h1>Make room for your next idea.</h1>
          <p>
            {{ projects.length }} {{ projects.length === 1 ? 'project' : 'projects' }} on this device. A whole
            world on your table.
          </p>
        </div>
        <button class="button" @click="importProject"><Icon name="FolderOpen" />Open…</button>
      </div>
      <div class="section-heading">
        <h2>Recent projects</h2>
        <div class="inline">
          <div class="search-field">
            <Icon name="Search" /><input
              v-model="search"
              placeholder="Find a project…"
              aria-label="Search projects"
            />
          </div>
          <select v-model="sort" aria-label="Sort projects">
            <option value="recent">Last edited</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      <div class="project-grid">
        <button v-for="p in filtered" :key="p.id" class="project-card" @click="openProject(p)">
          <div class="project-art" :style="{ '--project-color': p.templates[0]?.background ?? '#e5eadd' }">
            <div v-if="p.sets[0]?.rows[0]" class="project-fan">
              <ComponentPreview
                v-for="(r, i) in p.sets[0].rows.slice(0, 3)"
                :key="r.id"
                :doc="p"
                :set="p.sets[0]"
                :row="r"
                :style="{ transform: `translateX(${(i - 1) * 47}px) rotate(${(i - 1) * 12}deg)` }"
              />
            </div>
            <Icon v-else name="Layers" :size="48" />
          </div>
          <div class="project-info">
            <div class="inline spread">
              <h3>{{ p.name }}</h3>
              <Icon name="ArrowUpRight" />
            </div>
            <p>{{ p.description || 'A new tabletop idea.' }}</p>
            <div class="project-meta">
              <span>{{ p.sets.reduce((n, s) => n + totalCopies(s), 0) }} pieces</span
              ><span>{{ p.sets.length }} sets</span><span class="tag">Local</span>
            </div>
          </div></button
        ><button class="new-project-card" @click="creating = true">
          <span><Icon name="Plus" :size="24" /></span><strong>A fresh start</strong>
          <p>Blank canvas, endless possibilities.</p>
        </button>
      </div>
      <section id="starters">
        <div class="section-heading">
          <div>
            <h2>A little head start</h2>
            <p class="muted">Original, editable projects. Open one, make it yours, play.</p>
          </div>
          <span class="eyebrow">6 WORKING STARTERS</span>
        </div>
        <div class="starter-grid">
          <button v-for="s in starters" :key="s.id" class="starter-card" @click="newProject(s.name, s.id)">
            <div class="starter-swatch" :style="{ background: s.color + '20', color: s.color }">
              <Icon
                :name="
                  s.id === 'terrain'
                    ? 'Hexagon'
                    : s.id === 'tokens'
                      ? 'Circle'
                      : s.id === 'expedition'
                        ? 'Grid3X3'
                        : s.id === 'actions'
                          ? 'Workflow'
                          : 'Layers'
                "
                :size="28"
              /><span>{{ s.kind }}</span>
            </div>
            <h3>{{ s.name }}</h3>
            <p>{{ s.description }}</p>
            <small>{{ s.tag }}</small>
          </button>
        </div>
      </section>
    </main>
    <aside class="home-context">
      <div class="eyebrow">PICK UP THE THREAD</div>
      <template v-if="recent"
        ><h2>{{ recent.name }}</h2>
        <p class="muted">Your latest work, ready when you are.</p>
        <div class="context-card">
          <div class="context-stat">
            <span>Component sets</span><strong>{{ recent.sets.length }}</strong>
          </div>
          <div class="context-stat">
            <span>Saved versions</span><strong>{{ recent.snapshots.length }}</strong>
          </div>
          <div class="context-stat">
            <span>Open playtest notes</span
            ><strong>{{ recent.notes.filter((n) => !n.resolved).length }}</strong>
          </div>
          <button class="button primary full" @click="openProject(recent)">
            Continue designing<Icon name="ArrowRight" />
          </button></div
      ></template>
      <div class="home-tip">
        <div class="eyebrow">FROM IDEA TO TABLE</div>
        <h3>One change.<br />A better next playtest.</h3>
        <p>Link your layout to your game data. When a rule changes, every connected component follows.</p>
        <div class="workflow-line">
          <span>Design</span><Icon name="ArrowRight" /><span>Test</span><Icon name="ArrowRight" /><span
            >Refine</span
          >
        </div>
      </div>
      <div class="local-note"><span class="status-dot"></span>No account needed. All yours.</div>
    </aside>
    <Modal v-if="creating" title="A new game starts here" @close="creating = false"
      ><label>Project name<input v-model="name" autofocus @keydown.enter="create" /></label>
      <p class="muted">Start with an empty workspace, then add cards, tokens, tiles or a board.</p>
      <template #footer
        ><button class="button" @click="creating = false">Cancel</button
        ><button class="button primary" :disabled="!name.trim()" @click="create">
          Create project
        </button></template
      ></Modal
    >
  </div>
</template>
