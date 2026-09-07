import type { Template, Element } from './model';
import { uid } from './model';
export function tuckbox(width: number, height: number, depth: number): Template {
  if ([width, height, depth].some((v) => !Number.isFinite(v) || v <= 0) || depth > Math.min(width, height))
    throw new Error('Box dimensions must be positive and depth must fit its face.');
  const tab = Math.min(12, depth);
  const flap = Math.min(width / 2, depth + 12);
  const w = 2 * width + 2 * depth + tab,
    h = height + 2 * flap;
  const panels = [0, width, width + depth, 2 * width + depth, 2 * width + 2 * depth];
  const cut = `M0 ${flap}V${flap + height}H${width}V${h}H${width + depth}V${flap + height}H${2 * width + depth}V${h}H${2 * width + 2 * depth}V${flap + height}L${w} ${flap + height - 5}V${flap + 5}L${2 * width + 2 * depth} ${flap}V0H${2 * width + depth}V${flap}H${width + depth}V0H${width}V${flap}Z`;
  const line = (id: string, name: string, d: string, layer: 'cut' | 'fold', color: string): Element => ({
    id,
    name,
    type: 'path',
    x: 0,
    y: 0,
    w,
    h,
    path: d,
    fill: 'none',
    stroke: color,
    strokeWidth: 0.2,
    layer,
  });
  return {
    id: uid('box'),
    name: `Tuckbox ${width} × ${height} × ${depth}`,
    width: w,
    height: h,
    bleed: 3,
    safe: 3,
    background: '#faf8f0',
    shape: 'rect',
    radius: 0,
    elements: [
      line('box-cut', 'Outer cut path', cut, 'cut', '#d15c5c'),
      line(
        'box-fold',
        'Panel fold lines',
        panels
          .slice(1)
          .map((x) => `M${x} ${flap}V${flap + height}`)
          .join(' ') + ` M0 ${flap}H${w - tab} M0 ${flap + height}H${w - tab}`,
        'fold',
        '#507dc0',
      ),
      {
        id: 'box-title',
        name: 'Front title',
        type: 'text',
        x: 5,
        y: flap + 10,
        w: width - 10,
        h: height - 20,
        binding: 'name',
        font: 'Alegreya',
        fontSize: 18,
        align: 'center',
        color: '#455a37',
        layer: 'art',
      },
    ],
  };
}
export function standee(width: number, height: number): Template {
  const base = Math.min(12, height * 0.2);
  return {
    id: uid('standee'),
    name: 'Folded standee',
    width,
    height,
    bleed: 2,
    safe: 2,
    background: '#faf8ef',
    shape: 'rect',
    radius: 0,
    elements: [
      {
        id: 'standee-title',
        name: 'Character name',
        type: 'text',
        x: 2,
        y: 5,
        w: width - 4,
        h: height - base - 7,
        binding: 'name',
        fontSize: 10,
        align: 'center',
        layer: 'art',
      },
      {
        id: 'standee-cut',
        name: 'Cut outline',
        type: 'path',
        x: 0,
        y: 0,
        w: width,
        h: height,
        path: `M0 0H${width}V${height}H0Z`,
        stroke: '#cf7771',
        strokeWidth: 0.2,
        fill: 'none',
        layer: 'cut',
      },
      {
        id: 'standee-fold',
        name: 'Base fold',
        type: 'path',
        x: 0,
        y: 0,
        w: width,
        h: height,
        path: `M0 ${height - base}H${width}`,
        stroke: '#6d93bf',
        strokeWidth: 0.2,
        fill: 'none',
        layer: 'fold',
      },
    ],
  };
}
export interface NestItem {
  id: string;
  width: number;
  height: number;
}
export function nestPunchboard(
  items: NestItem[],
  width: number,
  height: number,
  gap = 2,
): { sheet: number; id: string; x: number; y: number; width: number; height: number; rotated: boolean }[] {
  if (width <= 0 || height <= 0 || gap < 0) throw new Error('Invalid punchboard dimensions');
  const result: ReturnType<typeof nestPunchboard> = [];
  let x = gap,
    y = gap,
    rowHeight = 0,
    sheet = 0;
  for (const item of [...items].sort((a, b) => b.height - a.height)) {
    let w = item.width,
      h = item.height,
      rotated = false;
    if (w + 2 * gap > width && h + 2 * gap <= width && w + 2 * gap <= height) {
      [w, h] = [h, w];
      rotated = true;
    }
    if (w + 2 * gap > width || h + 2 * gap > height)
      throw new Error(`${item.id} does not fit the punchboard`);
    if (x + w + gap > width) {
      x = gap;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    if (y + h + gap > height) {
      sheet++;
      x = gap;
      y = gap;
      rowHeight = 0;
    }
    result.push({ sheet, id: item.id, x, y, width: w, height: h, rotated });
    x += w + gap;
    rowHeight = Math.max(rowHeight, h);
  }
  return result;
}
