#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { createStarter, defaultProfile } from './core/starters';
import { parseProject, fileId } from './core/model';
import { encodeProject, decodeProject } from './core/packages';
import { preflight, renderComponent, registerFont, setEmbeddedFonts } from './core/layout';
import { impose, printHtml, ttsSave, exportManifest } from './core/export';
import { applyOperations } from './core/automation';
import { statistics, compareDocuments } from './core/revision';
import type { Operation } from './core/automation';
const args = process.argv.slice(2);
const command = args.shift();
async function fonts() {
  const definitions = JSON.parse(await readFile(new URL('./font-manifest.json', import.meta.url), 'utf8'));
  const css: string[] = [];
  for (const def of definitions) {
    const buffer = await readFile(new URL('../node_modules/' + def.path, import.meta.url));
    registerFont(`${def.family}:${def.weight}`, fontkit.create(new Uint8Array(buffer)));
    css.push(
      `@font-face{font-family:'${def.family}';font-weight:${def.weight};src:url(data:font/woff;base64,${buffer.toString('base64')}) format('woff');unicode-range:${def.range}}`,
    );
  }
  setEmbeddedFonts(css.join('\n'));
}
async function save(file: string, data: Uint8Array | string) {
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  const temp = file + '.tmp';
  await writeFile(temp, data);
  await rename(temp, file);
}
async function readProject(file: string) {
  return decodeProject(new Uint8Array(await readFile(file)));
}
async function main() {
  if (!command || command === 'help') {
    console.log(
      `Tableloom CLI\n\ncreate <starter-id> <output.tableloom>\nvalidate <project>\nrender <project> <output-directory>\nprint <project> <output.html> [profile.json]\nstats <project>\nbatch <project> <operations.json> <output.tableloom>\ndiff <before> <after>\ntts <project> <asset-base> <output.json>\nscript <project> <trusted-script.mjs> <output.tableloom>\n\nThe script command runs trusted local JavaScript with your user permissions. Export a default async function receiving a cloned project and returning operations. GUI formulas never execute JavaScript.`,
    );
    return;
  }
  if (command === 'create') {
    if (args.length < 2) throw new Error('create needs a starter ID and output path');
    await save(args[1]!, encodeProject(createStarter(args[0])));
    console.log(args[1]);
    return;
  }
  if (!args[0]) throw new Error('A project path is required');
  const project = await readProject(args[0]);
  await fonts();
  if (command === 'validate') {
    const issues = preflight(project);
    console.log(JSON.stringify({ project: project.name, issues }, null, 2));
    if (issues.some((i) => i.severity === 'error')) process.exitCode = 1;
  } else if (command === 'stats')
    console.log(
      JSON.stringify(
        project.sets.map((s) => ({ id: s.id, name: s.name, ...statistics(s) })),
        null,
        2,
      ),
    );
  else if (command === 'render') {
    if (!args[1]) throw new Error('An output directory is required');
    const root = path.resolve(args[1]);
    const files: string[] = [];
    for (const set of project.sets)
      for (const row of set.rows)
        for (const back of set.backTemplateId ? [false, true] : [false]) {
          const name = `${fileId(set.id)}/${fileId(row.id)}-${back ? 'back' : 'front'}.svg`;
          const target = path.resolve(root, name);
          if (!target.startsWith(root + path.sep)) throw new Error('Invalid output path');
          await save(target, renderComponent(project, set, row, { back, embedFonts: true }));
          files.push(name);
        }
    await save(
      path.join(root, 'manifest.json'),
      JSON.stringify(exportManifest(project, defaultProfile(), files), null, 2),
    );
    console.log(`Rendered ${files.length} SVG components.`);
  } else if (command === 'print') {
    if (!args[1]) throw new Error('An output HTML path is required');
    const profile = args[2] ? JSON.parse(await readFile(args[2], 'utf8')) : defaultProfile();
    await save(args[1], printHtml(project, profile, impose(project, profile)));
    console.log(args[1]);
  } else if (command === 'batch' || command === 'script') {
    if (args.length < 3) throw new Error(`${command} needs an input and output path`);
    let operations: Operation[];
    if (command === 'batch') operations = JSON.parse(await readFile(args[1]!, 'utf8'));
    else {
      const module = await import(pathToFileURL(path.resolve(args[1]!)).href);
      operations = await module.default(structuredClone(project));
    }
    await save(args[2]!, encodeProject(applyOperations(project, operations)));
    console.log(args[2]);
  } else if (command === 'diff')
    console.log(JSON.stringify(compareDocuments(project, await readProject(args[1]!)), null, 2));
  else if (command === 'tts') {
    await save(args[2]!, JSON.stringify(ttsSave(project, args[1]!), null, 2));
    console.log(args[2]);
  } else throw new Error(`Unknown command: ${command}`);
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
