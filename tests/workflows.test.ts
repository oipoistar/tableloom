import { describe, it, expect } from 'vitest';
import { createStarter, emptyProject, element, defaultProfile, addComponentSet } from '../src/core/starters';
import { clone, documentState } from '../src/core/model';
import { builtinPackages, installPackage, namespacedPackage, validatePackage } from '../src/core/packages';
import { flowChildren, preflight, renderComponent } from '../src/core/layout';
import { compareDocuments, feedbackSummary, outputRecord, outputImpacts } from '../src/core/revision';
import { groupElements, ungroupElement, arrangeElements } from '../src/core/selection';
import { productionJobs } from '../src/core/production';
import { impose, renderPrintPage, imageSheets } from '../src/core/export';
import { PreflightCache } from '../src/core/cache';
describe('resource and revision workflows', () => {
  it('identifies saved outputs affected by later edits and removals', () => {
    const p = createStarter('orchard');
    p.outputs = [outputRecord(p, defaultProfile(), 'prototype.pdf')];
    expect(outputImpacts(p)[0]!.changed).toBe(0);
    p.sets[0]!.rows[0]!.name = 'Revised';
    expect(outputImpacts(p)[0]!.changed).toBe(1);
    p.sets[0]!.rows.pop();
    expect(outputImpacts(p)[0]!.changed).toBe(2);
  });
  it('installs self-contained resources with remapped references', () => {
    const p = emptyProject('Consumer'),
      pack = builtinPackages().find((p) => p.id === 'tableloom.actions')!;
    installPackage(p, pack);
    const next = namespacedPackage(pack);
    const template = p.templates.find((t) => t.id === next.templates[0]!.id)!;
    expect(template.elements.find((e) => e.type === 'repeater')?.blockId).toBe(
      'tableloom.actions:action-block',
    );
    expect(p.assets.length).toBeGreaterThan(0);
    expect(p.styles['tableloom.actions:title']).toBeTruthy();
    const row = next.sampleRows[0]!;
    const set = {
      id: 's',
      kind: 'card' as const,
      name: 'Imported',
      templateId: template.id,
      rows: [row],
      fields: next.fields,
      overrides: {},
    };
    p.sets.push(set);
    expect(preflight(p).filter((i) => i.code === 'asset' || i.code === 'binding')).toEqual([]);
  });
  it('updates unmodified resources while preserving local overrides', () => {
    const p = emptyProject('Consumer'),
      pack = builtinPackages()[0]!;
    installPackage(p, pack);
    const id = pack.id + ':' + pack.templates[0]!.id;
    p.templates.find((t) => t.id === id)!.background = '#abcdef';
    const update = clone(pack);
    update.version = '1.0.1';
    update.templates[0]!.background = '#123456';
    update.symbols[0]!.color = '#cccccc';
    installPackage(p, update);
    expect(p.templates.find((t) => t.id === id)!.background).toBe('#abcdef');
    expect(p.symbols.find((s) => s.id === pack.id + ':' + update.symbols[0]!.id)!.color).toBe('#cccccc');
    expect(p.packages[0]!.version).toBe('1.0.1');
  });
  it('rejects incompatible and active-content packages', () => {
    const pack = builtinPackages()[0]!;
    pack.minAppVersion = '9.0.0';
    expect(() => validatePackage(pack)).toThrow(/newer/);
  });
  it('does not mark components for unused artwork and terminology', () => {
    const p = createStarter('orchard'),
      before = documentState(p);
    p.assets.push({ ...clone(p.assets[0]!), id: 'unused', hash: 'new' });
    p.terms.push({ id: 'unused', name: 'Unused', definition: '', translations: {} });
    expect(compareDocuments(before, p)).toEqual([]);
    p.assets[0]!.hash = 'changed';
    const changes = compareDocuments(before, p);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.length).toBeLessThan(p.sets[0]!.rows.length);
  });
  it('rechecks only changed records and returns identical findings', () => {
    const p = createStarter('orchard'),
      cache = new PreflightCache();
    expect(cache.run(p)).toEqual(preflight(p));
    p.sets[0]!.rows[0]!.effect = 'long '.repeat(150);
    expect(
      cache
        .run(p)
        .map((i) => i.id)
        .sort(),
    ).toEqual(
      preflight(p)
        .map((i) => i.id)
        .sort(),
    );
    expect(cache.size).toBe(p.sets[0]!.rows.length);
  });
});
describe('layout editing and responsive checks', () => {
  it('groups and ungroups while preserving physical coordinates', () => {
    const a = element('rect', { id: 'a', x: 8, y: 9, w: 10, h: 4 }),
      b = element('text', { id: 'b', x: 22, y: 18, w: 12, h: 6 });
    const grouped = groupElements([a, b], ['a', 'b']);
    expect(grouped.elements).toHaveLength(1);
    const result = ungroupElement(grouped.elements, grouped.id);
    expect(result.map((e) => [e.x, e.y, e.w, e.h])).toEqual([
      [8, 9, 10, 4],
      [22, 18, 12, 6],
    ]);
  });
  it('distributes unequal widths with equal gaps and ignores locks', () => {
    const items = [
      element('rect', { id: 'a', x: 0, w: 10 }),
      element('rect', { id: 'b', x: 20, w: 20 }),
      element('rect', { id: 'c', x: 60, w: 10 }),
    ];
    const patches = arrangeElements(items, 'x', 'distribute');
    expect(patches.b!.x).toBe(25);
    items[1]!.locked = true;
    expect(arrangeElements(items, 'x', 'center').b).toBeUndefined();
  });
  it('preflights actual repeater item bindings and block overflow', () => {
    const p = createStarter('actions');
    const set = p.sets[0]!;
    set.rows = [
      { ...set.rows[0]!, actions: Array.from({ length: 20 }, (_, i) => ({ title: 'Gather', cost: i })) },
    ];
    expect(preflight(p).some((i) => i.code === 'flow-overflow')).toBe(true);
    expect(preflight(p).some((i) => i.code === 'binding' && i.field === 'title')).toBe(false);
  });
  it('collapses hidden flow children and obeys height limits', () => {
    const p = createStarter('actions');
    const group = element('group', {
      layout: 'vertical',
      w: 50,
      h: 100,
      gap: 2,
      children: [
        element('text', { hidden: true, h: 20 }),
        element('text', {
          id: 'visible',
          autoHeight: true,
          minHeight: 10,
          maxHeight: 12,
          w: 40,
          text: 'Short',
        }),
      ],
    });
    const children = flowChildren(group, { id: 'r' }, p);
    expect(children).toHaveLength(1);
    expect(children[0]!.element.y).toBe(0);
    expect(children[0]!.element.h).toBe(10);
  });
  it('quotes multiword font families in exported SVG', () => {
    const p = createStarter('orchard');
    expect(renderComponent(p, p.sets[0]!, p.sets[0]!.rows[0]!)).toContain('&apos;Source Sans 3&apos;');
  });
});
describe('physical and feedback outputs', () => {
  it('exports nested cut geometry independently of artwork and backgrounds', () => {
    const p = createStarter('orchard'),
      set = p.sets[0]!,
      t = p.templates.find((t) => t.id === set.templateId)!;
    t.elements.push(
      element('group', {
        id: 'outer',
        children: [
          element('path', { id: 'nested-cut', layer: 'cut', path: 'M0 0H10V10Z', stroke: '#ff0000' }),
        ],
      }),
    );
    const svg = renderComponent(p, set, set.rows[0]!, { layer: 'cut' });
    expect(svg).toContain('data-element-id="nested-cut"');
    expect(svg).not.toContain('data-element-id="title"');
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('data-production-layer="cut"');
  });
  it('exports the selected translation consistently in sheets, artwork and production', () => {
    const p = createStarter('orchard'),
      set = p.sets[0]!,
      row = set.rows[0]!;
    p.locales.push('de');
    p.translations.de = { [row.id + '.name']: 'Apfelwagen' };
    const profile = { ...defaultProfile(), locale: 'de' };
    expect(renderPrintPage(p, impose(p, profile)[0]!, profile)).toContain('Apfelwagen');
    expect(imageSheets(p, set, false, 'de')[0]!.svg).toContain('Apfelwagen');
    expect(productionJobs(p, profile)[0]!.html).toContain('Apfelwagen');
    expect(row.name).toBe('Apple Cart');
  });
  it('production artwork has individual trimmed pages and paired backs', () => {
    const p = createStarter('orchard');
    const jobs = productionJobs(p, { ...defaultProfile(), bleed: true });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.width).toBe(69);
    expect(jobs[0]!.height).toBe(94);
    expect(jobs[0]!.bleed).toBe(3);
    expect(jobs[0]!.html.match(/<section>/g)).toHaveLength(12);
  });
  it('changed-only production includes one edited front and its back', () => {
    const p = createStarter('orchard'),
      before = documentState(p);
    p.sets[0]!.rows[0]!.name = 'Revised';
    expect(
      productionJobs(p, { ...defaultProfile(), changedOnly: true }, before)[0]!.html.match(/<section>/g),
    ).toHaveLength(2);
  });
  it('nests mixed token sets without overlapping placements', () => {
    const p = emptyProject('Mixed');
    addComponentSet(p, 'Small', 'token', 20, 20);
    addComponentSet(p, 'Large', 'tile', 40, 30);
    p.sets.forEach((s) => (s.rows[0]!.qty = 10));
    const pages = impose(p, { ...defaultProfile(), nesting: true, duplex: 'none' });
    expect(pages.flatMap((p) => p.placements)).toHaveLength(20);
    for (const page of pages)
      for (const [i, a] of page.placements.entries())
        for (const b of page.placements.slice(i + 1))
          expect(
            a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
          ).toBe(true);
  });
  it('compares recorded outcomes without inventing unrecorded values', () => {
    const base = {
      target: 'card',
      session: 'A',
      category: 'pacing',
      resolved: false,
      createdAt: '2026-01-01',
      text: 'Slow',
    };
    const summary = feedbackSummary([
      { ...base, id: '1', metric: 'turns', value: 8 },
      { ...base, id: '2', metric: 'turns', value: 12 },
      { ...base, id: '3', session: 'B', metric: 'turns', value: 6 },
    ]);
    expect(summary.observations[0]!.count).toBe(3);
    expect(summary.metrics.map((m) => m.mean)).toEqual([10, 6]);
  });
});
