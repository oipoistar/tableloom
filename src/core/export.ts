import type { DocumentState, ComponentSet, Row, ExportProfile, Project } from './model';
import { quantity, stableStringify, hashString, APP_VERSION, fileId } from './model';
import { renderComponent, resolveTemplate, fontCSS, xml } from './layout';
import { nestPunchboard } from './physical';
import { compareDocuments, deckStructure } from './revision';
export interface Placement {
  setId: string;
  rowId: string;
  copy: number;
  x: number;
  y: number;
  width: number;
  height: number;
  back: boolean;
  rotation: number;
  tileX?: number;
  tileY?: number;
}
export interface PrintPage {
  width: number;
  height: number;
  placements: Placement[];
  label: string;
}
export function impose(doc: DocumentState, profile: ExportProfile, baseline?: DocumentState): PrintPage[] {
  for (const v of [
    profile.width,
    profile.height,
    profile.margin,
    profile.gap,
    profile.offsetX,
    profile.offsetY,
  ])
    if (!Number.isFinite(v)) throw new Error('Print dimensions must be finite numbers');
  if (
    profile.width <= 0 ||
    profile.height <= 0 ||
    profile.margin < 0 ||
    profile.gap < 0 ||
    profile.margin * 2 >= Math.min(profile.width, profile.height)
  )
    throw new Error('Margins leave no printable area');
  if (profile.changedOnly && !baseline) throw new Error('Select a snapshot for changed-only export');
  const changes = baseline
    ? new Set(
        compareDocuments(baseline, doc)
          .filter((c) => c.kind !== 'removed')
          .map((c) => `${c.setId}/${c.rowId}`),
      )
    : null;
  const pages: PrintPage[] = [];
  if (doc.sets.reduce((n, s) => n + s.rows.reduce((sum, r) => sum + quantity(r), 0), 0) > 100000)
    throw new Error('An export is limited to 100,000 pieces. Reduce quantities or split the project.');
  const selected = doc.sets.filter((s) => !profile.setIds.length || profile.setIds.includes(s.id));
  const nested = profile.nesting ? selected.filter((s) => ['token', 'hex', 'tile'].includes(s.kind)) : [];
  if (nested.length) {
    const copies = nested.flatMap((set) => {
      const t = resolveTemplate(doc, set.templateId),
        b = profile.bleed ? t.bleed : 0;
      return set.rows
        .filter((row) => !profile.changedOnly || changes?.has(`${set.id}/${row.id}`))
        .flatMap((row) =>
          Array.from({ length: quantity(row) }, (_, copy) => ({
            id: `${set.id}/${row.id}/${copy}`,
            setId: set.id,
            rowId: row.id,
            copy,
            width: t.width + 2 * b,
            height: t.height + 2 * b,
          })),
        );
    });
    if (copies.length > 100000) throw new Error('Too many nested pieces');
    const map = new Map(copies.map((c) => [c.id, c]));
    for (const item of nestPunchboard(
      copies,
      profile.width - 2 * profile.margin,
      profile.height - 2 * profile.margin,
      profile.gap,
    )) {
      let page = pages[item.sheet];
      if (!page) {
        page = {
          width: profile.width,
          height: profile.height,
          label: `Punchboard ${item.sheet + 1} fronts`,
          placements: [],
        };
        pages[item.sheet] = page;
      }
      const original = map.get(item.id)!;
      page.placements.push({
        ...original,
        x: item.x + profile.margin,
        y: item.y + profile.margin,
        width: item.width,
        height: item.height,
        back: false,
        rotation: item.rotated ? 90 : 0,
      });
    }
    const fronts = [...pages];
    if (['long', 'short'].includes(profile.duplex))
      for (const front of fronts) {
        const paired = front.placements
          .filter((p) => doc.sets.find((s) => s.id === p.setId)?.backTemplateId)
          .map((p) => ({
            ...p,
            back: true,
            x:
              profile.duplex === 'long'
                ? profile.width - p.x - p.width + profile.offsetX
                : p.x + profile.offsetX,
            y:
              profile.duplex === 'short'
                ? profile.height - p.y - p.height + profile.offsetY
                : p.y + profile.offsetY,
          }));
        if (paired.length)
          pages.push({ ...front, label: front.label.replace('fronts', 'backs'), placements: paired });
      }
  }
  for (const set of selected.filter((s) => !nested.includes(s))) {
    const t = resolveTemplate(doc, set.templateId);
    const bleed = profile.bleed ? t.bleed : 0;
    const w = t.width + 2 * bleed;
    const h = t.height + 2 * bleed;
    const fold = profile.duplex === 'fold' && !!set.backTemplateId;
    const cellH = fold ? h * 2 : h;
    const cols = Math.floor((profile.width - 2 * profile.margin + profile.gap) / (w + profile.gap));
    const rows = Math.floor((profile.height - 2 * profile.margin + profile.gap) / (cellH + profile.gap));
    if (set.rows.reduce((n, r) => n + quantity(r), 0) > 100000)
      throw new Error('An export is limited to 100,000 printed components.');
    const cards = set.rows
      .filter((r) => !profile.changedOnly || changes?.has(`${set.id}/${r.id}`))
      .flatMap((row) => Array.from({ length: quantity(row) }, (_, copy) => ({ row, copy })));
    if (cards.length > 100000) throw new Error('An export is limited to 100,000 printed components.');
    if (cols < 1 || rows < 1) {
      if (!['board', 'aid', 'box'].includes(set.kind))
        throw new Error(`${set.name} does not fit the paper. Choose a larger sheet or reduce margins.`);
      const tw = profile.width - 2 * profile.margin;
      const th = profile.height - 2 * profile.margin;
      for (const { row, copy } of cards)
        for (let y = 0; y < Math.ceil(h / th); y++)
          for (let x = 0; x < Math.ceil(w / tw); x++)
            pages.push({
              width: profile.width,
              height: profile.height,
              label: `${row.name} · tile ${x + 1},${y + 1}`,
              placements: [
                {
                  setId: set.id,
                  rowId: row.id,
                  copy,
                  x: profile.margin,
                  y: profile.margin,
                  width: Math.min(tw, w - x * tw),
                  height: Math.min(th, h - y * th),
                  back: false,
                  rotation: 0,
                  tileX: x * tw,
                  tileY: y * th,
                },
              ],
            });
      continue;
    }
    const capacity = cols * rows;
    const startX = (profile.width - (cols * w + (cols - 1) * profile.gap)) / 2;
    const startY = (profile.height - (rows * cellH + (rows - 1) * profile.gap)) / 2;
    for (let start = 0; start < cards.length; start += capacity) {
      const front: PrintPage = {
        width: profile.width,
        height: profile.height,
        label: `${set.name} · sheet ${Math.floor(start / capacity) + 1} fronts`,
        placements: [],
      };
      const back: PrintPage = { ...front, label: front.label.replace('fronts', 'backs'), placements: [] };
      cards.slice(start, start + capacity).forEach(({ row, copy }, i) => {
        const x = startX + (i % cols) * (w + profile.gap);
        const y = startY + Math.floor(i / cols) * (cellH + profile.gap);
        const placement: Placement = {
          setId: set.id,
          rowId: row.id,
          copy,
          x,
          y,
          width: w,
          height: h,
          back: false,
          rotation: 0,
        };
        front.placements.push(placement);
        if (set.backTemplateId && profile.duplex !== 'none') {
          if (fold) front.placements.push({ ...placement, back: true, y: y + h, rotation: 180 });
          else
            back.placements.push({
              ...placement,
              back: true,
              x: profile.duplex === 'long' ? profile.width - x - w + profile.offsetX : x + profile.offsetX,
              y: profile.duplex === 'short' ? profile.height - y - h + profile.offsetY : y + profile.offsetY,
            });
        }
      });
      pages.push(front);
      if (back.placements.length) pages.push(back);
    }
  }
  return pages;
}
function innerSvg(svg: string): string {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}
export function renderPrintPage(
  doc: DocumentState,
  page: PrintPage,
  profile: ExportProfile,
  index = 0,
): string {
  const contents = page.placements
    .map((p, i) => {
      const set = doc.sets.find((s) => s.id === p.setId)!;
      const row = set.rows.find((r) => r.id === p.rowId)!;
      const t = resolveTemplate(doc, set.templateId);
      const bleed = profile.bleed ? t.bleed : 0;
      const id = `page-${index}-${i}`;
      let component = renderComponent(doc, set, row, {
        back: p.back,
        bleed: profile.bleed,
        idPrefix: id,
        locale: profile.locale,
        layer: profile.layer,
      });
      if (p.tileX !== undefined)
        component = `<svg x="0" y="0" width="${p.width}" height="${p.height}" viewBox="${p.tileX - bleed} ${(p.tileY ?? 0) - bleed} ${p.width} ${p.height}">${innerSvg(component)}</svg>`;
      else component = `<g transform="translate(${bleed} ${bleed})">${innerSvg(component)}</g>`;
      const rotation =
        p.rotation === 90
          ? ` translate(${p.width} 0) rotate(90)`
          : p.rotation
            ? ` rotate(${p.rotation} ${p.width / 2} ${p.height / 2})`
            : '';
      let marks = '';
      if (profile.cropMarks) {
        const l = 2;
        const x = bleed,
          y = bleed,
          w = p.width - 2 * bleed,
          h = p.height - 2 * bleed;
        marks = `<path d="M${x - l} ${y}h${l}M${x} ${y - l}v${l}M${x + w} ${y - l}v${l}M${x + w} ${y}h${l}M${x - l} ${y + h}h${l}M${x} ${y + h}v${l}M${x + w} ${y + h}h${l}M${x + w} ${y + h}v${l}" stroke="#333" stroke-width=".15" fill="none"/>`;
      }
      return `<g transform="translate(${p.x} ${p.y})${rotation}">${component}${marks}</g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}"><defs><style>${fontCSS()}</style></defs><rect width="100%" height="100%" fill="#fff"/>${contents}<text x="${profile.margin}" y="${page.height - 3}" font-family="'Source Sans 3', sans-serif" font-size="2.2" fill="#777">${xml(doc.name)} · ${xml(page.label)}</text></svg>`;
}
export function printHtml(doc: DocumentState, profile: ExportProfile, pages: PrintPage[]): string {
  return `<!doctype html><html><head><title>${xml(doc.name)} · Tableloom</title><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>${fontCSS()}@page{size:${profile.width}mm ${profile.height}mm;margin:0}*{box-sizing:border-box}body{margin:0}.page{width:${profile.width}mm;height:${profile.height}mm;break-after:page;overflow:hidden}.page:last-child{break-after:auto}svg{display:block}</style></head><body>${pages.map((p, i) => `<div class="page">${renderPrintPage(doc, p, profile, i)}</div>`).join('')}</body></html>`;
}
export function calibrationSvg(profile: ExportProfile): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}mm" height="${profile.height}mm" viewBox="0 0 ${profile.width} ${profile.height}"><rect width="100%" height="100%" fill="white"/><g fill="none" stroke="black" stroke-width=".2"><rect x="30" y="40" width="100" height="100"/><path d="M25 40H135M30 35V145M25 140H135M130 35V145M75 90H85M80 85V95"/></g><g font-family="sans-serif" font-size="4"><text x="30" y="28">Tableloom · printer calibration</text><text x="30" y="155">This square must measure exactly 100 × 100 mm.</text><text x="30" y="165">Print at 100%. Disable “fit to page”.</text><text x="30" y="175">For duplex: print on both sides and compare crosshairs.</text></g></svg>`;
}
export interface SheetAsset {
  name: string;
  svg: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
  rowIds: string[];
}
export function imageSheets(
  doc: DocumentState,
  set: ComponentSet,
  back = false,
  locale = doc.baseLocale,
): SheetAsset[] {
  const t = resolveTemplate(doc, set.templateId);
  const sheets: SheetAsset[] = [];
  for (let start = 0; start < set.rows.length; start += 69) {
    const rows = set.rows.slice(start, start + 69);
    const cols = Math.min(10, Math.max(2, rows.length + 1));
    const nr = Math.max(2, Math.ceil((rows.length + 1) / cols));
    const body = rows
      .map(
        (row, i) =>
          `<g transform="translate(${(i % cols) * t.width} ${Math.floor(i / cols) * t.height})">${innerSvg(renderComponent(doc, set, row, { back, locale, idPrefix: `sheet-${start}-${i}-${back}` }))}</g>`,
      )
      .join('');
    sheets.push({
      columns: cols,
      rows: nr,
      rowIds: rows.map((r) => r.id),
      name: `${fileId(set.id)}-${Math.floor(start / 69) + 1}-${back ? 'backs' : 'fronts'}.png`,
      width: Math.round(((cols * t.width) / 25.4) * 150),
      height: Math.round(((nr * t.height) / 25.4) * 150),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * t.width}mm" height="${nr * t.height}mm" viewBox="0 0 ${cols * t.width} ${nr * t.height}"><defs><style>${fontCSS()}</style></defs>${body}</svg>`,
    });
  }
  return sheets;
}
export function ttsSave(doc: DocumentState, assetBase: string): unknown {
  if (doc.sets.reduce((n, s) => n + s.rows.reduce((sum, r) => sum + quantity(r), 0), 0) > 100000)
    throw new Error('TTS output is limited to 100,000 pieces');
  if (!assetBase.trim())
    throw new Error('Choose an absolute local asset folder or an HTTPS asset URL for Tabletop Simulator.');
  if (!/^(https:\/\/|[a-zA-Z]:[\\/]|\/)/.test(assetBase))
    throw new Error('Use an absolute asset folder or HTTPS URL.');
  const base = assetBase.replaceAll('\\', '/').replace(/\/$/, '');
  const objects: unknown[] = [];
  let deckId = 1;
  for (const [setIndex, set] of doc.sets.filter((s) => s.kind === 'card').entries()) {
    if (!set.backTemplateId) throw new Error(`${set.name} needs a card back for TTS export.`);
    const custom: Record<string, unknown> = {};
    const contained: unknown[] = [];
    const ids: number[] = [];
    for (let start = 0; start < set.rows.length; start += 69) {
      const part = set.rows.slice(start, start + 69);
      const cols = Math.min(10, Math.max(2, part.length + 1));
      const rows = Math.max(2, Math.ceil((part.length + 1) / cols));
      const sheet = Math.floor(start / 69) + 1;
      custom[String(deckId)] = {
        FaceURL: `${base}/${base.startsWith('https:') ? encodeURIComponent(fileId(set.id)) : fileId(set.id)}-${sheet}-fronts.png`,
        BackURL: `${base}/${base.startsWith('https:') ? encodeURIComponent(fileId(set.id)) : fileId(set.id)}-${sheet}-backs.png`,
        NumWidth: cols,
        NumHeight: rows,
        BackIsHidden: true,
        UniqueBack: true,
        Type: 0,
      };
      part.forEach((row, i) => {
        for (let copy = 0; copy < quantity(row); copy++) {
          const cardId = deckId * 100 + i;
          ids.push(cardId);
          contained.push({
            GUID: hashString(`${set.id}:${row.id}:${copy}`).slice(0, 6),
            Name: 'CardCustom',
            Nickname: String(row.name ?? row.id),
            Description: String(row.effect ?? ''),
            CardID: cardId,
            Transform: {
              posX: 0,
              posY: 1,
              posZ: 0,
              rotX: 0,
              rotY: 180,
              rotZ: 180,
              scaleX: 1,
              scaleY: 1,
              scaleZ: 1,
            },
            CustomDeck: { [deckId]: custom[String(deckId)] },
            HideWhenFaceDown: true,
          });
        }
      });
      deckId++;
    }
    if (ids.length === 1) objects.push(contained[0]);
    else if (ids.length > 1)
      objects.push({
        GUID: hashString(set.id).slice(0, 6),
        Name: 'DeckCustom',
        Nickname: set.name,
        Transform: {
          posX: setIndex * 4,
          posY: 1,
          posZ: 0,
          rotX: 0,
          rotY: 180,
          rotZ: 180,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
        },
        DeckIDs: ids,
        CustomDeck: custom,
        ContainedObjects: contained,
      });
  }
  return {
    SaveName: doc.name,
    GameMode: '',
    Date: new Date().toISOString(),
    VersionNumber: '',
    ObjectStates: objects,
    TabStates: {},
    Tableloom: { structure: deckStructure(doc), appVersion: APP_VERSION },
  };
}
export function exportManifest(project: Project, profile: ExportProfile, files: string[]) {
  return {
    formatVersion: 1,
    appVersion: APP_VERSION,
    projectId: project.id,
    projectName: project.name,
    createdAt: new Date().toISOString(),
    documentHash: hashString(stableStringify(project)),
    structureHash: deckStructure(project),
    settings: profile,
    files,
    components: project.sets.flatMap((s) =>
      s.rows.map((r) => ({
        setId: s.id,
        rowId: r.id,
        quantity: quantity(r),
        dataHash: hashString(stableStringify(r)),
      })),
    ),
  };
}
