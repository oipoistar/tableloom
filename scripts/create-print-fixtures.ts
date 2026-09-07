import { readFile, writeFile, mkdir } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { createStarter, defaultProfile } from '../src/core/starters';
import { registerFont, setEmbeddedFonts } from '../src/core/layout';
import { impose, printHtml } from '../src/core/export';
import { productionJobs } from '../src/core/production';
import { encodeProject } from '../src/core/packages';
const manifest = JSON.parse(await readFile('src/font-manifest.json', 'utf8'));
const css: string[] = [];
for (const definition of manifest) {
  const bytes = await readFile('node_modules/' + definition.path);
  registerFont(`${definition.family}:${definition.weight}`, fontkit.create(new Uint8Array(bytes)));
  css.push(
    `@font-face{font-family:'${definition.family}';font-weight:${definition.weight};src:url(data:font/woff;base64,${bytes.toString('base64')}) format('woff');unicode-range:${definition.range}}`,
  );
}
setEmbeddedFonts(css.join('\n'));
const project = createStarter('orchard'),
  profile = defaultProfile();
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/orchard.tableloom', encodeProject(project));
await writeFile('artifacts/orchard-print.html', printHtml(project, profile, impose(project, profile)));
await writeFile(
  'artifacts/production-jobs.json',
  JSON.stringify(productionJobs(project, { ...profile, bleed: true })),
);
