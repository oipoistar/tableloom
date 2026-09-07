import type { Generator, Row, Scalar } from './model';
import { hashString, stableStringify } from './model';
export function generateRows(generator: Generator, existing: Row[] = []): Row[] {
  let variants: Record<string, Scalar>[] = [{}];
  for (const dimension of generator.dimensions) {
    if (
      !/^[a-zA-Z][\w]*$/.test(dimension.field) ||
      ['id', 'qty', 'constructor', 'prototype', '__proto__'].includes(dimension.field)
    )
      throw new Error('Use a unique field name beginning with a letter (other than id or qty).');
    if (variants.length * dimension.values.length > 10000)
      throw new Error('Generators are limited to 10,000 variants per operation.');
    variants = variants.flatMap((v) =>
      [...new Set(dimension.values)].map((value) => ({ ...v, [dimension.field]: value })),
    );
  }
  const fields = generator.dimensions.map((d) => d.field);
  if (new Set(fields).size !== fields.length) throw new Error('Generator fields must be unique.');
  const byId = new Map(existing.map((r) => [r.id, r]));
  return variants
    .filter((v) => !generator.exclusions.some((ex) => Object.keys(ex).every((k) => v[k] === ex[k])))
    .map((v) => {
      const id = `gen-${hashString(stableStringify(v))}`;
      return { id, name: Object.values(v).join(' · '), qty: 1, ...v, ...byId.get(id) } as Row;
    });
}
export function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(values: T[], seed: number): T[] {
  const a = values.slice();
  const rand = seededRandom(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function missingCombinations(generator: import('./model').Generator, rows: import('./model').Row[]) {
  const expected = generateRows(generator);
  const ids = new Set(rows.map((r) => r.id));
  return expected.filter((r) => !ids.has(r.id));
}
