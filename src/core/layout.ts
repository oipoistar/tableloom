import type { DocumentState, ComponentSet, Row, Element, Template, Issue, TextStyle } from './model';
import { getPath, textValue, clone } from './model';
import { matchesRule, evaluateFormula, expandText } from './rules';

export const DEFAULT_STYLE: TextStyle = {
  font: 'Source Sans 3',
  fontSize: 10,
  color: '#292c27',
  bold: false,
  italic: false,
  align: 'left',
  lineHeight: 1.28,
};
export const PT_MM = 25.4 / 72;
export type FontMetrics = {
  unitsPerEm: number;
  layout: (s: string) => { positions: { xAdvance: number }[] };
  hasGlyphForCodePoint?: (code: number) => boolean;
};
const fonts = new Map<string, FontMetrics[]>();
let embeddedFonts = '';
export function registerFont(key: string, font: FontMetrics) {
  const list = fonts.get(key) ?? [];
  if (!list.includes(font)) list.push(font);
  fonts.set(key, list);
}
export function setEmbeddedFonts(css: string) {
  embeddedFonts = css;
}
export function fontCSS() {
  return embeddedFonts;
}
export function measureText(text: string, size: number, bold = false, font = 'Source Sans 3'): number {
  const candidates = [
    ...(fonts.get(`${font}:${bold ? 700 : 400}`) ?? []),
    ...(fonts.get('Source Sans 3:400') ?? []),
    ...(fonts.get(`Noto Sans Arabic:${bold ? 700 : 400}`) ?? []),
    ...(fonts.get(`Noto Sans Hebrew:${bold ? 700 : 400}`) ?? []),
  ];
  const segments: { font: FontMetrics; text: string }[] = [];
  const whole = candidates.find((f) =>
    Array.from(text).every((c) => !f.hasGlyphForCodePoint || f.hasGlyphForCodePoint(c.codePointAt(0)!)),
  );
  if (whole) segments.push({ font: whole, text });
  else
    for (const char of Array.from(text)) {
      const face =
        candidates.find((f) => !f.hasGlyphForCodePoint || f.hasGlyphForCodePoint(char.codePointAt(0)!)) ??
        candidates[0];
      if (face) {
        const last = segments.at(-1);
        if (last?.font === face) last.text += char;
        else segments.push({ font: face, text: char });
      }
    }
  if (segments.length) {
    try {
      return (
        segments.reduce(
          (sum, s) =>
            sum + s.font.layout(s.text).positions.reduce((n, p) => n + p.xAdvance, 0) / s.font.unitsPerEm,
          0,
        ) *
        size *
        PT_MM
      );
    } catch {}
  }
  return (
    Array.from(text).reduce(
      (n, c) =>
        n + (/[ilI.,'! :;]/.test(c) ? 0.26 : /[MW@]/.test(c) ? 0.85 : c.codePointAt(0)! > 0x2e80 ? 1 : 0.51),
      0,
    ) *
    size *
    PT_MM
  );
}
export function resolveTemplate(doc: DocumentState, id: string, chain: string[] = []): Template {
  if (chain.includes(id)) throw new Error('Circular template inheritance');
  const template = doc.templates.find((t) => t.id === id);
  if (!template) throw new Error(`Missing template: ${id}`);
  if (!template.parentId) return template;
  const parent = resolveTemplate(doc, template.parentId, [...chain, id]);
  const replacements = new Map(template.elements.map((e) => [e.id, e]));
  return {
    ...parent,
    ...template,
    elements: [
      ...parent.elements.map((e) => replacements.get(e.id) ?? e),
      ...template.elements.filter((e) => !parent.elements.some((p) => p.id === e.id)),
    ],
  };
}
export function resolvedElements(doc: DocumentState, set: ComponentSet, row: Row, back = false): Element[] {
  const tid = back ? set.backTemplateId : set.templateId;
  if (!tid) return [];
  const template = resolveTemplate(doc, tid);
  const overrides = set.overrides[row.id] ?? {};
  const visit = (e: Element, depth = 0): Element => {
    if (depth > 12) throw new Error('Blocks are nested too deeply or circular');
    const result = { ...DEFAULT_STYLE, ...doc.styles[e.styleId ?? ''], ...e, ...overrides[e.id] };
    if (result.styleWhen && matchesRule(result.styleWhen, row)) {
      if (result.styleWhen.fill) result.fill = result.styleWhen.fill;
      if (result.styleWhen.color) result.color = result.styleWhen.color;
    }
    if (result.children) result.children = result.children.map((child) => visit(child, depth + 1));
    if (result.blockId)
      result.children = (doc.blocks.find((b) => b.id === result.blockId)?.elements ?? []).map((child) =>
        visit(child, depth + 1),
      );
    if (result.linkSetId) {
      const linkedSet = doc.sets.find((s) => s.id === result.linkSetId);
      const linked = linkedSet && doc.templates.find((t) => t.id === linkedSet.templateId);
      if (linked) {
        result.w = linked.width;
        result.h = linked.height;
      }
    }
    return result;
  };
  return template.elements.map((e) => visit(e));
}
export function elementContent(
  element: Element,
  row: Row,
  doc: DocumentState,
  locale = doc.baseLocale,
): string {
  let value = element.formula
    ? evaluateFormula(element.formula, row, doc).value
    : element.binding
      ? getPath(row, element.binding)
      : element.text;
  if (element.binding && locale !== doc.baseLocale)
    value = doc.translations[locale]?.[`${row.id}.${element.binding}`] ?? value;
  const content = expandText(textValue(value), row, doc, locale);
  if (element.type !== 'text' || !element.textCase || element.textCase === 'original') return content;
  return content
    .split(/(\[icon:[^\]]+\])/g)
    .map((part) =>
      part.startsWith('[icon:')
        ? part
        : element.textCase === 'upper'
          ? part.toLocaleUpperCase(locale)
          : part.toLocaleLowerCase(locale),
    )
    .join('');
}
export interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  color: string;
  icon?: string;
  width: number;
}
export interface RichLine {
  runs: RichRun[];
  width: number;
}
export function wrapText(
  text: string,
  width: number,
  style: Partial<TextStyle> & { iconScale?: number },
): RichLine[] {
  const size = style.fontSize ?? 10;
  let bold = !!style.bold;
  let italic = !!style.italic;
  let color = style.color ?? '#292c27';
  const lines: RichLine[] = [{ runs: [], width: 0 }];
  const tokens = text
    .split(/(\*\*|\*|\[icon:[^\]]+\]|\[color:#[0-9a-fA-F]{3,8}\]|\[\/color\]|\n|[^\S\n]+)/)
    .filter(Boolean);
  const add = (token: string, icon?: string) => {
    const w = icon ? size * PT_MM * (style.iconScale ?? 1) : measureText(token, size, bold, style.font);
    let line = lines[lines.length - 1]!;
    if (line.width + w > width + 0.01 && line.runs.length && token.trim()) {
      line = { runs: [], width: 0 };
      lines.push(line);
    }
    if (!line.runs.length && !token.trim() && !icon) return;
    if (w > width && !icon && Array.from(token).length > 1) {
      for (const ch of Array.from(token)) add(ch);
      return;
    }
    line.runs.push({ text: icon ? '' : token, bold, italic, color, icon, width: w });
    line.width += w;
  };
  for (const token of tokens) {
    if (token === '**') {
      bold = !bold;
      continue;
    }
    if (token === '*') {
      italic = !italic;
      continue;
    }
    if (token.startsWith('[color:')) {
      color = token.slice(7, -1);
      continue;
    }
    if (token === '[/color]') {
      color = style.color ?? '#292c27';
      continue;
    }
    if (token === '\n') {
      lines.push({ runs: [], width: 0 });
      continue;
    }
    const icon = token.match(/^\[icon:(.+)\]$/)?.[1];
    add(token, icon);
  }
  return lines;
}
export function textLayout(
  element: Element,
  content: string,
): { lines: RichLine[]; size: number; height: number; overflow: boolean } {
  let size = element.fontSize ?? 10;
  let lines = wrapText(content, Math.max(0.1, element.w), element);
  if (
    element.shrinkToFit &&
    !element.autoHeight &&
    lines.length * size * PT_MM * (element.lineHeight ?? 1.28) > element.h + 0.1
  ) {
    let low = Math.min(size, element.minFontSize ?? 7),
      high = size;
    for (let i = 0; i < 12; i++) {
      const test = (low + high) / 2;
      const testLines = wrapText(content, Math.max(0.1, element.w), { ...element, fontSize: test });
      if (testLines.length * test * PT_MM * (element.lineHeight ?? 1.28) <= element.h + 0.1) low = test;
      else high = test;
    }
    size = low;
    lines = wrapText(content, Math.max(0.1, element.w), { ...element, fontSize: size });
  }
  const height = lines.length * size * PT_MM * (element.lineHeight ?? 1.28);
  return { lines, size, height, overflow: height > element.h + 0.1 };
}
export function flowChildren(
  el: Element,
  data: Row,
  doc: DocumentState,
  locale = doc.baseLocale,
  depth = 0,
): { element: Element; data: Row }[] {
  if (depth > 12) return [];
  const list = el.type === 'repeater' ? getPath(data, el.binding ?? '') : [null];
  const items = Array.isArray(list) ? list.slice(0, 200) : [];
  let x = el.padding ?? 0,
    y = el.padding ?? 0,
    lineH = 0;
  const output: { element: Element; data: Row }[] = [];
  const gap = el.gap ?? 1,
    padding = el.padding ?? 0;
  const repeatHeight = Math.max(0, ...(el.children ?? []).map((c) => c.y + c.h));
  for (const [index, item] of items.entries()) {
    const itemData =
      item && typeof item === 'object' && !Array.isArray(item)
        ? ({ ...data, ...item, id: data.id, index: index + 1 } as Row)
        : ({ ...data, value: item, index: index + 1 } as Row);
    for (const child of el.children ?? []) {
      if (child.hidden || !matchesRule(child.visibleWhen, itemData)) continue;
      const target = clone(child);
      target.w = Math.max(child.minWidth ?? 0.1, Math.min(child.maxWidth ?? 10000, child.w));
      if (child.autoHeight) {
        if (child.type === 'text')
          target.h = textLayout(target, elementContent(target, itemData, doc, locale)).height;
        else if (['group', 'repeater'].includes(child.type))
          target.h =
            Math.max(
              0,
              ...flowChildren(child, itemData, doc, locale, depth + 1).map((c) => c.element.y + c.element.h),
            ) + (child.padding ?? 0);
      }
      target.h = Math.max(child.minHeight ?? 0.1, Math.min(child.maxHeight ?? 10000, target.h));
      if (el.layout && el.layout !== 'absolute') {
        if (
          (el.layout === 'horizontal' || el.layout === 'grid') &&
          x + target.w > el.w - padding &&
          x > padding
        ) {
          x = padding;
          y += lineH + gap;
          lineH = 0;
        }
        target.x =
          el.layout === 'vertical'
            ? el.flowAlign === 'center'
              ? (el.w - target.w) / 2
              : el.flowAlign === 'end'
                ? el.w - padding - target.w
                : padding
            : x;
        target.y = y;
        if (el.layout === 'vertical') y += target.h + gap;
        else {
          x += target.w + gap;
          lineH = Math.max(lineH, target.h);
        }
      } else if (el.type === 'repeater') target.y += index * (repeatHeight + gap);
      output.push({ element: target, data: itemData });
    }
  }
  if ((el.layout === 'horizontal' || el.layout === 'grid') && el.flowAlign && el.flowAlign !== 'start') {
    const rows = new Map<number, typeof output>();
    for (const item of output) {
      const row = rows.get(item.element.y) ?? [];
      row.push(item);
      rows.set(item.element.y, row);
    }
    for (const row of rows.values()) {
      const used = Math.max(...row.map((item) => item.element.x + item.element.w)) - padding;
      const spare = Math.max(0, el.w - padding * 2 - used);
      for (const item of row) item.element.x += el.flowAlign === 'center' ? spare / 2 : spare;
    }
  }
  return output;
}
export function xml(value: unknown): string {
  return textValue(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!,
  );
}
function number(value: number | undefined, fallback = 0): string {
  return (Number.isFinite(value) ? Number(value) : fallback).toFixed(4).replace(/\.?0+$/, '') || '0';
}
export function safeColor(value: string | undefined, fallback = 'none'): string {
  return value && /^(#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d\s.,%]+\))$/i.test(value) ? value : fallback;
}
export function shapePath(template: Template): string {
  const { width: w, height: h } = template;
  return template.shape === 'hex'
    ? `M${w * 0.25} 0H${w * 0.75}L${w} ${h * 0.5} ${w * 0.75} ${h}H${w * 0.25}L0 ${h * 0.5}Z`
    : '';
}
function backgroundShape(t: Template, extra = 0): string {
  const fill = safeColor(t.background, '#fff');
  if (t.shape === 'ellipse')
    return `<ellipse cx="${number(t.width / 2)}" cy="${number(t.height / 2)}" rx="${number(t.width / 2 + extra)}" ry="${number(t.height / 2 + extra)}" fill="${fill}"/>`;
  if (t.shape === 'hex' && !extra) return `<path d="${shapePath(t)}" fill="${fill}"/>`;
  return `<rect x="${-extra}" y="${-extra}" width="${t.width + 2 * extra}" height="${t.height + 2 * extra}" rx="${t.radius}" fill="${fill}"/>`;
}
export interface RenderOptions {
  back?: boolean;
  guides?: boolean;
  locale?: string;
  embedFonts?: boolean;
  bleed?: boolean;
  layer?: string;
  idPrefix?: string;
}
export function renderComponent(
  doc: DocumentState,
  set: ComponentSet,
  row: Row,
  options: RenderOptions = {},
): string {
  const tid = options.back ? set.backTemplateId : set.templateId;
  const template = resolveTemplate(doc, tid ?? set.templateId);
  const b = options.bleed ? template.bleed : 0;
  const prefix = (options.idPrefix ?? `${set.id}-${row.id}-${options.back ? 'b' : 'f'}`).replace(
    /[^a-zA-Z0-9_-]/g,
    '_',
  );
  const backRow = options.back && set.backField ? { ...row, name: row[set.backField] ?? row.name } : row;
  let serial = 0;
  let count = 0;
  const render = (el: Element, data: Row, depth = 0, inheritedLayer = 'art'): string => {
    if (++count > 2000 || depth > 12) return '';
    const productionLayer = el.layer ?? inheritedLayer;
    const container = ['group', 'repeater'].includes(el.type);
    if (
      el.hidden ||
      !matchesRule(el.visibleWhen, data) ||
      (!container && options.layer && productionLayer !== options.layer)
    )
      return '';
    const cid = `${prefix}-${serial++}`;
    const content = elementContent(el, data, doc, options.locale);
    if (el.styleWhen && matchesRule(el.styleWhen, data))
      el = {
        ...el,
        ...(el.styleWhen.fill ? { fill: el.styleWhen.fill } : {}),
        ...(el.styleWhen.color ? { color: el.styleWhen.color } : {}),
      };
    const xy = `translate(${number(el.x)} ${number(el.y)})${el.rotation ? ` rotate(${number(el.rotation)} ${number(el.w / 2)} ${number(el.h / 2)})` : ''}`;
    const paint = `fill="${safeColor(el.fill, 'none')}" stroke="${safeColor(el.stroke, 'none')}" stroke-width="${number(el.strokeWidth, 0.3)}"`;
    let body = '';
    switch (el.type) {
      case 'text': {
        const layout = textLayout(el, content);
        body = `<clipPath id="${cid}-clip"><rect width="${el.w}" height="${el.autoHeight ? Math.min(el.maxHeight ?? 10000, Math.max(el.minHeight ?? el.h, layout.height)) : el.h}"/></clipPath><g clip-path="url(#${cid}-clip)">`;
        layout.lines.forEach((line, i) => {
          let x =
            el.align === 'center' ? (el.w - line.width) / 2 : el.align === 'right' ? el.w - line.width : 0;
          const rtl = /^[^A-Za-z\u00c0-\u052f]*[\u0590-\u08ff]/.test(content);
          if (rtl) x += line.width;
          const y = (i * (el.lineHeight ?? 1.28) + 0.84) * layout.size * PT_MM;
          for (const run of line.runs) {
            if (rtl) x -= run.width;
            if (run.icon) {
              const symbol = doc.symbols.find(
                (s) => s.id === run.icon || s.name.toLowerCase() === run.icon!.toLowerCase(),
              );
              body += symbol
                ? `<path d="${xml(symbol.path)}" transform="translate(${number(x)} ${number(y - layout.size * PT_MM * 0.8 * (el.iconScale ?? 1) + (el.iconBaseline ?? 0))}) scale(${number((layout.size * PT_MM * (el.iconScale ?? 1)) / 24)})" fill="${safeColor(symbol.color, run.color)}"/>`
                : `<text x="${number(x)}" y="${number(y)}" font-size="${number(layout.size * PT_MM)}">?</text>`;
            } else
              body += `<text x="${number(x)}" y="${number(y)}" font-family="${xml("'" + (el.font ?? 'Source Sans 3').replace(/['\\]/g, '') + "', 'Source Sans 3', 'Noto Sans Arabic', 'Noto Sans Hebrew', sans-serif")}" font-size="${number(layout.size * PT_MM)}" font-weight="${run.bold ? 700 : 400}" font-style="${run.italic ? 'italic' : 'normal'}" fill="${safeColor(run.color, '#222')}" xml:space="preserve">${xml(run.text)}</text>`;
            if (!rtl) x += run.width;
          }
        });
        body += '</g>';
        break;
      }
      case 'rect':
        body = `<rect width="${number(el.w)}" height="${number(el.h)}" rx="${number(el.radius)}" ${paint}/>`;
        break;
      case 'ellipse':
        body = `<ellipse cx="${el.w / 2}" cy="${el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" ${paint}/>`;
        break;
      case 'path':
        body = `<path d="${xml(el.path ?? '')}" ${paint}/>`;
        break;
      case 'symbol': {
        const symbol = doc.symbols.find((s) => s.id === (el.symbolId || content));
        if (symbol)
          body = `<path d="${xml(symbol.path)}" transform="scale(${el.w / 24} ${el.h / 24})" fill="${safeColor(el.fill ?? symbol.color, '#222')}"/>`;
        break;
      }
      case 'image': {
        const asset = doc.assets.find(
          (a) => a.id === (el.binding ? content : el.imageId) || a.name === content,
        );
        if (asset && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(asset.data)) {
          const alignX = (el.focalX ?? 0.5) < 0.34 ? 'xMin' : (el.focalX ?? 0.5) > 0.66 ? 'xMax' : 'xMid';
          const alignY = (el.focalY ?? 0.5) < 0.34 ? 'YMin' : (el.focalY ?? 0.5) > 0.66 ? 'YMax' : 'YMid';
          body = `<clipPath id="${cid}-clip"><rect width="${el.w}" height="${el.h}" rx="${el.radius ?? 0}"/></clipPath><image href="${xml(asset.data)}" width="${el.w}" height="${el.h}" preserveAspectRatio="${alignX}${alignY} ${el.fit === 'contain' ? 'meet' : 'slice'}" clip-path="url(#${cid}-clip)"/>`;
        } else
          body = `<rect width="${el.w}" height="${el.h}" fill="#ebe7dd"/><path d="M0 ${el.h}L${el.w} 0M0 0L${el.w} ${el.h}" stroke="#cec8b8" stroke-width=".3"/>`;
        break;
      }
      case 'grid': {
        const cols = Math.max(1, Math.min(100, el.columns ?? 5));
        const rows = Math.max(1, Math.min(100, el.rows ?? 5));
        const cw = el.w / cols;
        const ch = el.h / rows;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            if (el.cellShape === 'hex')
              body += `<path d="M${cw * 0.25} 0H${cw * 0.75}L${cw} ${ch * 0.5} ${cw * 0.75} ${ch}H${cw * 0.25}L0 ${ch * 0.5}Z" transform="translate(${c * cw} ${r * ch})" ${paint}/>`;
            else body += `<rect x="${c * cw}" y="${r * ch}" width="${cw}" height="${ch}" ${paint}/>`;
          }
        break;
      }
      case 'group':
      case 'repeater': {
        for (const child of flowChildren(el, data, doc, options.locale))
          body += render(child.element, child.data, depth + 1, productionLayer);
        break;
      }
    }
    return `<g data-production-layer="${xml(productionLayer)}" data-element-id="${xml(el.id)}" transform="${xy}" opacity="${number(Math.max(0, Math.min(1, el.opacity ?? 1)))}">${body}</g>`;
  };
  let markup = !options.layer || options.layer === 'art' ? backgroundShape(template, b) : '';
  for (const el of resolvedElements(doc, set, backRow, options.back)) markup += render(el, backRow);
  if (options.guides)
    markup += `<rect x="0" y="0" width="${template.width}" height="${template.height}" fill="none" stroke="#e18466" stroke-width=".18" stroke-dasharray="1 1"/><rect x="${template.safe}" y="${template.safe}" width="${Math.max(0, template.width - template.safe * 2)}" height="${Math.max(0, template.height - template.safe * 2)}" fill="none" stroke="#2f62d6" stroke-width=".15" stroke-dasharray="1 1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${template.width + 2 * b}mm" height="${template.height + 2 * b}mm" viewBox="${-b} ${-b} ${template.width + 2 * b} ${template.height + 2 * b}" role="img" aria-label="${xml(options.back ? 'Face-down component' : (row.name ?? row.id))}">${options.embedFonts && embeddedFonts ? `<defs><style>${embeddedFonts}</style></defs>` : ''}${markup}</svg>`;
}

export function preflight(
  doc: DocumentState,
  locale = doc.baseLocale,
  target?: { setId: string; rowId: string; row?: Row },
): Issue[] {
  const issues: Issue[] = [];
  const push = (issue: Omit<Issue, 'id'>) =>
    issues.push({
      ...issue,
      id: `${issue.code}:${issue.setId ?? ''}:${issue.rowId ?? ''}:${issue.elementId ?? ''}:${issue.field ?? ''}:${issue.back ? 'back' : 'front'}`,
    });
  for (const set of doc.sets) {
    if (target && target.setId !== set.id) continue;
    const tpl = doc.templates.find((t) => t.id === set.templateId);
    if (!tpl) {
      push({
        severity: 'error',
        code: 'template',
        message: 'Template is missing',
        detail: set.name,
        setId: set.id,
      });
      continue;
    }
    if (set.backTemplateId) {
      const back = doc.templates.find((t) => t.id === set.backTemplateId);
      if (!back || back.width !== tpl.width || back.height !== tpl.height)
        push({
          severity: 'error',
          code: 'back-size',
          message: 'Front and back sizes differ',
          detail: set.name,
          setId: set.id,
        });
    }
    for (const row of target?.row ? [target.row] : set.rows) {
      if (target && target.rowId !== row.id) continue;
      const context: { setId: string; rowId: string; back?: boolean } = { setId: set.id, rowId: row.id };
      if (!Number.isInteger(Number(row.qty ?? 1)) || Number(row.qty ?? 1) < 0 || Number(row.qty ?? 1) > 10000)
        push({
          ...context,
          severity: 'error',
          code: 'quantity',
          message: 'Invalid quantity',
          detail: 'Use a whole number between 0 and 10,000.',
          field: 'qty',
        });
      for (const field of set.fields)
        if (field.required && (row[field.key] == null || row[field.key] === ''))
          push({
            ...context,
            severity: 'error',
            code: 'required',
            message: `Missing ${field.key}`,
            detail: textValue(row.name),
            field: field.key,
          });
      const walk = (
        el: Element,
        depth = 0,
        data: Row = row,
        bounds = { width: tpl.width + tpl.bleed, height: tpl.height + tpl.bleed },
      ) => {
        if (depth > 12) {
          push({
            ...context,
            severity: 'error',
            code: 'nesting',
            message: 'Blocks are nested too deeply',
            detail: el.name,
            elementId: el.id,
          });
          return;
        }
        if (el.hidden || !matchesRule(el.visibleWhen, data)) return;
        const ctx = { ...context, elementId: el.id, field: el.binding };
        if (el.binding && getPath(data, el.binding) === undefined && el.type !== 'repeater')
          push({
            ...ctx,
            severity: 'error',
            code: 'binding',
            message: `Unknown field: ${el.binding}`,
            detail: el.name,
          });
        if (el.formula) {
          const result = evaluateFormula(el.formula, data, doc);
          if (result.error)
            push({
              ...ctx,
              severity: 'error',
              code: 'formula',
              message: 'Formula cannot be evaluated',
              detail: result.error,
            });
        }
        if (el.type === 'text') {
          const content = elementContent(el, data, doc, locale);
          const layout = textLayout(el, content);
          if (layout.overflow && (!el.autoHeight || layout.height > (el.maxHeight ?? 10000)))
            push({
              ...ctx,
              severity: 'error',
              code: 'overflow',
              message: 'Text exceeds its box',
              detail: `${el.name} needs ${layout.height.toFixed(1)} mm; ${el.h.toFixed(1)} mm available.`,
            });
          const missing = [...new Set(Array.from(content.replace(/\[[^\]]+\]|\s|\*/g, '')))].filter(
            (c) =>
              fonts.size &&
              ![...fonts.values()]
                .flat()
                .some((f) => !f.hasGlyphForCodePoint || f.hasGlyphForCodePoint(c.codePointAt(0)!)),
          );
          if (missing.length)
            push({
              ...ctx,
              severity: 'warning',
              code: 'glyph',
              message: 'A character needs an additional font',
              detail: missing.slice(0, 12).join(' '),
            });
          if (layout.size < (el.minFontSize ?? 7))
            push({
              ...ctx,
              severity: 'warning',
              code: 'small-type',
              message: 'Text is below minimum size',
              detail: `${el.fontSize} pt; minimum ${el.minFontSize ?? 7} pt.`,
            });
          for (const match of content.matchAll(/\[icon:([^\]]+)\]/g))
            if (
              !doc.symbols.some((s) => s.id === match[1] || s.name.toLowerCase() === match[1]!.toLowerCase())
            )
              push({
                ...ctx,
                severity: 'error',
                code: 'symbol',
                message: 'Inline symbol is missing',
                detail: match[1]!,
              });
          for (const match of content.matchAll(/\[term:([^\]]+)\]/g))
            push({
              ...ctx,
              severity: 'warning',
              code: 'term',
              message: 'Shared term is missing',
              detail: match[1]!,
            });
          if (
            locale !== doc.baseLocale &&
            el.binding &&
            !doc.translations[locale]?.[`${row.id}.${el.binding}`]
          )
            push({
              ...ctx,
              severity: 'warning',
              code: 'translation',
              message: `Missing ${locale} translation`,
              detail: 'Showing the source language.',
            });
        }
        if (el.type === 'image') {
          const ref = el.binding ? elementContent(el, data, doc) : el.imageId;
          const asset = doc.assets.find((a) => a.id === ref || a.name === ref);
          if (!asset)
            push({
              ...ctx,
              severity: 'error',
              code: 'asset',
              message: 'Artwork is missing',
              detail: ref || 'Choose an image or bind an image field.',
            });
          else if (asset.width && asset.mime !== 'image/svg+xml' && asset.width / (el.w / 25.4) < 200)
            push({
              ...ctx,
              severity: 'warning',
              code: 'resolution',
              message: 'Low effective image resolution',
              detail: `${Math.round(asset.width / (el.w / 25.4))} DPI at this size.`,
            });
        }
        if (
          el.x + el.w > bounds.width + 0.1 ||
          el.y + el.h > bounds.height + 0.1 ||
          el.x < -tpl.bleed ||
          el.y < -tpl.bleed
        )
          push({
            ...ctx,
            severity: 'warning',
            code: 'bounds',
            message: 'Element extends past the bleed',
            detail: el.name,
          });
        if (el.type === 'group' || el.type === 'repeater') {
          const list = flowChildren(el, data, doc, locale);
          if (
            list.some((c) => c.element.x + c.element.w > el.w + 0.1 || c.element.y + c.element.h > el.h + 0.1)
          )
            push({
              ...ctx,
              severity: 'error',
              code: 'flow-overflow',
              message: 'Block content exceeds its bounds',
              detail: el.name,
            });
          for (const child of list) walk(child.element, depth + 1, child.data, { width: el.w, height: el.h });
        }
      };
      try {
        resolvedElements(doc, set, row).forEach((e) => walk(e));
        if (set.backTemplateId) {
          context.back = true;
          const backRow = set.backField ? { ...row, name: row[set.backField] ?? row.name } : row;
          resolvedElements(doc, set, backRow, true).forEach((e) => walk(e, 0, backRow));
        }
      } catch (e) {
        push({
          ...context,
          severity: 'error',
          code: 'layout',
          message: 'Layout cannot be resolved',
          detail: (e as Error).message,
        });
      }
    }
  }
  return issues;
}
