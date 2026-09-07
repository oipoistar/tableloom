import { clone } from '../../src/core/model';
import { createStarter, makeTemplate } from '../../src/core/starters';
import { addTablePiece, dealPhase, moveToZone } from '../../src/core/table';

export function tableFixture() {
  const p = createStarter('orchard');
  const cards = clone(p.sets[0]!);
  p.sets = Array.from({ length: 3 }, (_, phase) => ({
    ...clone(cards),
    id: `phase-${phase + 1}`,
    rows: Array.from({ length: 23 }, (_, index) => ({
      ...clone(cards.rows[0]!),
      id: `card-${phase + 1}-${index + 1}`,
      name: `Test card ${index + 1}`,
      qty: 1,
    })),
  }));
  const board = makeTemplate('Test board', 'board', 276, 160);
  p.templates.push(board);
  p.sets.push({
    ...clone(cards),
    id: 'board',
    templateId: board.id,
    rows: [{ id: 'map', name: 'Test board', qty: 1 }],
  });
  p.table = {
    id: 'test-table',
    name: 'Test setup',
    seed: 42,
    objects: [],
    deck: [],
    dice: [1],
    width: 1675,
    height: 1020,
    counters: [{ id: 'coins', name: 'Coins', value: 3, min: 0, max: 99, color: '#977561' }],
    zones: [
      {
        id: 'discard',
        name: 'Discard',
        x: 650,
        y: 100,
        width: 150,
        height: 205,
        kind: 'discard',
        arrangement: 'stack',
        color: '#977561',
      },
      {
        id: 'player-a',
        name: 'Player A',
        x: 20,
        y: 700,
        width: 550,
        height: 280,
        kind: 'area',
        arrangement: 'fan',
        color: '#448866',
      },
      {
        id: 'player-b',
        name: 'Player B',
        x: 850,
        y: 700,
        width: 550,
        height: 280,
        kind: 'area',
        arrangement: 'fan',
        color: '#886644',
      },
      {
        id: 'pile',
        name: 'Spare cards',
        x: 1200,
        y: 100,
        width: 150,
        height: 205,
        kind: 'pile',
        arrangement: 'stack',
        color: '#668888',
        faceDown: true,
      },
    ],
    phases: Array.from({ length: 3 }, (_, i) => ({
      id: `layout-${i + 1}`,
      name: `Round ${i + 1}`,
      setId: `phase-${i + 1}`,
      rows: [2, 3, 4, 5, 6],
      x: 330,
      y: 100,
      cardWidth: 70,
      rowStep: 55,
      columnStep: 38,
    })),
  };
  const map = addTablePiece(p, 'board', 'map', 850, 300)!;
  map.id = 'board-map';
  map.width = 760;
  map.locked = true;
  const piece = addTablePiece(p, 'board', 'map', 1000, 500)!;
  piece.id = 'small-piece';
  piece.width = 25;
  for (let i = 0; i < 3; i++) {
    const spare = addTablePiece(p, 'board', 'map', 1200, 100)!;
    moveToZone(p, [spare.id], 'pile');
  }
  dealPhase(p, 0);
  return p;
}
