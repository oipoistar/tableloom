import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { clone, documentState, parseProject, totalCopies } from '../src/core/model';
import { decodeProject, encodeProject } from '../src/core/packages';
import {
  flowChildren,
  preflight,
  registerFont,
  renderComponent,
  textLayout,
  elementContent,
} from '../src/core/layout';
import {
  addTablePiece,
  arrangeZone,
  dealPhase,
  discardPieces,
  drawFromZone,
  isCovered,
  movePieces,
  moveToZone,
  pieceSize,
  restoreSetup,
  shuffleZone,
  zoneObjects,
} from '../src/core/table';
import { tableFixture } from './fixtures/table';
const sample = tableFixture();
beforeAll(() => {
  const manifest = JSON.parse(readFileSync('src/font-manifest.json', 'utf8'));
  for (const f of manifest)
    registerFont(
      `${f.family}:${f.weight}`,
      fontkit.create(new Uint8Array(readFileSync(`node_modules/${f.path}`))),
    );
});
describe('Editable tabletop components', () => {
  it('fits long uppercase titles within a readable minimum without changing source data', () => {
    const el = {
      id: 'title',
      name: 'Title',
      type: 'text' as const,
      x: 0,
      y: 0,
      w: 56,
      h: 6,
      font: 'Stardos Stencil',
      fontSize: 13,
      minFontSize: 8,
      shrinkToFit: true,
      textCase: 'upper' as const,
      binding: 'name',
    };
    const row = { id: 'r', name: 'International guarantees' };
    const content = elementContent(el, row, sample);
    const fit = textLayout(el, content);
    expect(content).toBe('INTERNATIONAL GUARANTEES');
    expect(row.name).toBe('International guarantees');
    expect(fit.overflow).toBe(false);
    expect(fit.size).toBeGreaterThanOrEqual(8);
    expect(fit.size).toBeLessThan(13);
    expect(textLayout({ ...el, w: 1, h: 1 }, content).overflow).toBe(true);
    expect(elementContent({ ...el, binding: undefined, text: 'Gain [icon:salt]' }, row, sample)).toBe(
      'GAIN [icon:salt]',
    );
  });
  it('centers horizontal repeated rows after wrapping', () => {
    const result = flowChildren(
      {
        id: 'repeat',
        name: 'Centered',
        type: 'repeater',
        x: 0,
        y: 0,
        w: 30,
        h: 30,
        layout: 'horizontal',
        flowAlign: 'center',
        gap: 2,
        binding: 'items',
        children: [{ id: 'item', name: 'Item', type: 'rect', x: 0, y: 0, w: 8, h: 8 }],
      },
      { id: 'row', items: [1, 2, 3, 4] },
      sample,
    );
    expect(result.map((r) => [r.element.x, r.element.y])).toEqual([
      [1, 0],
      [11, 0],
      [21, 0],
      [11, 10],
    ]);
  });
  it('keeps hidden identities out of rendered back labels', () => {
    const s = sample.sets[0]!,
      r = s.rows[0]!;
    const back = renderComponent(sample, s, r, { back: true });
    expect(back).toContain('aria-label="Face-down component"');
    expect(back).not.toContain(`aria-label="${r.name}"`);
  });
  it('round trips all table metadata, setups, backs, and original artwork', () => {
    const p = decodeProject(encodeProject(sample));
    expect(p.table).toEqual(sample.table);
    expect(p.setups).toEqual(sample.setups);
    expect(p.assets[0]!.data).toBe(sample.assets[0]!.data);
  });
});
describe('Reusable manual tabletop operations', () => {
  it('prevents taking a covered card and reveals it only after both covering cards leave', () => {
    const p = clone(sample),
      upper = p.table.objects.find(
        (o) =>
          o.layoutId &&
          o.flipped &&
          o.coveredBy?.length === 2 &&
          o.coveredBy.every((id) => !isCovered(p.table, p.table.objects.find((o) => o.id === id)!)),
      )!;
    expect(upper).toBeDefined();
    expect(discardPieces(p, [upper.id])).toBe(0);
    const [a, b] = upper.coveredBy!;
    discardPieces(p, [a!]);
    expect(upper.flipped).toBe(true);
    moveToZone(p, [b!], 'player-b');
    expect(upper.flipped).toBe(false);
    expect(isCovered(p.table, upper)).toBe(false);
  });
  it('retains identity when discarding, retrieving, drawing, and shuffling piles', () => {
    const p = clone(sample),
      piece = p.table.objects.find((o) => o.layoutId && !isCovered(p.table, o))!,
      count = p.table.objects.length;
    discardPieces(p, [piece.id]);
    expect(piece.zoneId).toBe('discard');
    expect(piece.flipped).toBe(false);
    expect(drawFromZone(p, 'discard')).toBe(piece.id);
    expect(piece.zoneId).toBeUndefined();
    expect(p.table.objects).toHaveLength(count);
    const before = zoneObjects(p.table, 'pile')
      .map((o) => o.id)
      .sort();
    shuffleZone(p, 'pile', 9);
    expect(
      zoneObjects(p.table, 'pile')
        .map((o) => o.id)
        .sort(),
    ).toEqual(before);
  });
  it('moves a group in logical coordinates while preserving spacing at table boundaries', () => {
    const p = clone(sample),
      a = addTablePiece(p, 'phase-1', 'card-1-1', 30, 250)!,
      b = addTablePiece(p, 'phase-1', 'card-1-2', 150, 250)!;
    movePieces(p, [a.id, b.id], -500, 40);
    expect(a.x).toBe(0);
    expect(b.x - a.x).toBe(120);
    expect(a.y).toBe(290);
    movePieces(p, [a.id, b.id], 10000, 0);
    expect(b.x + pieceSize(p, b).width).toBeCloseTo(p.table.width!);
    expect(b.x - a.x).toBe(120);
  });
  it('keeps a locked board fixed and uses template aspect ratios for mixed piece sizes', () => {
    const p = clone(sample),
      board = p.table.objects.find((o) => o.id === 'board-map')!,
      before = clone(board);
    movePieces(p, [board.id], 300, 200);
    discardPieces(p, [board.id]);
    expect(board).toEqual(before);
    expect(pieceSize(p, board)).toEqual({ width: 760, height: (760 * 160) / 276 });
    expect(pieceSize(p, p.table.objects.find((o) => o.id === 'small-piece')!).width).toBe(25);
  });
  it('fans acquired cards, reflows their area, and keeps object identities', () => {
    const p = clone(sample),
      cards = p.table.objects.filter((o) => o.layoutId && !isCovered(p.table, o)).slice(0, 3);
    moveToZone(
      p,
      cards.map((o) => o.id),
      'player-a',
    );
    expect(cards.every((o) => o.zoneId === 'player-a')).toBe(true);
    expect(cards[1]!.x).toBeGreaterThan(cards[0]!.x);
    movePieces(p, [cards[0]!.id], 5, 20);
    expect(cards[0]!.zoneId).toBeUndefined();
    expect(cards[1]!.x).toBe(32);
  });
  it('plays through all three layouts without losing cards, acquired pieces or counters', () => {
    const p = clone(sample);
    p.table.counters![0]!.value = 8;
    for (let phase = 0; phase < 3; phase++) {
      if (phase > 0) dealPhase(p, phase);
      expect(p.table.objects.filter((o) => o.layoutId)).toHaveLength(20);
      let n = 0;
      while (p.table.objects.some((o) => o.layoutId)) {
        const next = p.table.objects.find((o) => o.layoutId && !isCovered(p.table, o));
        expect(next).toBeDefined();
        if (n++ % 2) discardPieces(p, [next!.id]);
        else moveToZone(p, [next!.id], 'player-a');
        expect(n).toBeLessThan(21);
      }
    }
    const cards = p.table.objects.filter((o) => o.setId.startsWith('phase-'));
    expect(cards).toHaveLength(69);
    expect(new Set(cards.map((o) => o.rowId)).size).toBe(69);
    expect(p.table.counters![0]!.value).toBe(8);
    expect(zoneObjects(p.table, 'player-a')).toHaveLength(30);
    expect(zoneObjects(p.table, 'discard')).toHaveLength(39);
  });
  it('rejects a premature phase change without disturbing the table', () => {
    const p = clone(sample),
      before = clone(p.table);
    expect(() => dealPhase(p, 1)).toThrow('Finish taking');
    expect(p.table).toEqual(before);
  });
  it('saves independent setups and restores positions without aliasing', () => {
    const p = clone(sample),
      saved = clone(p.table);
    p.table.objects[0]!.x += 100;
    restoreSetup(p, saved);
    expect(p.table).toEqual(saved);
    p.table.objects[0]!.x += 50;
    expect(p.table.objects[0]!.x).not.toBe(saved.objects[0]!.x);
    const snapshot = documentState(p);
    p.table.counters![0]!.value = 30;
    expect(snapshot.table.counters![0]!.value).toBe(3);
  });
  it('validates new tabletop geometry when importing a project', () => {
    const p = clone(sample);
    p.table.objects[0]!.width = -1;
    expect(() => parseProject(p)).toThrow('Invalid project');
    p.table.objects[0]!.width = 100;
    p.table.zones![0]!.height = Infinity;
    expect(() => parseProject(p)).toThrow('Invalid project');
  });
});
