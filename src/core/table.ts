import { clone, quantity, uid } from './model';
import type { DocumentState, TableObject, TableSetup, TableZone } from './model';
import { shuffle } from './generators';

/** Table coordinates are logical pixels, independent of viewport zoom. */
export function pieceSize(doc: DocumentState, object: TableObject) {
  const set = doc.sets.find((s) => s.id === object.setId);
  const template = doc.templates.find((t) => t.id === set?.templateId);
  const width = object.width ?? Math.min(850, (template?.width ?? 63) * (110 / 63));
  return { width, height: width * ((template?.height ?? 88) / (template?.width ?? 63)) };
}
export function tableLog(table: TableSetup, message: string) {
  table.log = [...(table.log ?? []), message].slice(-100);
}
export function isCovered(table: TableSetup, object: TableObject) {
  return (
    !!object.layoutId &&
    (object.coveredBy ?? []).some((id) =>
      table.objects.some((o) => o.id === id && o.layoutId === object.layoutId),
    )
  );
}
export function revealUncovered(table: TableSetup) {
  for (const object of table.objects) {
    if (object.layoutId && !isCovered(table, object)) object.flipped = false;
  }
}
export function zoneObjects(table: TableSetup, id: string) {
  return table.objects.filter((o) => o.zoneId === id);
}
export function arrangeZone(doc: DocumentState, zone: TableZone) {
  if (zone.arrangement === 'free') return;
  const pieces = zoneObjects(doc.table, zone.id);
  const maxWidth = Math.max(1, ...pieces.map((o) => pieceSize(doc, o).width));
  const step =
    zone.arrangement === 'stack'
      ? 0
      : Math.min(maxWidth + 12, Math.max(8, (zone.width - 24 - maxWidth) / Math.max(1, pieces.length - 1)));
  pieces.forEach((o, i) => {
    o.x = zone.x + 12 + i * step;
    o.y = zone.y + 34;
    o.rotation = 0;
  });
}
export function ensureDiscard(table: TableSetup) {
  table.zones ??= [];
  let zone = table.zones.find((z) => z.kind === 'discard');
  if (!zone) {
    zone = {
      id: uid('zone'),
      name: 'Discard',
      x: (table.width ?? 1400) - 170,
      y: 230,
      width: 150,
      height: 205,
      kind: 'discard',
      arrangement: 'stack',
      color: '#977561',
    };
    table.zones.push(zone);
  }
  return zone;
}
export function moveToZone(doc: DocumentState, ids: string[], zoneId?: string, force = false) {
  const zone = doc.table.zones?.find((z) => z.id === zoneId);
  const moved: TableObject[] = [];
  const oldZones = new Set<string>();
  for (const id of ids) {
    const o = doc.table.objects.find((x) => x.id === id);
    if (!o || o.locked || (!force && isCovered(doc.table, o))) continue;
    if (o.zoneId) oldZones.add(o.zoneId);
    delete o.layoutId;
    delete o.coveredBy;
    delete o.group;
    if (zone) {
      o.zoneId = zone.id;
      o.flipped = zone.faceDown ?? false;
      o.x = zone.x + 12;
      o.y = zone.y + 34;
    } else delete o.zoneId;
    moved.push(o);
  }
  // Append to the top of the destination pile without losing identity or data.
  doc.table.objects = [...doc.table.objects.filter((o) => !moved.includes(o)), ...moved];
  for (const z of doc.table.zones ?? []) if (oldZones.has(z.id) || z.id === zoneId) arrangeZone(doc, z);
  revealUncovered(doc.table);
  return moved.length;
}
export function discardPieces(doc: DocumentState, ids: string[]) {
  return moveToZone(doc, ids, ensureDiscard(doc.table).id);
}
export function movePieces(doc: DocumentState, ids: string[], dx: number, dy: number) {
  const moving = doc.table.objects.filter((o) => ids.includes(o.id) && !o.locked && !isCovered(doc.table, o));
  if (!moving.length) return;
  const w = doc.table.width ?? 1400,
    h = doc.table.height ?? 1000;
  const maxX = Math.max(0, Math.min(...moving.map((o) => w - o.x - pieceSize(doc, o).width)));
  const maxY = Math.max(0, Math.min(...moving.map((o) => h - o.y - pieceSize(doc, o).height)));
  dx = Math.max(-Math.min(...moving.map((o) => o.x)), Math.min(maxX, dx));
  dy = Math.max(-Math.min(...moving.map((o) => o.y)), Math.min(maxY, dy));
  const oldZones = new Set(moving.map((o) => o.zoneId));
  for (const o of moving) {
    o.x += dx;
    o.y += dy;
    delete o.zoneId;
    delete o.layoutId;
    delete o.coveredBy;
  }
  doc.table.objects = [...doc.table.objects.filter((o) => !moving.includes(o)), ...moving];
  for (const z of doc.table.zones ?? []) if (oldZones.has(z.id)) arrangeZone(doc, z);
  revealUncovered(doc.table);
}
export function drawFromZone(doc: DocumentState, zoneId: string) {
  const object = zoneObjects(doc.table, zoneId).at(-1);
  if (!object) return;
  moveToZone(doc, [object.id]);
  object.flipped = false;
  object.x = Math.max(20, object.x - pieceSize(doc, object).width - 25);
  object.y = Math.min((doc.table.height ?? 1000) - pieceSize(doc, object).height, object.y + 50);
  return object.id;
}
export function shuffleZone(doc: DocumentState, zoneId: string, seed: number) {
  const pieces = shuffle(zoneObjects(doc.table, zoneId), seed);
  doc.table.objects = [...doc.table.objects.filter((o) => o.zoneId !== zoneId), ...pieces];
  const zone = doc.table.zones?.find((z) => z.id === zoneId);
  if (zone) arrangeZone(doc, zone);
}
export function addTablePiece(doc: DocumentState, setId: string, rowId: string, x = 40, y = 250) {
  if (!doc.sets.find((s) => s.id === setId)?.rows.some((r) => r.id === rowId)) return;
  const object: TableObject = { id: uid('piece'), setId, rowId, x, y, rotation: 0, flipped: false };
  doc.table.objects.push(object);
  return object;
}
/** Deal a declarative layered layout; existing player areas, counters and discards survive phase changes. */
export function dealPhase(doc: DocumentState, index: number) {
  const table = doc.table,
    phase = table.phases?.[index];
  if (!phase) throw new Error('This phase is not defined.');
  if (table.objects.some((o) => o.layoutId))
    throw new Error('Finish taking the current layout before dealing the next phase.');
  const set = doc.sets.find((s) => s.id === phase.setId);
  if (!set) throw new Error('The phase component set is missing.');
  if (table.objects.some((o) => o.setId === set.id))
    throw new Error('This phase already has pieces on the table. Load a saved setup to restart it.');
  if (set.rows.reduce((n, r) => n + quantity(r), 0) > 100000)
    throw new Error('A phase supports up to 100,000 pieces.');
  const needed = phase.rows.reduce((a, b) => a + b, 0);
  const cards = shuffle(
    set.rows.flatMap((r) => Array.from({ length: quantity(r) }, () => r)),
    table.seed + index,
  );
  if (cards.length < needed)
    throw new Error(`The layout needs ${needed} cards; this set has ${cards.length}.`);
  const placed: { object: TableObject; level: number; center: number }[] = [];
  phase.rows.forEach((n, level) => {
    for (let j = 0; j < n; j++) {
      const center = phase.centers?.[String(level)]?.[j] ?? 2 * j - (n - 1);
      const object: TableObject = {
        id: uid('piece'),
        setId: set.id,
        rowId: cards.shift()!.id,
        x: phase.x + center * phase.columnStep,
        y: phase.y + level * phase.rowStep,
        width: phase.cardWidth,
        rotation: 0,
        flipped: level % 2 === 1,
        layoutId: phase.id,
      };
      placed.push({ object, level, center });
    }
  });
  for (const p of placed) {
    p.object.coveredBy = placed
      .filter((q) => q.level === p.level + 1 && Math.abs(p.center - q.center) < 2)
      .map((q) => q.object.id);
  }
  table.objects.push(...placed.map((p) => p.object));
  const discard = ensureDiscard(table);
  for (const row of cards)
    table.objects.push({
      id: uid('piece'),
      setId: set.id,
      rowId: row.id,
      x: discard.x + 12,
      y: discard.y + 34,
      width: phase.cardWidth,
      rotation: 0,
      flipped: true,
      zoneId: discard.id,
    });
  arrangeZone(doc, discard);
  table.phaseIndex = index;
  revealUncovered(table);
  tableLog(table, `Dealt ${phase.name}: ${needed} cards, ${cards.length} set aside face down.`);
}
export function restoreSetup(doc: DocumentState, setup: TableSetup) {
  doc.table = clone(setup);
}
