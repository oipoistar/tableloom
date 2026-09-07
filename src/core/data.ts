import Papa from 'papaparse';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type { Row, Field, Value } from './model';
import { uid, textValue, clone, fileId, hashString, validateImportedData } from './model';

export function parseValue(text: string, field?: Field): Value {
  if (field?.type === 'number') {
    const n = Number(text);
    if (!Number.isFinite(n)) throw new Error(`“${text}” is not a number`);
    return n;
  }
  if (field?.type === 'boolean') return ['true', '1', 'yes'].includes(text.toLowerCase());
  if (field?.type === 'list') {
    const value = JSON.parse(text || '[]');
    if (!Array.isArray(value)) throw new Error('A list must be a JSON array');
    return value;
  }
  return text;
}
export function parseDelimited(
  source: string,
  fields: Field[] = [],
  delimiter?: string,
): { rows: Row[]; fields: Field[] } {
  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length)
    throw new Error(
      parsed.errors
        .slice(0, 3)
        .map((e) => `Row ${e.row ?? 0}: ${e.message}`)
        .join('; '),
    );
  const headers = parsed.meta.fields ?? [];
  if (headers.some((h) => !h || ['__proto__', 'prototype', 'constructor'].includes(h)))
    throw new Error('The data includes an empty or reserved column name');
  const inferred: Field[] = headers
    .filter((h) => h !== 'id')
    .map(
      (key) =>
        fields.find((f) => f.key === key) ?? {
          key,
          type:
            parsed.data.length &&
            parsed.data.every((r) => r[key]?.trim() !== '' && Number.isFinite(Number(r[key])))
              ? 'number'
              : 'text',
        },
    );
  const seen = new Set<string>();
  const rows = parsed.data.map((record) => {
    const row: Row = { id: record.id || uid('row') };
    if (seen.has(row.id)) throw new Error(`Duplicate row ID: ${row.id}`);
    seen.add(row.id);
    for (const field of inferred) row[field.key] = parseValue(record[field.key] ?? '', field);
    return row;
  });
  return { rows, fields: inferred };
}
export function exportDelimited(rows: Row[], fields: Field[], delimiter = ','): string {
  return Papa.unparse(
    {
      fields: ['id', ...fields.map((f) => f.key)],
      data: rows.map((row) => [row.id, ...fields.map((f) => textValue(row[f.key]))]),
    },
    { delimiter, escapeFormulae: true },
  );
}
export function mergeRows(existing: Row[], incoming: Row[], mode: 'merge' | 'replace'): Row[] {
  if (new Set(incoming.map((r) => r.id)).size !== incoming.length)
    throw new Error('Imported row IDs must be unique');
  if (mode === 'replace') return clone(incoming);
  const updates = new Map(incoming.map((r) => [r.id, r]));
  const ids = new Set(existing.map((r) => r.id));
  return [
    ...existing.map((r) => (updates.has(r.id) ? { ...r, ...updates.get(r.id) } : r)),
    ...incoming.filter((r) => !ids.has(r.id)),
  ];
}
export function pasteCells(
  rows: Row[],
  fields: Field[],
  rowIndex: number,
  columnIndex: number,
  text: string,
): Row[] {
  const matrix = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true }).data;
  const next = clone(rows);
  matrix.forEach((line, ri) => {
    let row = next[rowIndex + ri];
    if (!row) {
      row = { id: uid('row'), qty: 1 };
      next.push(row);
    }
    line.forEach((cell, ci) => {
      const field = fields[columnIndex + ci];
      if (field) row![field.key] = parseValue(cell, field);
    });
  });
  return next;
}
export function parseOds(bytes: Uint8Array): { rows: Row[]; fields: Field[] } {
  if (bytes.length > 30_000_000) throw new Error('ODS file exceeds 30 MB');
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (file.name !== 'content.xml') return false;
      if (file.originalSize > 30_000_000) throw new Error('ODS content exceeds 30 MB');
      return true;
    },
  });
  if (!entries['content.xml']) throw new Error('Not an OpenDocument spreadsheet');
  const content = strFromU8(entries['content.xml']);
  if (content.length > 30_000_000 || /<!DOCTYPE|<!ENTITY/i.test(content))
    throw new Error('Unsupported or oversized ODS content');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['table:table', 'table:table-row', 'table:table-cell', 'text:p'].includes(name),
  });
  const root = parser.parse(content);
  const sheets = root?.['office:document-content']?.['office:body']?.['office:spreadsheet']?.['table:table'];
  if (!sheets?.length) throw new Error('Spreadsheet has no sheets');
  const lines: string[][] = [];
  for (const row of sheets[0]['table:table-row'] ?? []) {
    const cells: string[] = [];
    for (const cell of row['table:table-cell'] ?? []) {
      const count = Math.min(200, Number(cell['@_table:number-columns-repeated'] ?? 1));
      const text =
        cell['@_office:value'] ??
        (cell['text:p'] ?? [])
          .map((v: unknown) =>
            typeof v === 'object' && v ? ((v as Record<string, unknown>)['#text'] ?? '') : v,
          )
          .join('\n');
      for (let i = 0; i < count; i++) cells.push(String(text));
    }
    if (cells.every((c) => c === '')) continue;
    const repeat = Math.min(10000 - lines.length, Number(row['@_table:number-rows-repeated'] ?? 1));
    for (let i = 0; i < repeat; i++) lines.push(cells);
    if (lines.length >= 10000) break;
  }
  return parseDelimited(Papa.unparse(lines));
}

/** Related CSVs retain exact JSON values while making parent IDs/order explicit. */
export function exportRelatedData(rows: Row[], fields: Field[]): Uint8Array {
  const tables = fields
    .filter((f) => f.type === 'list')
    .map((f) => ({ field: f.key, file: `children-${fileId(f.key)}.csv` }));
  const scalarFields = fields.filter((f) => f.type !== 'list');
  const encode = (value: unknown) => (value === undefined ? '' : JSON.stringify(value));
  const files: Record<string, Uint8Array> = {};
  files['records.csv'] = strToU8(
    Papa.unparse({
      fields: ['id', ...scalarFields.map((f) => f.key)],
      data: rows.map((r) => [r.id, ...scalarFields.map((f) => encode(r[f.key]))]),
    }),
  );
  for (const table of tables) {
    const children = rows.flatMap((row) =>
      (Array.isArray(row[table.field]) ? (row[table.field] as Value[]) : []).map((value, index) => ({
        parent_id: row.id,
        child_id:
          value && typeof value === 'object' && !Array.isArray(value) && typeof value.id === 'string'
            ? value.id
            : 'child-' + hashString(JSON.stringify([row.id, table.field, index])),
        position: index,
        value_json: JSON.stringify(value),
      })),
    );
    files[table.file] = strToU8(
      Papa.unparse({
        fields: ['parent_id', 'child_id', 'position', 'value_json'],
        data: children.map((c) => [c.parent_id, c.child_id, c.position, c.value_json]),
      }),
    );
  }
  files['manifest.json'] = strToU8(
    JSON.stringify({ format: 'tableloom-related-data', version: 1, fields, tables }, null, 2),
  );
  files['README.txt'] = strToU8(
    'Import this ZIP through Tableloom Data > Import data. records.csv contains stable parent IDs. Each children CSV links parent_id and position to value_json, which preserves nested objects, arrays, numbers, booleans and text exactly. Scalar cells in records.csv also use JSON values (including quoted strings). Keep the manifest and filenames together; ZIP the files after editing. Empty cells represent absent scalar values.',
  );
  return zipSync(files, { level: 6 });
}
export function parseRelatedData(bytes: Uint8Array): { rows: Row[]; fields: Field[] } {
  if (bytes.length > 30_000_000) throw new Error('Related data ZIP exceeds 30 MB');
  let expanded = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      expanded += file.originalSize;
      if (expanded > 60_000_000 || !/^[a-zA-Z0-9_%!()'.,~\-]+$/.test(file.name))
        throw new Error('Invalid or oversized related data ZIP');
      return true;
    },
  });
  const read = (name: string) => {
    if (!files[name]) throw new Error(`Missing related data file: ${name}`);
    return strFromU8(files[name]);
  };
  const manifest = JSON.parse(read('manifest.json'));
  if (
    manifest.format !== 'tableloom-related-data' ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.tables) ||
    !Array.isArray(manifest.fields)
  )
    throw new Error('Unsupported related data package');
  const csv = (name: string) => {
    const parsed = Papa.parse<Record<string, string>>(read(name), { header: true, skipEmptyLines: true });
    if (parsed.errors.length) throw new Error(`Invalid CSV in ${name}: ${parsed.errors[0]!.message}`);
    return parsed.data;
  };
  validateImportedData({ rows: [], fields: manifest.fields });
  const scalarFields = manifest.fields.filter((f: Field) => f.type !== 'list');
  const rows: Row[] = csv('records.csv').map((record) => ({
    id: record.id!,
    ...Object.fromEntries(
      scalarFields
        .filter((f: Field) => record[f.key] !== '' && record[f.key] !== undefined)
        .map((f: Field) => [f.key, JSON.parse(record[f.key]!)]),
    ),
  }));
  const parents = new Map(rows.map((r) => [r.id, r]));
  for (const table of manifest.tables) {
    if (!manifest.fields.some((f: Field) => f.key === table.field && f.type === 'list'))
      throw new Error('Unknown child-table field');
    for (const row of rows) row[table.field] = [];
    const children = csv(table.file);
    const seen = new Set<string>();
    for (const child of children) {
      const parent = parents.get(child.parent_id!);
      if (!parent) throw new Error('Child record references a missing parent');
      const position = Number(child.position);
      const key = JSON.stringify([child.parent_id, position]);
      if (!Number.isInteger(position) || position < 0 || position > 100000 || seen.has(key))
        throw new Error('Invalid or duplicate child position');
      seen.add(key);
      (parent[table.field] as Value[])[position] = JSON.parse(child.value_json!);
    }
    for (const row of rows) {
      const list = row[table.field] as Value[];
      if (Array.from(list).some((v) => v === undefined))
        throw new Error('Child positions must start at zero with no gaps');
    }
  }
  return validateImportedData({ rows, fields: manifest.fields });
}
