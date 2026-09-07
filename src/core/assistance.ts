import type { Project } from './model';
import type { Operation } from './automation';
import { applyOperations } from './automation';
export interface Suggestion {
  id: string;
  title: string;
  reason: string;
  operations: Operation[];
}
export function suggestCleanup(project: Project): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const set of project.sets) {
    const whitespace: Operation[] = [];
    const terms: Operation[] = [];
    for (const row of set.rows)
      for (const field of set.fields.filter((f) => f.type === 'text')) {
        const value = row[field.key];
        if (typeof value !== 'string') continue;
        const trimmed = value.trim().replace(/[ \t]{2,}/g, ' ');
        if (trimmed !== value)
          whitespace.push({
            type: 'set-cell',
            setId: set.id,
            rowId: row.id,
            field: field.key,
            value: trimmed,
          });
        if (field.key !== 'name') {
          let linked = value;
          for (const term of project.terms) {
            const escaped = term.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            linked = linked.replace(
              new RegExp(`(?<![\\w:])${escaped}(?![\\w\\]])`, 'gi'),
              `[term:${term.id}]`,
            );
          }
          if (linked !== value)
            terms.push({ type: 'set-cell', setId: set.id, rowId: row.id, field: field.key, value: linked });
        }
      }
    if (whitespace.length)
      suggestions.push({
        id: `space-${set.id}`,
        title: `Tidy spacing in ${set.name}`,
        reason: `${whitespace.length} fields have leading, trailing, or doubled whitespace.`,
        operations: whitespace,
      });
    if (terms.length)
      suggestions.push({
        id: `terms-${set.id}`,
        title: `Link shared terms in ${set.name}`,
        reason: `${terms.length} fields contain terminology that can stay linked to your shared definitions.`,
        operations: terms,
      });
  }
  return suggestions;
}
export function fieldMapping(headers: string[], project: Project) {
  const fields = [...new Set(project.sets.flatMap((s) => s.fields.map((f) => f.key)))];
  return headers.map((header) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exact = fields.find((f) => f.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);
    const synonyms: Record<string, string> = {
      title: 'name',
      description: 'effect',
      rules: 'effect',
      quantity: 'qty',
      image: 'art',
      artwork: 'art',
    };
    return { source: header, target: exact ?? synonyms[normalized] ?? null };
  });
}
export async function providerSuggestions(
  endpoint: string,
  project: Project,
  token?: string,
): Promise<Suggestion[]> {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  )
    throw new Error('Use HTTPS, or a local provider on this computer.');
  const payload = {
    protocol: 'tableloom-assistance-v1',
    project: {
      name: project.name,
      sets: project.sets.map((s) => ({ id: s.id, name: s.name, fields: s.fields, rows: s.rows })),
      terms: project.terms,
      variables: project.variables,
    },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.suggestions) || data.suggestions.length > 50)
    throw new Error('Provider response must contain at most 50 suggestions');
  for (const suggestion of data.suggestions) {
    if (
      typeof suggestion.title !== 'string' ||
      typeof suggestion.reason !== 'string' ||
      !Array.isArray(suggestion.operations)
    )
      throw new Error('Invalid suggestion response');
    applyOperations(project, suggestion.operations);
  }
  return data.suggestions;
}
