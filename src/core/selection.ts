import type { Element } from './model';
import { clone, uid } from './model';
export function arrangeElements(
  elements: Element[],
  axis: 'x' | 'y',
  mode: 'start' | 'center' | 'end' | 'distribute',
  extent?: { start: number; size: number },
): Record<string, Partial<Element>> {
  const items = elements.filter((e) => !e.locked);
  if (!items.length) return {};
  const size = axis === 'x' ? 'w' : 'h';
  const start = extent?.start ?? Math.min(...items.map((e) => e[axis])),
    end = extent ? start + extent.size : Math.max(...items.map((e) => e[axis] + e[size]));
  const patches: Record<string, Partial<Element>> = {};
  if (mode === 'distribute') {
    if (items.length < 3) return {};
    const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
    const gap = (end - start - sorted.reduce((n, e) => n + e[size], 0)) / (sorted.length - 1);
    let position = start;
    for (const e of sorted) {
      patches[e.id] = { [axis]: position };
      position += e[size] + gap;
    }
  } else
    for (const e of items)
      patches[e.id] = {
        [axis]:
          mode === 'start' ? start : mode === 'end' ? end - e[size] : start + (end - start - e[size]) / 2,
      };
  return patches;
}
export function groupElements(elements: Element[], ids: string[]): { elements: Element[]; id: string } {
  const selected = elements.filter((e) => ids.includes(e.id) && !e.locked);
  if (selected.length < 2) throw new Error('Select at least two unlocked elements to group.');
  const x = Math.min(...selected.map((e) => e.x)),
    y = Math.min(...selected.map((e) => e.y)),
    w = Math.max(...selected.map((e) => e.x + e.w)) - x,
    h = Math.max(...selected.map((e) => e.y + e.h)) - y;
  const id = uid('group');
  const group: Element = {
    id,
    name: 'Group',
    type: 'group',
    x,
    y,
    w,
    h,
    layout: 'absolute',
    children: selected.map((e) => ({ ...clone(e), x: e.x - x, y: e.y - y })),
  };
  const chosen = new Set(selected.map((e) => e.id));
  const result = elements.filter((e) => !chosen.has(e.id));
  const index = elements.findIndex((e) => chosen.has(e.id));
  result.splice(index, 0, group);
  return { elements: result, id };
}
export function ungroupElement(elements: Element[], id: string): Element[] {
  return elements.flatMap((e) => {
    if (e.id !== id || e.type !== 'group') return [e];
    if (e.rotation || (e.layout && e.layout !== 'absolute'))
      throw new Error('Set group rotation to 0 and layout to Positioned before ungrouping.');
    return (e.children ?? []).map((child) => ({
      ...clone(child),
      x: child.x + e.x,
      y: child.y + e.y,
      opacity: (child.opacity ?? 1) * (e.opacity ?? 1),
    }));
  });
}
