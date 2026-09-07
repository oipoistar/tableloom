import { z } from 'zod';

export const FORMAT_VERSION = 1;
import { version as appVersion } from '../../package.json';
export const APP_VERSION = appVersion;
export type Scalar = string | number | boolean | null;
export type Value = Scalar | Value[] | { [key: string]: Value };
export interface Row {
  id: string;
  [key: string]: Value;
}
export type Kind = 'card' | 'token' | 'hex' | 'tile' | 'board' | 'aid' | 'standee' | 'box';
export interface Field {
  key: string;
  type: 'text' | 'number' | 'boolean' | 'image' | 'list' | 'choice';
  options?: string[];
  required?: boolean;
}
export interface Condition {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'empty' | 'notEmpty';
  value: Scalar;
}
export interface Rule {
  mode: 'all' | 'any';
  conditions: Condition[];
  fill?: string;
  color?: string;
}
export interface TextStyle {
  font: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}
export interface Element extends Partial<TextStyle> {
  id: string;
  name: string;
  type: 'text' | 'image' | 'rect' | 'ellipse' | 'path' | 'symbol' | 'group' | 'repeater' | 'grid';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean;
  binding?: string;
  text?: string;
  textCase?: 'original' | 'upper' | 'lower';
  formula?: string;
  styleId?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  imageId?: string;
  fit?: 'cover' | 'contain';
  focalX?: number;
  focalY?: number;
  path?: string;
  symbolId?: string;
  visibleWhen?: Rule;
  styleWhen?: Rule;
  children?: Element[];
  blockId?: string;
  layout?: 'absolute' | 'vertical' | 'horizontal' | 'grid';
  gap?: number;
  padding?: number;
  columns?: number;
  rows?: number;
  cellShape?: 'square' | 'hex';
  minFontSize?: number;
  shrinkToFit?: boolean;
  autoHeight?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  flowAlign?: 'start' | 'center' | 'end';
  iconScale?: number;
  iconBaseline?: number;
  layer?: 'art' | 'cut' | 'fold' | 'finish';
  linkSetId?: string;
  keepAspect?: boolean;
}
export interface Template {
  id: string;
  name: string;
  width: number;
  height: number;
  bleed: number;
  safe: number;
  background: string;
  shape: 'rect' | 'ellipse' | 'hex';
  radius: number;
  elements: Element[];
  parentId?: string;
}
export interface ComponentSet {
  id: string;
  name: string;
  kind: Kind;
  templateId: string;
  backTemplateId?: string;
  backField?: string;
  fields: Field[];
  rows: Row[];
  overrides: Record<string, Record<string, Partial<Element>>>;
  generator?: Generator;
  source?: DataSource;
}
export interface Generator {
  dimensions: { field: string; values: Scalar[] }[];
  exclusions: Record<string, Scalar>[];
  seed: number;
}
export interface DataSource {
  path: string;
  kind: 'csv' | 'json' | 'ods';
  refreshedAt?: string;
  pending?: Row[];
  mode: 'merge' | 'replace';
}
export interface Asset {
  id: string;
  name: string;
  mime: string;
  data: string;
  width?: number;
  height?: number;
  hash: string;
  sourcePath?: string;
  license?: string;
}
export interface SymbolDef {
  id: string;
  name: string;
  path: string;
  color: string;
}
export interface Term {
  id: string;
  name: string;
  definition: string;
  translations: Record<string, string>;
}
export interface Note {
  id: string;
  target: string;
  session: string;
  category: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  addressedIn?: string;
  metric?: string;
  value?: number;
}
export interface TableObject {
  id: string;
  setId: string;
  rowId: string;
  x: number;
  y: number;
  rotation: number;
  flipped: boolean;
  group?: string;
  width?: number;
  locked?: boolean;
  zoneId?: string;
  layoutId?: string;
  coveredBy?: string[];
}
export interface TableZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  kind: 'area' | 'discard' | 'pile';
  arrangement: 'free' | 'fan' | 'stack';
  faceDown?: boolean;
}
export interface TableCounter {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  color: string;
}
export interface TablePhase {
  id: string;
  name: string;
  setId: string;
  rows: number[];
  centers?: Record<string, number[]>;
  x: number;
  y: number;
  cardWidth: number;
  rowStep: number;
  columnStep: number;
}
export interface TableSetup {
  id: string;
  name: string;
  seed: number;
  objects: TableObject[];
  deck: { setId: string; rowId: string; copy: number }[];
  dice: number[];
  width?: number;
  height?: number;
  background?: string;
  zones?: TableZone[];
  counters?: TableCounter[];
  players?: string[];
  activePlayer?: number;
  turn?: number;
  phases?: TablePhase[];
  phaseIndex?: number;
  log?: string[];
}
export interface ExportProfile {
  layer?: 'art' | 'cut' | 'fold' | 'finish';
  locale?: string;
  artFormat?: 'svg' | 'png';
  nesting?: boolean;
  presetVersion?: string;
  convention?: string;
  id: string;
  name: string;
  destination: 'home' | 'images' | 'tts' | 'production' | 'screentop';
  paper: 'A4' | 'Letter' | 'custom';
  width: number;
  height: number;
  margin: number;
  gap: number;
  duplex: 'none' | 'long' | 'short' | 'fold';
  offsetX: number;
  offsetY: number;
  cropMarks: boolean;
  bleed: boolean;
  dpi: number;
  changedOnly: boolean;
  baselineId?: string;
  setIds: string[];
}
export interface RuleSection {
  id: string;
  title: string;
  text: string;
  componentIds: string[];
}
export interface ResourcePackage {
  assets?: Asset[];
  styles?: Record<string, TextStyle>;
  terms?: Term[];
  id: string;
  name: string;
  version: string;
  license: string;
  description: string;
  minAppVersion: string;
  dependencies: { id: string; version: string }[];
  templates: Template[];
  blocks: { id: string; name: string; elements: Element[] }[];
  symbols: SymbolDef[];
  profiles: ExportProfile[];
  fields: Field[];
  sampleRows: Row[];
}
export interface InstalledPackage {
  id: string;
  version: string;
  name: string;
  resource: ResourcePackage;
}
export interface DocumentState {
  outputs?: SavedOutput[];
  name: string;
  description: string;
  sets: ComponentSet[];
  templates: Template[];
  styles: Record<string, TextStyle>;
  blocks: { id: string; name: string; elements: Element[] }[];
  assets: Asset[];
  symbols: SymbolDef[];
  terms: Term[];
  variables: Record<string, Scalar>;
  notes: Note[];
  table: TableSetup;
  setups: TableSetup[];
  profiles: ExportProfile[];
  rulebook: RuleSection[];
  locales: string[];
  baseLocale: string;
  translations: Record<string, Record<string, string>>;
  packages: InstalledPackage[];
  tasks: string[];
}
export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  kind: 'snapshot' | 'release' | 'experiment';
  data: DocumentState;
}
export interface Project extends DocumentState {
  formatVersion: number;
  appVersion: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  snapshots: Snapshot[];
}
export interface Issue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  detail: string;
  setId?: string;
  rowId?: string;
  elementId?: string;
  field?: string;
  back?: boolean;
}
export interface Change {
  setId: string;
  rowId: string;
  name: string;
  kind: 'added' | 'removed' | 'data' | 'layout' | 'both';
  fields: string[];
}
export interface SavedOutput {
  id: string;
  name: string;
  createdAt: string;
  destination: ExportProfile['destination'];
  setIds: string[];
  componentHashes: Record<string, string>;
}

const finite = z.number().finite();
const ident = z
  .string()
  .min(1)
  .max(160)
  .refine((s) => !['__proto__', 'constructor', 'prototype'].includes(s), 'Reserved identifier');
const ruleSchema = z.object({
  mode: z.enum(['all', 'any']),
  conditions: z
    .array(
      z.object({
        field: ident,
        op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'notEmpty']),
        value: z.union([z.string(), finite, z.boolean(), z.null()]),
      }),
    )
    .max(100),
  fill: z.string().optional(),
  color: z.string().optional(),
});
const val: z.ZodType<Value> = z.lazy(() =>
  z.union([z.string(), finite, z.boolean(), z.null(), z.array(val), z.record(ident, val)]),
);
export function validateDataValue(value: unknown) {
  return val.parse(value);
}
const rowSchema = z.record(ident, val).and(z.object({ id: ident }));
const fieldSchema = z
  .object({
    key: ident,
    type: z.enum(['text', 'number', 'boolean', 'image', 'list', 'choice']),
    options: z.array(z.string()).optional(),
    required: z.boolean().optional(),
  })
  .passthrough();
export function validateImportedData(input: unknown): { rows: Row[]; fields: Field[] } {
  const result = z
    .object({ rows: z.array(rowSchema).max(100000), fields: z.array(fieldSchema).max(1000) })
    .parse(input);
  if (new Set(result.rows.map((r) => r.id)).size !== result.rows.length)
    throw new Error('Duplicate imported row IDs');
  if (new Set(result.fields.map((f) => f.key)).size !== result.fields.length)
    throw new Error('Duplicate imported field names');
  return result;
}
const elementObject = () =>
  z
    .object({
      id: ident,
      name: z.string(),
      type: z.enum(['text', 'image', 'rect', 'ellipse', 'path', 'symbol', 'group', 'repeater', 'grid']),
      x: finite,
      y: finite,
      w: finite.min(0).max(10000),
      h: finite.min(0).max(10000),
      children: z.array(elementSchema).optional(),
      rotation: finite.optional(),
      opacity: finite.min(0).max(1).optional(),
      hidden: z.boolean().optional(),
      locked: z.boolean().optional(),
      fontSize: finite.positive().max(1000).optional(),
      textCase: z.enum(['original', 'upper', 'lower']).optional(),
      lineHeight: finite.positive().max(10).optional(),
      radius: finite.min(0).max(5000).optional(),
      columns: finite.int().min(1).max(100).optional(),
      rows: finite.int().min(1).max(100).optional(),
      gap: finite.min(0).max(1000).optional(),
      padding: finite.min(0).max(1000).optional(),
      visibleWhen: ruleSchema.optional(),
      styleWhen: ruleSchema.optional(),
      binding: z.string().optional(),
      text: z.string().optional(),
      formula: z.string().max(2000).optional(),
      blockId: ident.optional(),
      font: z.string().optional(),
      color: z.string().optional(),
      fill: z.string().optional(),
      stroke: z.string().optional(),
      strokeWidth: finite.min(0).optional(),
      path: z.string().max(100000).optional(),
      imageId: ident.optional(),
      symbolId: ident.optional(),
      styleId: ident.optional(),
      parentId: ident.optional(),
      align: z.enum(['left', 'center', 'right']).optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      fit: z.enum(['cover', 'contain']).optional(),
      focalX: finite.min(0).max(1).optional(),
      focalY: finite.min(0).max(1).optional(),
      layout: z.enum(['absolute', 'vertical', 'horizontal', 'grid']).optional(),
      flowAlign: z.enum(['start', 'center', 'end']).optional(),
      iconScale: finite.min(0.25).max(4).optional(),
      iconBaseline: finite.min(-20).max(20).optional(),
      minWidth: finite.min(0).optional(),
      maxWidth: finite.min(0).optional(),
      minHeight: finite.min(0).optional(),
      maxHeight: finite.min(0).optional(),
      minFontSize: finite.positive().optional(),
      shrinkToFit: z.boolean().optional(),
      autoHeight: z.boolean().optional(),
      keepAspect: z.boolean().optional(),
      layer: z.enum(['art', 'cut', 'fold', 'finish']).optional(),
      cellShape: z.enum(['square', 'hex']).optional(),
    })
    .passthrough();
const elementSchema: z.ZodType<Element> = z.lazy(() => elementObject()) as z.ZodType<Element>;
const elementPatchSchema = z.lazy(() => elementObject().partial());
export function validateElementPatch(patch: Partial<Element>) {
  elementPatchSchema.parse(patch);
  return patch;
}
const templateSchema = z
  .object({
    id: ident,
    name: z.string(),
    width: finite.positive().max(5000),
    height: finite.positive().max(5000),
    bleed: finite.min(0).max(100),
    safe: finite.min(0).max(100),
    background: z.string(),
    shape: z.enum(['rect', 'ellipse', 'hex']),
    radius: finite.min(0),
    elements: z.array(elementSchema),
  })
  .passthrough();
const tableSchema = z.object({
  id: ident,
  name: z.string(),
  seed: finite,
  objects: z.array(
    z.object({
      id: ident,
      setId: ident,
      rowId: ident,
      x: finite,
      y: finite,
      rotation: finite,
      flipped: z.boolean(),
      group: z.string().optional(),
      width: finite.positive().max(10000).optional(),
      locked: z.boolean().optional(),
      zoneId: ident.optional(),
      layoutId: ident.optional(),
      coveredBy: z.array(ident).max(200).optional(),
    }),
  ),
  deck: z.array(z.object({ setId: ident, rowId: ident, copy: finite.int().min(0) })),
  dice: z.array(finite.int().min(1).max(100)),
  width: finite.positive().max(20000).optional(),
  height: finite.positive().max(20000).optional(),
  background: z.string().optional(),
  zones: z
    .array(
      z.object({
        id: ident,
        name: z.string(),
        x: finite,
        y: finite,
        width: finite.positive().max(20000),
        height: finite.positive().max(20000),
        color: z.string(),
        kind: z.enum(['area', 'discard', 'pile']),
        arrangement: z.enum(['free', 'fan', 'stack']),
        faceDown: z.boolean().optional(),
      }),
    )
    .max(200)
    .optional(),
  counters: z
    .array(
      z.object({ id: ident, name: z.string(), value: finite, min: finite, max: finite, color: z.string() }),
    )
    .max(200)
    .optional(),
  players: z.array(z.string()).max(20).optional(),
  activePlayer: finite.int().min(0).optional(),
  turn: finite.int().min(1).optional(),
  phases: z
    .array(
      z.object({
        id: ident,
        name: z.string(),
        setId: ident,
        rows: z.array(finite.int().min(1).max(30)).max(30),
        centers: z.record(z.string(), z.array(finite).max(30)).optional(),
        x: finite,
        y: finite,
        cardWidth: finite.positive().max(1000),
        rowStep: finite.positive().max(1000),
        columnStep: finite.positive().max(1000),
      }),
    )
    .max(50)
    .optional(),
  phaseIndex: finite.int().min(0).optional(),
  log: z.array(z.string()).max(100).optional(),
});
const profileSchema = z
  .object({
    layer: z.enum(['art', 'cut', 'fold', 'finish']).optional(),
    locale: z.string().optional(),
    id: ident,
    name: z.string(),
    destination: z.enum(['home', 'images', 'tts', 'production', 'screentop']),
    paper: z.enum(['A4', 'Letter', 'custom']),
    width: finite.positive().max(5000),
    height: finite.positive().max(5000),
    margin: finite.min(0),
    gap: finite.min(0),
    duplex: z.enum(['none', 'long', 'short', 'fold']),
    offsetX: finite,
    offsetY: finite,
    cropMarks: z.boolean(),
    bleed: z.boolean(),
    dpi: finite.int().min(72).max(1200),
    changedOnly: z.boolean(),
    setIds: z.array(ident),
  })
  .passthrough();
const stateSchema = z.object({
  outputs: z
    .array(
      z.object({
        id: ident,
        name: z.string(),
        createdAt: z.string(),
        destination: z.enum(['home', 'images', 'tts', 'production', 'screentop']),
        setIds: z.array(ident),
        componentHashes: z.record(z.string(), z.string()),
      }),
    )
    .optional(),
  name: z.string().min(1).max(300),
  description: z.string(),
  sets: z.array(
    z
      .object({
        id: ident,
        name: z.string(),
        backTemplateId: ident.optional(),
        backField: ident.optional(),
        kind: z.enum(['card', 'token', 'hex', 'tile', 'board', 'aid', 'standee', 'box']),
        templateId: ident,
        fields: z.array(fieldSchema),
        rows: z.array(rowSchema),
        overrides: z.record(ident, z.record(ident, elementPatchSchema)),
      })
      .passthrough(),
  ),
  templates: z.array(templateSchema),
  styles: z.record(
    ident,
    z.object({
      font: z.string(),
      fontSize: finite.positive(),
      color: z.string(),
      bold: z.boolean(),
      italic: z.boolean(),
      align: z.enum(['left', 'center', 'right']),
      lineHeight: finite.positive(),
    }),
  ),
  assets: z.array(
    z
      .object({ id: ident, name: z.string(), mime: z.string(), data: z.string(), hash: z.string() })
      .passthrough(),
  ),
  blocks: z.array(z.object({ id: ident, name: z.string(), elements: z.array(elementSchema) })),
  symbols: z.array(z.object({ id: ident, name: z.string(), path: z.string(), color: z.string() })),
  terms: z.array(
    z.object({
      id: ident,
      name: z.string(),
      definition: z.string(),
      translations: z.record(z.string(), z.string()),
    }),
  ),
  variables: z.record(ident, z.union([z.string(), finite, z.boolean(), z.null()])),
  notes: z.array(
    z
      .object({
        id: ident,
        target: z.string(),
        session: z.string(),
        category: z.string(),
        text: z.string(),
        resolved: z.boolean(),
        createdAt: z.string(),
      })
      .passthrough(),
  ),
  table: tableSchema,
  setups: z.array(tableSchema),
  profiles: z.array(profileSchema),
  rulebook: z.array(
    z.object({ id: ident, title: z.string(), text: z.string(), componentIds: z.array(z.string()) }),
  ),
  locales: z.array(z.string()),
  baseLocale: z.string(),
  translations: z.record(z.string(), z.record(z.string(), z.string())),
  packages: z.array(z.unknown()),
  tasks: z.array(z.string()),
});
const projectSchema = stateSchema.extend({
  formatVersion: z.literal(FORMAT_VERSION),
  appVersion: z.string(),
  id: ident,
  createdAt: z.string(),
  updatedAt: z.string(),
  snapshots: z.array(
    z.object({
      id: ident,
      name: z.string(),
      createdAt: z.string(),
      kind: z.enum(['snapshot', 'release', 'experiment']),
      data: stateSchema,
    }),
  ),
});
export function parseProject(input: unknown): Project {
  let nodes = 0;
  const check = (value: unknown, depth = 0) => {
    if (++nodes > 2_000_000 || depth > 100) throw new Error('Project exceeds structural limits');
    if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
          throw new Error('Reserved project property');
        check(child, depth + 1);
      }
  };
  check(input);
  const version = (input as { formatVersion?: number })?.formatVersion;
  if (version !== FORMAT_VERSION)
    throw new Error(
      `This project uses format ${version ?? 'unknown'}. Tableloom supports format ${FORMAT_VERSION}; the original file has not been changed.`,
    );
  const result = projectSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid project: ${result.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  // Validate without stripping future optional fields from supported-version documents.
  const project = clone(input as Project);
  for (const collection of [project.sets, project.templates, project.assets, project.symbols]) {
    const ids = collection.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate IDs in project');
  }
  for (const set of project.sets)
    if (new Set(set.rows.map((r) => r.id)).size !== set.rows.length)
      throw new Error(`Duplicate row IDs in ${set.name}`);
  for (const asset of project.assets) {
    if (!/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[a-zA-Z0-9+/=\s]*$/.test(asset.data))
      throw new Error(`Unsupported artwork data: ${asset.name}`);
    if (asset.mime === 'image/svg+xml') {
      const svg = atob(asset.data.slice(asset.data.indexOf(',') + 1));
      if (
        /<!DOCTYPE|<!ENTITY|<\s*(script|foreignObject|iframe|object|embed|audio|video|style)\b|\bon\w+\s*=|javascript\s*:|url\s*\(|@import|(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)/i.test(
          svg,
        )
      )
        throw new Error(`Unsafe SVG content: ${asset.name}`);
    }
  }
  const visit = (list: Element[], path: string[]) => {
    if (path.length > 12) throw new Error('Blocks are nested too deeply');
    for (const element of list) {
      if (element.children) visit(element.children, path);
      if (element.blockId) {
        if (path.includes(element.blockId)) throw new Error('Circular reusable block');
        const block = project.blocks.find((b) => b.id === element.blockId);
        if (block) visit(block.elements, [...path, element.blockId]);
      }
    }
  };
  for (const template of project.templates) visit(template.elements, []);
  return project;
}
export function uid(prefix = 'id'): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
export function clone<T>(value: T): T {
  // Clone plain project data without duplicating large, immutable artwork strings.
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, clone(v)]),
    ) as T;
  return value;
}
export function documentState(project: Project): DocumentState {
  const { id, formatVersion, appVersion, createdAt, updatedAt, snapshots, ...state } = project;
  return clone(state);
}
export function totalCopies(set: ComponentSet) {
  return set.rows.reduce((sum, row) => sum + quantity(row), 0);
}
export function quantity(row: Row): number {
  const q = Number(row.qty ?? 1);
  return Number.isFinite(q) ? Math.max(0, Math.min(10000, Math.floor(q))) : 0;
}
export function getPath(row: unknown, path: string): Value | undefined {
  let value: unknown = row;
  for (const key of path.split('.')) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || value == null || typeof value !== 'object')
      return undefined;
    value = Object.prototype.hasOwnProperty.call(value, key)
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }
  return value as Value | undefined;
}
export function textValue(value: unknown): string {
  return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function hashString(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function fileId(id: string) {
  return encodeURIComponent(id).replace(/\./g, '%2E');
}
