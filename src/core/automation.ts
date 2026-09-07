import type { Project, Value, Row, Element, Issue, DocumentState, Field } from './model';
import { clone, parseProject, uid, validateImportedData } from './model';
import { generateRows } from './generators';
import { preflight, renderComponent } from './layout';
import { evaluateFormula } from './rules';
export type Operation =
  | { type: 'set-cell'; setId: string; rowId: string; field: string; value: Value }
  | { type: 'calculate'; setId: string; field: string; formula: string }
  | { type: 'add-row'; setId: string; row: Row }
  | { type: 'delete-row'; setId: string; rowId: string }
  | { type: 'edit-element'; templateId: string; elementId: string; patch: Partial<Element> }
  | { type: 'generate'; setId: string }
  | { type: 'rename'; name: string };
export function applyOperations(project: Project, operations: Operation[]): Project {
  if (operations.length > 10000) throw new Error('Limit each batch to 10,000 operations');
  const next = clone(project);
  for (const op of operations) {
    if (op.type === 'rename') {
      next.name = op.name;
      continue;
    }
    if (op.type === 'edit-element') {
      const t = next.templates.find((t) => t.id === op.templateId);
      const e = t?.elements.find((e) => e.id === op.elementId);
      if (!e) throw new Error('Unknown element');
      if ('id' in op.patch) throw new Error('Element IDs cannot be changed');
      Object.assign(e, op.patch);
      continue;
    }
    const set = next.sets.find((s) => s.id === op.setId);
    if (!set) throw new Error(`Unknown set ${op.setId}`);
    if (op.type === 'add-row') {
      if (set.rows.some((r) => r.id === op.row.id)) throw new Error('Duplicate row ID');
      set.rows.push(clone(op.row));
    }
    if (op.type === 'delete-row') set.rows = set.rows.filter((r) => r.id !== op.rowId);
    if (op.type === 'generate') {
      if (!set.generator) throw new Error('Set has no generator');
      set.rows = generateRows(set.generator, set.rows);
    }
    if (op.type === 'set-cell' || op.type === 'calculate') {
      if (['id', '__proto__', 'constructor', 'prototype'].includes(op.field))
        throw new Error('Reserved field name');
      if (op.type === 'set-cell') {
        const row = set.rows.find((r) => r.id === op.rowId);
        if (!row) throw new Error('Unknown row');
        row[op.field] = clone(op.value);
      } else
        for (const row of set.rows) {
          const result = evaluateFormula(op.formula, row, next);
          if (result.error) throw new Error(`${row.id}: ${result.error}`);
          row[op.field] = result.value ?? null;
        }
      if (!set.fields.some((f) => f.key === op.field)) set.fields.push({ key: op.field, type: 'text' });
    }
  }
  next.updatedAt = new Date().toISOString();
  return parseProject(next);
}
export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  permissions: ('read-project' | 'propose-edits' | 'import-data' | 'export')[];
}
export interface Extension {
  manifest: ExtensionManifest;
  connect?: (
    input: Uint8Array,
    parameters: Record<string, Value>,
  ) => Promise<{ rows: Row[]; fields: Field[] }>;
  validate?: (document: Readonly<DocumentState>) => Issue[];
  generate?: (document: Readonly<DocumentState>, parameters: Record<string, Value>) => Operation[];
  export?: (document: Readonly<DocumentState>) => Record<string, string | Uint8Array>;
}
export class ExtensionRegistry {
  private extensions = new Map<string, Extension>();
  register(extension: Extension) {
    if (this.extensions.has(extension.manifest.id))
      throw new Error('An extension with this ID is already registered');
    this.extensions.set(extension.manifest.id, extension);
  }
  list() {
    return [...this.extensions.values()].map((e) => clone(e.manifest));
  }
  validate(project: DocumentState): Issue[] {
    const issues: Issue[] = [];
    for (const extension of this.extensions.values()) {
      if (!extension.manifest.permissions.includes('read-project')) continue;
      try {
        issues.push(...(extension.validate?.(clone(project)) ?? []));
      } catch (e) {
        issues.push({
          id: uid('extension-error'),
          severity: 'warning',
          code: 'extension',
          message: `${extension.manifest.name} failed`,
          detail: (e as Error).message,
        });
      }
    }
    return issues;
  }
  propose(
    id: string,
    project: Project,
    parameters: Record<string, Value>,
  ): { operations: Operation[]; preview: Project } {
    const extension = this.extensions.get(id);
    if (
      !extension?.manifest.permissions.includes('propose-edits') ||
      !extension.manifest.permissions.includes('read-project') ||
      !extension.generate
    )
      throw new Error('Extension cannot propose edits');
    const operations = extension.generate(clone(project), clone(parameters));
    return { operations, preview: applyOperations(project, operations) };
  }
  async connect(id: string, input: Uint8Array, parameters: Record<string, Value>) {
    const extension = this.extensions.get(id);
    if (!extension?.manifest.permissions.includes('import-data') || !extension.connect)
      throw new Error('Extension cannot import data');
    const result = await extension.connect(new Uint8Array(input), clone(parameters));
    return validateImportedData(result);
  }
  export(id: string, project: Project) {
    const extension = this.extensions.get(id);
    if (
      !extension?.manifest.permissions.includes('export') ||
      !extension.manifest.permissions.includes('read-project') ||
      !extension.export
    )
      throw new Error('Extension cannot export');
    return extension.export(clone(project));
  }
}
export { renderComponent, preflight };
