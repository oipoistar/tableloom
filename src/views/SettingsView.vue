<script setup lang="ts">
import { ref, computed } from 'vue';
import CollaborationPanel from '../components/CollaborationPanel.vue';
import AssistancePanel from '../components/AssistancePanel.vue';
import Icon from '../components/Icon.vue';
import { project, settingsTab as tab, commit, uiScale, units, locale, notify, currentSet } from '../store';
import { uid, clone } from '../core/model';
import { element, makeTemplate } from '../core/starters';
const symbolName = ref('');
const symbolPath = ref('M12 2L22 12 12 22 2 12Z');
const newTerm = ref('');
const termDefinition = ref('');
const variableName = ref('');
const variableValue = ref('');
const newLocale = ref('');
const targetLocale = ref('');
const localeSearch = ref('');
const translationRows = computed(() =>
  project.value.sets
    .flatMap((s) =>
      s.rows.flatMap((r) =>
        s.fields
          .filter((f) => f.type === 'text')
          .map((f) => ({
            key: `${r.id}.${f.key}`,
            name: String(r.name),
            field: f.key,
            source: String(r[f.key] ?? ''),
          })),
      ),
    )
    .filter((r) => `${r.name} ${r.source}`.toLowerCase().includes(localeSearch.value.toLowerCase()))
    .slice(0, 100),
);
function addLocale() {
  const code = newLocale.value.trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(code)) {
    notify('Use a language code such as de, fr, or pt-br.');
    return;
  }
  commit('Add locale', (p) => {
    if (!p.locales.includes(code)) p.locales.push(code);
    p.translations[code] ??= {};
  });
  targetLocale.value = code;
  newLocale.value = '';
}
function pairBack() {
  if (!currentSet.value) return;
  commit('Create paired back', (p) => {
    const set = p.sets.find((s) => s.id === currentSet.value!.id)!;
    const front = p.templates.find((t) => t.id === set.templateId)!;
    const back = makeTemplate(set.name + ' back', set.kind, front.width, front.height);
    back.shape = front.shape;
    back.background = '#394f42';
    back.elements = [
      element('text', {
        name: 'Back title',
        x: 5,
        y: front.height * 0.4,
        w: front.width - 10,
        h: front.height * 0.3,
        text: p.name,
        fontSize: 14,
        font: 'Alegreya',
        color: '#f2eddc',
        align: 'center',
      }),
    ];
    p.templates.push(back);
    set.backTemplateId = back.id;
  });
}
</script>
<template>
  <div class="settings-layout">
    <nav class="settings-nav">
      <h3>Project & workspace</h3>
      <button
        v-for="t in [
          { id: 'general', icon: 'Settings', label: 'General' },
          { id: 'styles', icon: 'Type', label: 'Shared styles' },
          { id: 'symbols', icon: 'Sparkles', label: 'Symbols' },
          { id: 'terms', icon: 'BookOpen', label: 'Terms & variables' },
          { id: 'localization', icon: 'Globe', label: 'Localization' },
          { id: 'help', icon: 'Keyboard', label: 'Shortcuts & guide' },
        ]"
        :key="t.id"
        :class="['nav-button', { active: tab === t.id }]"
        @click="tab = t.id"
      >
        <Icon :name="t.icon" />{{ t.label }}
      </button>
    </nav>
    <main class="settings-main">
      <template v-if="tab === 'general'"
        ><h1>A space that works for you.</h1>
        <section class="settings-card">
          <h3>Your project</h3>
          <label
            >Name<input
              :value="project.name"
              @change="
                commit(
                  'Rename project',
                  (p) => (p.name = ($event.target as HTMLInputElement).value || p.name),
                )
              " /></label
          ><label
            >Description<textarea
              :value="project.description"
              rows="2"
              @change="
                commit(
                  'Edit description',
                  (p) => (p.description = ($event.target as HTMLTextAreaElement).value),
                )
              "
            ></textarea>
          </label>
        </section>
        <section class="settings-card">
          <h3>Workspace</h3>
          <div class="form-grid">
            <label
              >Interface size<select v-model.number="uiScale">
                <option v-for="n in [85, 100, 110, 125, 150]" :key="n" :value="n">{{ n }}%</option>
              </select></label
            ><label
              >Measurements<select v-model="units">
                <option value="mm">Millimeters</option>
                <option value="in">Inches</option>
              </select></label
            >
          </div>
          <p class="muted">Fonts and artwork are bundled. Local authoring and exports work offline.</p>
        </section>
        <section v-if="currentSet" class="settings-card">
          <h3>{{ currentSet.name }}</h3>
          <label
            >Paired back<select
              :value="currentSet.backTemplateId ?? ''"
              @change="
                commit('Pair card back', (p) => {
                  p.sets.find((s) => s.id === currentSet!.id)!.backTemplateId =
                    ($event.target as HTMLSelectElement).value || undefined;
                })
              "
            >
              <option value="">No paired back</option>
              <option v-for="t in project.templates" :key="t.id" :value="t.id">
                {{ t.name }} · {{ t.width }} × {{ t.height }} mm
              </option>
            </select></label
          ><button class="button" @click="pairBack">Create a matching back</button
          ><label
            >Unique back text field<select
              :value="currentSet.backField ?? ''"
              @change="
                commit(
                  'Set unique backs',
                  (p) =>
                    (p.sets.find((s) => s.id === currentSet!.id)!.backField =
                      ($event.target as HTMLSelectElement).value || undefined),
                )
              "
            >
              <option value="">Use the front record unchanged</option>
              <option v-for="f in currentSet.fields" :key="f.key" :value="f.key">{{ f.key }}</option>
            </select></label
          >
        </section>
        <CollaborationPanel /><AssistancePanel /></template
      ><template v-else-if="tab === 'styles'"
        ><h1>One style. A consistent game.</h1>
        <p class="muted">
          Linked elements inherit these settings. Explicit local properties keep their overrides.
        </p>
        <section v-for="(style, id) in project.styles" :key="id" class="settings-card">
          <h3>{{ id }}</h3>
          <div
            class="style-sample"
            :style="{
              fontFamily: style.font,
              color: style.color,
              fontSize: style.fontSize * 1.5 + 'px',
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? 'italic' : 'normal',
            }"
          >
            The next turn is yours.
          </div>
          <div class="form-grid">
            <label
              >Font<select
                :value="style.font"
                @change="
                  commit(
                    'Edit shared font',
                    (p) => (p.styles[id]!.font = ($event.target as HTMLSelectElement).value),
                  )
                "
              >
                <option>Source Sans 3</option>
                <option>Alegreya</option>
              </select></label
            ><label
              >Size · pt<input
                :value="style.fontSize"
                type="number"
                min="1"
                @change="
                  commit(
                    'Edit shared type size',
                    (p) =>
                      (p.styles[id]!.fontSize = Math.max(
                        1,
                        Number(($event.target as HTMLInputElement).value),
                      )),
                  )
                " /></label
            ><label
              >Color<input
                :value="style.color"
                type="color"
                @change="
                  commit(
                    'Edit shared color',
                    (p) => (p.styles[id]!.color = ($event.target as HTMLInputElement).value),
                  )
                " /></label
            ><label class="checkbox-label"
              ><input
                :checked="style.bold"
                type="checkbox"
                @change="
                  commit(
                    'Edit shared weight',
                    (p) => (p.styles[id]!.bold = ($event.target as HTMLInputElement).checked),
                  )
                "
              />Bold</label
            >
          </div>
          <button
            class="text-button"
            @click="
              commit('Copy shared style', (p) => (p.styles[String(id) + '-copy'] = { ...clone(style) }))
            "
          >
            Make an independent copy
          </button>
        </section></template
      ><template v-else-if="tab === 'symbols'"
        ><h1>A shared visual language.</h1>
        <section v-for="symbol in project.symbols" :key="symbol.id" class="settings-card">
          <div class="inline">
            <svg width="48" height="48" viewBox="0 0 24 24">
              <path :d="symbol.path" :fill="symbol.color" /></svg
            ><strong>[icon:{{ symbol.id }}]</strong>
          </div>
          <div class="form-grid">
            <label
              >Name<input
                :value="symbol.name"
                @change="
                  commit(
                    'Rename symbol',
                    (p) =>
                      (p.symbols.find((s) => s.id === symbol.id)!.name = (
                        $event.target as HTMLInputElement
                      ).value),
                  )
                " /></label
            ><label
              >Color<input
                type="color"
                :value="symbol.color"
                @change="
                  commit(
                    'Recolor symbol',
                    (p) =>
                      (p.symbols.find((s) => s.id === symbol.id)!.color = (
                        $event.target as HTMLInputElement
                      ).value),
                  )
                "
            /></label>
          </div>
          <label
            >Vector path · 24 × 24 coordinate space<textarea
              :value="symbol.path"
              @change="
                commit(
                  'Edit symbol path',
                  (p) =>
                    (p.symbols.find((s) => s.id === symbol.id)!.path = (
                      $event.target as HTMLTextAreaElement
                    ).value),
                )
              "
            ></textarea>
          </label>
        </section>
        <section class="settings-card">
          <h3>New symbol</h3>
          <label>Name<input v-model="symbolName" /></label
          ><label>SVG path<textarea v-model="symbolPath"></textarea></label
          ><button
            class="button primary"
            :disabled="!symbolName.trim() || !symbolPath.trim()"
            @click="
              commit('Create symbol', (p) =>
                p.symbols.push({ id: uid('symbol'), name: symbolName, path: symbolPath, color: '#526b49' }),
              );
              symbolName = '';
            "
          >
            Add reusable symbol
          </button>
        </section></template
      ><template v-else-if="tab === 'terms'"
        ><h1>Speak the same game language.</h1>
        <section class="settings-card">
          <h3>Shared terminology</h3>
          <p class="muted">
            Reference a term with [term:its-id] in cards and rules. Its displayed name updates everywhere.
          </p>
          <div v-for="term in project.terms" :key="term.id" class="term-row">
            <label
              >Name<input
                :value="term.name"
                @change="
                  commit(
                    'Rename term',
                    (p) =>
                      (p.terms.find((t) => t.id === term.id)!.name = (
                        $event.target as HTMLInputElement
                      ).value),
                  )
                " /></label
            ><label
              >Definition<textarea
                :value="term.definition"
                @change="
                  commit(
                    'Edit definition',
                    (p) =>
                      (p.terms.find((t) => t.id === term.id)!.definition = (
                        $event.target as HTMLTextAreaElement
                      ).value),
                  )
                "
              ></textarea></label
            ><small class="mono muted">[term:{{ term.id }}]</small>
          </div>
          <div class="form-grid">
            <label>New term<input v-model="newTerm" placeholder="Exhaust" /></label
            ><label>Meaning<input v-model="termDefinition" placeholder="Turn this card sideways." /></label>
          </div>
          <button
            class="button"
            :disabled="!newTerm.trim()"
            @click="
              commit('Add term', (p) =>
                p.terms.push({
                  id: uid('term'),
                  name: newTerm,
                  definition: termDefinition,
                  translations: {},
                }),
              );
              newTerm = '';
              termDefinition = '';
            "
          >
            <Icon name="Plus" />Add term
          </button>
        </section>
        <section class="settings-card">
          <h3>Formula variables</h3>
          <div v-for="(value, key) in project.variables" :key="key" class="form-grid">
            <label
              >{{ key
              }}<input
                :value="value"
                @change="
                  commit('Edit variable', (p) => {
                    const v = ($event.target as HTMLInputElement).value;
                    p.variables[key] = v.trim() && Number.isFinite(Number(v)) ? Number(v) : v;
                  })
                "
            /></label>
          </div>
          <div class="form-grid">
            <label>New variable<input v-model="variableName" placeholder="rounds" /></label
            ><label>Value<input v-model="variableValue" placeholder="6" /></label>
          </div>
          <button
            class="button"
            @click="
              /^[a-zA-Z]\w*$/.test(variableName) &&
              !['constructor', 'prototype', '__proto__'].includes(variableName)
                ? commit('Add variable', (p) => {
                    p.variables[variableName] = Number.isFinite(Number(variableValue))
                      ? Number(variableValue)
                      : variableValue;
                  })
                : notify('Use a valid variable name')
            "
          >
            Add variable
          </button>
        </section></template
      ><template v-else-if="tab === 'localization'"
        ><h1>More people around the table.</h1>
        <section class="settings-card">
          <div class="form-grid">
            <label>New language code<input v-model="newLocale" placeholder="de" /></label
            ><button class="button align-end" @click="addLocale"><Icon name="Plus" />Add language</button
            ><label
              >Edit translations<select v-model="targetLocale">
                <option value="">Choose language…</option>
                <option v-for="l in project.locales.filter((l) => l !== project.baseLocale)" :key="l">
                  {{ l }}
                </option>
              </select></label
            ><label
              >Preview language<select v-model="locale">
                <option v-for="l in project.locales" :key="l">{{ l }}</option>
              </select></label
            >
          </div>
          <p class="muted">
            Missing translations fall back to {{ project.baseLocale }} and appear in preflight. Preview every
            language for text overflow.
          </p>
        </section>
        <section v-if="targetLocale" class="settings-card">
          <input
            v-model="localeSearch"
            placeholder="Find text to translate…"
            aria-label="Search translation source"
          />
          <div v-for="r in translationRows" :key="r.key" class="translation-row">
            <div>
              <small>{{ r.name }} · {{ r.field }}</small>
              <p>{{ r.source }}</p>
            </div>
            <textarea
              :value="project.translations[targetLocale]?.[r.key] ?? ''"
              :aria-label="`${r.name} ${r.field} ${targetLocale}`"
              @change="
                commit('Translate field', (p) => {
                  p.translations[targetLocale] ??= {};
                  p.translations[targetLocale]![r.key] = ($event.target as HTMLTextAreaElement).value;
                })
              "
            ></textarea>
          </div></section></template
      ><template v-else
        ><h1>A few useful threads to pull.</h1>
        <section class="settings-card">
          <h3>Keyboard shortcuts</h3>
          <div
            v-for="s in [
              ['Save project package', 'Ctrl / ⌘ S'],
              ['Open project', 'Ctrl / ⌘ O'],
              ['Undo', 'Ctrl / ⌘ Z'],
              ['Redo', 'Ctrl / ⌘ Shift Z'],
              ['Nudge selected element', 'Arrow keys'],
              ['Nudge by 5 mm', 'Shift + Arrow'],
              ['Delete selected element', 'Delete'],
              ['Save a playtest note', 'Ctrl + Enter'],
            ]"
            :key="s[0]"
            class="context-stat"
          >
            <span>{{ s[0] }}</span
            ><kbd>{{ s[1] }}</kbd>
          </div>
        </section>
        <section class="settings-card">
          <h3>Your first design–test–revise cycle</h3>
          <ol class="guide-list">
            <li>Open one of the six starters from Home.</li>
            <li>
              In Design, select the card title. Drag another field onto it or edit its value in the inspector.
            </li>
            <li>Choose Template to change every linked component, or This component for a local override.</li>
            <li>In Data, paste a spreadsheet range or import a CSV, JSON, or ODS file.</li>
            <li>Review the set and open any preflight findings.</li>
            <li>Export a prototype or draw cards on the local Test table.</li>
            <li>
              Save a named version, revise your design, and compare or export only the changed components.
            </li>
          </ol>
        </section>
        <section class="settings-card">
          <h3>Formulas without scripts</h3>
          <p>
            Use arithmetic, comparisons, and functions such as <code>max(salt, reed)</code>,
            <code>sum(actions, "cost")</code>, or <code>lookup("structures", "id", "STR-01", "salt")</code>.
            Shared variables are available by name.
          </p>
        </section></template
      >
    </main>
  </div>
</template>
