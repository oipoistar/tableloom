import { readFile, writeFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { createStarter, starters } from '../src/core/starters';
import { preflight, registerFont, renderComponent } from '../src/core/layout';
import { PreflightCache } from '../src/core/cache';
import { clone, documentState } from '../src/core/model';
import { compareDocuments } from '../src/core/revision';
const manifest = JSON.parse(await readFile('src/font-manifest.json', 'utf8'));
for (const def of manifest)
  registerFont(
    `${def.family}:${def.weight}`,
    fontkit.create(new Uint8Array(await readFile('node_modules/' + def.path))),
  );
const starterChecks = starters.map((s) => {
  const p = createStarter(s.id);
  return { id: s.id, issues: preflight(p) };
});
const p = createStarter('orchard');
p.sets[0]!.rows = Array.from({ length: 5000 }, (_, i) => ({
  ...clone(p.sets[0]!.rows[i % 6]!),
  id: 'row-' + i,
}));
p.snapshots = [];
const cache = new PreflightCache();
let start = performance.now();
cache.run(p);
const cold = performance.now() - start;
const before = documentState(p);
p.sets[0]!.rows[2500]!.name = 'Revised specimen';
start = performance.now();
cache.run(p);
const incremental = performance.now() - start;
start = performance.now();
const changed = compareDocuments(before, p);
const comparison = performance.now() - start;
start = performance.now();
for (const row of p.sets[0]!.rows.slice(0, 24)) renderComponent(p, p.sets[0]!, row);
const viewportRender = performance.now() - start;
const report = {
  platform: process.platform,
  node: process.version,
  rows: 5000,
  coldPreflightMs: Math.round(cold),
  incrementalPreflightMs: Math.round(incremental),
  comparisonMs: Math.round(comparison),
  viewport24Ms: Math.round(viewportRender),
  changedRows: changed.length,
  starterChecks,
};
await writeFile('artifacts/performance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (starterChecks.some((s) => s.issues.some((i) => i.severity === 'error'))) process.exitCode = 1;
