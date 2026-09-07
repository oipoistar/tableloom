import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import {
  createStarter,
  starters,
  emptyProject,
  cardTemplate,
  defaultProfile,
  addComponentSet,
  element,
} from '../src/core/starters';
import { clone, parseProject, documentState, stableStringify, getPath, quantity } from '../src/core/model';
import {
  renderComponent,
  preflight,
  registerFont,
  resolveTemplate,
  resolvedElements,
  wrapText,
  measureText,
} from '../src/core/layout';
import { matchesRule, evaluateFormula } from '../src/core/rules';
import { generateRows, shuffle } from '../src/core/generators';
import { encodeProject, decodeProject, installPackage, builtinPackages } from '../src/core/packages';
import { impose, renderPrintPage, ttsSave, imageSheets } from '../src/core/export';
import { compareDocuments, drawProbability, deckStructure } from '../src/core/revision';
import { parseDelimited, exportDelimited, mergeRows, pasteCells } from '../src/core/data';
import { validateSvg } from '../src/core/assets';
beforeAll(() => {
  for (const weight of [400, 700]) {
    registerFont(
      `Source Sans 3:${weight}`,
      fontkit.create(
        new Uint8Array(
          readFileSync(
            `node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-${weight}-normal.woff`,
          ),
        ),
      ),
    );
    registerFont(
      `Alegreya:${weight}`,
      fontkit.create(
        new Uint8Array(
          readFileSync(`node_modules/@fontsource/alegreya/files/alegreya-latin-${weight}-normal.woff`),
        ),
      ),
    );
  }
});
describe('open project format', () => {
  for (const starter of starters)
    it(`${starter.name} survives a self-contained save and reopen`, () => {
      const p = createStarter(starter.id);
      const restored = decodeProject(encodeProject(p));
      expect(restored).toEqual(p);
      expect(parseProject(restored).sets.length).toBeGreaterThan(0);
    });
  it('rejects newer files without modifying them', () => {
    const p = createStarter();
    p.formatVersion = 999;
    const before = JSON.stringify(p);
    expect(() => parseProject(p)).toThrow(/supports format/);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('rejects duplicate component identities', () => {
    const p = createStarter();
    p.sets[0]!.rows.push(clone(p.sets[0]!.rows[0]!));
    expect(() => parseProject(p)).toThrow(/Duplicate/);
  });
  it('rejects invalid geometry', () => {
    const p = createStarter();
    p.templates[0]!.width = -10;
    expect(() => parseProject(p)).toThrow(/Invalid project/);
  });
  it('preserves optional supported-version extensions', () => {
    const p = { ...createStarter(), extensionMetadata: { example: 'retained' } };
    expect((parseProject(p) as typeof p).extensionMetadata).toEqual(p.extensionMetadata);
  });
});
describe('templates, binding and scope', () => {
  it('only overrides the selected row', () => {
    const p = createStarter();
    const s = p.sets[0]!;
    const [a, b] = s.rows;
    s.overrides[a!.id] = { title: { color: '#ff0000' } };
    expect(resolvedElements(p, s, a!).find((e) => e.id === 'title')?.color).toBe('#ff0000');
    expect(resolvedElements(p, s, b!).find((e) => e.id === 'title')?.color).not.toBe('#ff0000');
  });
  it('shared styles affect all linked titles', () => {
    const p = createStarter();
    p.styles.title!.fontSize = 18;
    for (const r of p.sets[0]!.rows)
      expect(resolvedElements(p, p.sets[0]!, r).find((e) => e.id === 'title')?.fontSize).toBe(18);
  });
  it('template variants inherit additions without duplicating existing IDs', () => {
    const p = createStarter();
    const parent = p.templates[0]!;
    p.templates.push({
      ...clone(parent),
      id: 'variant',
      parentId: parent.id,
      elements: [{ ...parent.elements[1]!, color: '#456789' }],
    });
    const resolved = resolveTemplate(p, 'variant');
    expect(resolved.elements.length).toBe(parent.elements.length);
    expect(resolved.elements.find((e) => e.id === 'title')?.color).toBe('#456789');
    parent.elements.push(element('text', { id: 'new', text: 'Inherited' }));
    expect(resolveTemplate(p, 'variant').elements.some((e) => e.id === 'new')).toBe(true);
  });
  it('rejects circular template inheritance', () => {
    const p = createStarter();
    p.templates[0]!.parentId = p.templates[0]!.id;
    expect(() => resolveTemplate(p, p.templates[0]!.id)).toThrow(/Circular/);
  });
  it('escapes markup in text rather than executing it', () => {
    const p = createStarter();
    p.sets[0]!.rows[0]!.name = '<script>alert(1)</script>';
    const svg = renderComponent(p, p.sets[0]!, p.sets[0]!.rows[0]!);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;');
  });
  it('renders responsive action lists including the last entry', () => {
    const p = createStarter('actions');
    const row = p.sets[0]!.rows[2]!;
    const svg = renderComponent(p, p.sets[0]!, row);
    expect(svg).toContain('Build');
    expect(svg).toContain('Gather');
  });
  it('shows actual missing assets and the field to repair', () => {
    const p = createStarter();
    p.sets[0]!.rows[0]!.art = 'missing';
    const issue = preflight(p).find((i) => i.code === 'asset');
    expect(issue?.rowId).toBe('STR-01');
    expect(issue?.field).toBe('art');
    expect(issue?.elementId).toBe('artwork');
  });
  it('flags overflowing multilingual text without shrinking the chosen font', () => {
    const p = createStarter();
    p.sets[0]!.rows[0]!.effect = 'Längerer Text '.repeat(100);
    const issue = preflight(p).find((i) => i.code === 'overflow');
    expect(issue?.elementId).toBe('effect');
    expect(p.styles.rules!.fontSize).toBe(9);
  });
  it('renders localized bound fields and reports missing translations', () => {
    const p = createStarter();
    p.locales.push('de');
    p.translations.de = { 'STR-01.name': 'Salzfarm' };
    expect(renderComponent(p, p.sets[0]!, p.sets[0]!.rows[0]!, { locale: 'de' })).toContain('Salzfarm');
    expect(preflight(p, 'de').some((i) => i.code === 'translation')).toBe(true);
  });
  it('measures bundled font runs rather than character count', () => {
    expect(measureText('WWW', 10)).toBeGreaterThan(measureText('iii', 10) * 2);
  });
  it('wraps an unbroken long word instead of losing it', () => {
    const lines = wrapText('abcdefghijk', 4, { fontSize: 10 });
    expect(lines.length).toBeGreaterThan(1);
    expect(
      lines
        .flatMap((l) => l.runs)
        .map((r) => r.text)
        .join(''),
    ).toBe('abcdefghijk');
  });
});
describe('safe rules and generators', () => {
  it('supports nested paths without prototype access', () => {
    expect(getPath({ cost: { salt: 2 } }, 'cost.salt')).toBe(2);
    expect(getPath({}, 'constructor.name')).toBeUndefined();
  });
  it('matches compound conditions and collapses hidden values', () => {
    expect(
      matchesRule(
        {
          mode: 'all',
          conditions: [
            { field: 'salt', op: 'gt', value: 0 },
            { field: 'name', op: 'contains', value: 'farm' },
          ],
        },
        { id: 'a', name: 'Salt Farm', salt: 1 },
      ),
    ).toBe(true);
  });
  it('evaluates arithmetic, shared variables, nested sums and lookups', () => {
    const p = createStarter();
    const r = p.sets[0]!.rows[0]!;
    expect(evaluateFormula('salt + startingHand * 2', r, p).value).toBe(11);
    expect(
      evaluateFormula('sum(actions, "cost")', { id: 'a', actions: [{ cost: 2 }, { cost: 3 }] }, p).value,
    ).toBe(5);
    expect(evaluateFormula('lookup("structures", "id", "STR-01", "name")', r, p).value).toBe('Salt Farm');
  });
  it('reports unsafe expressions and divide by zero', () => {
    const p = createStarter();
    for (const expr of ['constructor.constructor("return process")()', 'window.alert(1)', 'salt / 0'])
      expect(evaluateFormula(expr, p.sets[0]!.rows[0]!, p).error).toBeTruthy();
  });
  it('keeps generator variant identities and edits across expansion', () => {
    const generator = {
      dimensions: [
        { field: 'suit', values: ['A', 'B'] },
        { field: 'rank', values: [1, 2] },
      ],
      exclusions: [],
      seed: 42,
    };
    const first = generateRows(generator);
    first[0]!.name = 'Custom';
    generator.dimensions[1]!.values.push(3 as never);
    const expanded = generateRows(generator, first);
    expect(expanded).toHaveLength(6);
    expect(expanded.find((r) => r.id === first[0]!.id)?.name).toBe('Custom');
  });
  it('honors exclusions and rejects explosive generation', () => {
    expect(
      generateRows({
        dimensions: [
          { field: 'suit', values: ['A', 'B'] },
          { field: 'rank', values: [1, 2] },
        ],
        exclusions: [{ suit: 'B', rank: 2 }],
        seed: 1,
      }),
    ).toHaveLength(3);
    expect(() =>
      generateRows({
        dimensions: [
          { field: 'a', values: Array.from({ length: 101 }, (_, i) => i) },
          { field: 'b', values: Array.from({ length: 101 }, (_, i) => i) },
        ],
        exclusions: [],
        seed: 1,
      }),
    ).toThrow(/10,000/);
  });
  it('uses reproducible non-mutating shuffles', () => {
    const values = Array.from({ length: 30 }, (_, i) => i);
    expect(shuffle(values, 42)).toEqual(shuffle(values, 42));
    expect(shuffle(values, 42)).not.toEqual(shuffle(values, 43));
    expect(values[0]).toBe(0);
  });
});
describe('data exchange', () => {
  it('round-trips quoted, multiline and Unicode cells with stable IDs', () => {
    const rows = [{ id: 'row-1', name: '"Žuti", vrč', effect: 'line one\nline two', qty: 2 }];
    const fields = [
      { key: 'name', type: 'text' as const },
      { key: 'effect', type: 'text' as const },
      { key: 'qty', type: 'number' as const },
    ];
    expect(parseDelimited(exportDelimited(rows, fields), fields).rows).toEqual(rows);
  });
  it('merges by ID and only removes absent records in replace mode', () => {
    const a = [
      { id: 'a', name: 'old' },
      { id: 'b', name: 'keep' },
    ];
    const b = [
      { id: 'a', name: 'new' },
      { id: 'c', name: 'added' },
    ];
    expect(mergeRows(a, b, 'merge').map((r) => r.name)).toEqual(['new', 'keep', 'added']);
    expect(mergeRows(a, b, 'replace')).toEqual(b);
  });
  it('pastes rectangular cells and creates stable new rows', () => {
    const result = pasteCells(
      [{ id: 'a', name: 'A', qty: 1 }],
      [
        { key: 'name', type: 'text' },
        { key: 'qty', type: 'number' },
      ],
      0,
      0,
      'B\t3\nC\t4',
    );
    expect(result[0]).toEqual({ id: 'a', name: 'B', qty: 3 });
    expect(result[1]?.qty).toBe(4);
    expect(result[1]?.id).toBeTruthy();
  });
  it('rejects duplicate IDs and reserved headers', () => {
    expect(() => parseDelimited('id,name\na,X\na,Y')).toThrow(/Duplicate/);
    expect(() => parseDelimited('id,__proto__\na,test')).toThrow(/reserved/);
  });
  it('neutralizes spreadsheet formula injection on export', () => {
    expect(exportDelimited([{ id: 'a', name: '=CMD()' }], [{ key: 'name', type: 'text' }])).toContain(
      "'=CMD()",
    );
  });
});
describe('revision and probabilities', () => {
  it('finds a single edited record and added/removed components', () => {
    const p = createStarter();
    const before = documentState(p);
    p.sets[0]!.rows[0]!.salt = 10;
    p.sets[0]!.rows.pop();
    p.sets[0]!.rows.push({ id: 'new', name: 'New', qty: 1 });
    const changes = compareDocuments(before, p);
    expect(changes.map((c) => c.kind)).toEqual(['data', 'added', 'removed']);
    expect(changes[0]!.fields).toContain('salt');
  });
  it('finds all components affected by a shared title style', () => {
    const p = createStarter('orchard');
    const before = documentState(p);
    p.styles.title!.color = '#0000ff';
    expect(compareDocuments(before, p)).toHaveLength(p.sets[0]!.rows.length);
  });
  it('distinguishes artwork edits from a changed deck structure', () => {
    const p = createStarter();
    const before = deckStructure(p);
    p.sets[0]!.rows[0]!.effect = 'changed';
    expect(deckStructure(p)).toBe(before);
    p.sets[0]!.rows[0]!.qty = 9;
    expect(deckStructure(p)).not.toBe(before);
  });
  it('computes exact draw probabilities including edge cases', () => {
    expect(drawProbability(10, 2, 2)).toBeCloseTo(17 / 45, 10);
    expect(drawProbability(10, 10, 5)).toBeCloseTo(1);
    expect(drawProbability(10, 0, 5)).toBe(0);
    expect(drawProbability(0, 0, 0, 0)).toBe(1);
    expect(() => drawProbability(5, 7, 1)).toThrow();
  });
});
describe('physical and tabletop exports', () => {
  it('imposes all quantities and paired backs with mirrored long-edge positions', () => {
    const p = createStarter('orchard');
    const profile = defaultProfile();
    const pages = impose(p, profile);
    const front = pages.filter((p) => p.label.endsWith('fronts')).flatMap((p) => p.placements);
    const back = pages.filter((p) => p.label.endsWith('backs')).flatMap((p) => p.placements);
    expect(front.length).toBe(p.sets[0]!.rows.reduce((s, r) => s + quantity(r), 0));
    expect(back.length).toBe(front.length);
    expect(back[0]!.x).toBeCloseTo(profile.width - front[0]!.x - front[0]!.width);
    expect(back[0]!.rowId).toBe(front[0]!.rowId);
  });
  it('applies short-edge and calibration offsets', () => {
    const p = createStarter('orchard');
    const profile = { ...defaultProfile(), duplex: 'short' as const, offsetX: 0.3, offsetY: -0.2 };
    const [f, b] = impose(p, profile);
    expect(b!.placements[0]!.x).toBeCloseTo(f!.placements[0]!.x + 0.3);
    expect(b!.placements[0]!.y).toBeCloseTo(
      profile.height - f!.placements[0]!.y - f!.placements[0]!.height - 0.2,
    );
  });
  it('pairs folded fronts with rotated backs on the same sheet', () => {
    const pages = impose(createStarter('orchard'), { ...defaultProfile(), duplex: 'fold' });
    expect(pages[0]!.placements[1]!.back).toBe(true);
    expect(pages[0]!.placements[1]!.rotation).toBe(180);
  });
  it('prints only changed rows and their required backs', () => {
    const p = createStarter('orchard');
    const before = documentState(p);
    p.sets[0]!.rows[0]!.name = 'Changed';
    const pages = impose(p, { ...defaultProfile(), changedOnly: true }, before);
    expect(new Set(pages.flatMap((p) => p.placements.map((c) => c.rowId)))).toEqual(new Set(['STR-01']));
    expect(pages.some((p) => p.placements.some((c) => c.back))).toBe(true);
  });
  it('requires an explicit baseline and catches impossible paper', () => {
    expect(() => impose(createStarter(), { ...defaultProfile(), changedOnly: true })).toThrow(/snapshot/);
    expect(() => impose(createStarter('orchard'), { ...defaultProfile(), width: 20, height: 20 })).toThrow(
      /does not fit/,
    );
  });
  it('splits large boards into printable tiles', () => {
    const p = emptyProject();
    addComponentSet(p, 'Large board', 'board', 420, 297);
    const pages = impose(p, defaultProfile());
    expect(pages).toHaveLength(6);
    expect(pages[1]!.placements[0]!.tileX).toBeGreaterThan(0);
    expect(renderPrintPage(p, pages[0]!, defaultProfile())).toContain('viewBox="0 0');
  });
  it('exports valid TTS deck/card relationships and quantities', () => {
    const p = createStarter('orchard');
    const save = ttsSave(p, 'C:/Games/Orchard/assets') as {
      ObjectStates: {
        DeckIDs: number[];
        ContainedObjects: { CardID: number }[];
        CustomDeck: Record<string, { NumWidth: number; NumHeight: number; FaceURL: string }>;
      }[];
    };
    const deck = save.ObjectStates[0]!;
    expect(deck.DeckIDs).toHaveLength(20);
    expect(deck.ContainedObjects.map((c) => c.CardID)).toEqual(deck.DeckIDs);
    expect(deck.CustomDeck['1']!.FaceURL).toBe('C:/Games/Orchard/assets/structures-1-fronts.png');
    expect(deck.DeckIDs.every((id) => id % 100 < 69)).toBe(true);
  });
  it('reserves a hidden slot and partitions large sheets', () => {
    const p = createStarter('orchard');
    const set = p.sets[0]!;
    set.rows = Array.from({ length: 140 }, (_, i) => ({ ...clone(set.rows[0]!), id: `row-${i}` }));
    expect(imageSheets(p, set)).toHaveLength(3);
  });
});
describe('untrusted artwork', () => {
  it('rejects active content, external assets and XML entities', () => {
    for (const source of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"/>',
      '<svg><image href="https://evil.test/pixel"/></svg>',
      '<!DOCTYPE svg [<!ENTITY secret SYSTEM "file:///secret">]><svg/>',
    ])
      expect(() => validateSvg(source)).toThrow();
  });
  it('permits self-contained vector paths and internal references', () => {
    expect(() =>
      validateSvg('<svg><path d="M0 0L10 10" fill="#000"/><use href="#part"/></svg>'),
    ).not.toThrow();
  });
});
