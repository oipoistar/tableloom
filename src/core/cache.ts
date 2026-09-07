import type { DocumentState, Issue } from './model';
import { hashString, stableStringify } from './model';
import { preflight } from './layout';
export class PreflightCache {
  private global = '';
  private rows = new Map<string, { key: string; issues: Issue[] }>();
  run(doc: DocumentState, locale = doc.baseLocale): Issue[] {
    const dependencies = hashString(
      stableStringify({
        templates: doc.templates,
        styles: doc.styles,
        blocks: doc.blocks,
        assets: doc.assets.map(({ data, ...a }) => a),
        symbols: doc.symbols,
        terms: doc.terms,
        variables: doc.variables,
        translations: doc.translations,
        locale,
      }),
    );
    if (dependencies !== this.global) {
      this.rows.clear();
      this.global = dependencies;
    }
    const live = new Set<string>();
    const result = new Map<string, Issue>();
    const hasLookup = JSON.stringify([
      doc.templates,
      doc.blocks,
      ...doc.sets.map((s) => s.overrides),
    ]).includes('lookup(');
    for (const set of doc.sets)
      for (const row of set.rows) {
        const id = `${set.id}/${row.id}`;
        live.add(id);
        const key = hashString(
          stableStringify({
            row,
            overrides: set.overrides[row.id],
            fields: set.fields,
            templateId: set.templateId,
            back: set.backTemplateId,
          }),
        );
        let cached = this.rows.get(id);
        if (!cached || cached.key !== key || hasLookup) {
          cached = { key, issues: preflight(doc, locale, { setId: set.id, rowId: row.id, row }) };
          this.rows.set(id, cached);
        }
        for (const issue of cached.issues) result.set(issue.id, issue);
      }
    for (const key of this.rows.keys()) if (!live.has(key)) this.rows.delete(key);
    return [...result.values()];
  }
  get size() {
    return this.rows.size;
  }
}
