<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import {
  project,
  issues,
  preflightRunning,
  commit,
  notify,
  reportError,
  view,
  baseline,
  locale,
} from '../store';
import type { ExportProfile } from '../core/model';
import { clone, uid, fileId, documentState } from '../core/model';
import { defaultProfile } from '../core/starters';
import {
  impose,
  renderPrintPage,
  printHtml,
  calibrationSvg,
  imageSheets,
  ttsSave,
  exportManifest,
} from '../core/export';
import { renderComponent, resolveTemplate, preflight } from '../core/layout';
import { bundleFiles, encodeProject } from '../core/packages';
import { compareDocuments, deckStructure, outputRecord } from '../core/revision';
import { saveBytes } from '../persistence';
import { productionJobs } from '../core/production';
import { rasterSvg } from '../raster';
const production = ref<{ version: string; profile: string } | null>(null);
onMounted(async () => {
  production.value = (await window.tableloom?.productionStatus()) ?? null;
});
async function configureProduction() {
  try {
    production.value = (await window.tableloom?.configureProduction()) ?? null;
  } catch (e) {
    reportError(e);
  }
}
const desktop = !!window.tableloom;
const textEncoder = new TextEncoder();
const profile = ref<ExportProfile>(clone(project.value.profiles[0] ?? defaultProfile()));
profile.value.locale ??= locale.value;
const format = ref<'svg' | 'png'>(profile.value.artFormat ?? 'svg');
const pageIndex = ref(0);
const busy = ref(false);
const progress = ref(0);
const cancel = ref(false);
const output = ref('');
const freeze = ref(true);
const includeSource = ref(false);
const releaseName = ref(`Playtest ${project.value.snapshots.filter((s) => s.kind === 'release').length + 1}`);
const assetBase = ref('');
const acknowledge = ref(false);
const profileName = ref('My print preset');
watch(
  () => profile.value.locale,
  (code) => {
    if (code) locale.value = code;
  },
);
watch(
  () => profile.value.id,
  () => {
    format.value = profile.value.artFormat ?? 'svg';
  },
);
watch(format, (value) => (profile.value.artFormat = value));
const destinations = [
  { id: 'home', name: 'Home prototype', description: 'Print, cut, and play.', icon: 'Printer' },
  { id: 'images', name: 'Component artwork', description: 'Individual SVG or PNG files.', icon: 'Image' },
  { id: 'tts', name: 'Tabletop Simulator', description: 'Deck sheets and a saved game.', icon: 'Layers' },
  { id: 'screentop', name: 'Screentop assets', description: 'Image sheets for your table.', icon: 'Globe' },
  {
    id: 'production',
    name: 'Production PDF',
    description: 'CMYK PDF/X-4 with trim & bleed.',
    icon: 'FileText',
  },
] as const;
const baselineDoc = computed(
  () => project.value.snapshots.find((s) => s.id === profile.value.baselineId)?.data ?? baseline.value?.data,
);
const productionItems = computed(() =>
  project.value.sets
    .filter((s) => !profile.value.setIds.length || profile.value.setIds.includes(s.id))
    .flatMap((set) =>
      set.rows
        .filter((row) => Number(row.qty ?? 1) > 0)
        .flatMap((row) => (set.backTemplateId ? [false, true] : [false]).map((back) => ({ set, row, back }))),
    ),
);
const previewCount = computed(() =>
  profile.value.destination === 'production' ? productionItems.value.length : planning.value.pages.length,
);
const planning = computed(() => {
  try {
    const pages = impose(project.value, profile.value, baselineDoc.value);
    return { pages, error: '' };
  } catch (e) {
    return { pages: [], error: (e as Error).message };
  }
});
const preview = computed(() => {
  if (profile.value.destination === 'production') {
    const item = productionItems.value[Math.min(pageIndex.value, productionItems.value.length - 1)];
    return item
      ? renderComponent(project.value, item.set, item.row, {
          back: item.back,
          bleed: profile.value.bleed,
          locale: profile.value.locale,
          layer: profile.value.layer,
        })
      : '';
  }
  const page = planning.value.pages[Math.min(pageIndex.value, planning.value.pages.length - 1)];
  return page ? renderPrintPage(project.value, page, profile.value, pageIndex.value) : '';
});
const blocked = computed(() => issues.value.some((i) => i.severity === 'error') && !acknowledge.value);
function windowCancel() {
  window.tableloom?.cancelExport();
}
function chooseDestination(id: ExportProfile['destination']) {
  profile.value.destination = id;
  if (id === 'production') profile.value.bleed = true;
  pageIndex.value = 0;
}
function paper() {
  if (profile.value.paper === 'A4') {
    profile.value.width = 210;
    profile.value.height = 297;
  } else if (profile.value.paper === 'Letter') {
    profile.value.width = 215.9;
    profile.value.height = 279.4;
  }
}
function saveProfile() {
  const p = { ...clone(profile.value), id: uid('profile'), name: profileName.value };
  commit('Save export preset', (doc) => doc.profiles.push(p));
  notify('Export settings saved');
}
async function generate() {
  if (blocked.value || busy.value) return;
  busy.value = true;
  progress.value = 0;
  cancel.value = false;
  output.value = '';
  try {
    const doc = clone(project.value);
    const settings = clone(profile.value);
    const checked = preflight(
      { ...doc, sets: doc.sets.filter((s) => !settings.setIds.length || settings.setIds.includes(s.id)) },
      settings.locale ?? doc.baseLocale,
    );
    if (checked.some((i) => i.severity === 'error') && !acknowledge.value)
      throw new Error('Preflight found errors. Review the findings before exporting.');
    const files: Record<string, Uint8Array | string> = {};
    let path: string | null = null;
    if (settings.destination === 'production') {
      if (!window.tableloom || !production.value)
        throw new Error('Configure Ghostscript and a CMYK ICC profile in the desktop app first.');
      const jobs = productionJobs(doc, settings, baselineDoc.value);
      if (!jobs.length) throw new Error('No components match this output.');
      path = await window.tableloom.exportProduction(jobs, `${doc.name}-production.pdf`);
    } else if (settings.destination === 'home') {
      if (planning.value.error) throw new Error(planning.value.error);
      if (!planning.value.pages.length)
        throw new Error('There are no components to export with these settings.');
      const html = printHtml(doc, settings, impose(doc, settings, baselineDoc.value));
      progress.value = 50;
      if (window.tableloom)
        path = await window.tableloom.exportPdf(
          html,
          `${doc.name}-${settings.destination}.pdf`,
          settings.width,
          settings.height,
        );
      else path = await saveBytes(textEncoder.encode(html), `${doc.name}-print.html`);
    } else if (settings.destination === 'images') {
      const changed =
        settings.changedOnly && baselineDoc.value
          ? new Set(compareDocuments(baselineDoc.value, doc).map((c) => `${c.setId}/${c.rowId}`))
          : null;
      const work = doc.sets
        .filter((s) => !settings.setIds.length || settings.setIds.includes(s.id))
        .flatMap((set) =>
          set.rows
            .filter((r) => !changed || changed.has(`${set.id}/${r.id}`))
            .flatMap((row) =>
              (set.backTemplateId ? [false, true] : [false]).map((back) => ({ set, row, back })),
            ),
        );
      if (!work.length) throw new Error('No components match this output.');
      for (const [i, item] of work.entries()) {
        if (cancel.value) throw new Error('Export cancelled. Your project is saved.');
        const svg = renderComponent(doc, item.set, item.row, {
          back: item.back,
          bleed: settings.bleed,
          embedFonts: true,
          locale: settings.locale,
          layer: settings.layer,
        });
        const t = resolveTemplate(doc, item.set.templateId);
        const bleed = settings.bleed ? t.bleed : 0;
        files[
          `${fileId(item.set.id)}/${fileId(item.row.id)}-${item.back ? 'back' : 'front'}.${format.value}`
        ] =
          format.value === 'svg'
            ? svg
            : await rasterSvg(
                svg,
                ((t.width + 2 * bleed) / 25.4) * settings.dpi,
                ((t.height + 2 * bleed) / 25.4) * settings.dpi,
              );
        progress.value = Math.round(((i + 1) / work.length) * 90);
        await new Promise((r) => setTimeout(r, 0));
      }
    } else {
      const sets = doc.sets.filter(
        (s) =>
          (!settings.setIds.length || settings.setIds.includes(s.id)) &&
          (settings.destination !== 'tts' || s.kind === 'card'),
      );
      let done = 0;
      const changedIds =
        settings.changedOnly && baselineDoc.value
          ? new Set(compareDocuments(baselineDoc.value, doc).map((c) => c.rowId))
          : null;
      const sheets = sets
        .flatMap((s) => [
          ...imageSheets(doc, s, false, settings.locale),
          ...(s.backTemplateId ? imageSheets(doc, s, true, settings.locale) : []),
        ])
        .filter((sheet) => !changedIds || sheet.rowIds.some((id) => changedIds.has(id)));
      if (!sheets.length) throw new Error('No components match this output.');
      for (const sheet of sheets) {
        if (cancel.value) throw new Error('Export cancelled. Your project is saved.');
        files[sheet.name] = await rasterSvg(sheet.svg, sheet.width, sheet.height);
        progress.value = Math.round((++done / sheets.length) * 85);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (settings.destination === 'tts')
        files[`${doc.name}.json`] = JSON.stringify(ttsSave({ ...doc, sets }, assetBase.value), null, 2);
      else
        files['screentop-import.csv'] =
          'name,asset,width,height,columns,rows\n' +
          sheets.map((s) => `${s.name},${s.name},${s.width},${s.height},${s.columns},${s.rows}`).join('\n');
      files['README.txt'] =
        settings.destination === 'tts'
          ? 'Extract the PNG files into the asset folder specified during export. Copy the saved game JSON into your Tabletop Simulator Saves folder. Local image paths work on your computer; for a shared session use HTTPS-hosted images accessible to all players.\nThe exported structure hash distinguishes artwork-only changes from deck order or quantity changes. Changed-only exports contain affected sheets; retain unchanged PNGs from the previous export in the same asset folder.'
          : 'Upload the included PNG sheets as assets in Screentop. Configure the grid dimensions for each sheet before placing components. The accompanying CSV lists image dimensions. This package does not upload or publish your game.';
    }
    if (cancel.value) throw new Error('Export cancelled.');
    if (!['home', 'production'].includes(settings.destination)) {
      if (includeSource.value) files[fileId(doc.name) + '.tableloom'] = encodeProject(doc);
      files['notes.json'] = JSON.stringify(doc.notes, null, 2);
      files['manifest.json'] = JSON.stringify(exportManifest(doc, settings, Object.keys(files)), null, 2);
      path = await saveBytes(bundleFiles(files), `${doc.name}-${settings.destination}.zip`);
    }
    if (path) {
      output.value = path;
      if (project.value.id === doc.id)
        commit('Record completed export', (p) => {
          if (freeze.value)
            p.snapshots.push({
              id: uid('snapshot'),
              name: releaseName.value,
              kind: 'release',
              createdAt: new Date().toISOString(),
              data: documentState(doc),
            });
          p.outputs = [...(p.outputs ?? []), outputRecord(doc, settings, path!.split(/[\\/]/).at(-1)!)].slice(
            -30,
          );
          if (!p.tasks.includes('export')) p.tasks.push('export');
        });
      notify('Export complete');
    }
    progress.value = 100;
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="export-layout">
    <main class="export-main">
      <div class="view-heading">
        <div>
          <div class="eyebrow">FROM WORKSPACE TO PLAYSPACE</div>
          <h1>What are you making?</h1>
          <p>Choose a destination. Your layout comes with you.</p>
        </div>
      </div>
      <div class="destination-grid">
        <button
          v-for="d in destinations"
          :key="d.id"
          :class="['destination-card', { active: profile.destination === d.id }]"
          @click="chooseDestination(d.id)"
        >
          <Icon :name="d.icon" :size="22" /><strong>{{ d.name }}</strong
          ><small>{{ d.description }}</small
          ><Icon
            v-if="profile.destination === d.id"
            class="destination-check"
            name="CheckCircle2"
            :size="16"
          />
        </button>
      </div>
      <div class="export-preview-heading">
        <h3>Output preview</h3>
        <div class="inline">
          <button class="icon-button" :disabled="pageIndex <= 0" title="Previous sheet" @click="pageIndex--">
            <Icon name="ChevronLeft" /></button
          ><span
            >{{ previewCount ? Math.min(pageIndex + 1, previewCount) : 0 }} / {{ previewCount }}
            {{ profile.destination === 'production' ? 'components' : 'sheets' }}</span
          ><button
            class="icon-button"
            :disabled="pageIndex >= previewCount - 1"
            title="Next sheet"
            @click="pageIndex++"
          >
            <Icon name="ChevronRight" />
          </button>
        </div>
      </div>
      <div class="print-preview-area">
        <div v-if="preview" class="print-paper" v-html="preview"></div>
        <div v-else class="empty-state">
          <Icon name="Printer" :size="36" />
          <p>{{ planning.error || 'No components match these export settings.' }}</p>
        </div>
      </div>
      <div class="export-footnote">
        <Icon name="CheckCircle2" :size="15" />The canvas and output use the same component renderer.<span
          v-if="profile.destination === 'home'"
          >Print at 100% scale.</span
        >
      </div>
    </main>
    <aside class="export-settings">
      <section class="inspector-section">
        <h3>{{ destinations.find((d) => d.id === profile.destination)?.name }}</h3>
        <label
          >Saved settings<select
            aria-label="Load export preset"
            @change="
              profile = clone(
                project.profiles.find((p) => p.id === ($event.target as HTMLSelectElement).value) ??
                  defaultProfile(),
              )
            "
          >
            <option value="">Choose a preset…</option>
            <option v-for="p in project.profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select></label
        >
      </section>
      <section class="inspector-section">
        <div class="section-label">INCLUDE</div>
        <label v-for="s in project.sets" :key="s.id" class="checkbox-label"
          ><input
            type="checkbox"
            :checked="!profile.setIds.length || profile.setIds.includes(s.id)"
            @change="
              () => {
                if (!profile.setIds.length) profile.setIds = project.sets.map((s) => s.id);
                const i = profile.setIds.indexOf(s.id);
                if (i >= 0) profile.setIds.splice(i, 1);
                else profile.setIds.push(s.id);
                if (!profile.setIds.length) profile.setIds = ['__none__'];
              }
            "
          />{{ s.name }}<small>{{ s.rows.length }}</small></label
        ><label class="checkbox-label"
          ><input v-model="profile.changedOnly" type="checkbox" />Only changed components</label
        ><select
          v-if="profile.changedOnly"
          v-model="profile.baselineId"
          aria-label="Export comparison baseline"
        >
          <option v-for="s in project.snapshots" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </section>
      <section class="inspector-section">
        <div class="section-label">OUTPUT SETTINGS</div>
        <label
          >Language<select v-model="profile.locale">
            <option v-for="code in project.locales" :key="code" :value="code">
              {{ code }}{{ code === project.baseLocale ? ' · original' : '' }}
            </option>
          </select></label
        ><label v-if="['images', 'production'].includes(profile.destination)"
          >Physical layer<select
            :value="profile.layer ?? ''"
            @change="
              profile.layer =
                (($event.target as HTMLSelectElement).value as ExportProfile['layer']) || undefined
            "
          >
            <option value="">Artwork + cut / fold / finish</option>
            <option value="art">Artwork only</option>
            <option value="cut">Cut paths only</option>
            <option value="fold">Fold paths only</option>
            <option value="finish">Finish geometry only</option>
          </select></label
        ><template v-if="profile.destination === 'production'"
          ><p>Each unique component front and back gets a separate page at its finished size.</p>
          <div v-if="production" class="info-box">
            <strong>Ghostscript {{ production.version }}</strong>
            <p>CMYK profile: {{ production.profile }}</p>
          </div>
          <button v-if="desktop" class="button full" @click="configureProduction">
            {{ production ? 'Change converter and ICC profile' : 'Choose converter and ICC profile' }}
          </button>
          <p v-else class="muted">
            Open Tableloom desktop to configure the converter and generate a production PDF.
          </p>
          <p class="muted">
            Choose Ghostscript 10 and the CMYK ICC profile supplied by your printer. Output includes trim and
            bleed boxes, embedded fonts, and a settings record.
          </p></template
        ><template v-else-if="profile.destination === 'home'"
          ><label
            >Paper<select v-model="profile.paper" @change="paper">
              <option>A4</option>
              <option>Letter</option>
              <option value="custom">Custom</option>
            </select></label
          >
          <div v-if="profile.paper === 'custom'" class="form-grid">
            <label>Width · mm<input v-model.number="profile.width" type="number" min="20" /></label
            ><label>Height · mm<input v-model.number="profile.height" type="number" min="20" /></label>
          </div>
          <label
            >Fronts & backs<select v-model="profile.duplex">
              <option value="long">Duplex · long-edge flip</option>
              <option value="short">Duplex · short-edge flip</option>
              <option value="fold">Folded cards</option>
              <option value="none">Fronts only</option>
            </select></label
          >
          <div class="form-grid">
            <label>Margin · mm<input v-model.number="profile.margin" type="number" min="0" step=".5" /></label
            ><label>Gap · mm<input v-model.number="profile.gap" type="number" min="0" step=".5" /></label
            ><label>Back offset X<input v-model.number="profile.offsetX" type="number" step=".1" /></label
            ><label>Back offset Y<input v-model.number="profile.offsetY" type="number" step=".1" /></label>
          </div>
          <label class="checkbox-label"
            ><input v-model="profile.nesting" type="checkbox" />Nest tokens and tiles on punchboards</label
          ><label class="checkbox-label"
            ><input v-model="profile.cropMarks" type="checkbox" />Crop marks</label
          ><button
            class="text-button"
            @click="saveBytes(textEncoder.encode(calibrationSvg(profile)), 'tableloom-calibration.svg')"
          >
            <Icon name="Download" :size="13" />Printer calibration sheet
          </button></template
        ><template v-else-if="profile.destination === 'images'"
          ><label
            >Format<select v-model="format">
              <option value="svg">SVG · vector with embedded fonts</option>
              <option value="png">PNG · raster</option>
            </select></label
          ><label v-if="format === 'png'"
            >Resolution<select v-model.number="profile.dpi">
              <option :value="150">150 DPI</option>
              <option :value="300">300 DPI</option>
              <option :value="600">600 DPI</option>
            </select></label
          ></template
        ><template v-else-if="profile.destination === 'tts'"
          ><label
            >Asset folder or HTTPS base URL<input v-model="assetBase" placeholder="C:/Games/MyGame/assets"
          /></label>
          <p class="muted">The saved game uses this location to find the included PNG sheets.</p>
          <div v-if="baselineDoc" class="info-box">
            {{
              deckStructure(baselineDoc) === deckStructure(project)
                ? 'Deck structure is unchanged. Existing object identities can be retained for artwork updates.'
                : 'Deck order or quantities changed. Import this as a new saved game.'
            }}
          </div></template
        ><label class="checkbox-label"><input v-model="profile.bleed" type="checkbox" />Include bleed</label>
      </section>
      <section class="inspector-section">
        <div class="inline spread">
          <h3>Preflight</h3>
          <span class="tag" :class="issues.some((i) => i.severity === 'error') ? 'amber' : 'green'">{{
            preflightRunning ? 'Checking…' : issues.length + ' findings'
          }}</span>
        </div>
        <button
          v-for="issue in issues.slice(0, 3)"
          :key="issue.id"
          class="export-issue"
          @click="view = 'review'"
        >
          <Icon :name="issue.severity === 'error' ? 'CircleAlert' : 'AlertTriangle'" :size="14" /><span>{{
            issue.message
          }}</span
          ><Icon name="ArrowUpRight" :size="12" />
        </button>
        <p v-if="!issues.length && !preflightRunning" class="success-text">All current checks pass.</p>
        <label v-if="issues.some((i) => i.severity === 'error')" class="checkbox-label"
          ><input v-model="acknowledge" type="checkbox" />Export with these known issues</label
        >
      </section>
      <section class="inspector-section">
        <label v-if="!['home', 'production'].includes(profile.destination)" class="checkbox-label"
          ><input v-model="includeSource" type="checkbox" />Include editable project source</label
        ><label class="checkbox-label"
          ><input v-model="freeze" type="checkbox" />Freeze as a playtest release</label
        ><input v-if="freeze" v-model="releaseName" aria-label="Release name" /><button
          class="button primary full large"
          :disabled="
            busy ||
            blocked ||
            (profile.destination === 'home' && !!planning.error) ||
            (profile.destination === 'production' && !production)
          "
          @click="generate"
        >
          <Icon name="FileDown" />{{
            busy
              ? `Exporting ${progress}%`
              : ['home', 'production'].includes(profile.destination)
                ? desktop
                  ? 'Generate PDF'
                  : 'Download print document'
                : 'Generate export package'
          }}</button
        ><button
          v-if="busy"
          class="button full"
          @click="
            cancel = true;
            windowCancel();
          "
        >
          Cancel export
        </button>
        <div v-if="busy" class="progress-track"><span :style="{ width: progress + '%' }"></span></div>
        <div v-if="output" class="success-output">
          <Icon name="CheckCircle2" /><strong>Ready for your next playtest.</strong
          ><small>{{ output.split(/[\\/]/).at(-1) }}</small>
        </div>
        <label>Save these settings as<input v-model="profileName" /></label
        ><button class="button full" @click="saveProfile">Save preset</button>
      </section>
    </aside>
  </div>
</template>
