import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { Project, ResourcePackage, DocumentState } from './model';
import { parseProject, clone, uid, stableStringify, fileId } from './model';
import { createStarter, defaultProfile, emptyProject, cardTemplate, makeTemplate } from './starters';
export function encodeProject(project: Project): Uint8Array {
  const copy = clone(project);
  const files: Record<string, Uint8Array> = {};
  for (const asset of copy.assets) {
    const path = `assets/${fileId(asset.id)}.data`;
    files[path] = strToU8(asset.data);
    asset.data = `archive:${path}`;
  }
  files['project.json'] = strToU8(JSON.stringify(copy, null, 2));
  files['manifest.json'] = strToU8(
    JSON.stringify(
      { format: 'tableloom', version: 1, projectId: project.id, files: Object.keys(files) },
      null,
      2,
    ),
  );
  return zipSync(files, { level: 6 });
}
export function decodeProject(bytes: Uint8Array): Project {
  if (bytes.length > 150_000_000) throw new Error('Project package is too large (150 MB limit).');
  if (bytes[0] === 123) return parseProject(JSON.parse(strFromU8(bytes)));
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (file.originalSize > 150_000_000) throw new Error('An archive entry exceeds the size limit.');
      return true;
    },
  });
  let total = 0;
  for (const [name, data] of Object.entries(entries)) {
    total += data.length;
    if (name.includes('..') || name.startsWith('/') || name.includes('\\') || total > 300_000_000)
      throw new Error('Invalid archive path or oversized expanded package');
  }
  if (!entries['project.json']) throw new Error('The archive does not contain project.json');
  const raw = JSON.parse(strFromU8(entries['project.json']));
  for (const asset of raw.assets ?? []) {
    if (typeof asset.data === 'string' && asset.data.startsWith('archive:')) {
      const data = entries[asset.data.slice(8)];
      if (!data) throw new Error(`Missing original asset ${asset.name}`);
      asset.data = strFromU8(data);
    }
  }
  return parseProject(raw);
}
export function bundleFiles(files: Record<string, Uint8Array | string>): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])),
    { level: 6 },
  );
}
export function builtinPackages(): ResourcePackage[] {
  return [
    ...['saltmarsh', 'orchard', 'terrain', 'actions', 'tokens', 'expedition'].map((id) => {
      const p = createStarter(id);
      return {
        id: `tableloom.${id}`,
        name: p.name,
        version: '1.0.0',
        license: 'CC0-1.0',
        description: p.description,
        minAppVersion: '0.1.0',
        dependencies: [],
        templates: p.templates,
        assets: p.assets,
        styles: p.styles,
        terms: p.terms,
        blocks: p.blocks,
        symbols: p.symbols,
        profiles: [{ ...defaultProfile(), id: `profile-${id}` }],
        fields: p.sets[0]?.fields ?? [],
        sampleRows: p.sets[0]?.rows.slice(0, 3) ?? [],
      };
    }),
    printerPackage(),
  ];
}
export function packagePreview(doc: DocumentState, pack: ResourcePackage) {
  validatePackage(pack);
  const installed = doc.packages.find((p) => p.id === pack.id);
  return {
    installed: installed?.version,
    templates: pack.templates.length,
    blocks: pack.blocks.length,
    symbols: pack.symbols.length,
    updates: installed
      ? pack.templates
          .filter((t) => {
            const old = installed.resource.templates.find((o) => o.id === t.id);
            return old && stableStringify(t) !== stableStringify(old);
          })
          .map((t) => t.name)
      : [],
    missingDependencies: pack.dependencies.filter(
      (d) => !doc.packages.some((p) => p.id === d.id && p.version === d.version),
    ),
  };
}
export function validatePackage(pack: ResourcePackage): ResourcePackage {
  if (
    !pack ||
    !/^[-a-zA-Z0-9_.]{1,100}$/.test(pack.id) ||
    !/^\d+\.\d+\.\d+$/.test(pack.version) ||
    !pack.license ||
    !Array.isArray(pack.dependencies) ||
    !Array.isArray(pack.fields) ||
    !Array.isArray(pack.sampleRows)
  )
    throw new Error('Invalid resource package metadata');
  const version = (v: string) => v.split('.').map(Number);
  const required = version(pack.minAppVersion ?? '999.0.0'),
    supported = version('0.1.0');
  for (let i = 0; i < 3; i++) {
    if (required[i]! > supported[i]!) throw new Error('This package requires a newer Tableloom version');
    if (required[i]! < supported[i]!) break;
  }
  const p = emptyProject(pack.name);
  Object.assign(p, {
    templates: pack.templates,
    blocks: pack.blocks,
    symbols: pack.symbols,
    assets: pack.assets ?? [],
    styles: pack.styles ?? {},
    terms: pack.terms ?? [],
    profiles: pack.profiles,
    sets: pack.templates.length
      ? [
          {
            id: 'sample',
            name: 'Sample',
            kind: 'card',
            templateId: pack.templates[0]!.id,
            fields: pack.fields,
            rows: pack.sampleRows,
            overrides: {},
          },
        ]
      : [],
  });
  parseProject(p);
  return clone(pack);
}
export function namespacedPackage(pack: ResourcePackage): ResourcePackage {
  const p = validatePackage(pack),
    ids = new Map<string, string>();
  for (const values of [p.templates, p.blocks, p.symbols, p.assets ?? [], p.terms ?? [], p.profiles])
    for (const item of values) ids.set(item.id, `${p.id}:${item.id}`);
  for (const id of Object.keys(p.styles ?? {})) ids.set(id, `${p.id}:${id}`);
  const ref = (value: string) => ids.get(value) ?? value;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          typeof v === 'string' &&
          ['id', 'parentId', 'blockId', 'symbolId', 'imageId', 'styleId'].includes(key)
            ? ref(v)
            : walk(v),
        ]),
      );
    if (typeof value === 'string')
      return ref(value).replace(/\[(icon|term):([^\]]+)\]/g, (_, kind, id) => `[${kind}:${ref(id)}]`);
    return value;
  };
  const next = walk(p) as ResourcePackage;
  next.id = p.id;
  next.styles = Object.fromEntries(Object.entries(p.styles ?? {}).map(([id, style]) => [ref(id), style]));
  return next;
}
export function installPackage(doc: DocumentState, pack: ResourcePackage): void {
  validatePackage(pack);
  const preview = packagePreview(doc, pack);
  if (preview.missingDependencies.length) throw new Error('Install required package versions first');
  const installed = doc.packages.find((p) => p.id === pack.id);
  const old = installed ? namespacedPackage(installed.resource) : undefined;
  const next = namespacedPackage(pack);
  const apply = <T extends { id: string }>(target: T[], incoming: T[], previous: T[] = []) =>
    incoming.forEach((item) => {
      const index = target.findIndex((x) => x.id === item.id);
      const prev = previous.find((p) => p.id === item.id);
      if (index < 0) target.push(clone(item));
      else if (prev && stableStringify(target[index]) === stableStringify(prev)) target[index] = clone(item);
    });
  apply(doc.templates, next.templates, old?.templates);
  apply(doc.blocks, next.blocks, old?.blocks);
  apply(doc.symbols, next.symbols, old?.symbols);
  apply(doc.assets, next.assets ?? [], old?.assets);
  apply(doc.terms, next.terms ?? [], old?.terms);
  apply(doc.profiles, next.profiles, old?.profiles);
  for (const [id, style] of Object.entries(next.styles ?? {}))
    if (!doc.styles[id] || stableStringify(doc.styles[id]) === stableStringify(old?.styles?.[id]))
      doc.styles[id] = clone(style);
  if (!installed)
    doc.packages.push({ id: pack.id, name: pack.name, version: pack.version, resource: clone(pack) });
  else {
    installed.version = pack.version;
    installed.resource = clone(pack);
  }
}

export function printerPackage(): ResourcePackage {
  const base = createStarter('orchard');
  const front = clone(base.templates[0]!);
  front.id = 'poker-front';
  front.name = 'Poker card · 2.5 × 3.5 in';
  front.width = 63.5;
  front.height = 88.9;
  front.bleed = 3.175;
  front.safe = 3.175;
  const back = clone(base.templates[1]!);
  Object.assign(back, {
    id: 'poker-back',
    name: 'Poker back · 2.5 × 3.5 in',
    width: 63.5,
    height: 88.9,
    bleed: 3.175,
    safe: 3.175,
  });
  return {
    id: 'tableloom.poker-print',
    name: 'Poker printing reference',
    version: '2026.9.7',
    license: 'CC0-1.0',
    minAppVersion: '0.1.0',
    description:
      '2.5 × 3.5 in finished cards; 1/8 in bleed; 825 × 1125 px at 300 DPI. Based on The Game Crafter’s published poker dimensions and bleed guidance. Confirm the current product template before ordering.',
    dependencies: [],
    templates: [front, back],
    blocks: [],
    styles: base.styles,
    assets: base.assets,
    symbols: base.symbols,
    terms: base.terms,
    fields: base.sets[0]!.fields,
    sampleRows: base.sets[0]!.rows.slice(0, 3),
    profiles: [
      {
        ...defaultProfile(),
        id: 'poker-png',
        name: 'Poker reference · PNG 300 DPI',
        presetVersion: '2026.9.7',
        destination: 'images',
        artFormat: 'png',
        bleed: true,
        dpi: 300,
        convention: 'set-id/row-id-front.png and row-id-back.png; quantities in manifest.json',
      },
    ],
  };
}
