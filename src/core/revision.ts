import type {
  DocumentState,
  Change,
  ComponentSet,
  Row,
  Element,
  Note,
  SavedOutput,
  ExportProfile,
} from './model';
import { stableStringify, quantity, hashString, getPath, uid } from './model';
import { resolvedElements, resolveTemplate, elementContent } from './layout';
export function componentFingerprint(
  doc: DocumentState,
  set: ComponentSet,
  rowId: string,
  inputRow?: Row,
): { data: string; layout: string } {
  const row = inputRow ?? set.rows.find((r) => r.id === rowId)!;
  const front = resolvedElements(doc, set, row),
    back = set.backTemplateId ? resolvedElements(doc, set, row, true) : [];
  const lookupValues: unknown[] = [];
  const usedAssets = new Set<string>(),
    usedSymbols = new Set<string>(),
    usedTerms = new Set<string>(),
    usedVariables = new Set<string>();
  const inspect = (elements: Element[], data: Row) => {
    for (const el of elements) {
      const content = elementContent(el, data, doc);
      if (el.formula?.includes('lookup(')) lookupValues.push([el.id, content]);
      const raw = el.binding ? String(getPath(data, el.binding) ?? '') : (el.text ?? '');
      if (el.type === 'image') {
        const a = doc.assets.find((a) => a.id === (el.binding ? content : el.imageId) || a.name === content);
        if (a) usedAssets.add(a.id);
      }
      if (el.type === 'symbol') usedSymbols.add(el.symbolId || content);
      for (const match of content.matchAll(/\[icon:([^\]]+)\]/g)) usedSymbols.add(match[1]!);
      for (const match of raw.matchAll(/\[term:([^\]]+)\]/g)) usedTerms.add(match[1]!);
      for (const name of Object.keys(doc.variables))
        if (new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(el.formula ?? raw))
          usedVariables.add(name);
      if (el.type === 'repeater' && Array.isArray(data[el.binding ?? '']))
        for (const item of data[el.binding ?? ''] as Row[])
          inspect(el.children ?? [], { ...data, ...item, id: data.id });
      else inspect(el.children ?? [], data);
    }
  };
  inspect([...front, ...back], row);
  const assets = doc.assets.filter((a) => usedAssets.has(a.id)).map((a) => ({ id: a.id, hash: a.hash }));
  const template = resolveTemplate(doc, set.templateId);
  return {
    data: stableStringify(row),
    layout: stableStringify({
      template: { ...template, elements: front },
      back: set.backTemplateId ? { ...resolveTemplate(doc, set.backTemplateId), elements: back } : null,
      lookupValues,
      assets,
      symbols: doc.symbols.filter((s) => usedSymbols.has(s.id) || usedSymbols.has(s.name)),
      terms: doc.terms.filter((t) => usedTerms.has(t.id) || usedTerms.has(t.name)),
      variables: Object.fromEntries([...usedVariables].map((k) => [k, doc.variables[k]])),
      translations: Object.fromEntries(
        Object.entries(doc.translations).map(([locale, values]) => [
          locale,
          Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith(row.id + '.'))),
        ]),
      ),
    }),
  };
}
export function compareDocuments(before: DocumentState, after: DocumentState): Change[] {
  const changes: Change[] = [];
  for (const set of after.sets) {
    const old = before.sets.find((s) => s.id === set.id);
    const oldRows = new Map(old?.rows.map((r) => [r.id, r]));
    for (const row of set.rows) {
      const prev = oldRows.get(row.id);
      const name = String(row.name ?? row.id);
      if (!prev || !old) {
        changes.push({ setId: set.id, rowId: row.id, name, kind: 'added', fields: [] });
        continue;
      }
      const fields = [...new Set([...Object.keys(row), ...Object.keys(prev)])].filter(
        (k) => stableStringify(row[k]) !== stableStringify(prev[k]),
      );
      let layout = false;
      try {
        layout =
          componentFingerprint(before, old, row.id, prev).layout !==
          componentFingerprint(after, set, row.id, row).layout;
      } catch {
        layout = true;
      }
      if (fields.length || layout)
        changes.push({
          setId: set.id,
          rowId: row.id,
          name,
          kind: fields.length ? (layout ? 'both' : 'data') : 'layout',
          fields,
        });
    }
  }
  for (const set of before.sets) {
    const next = after.sets.find((s) => s.id === set.id);
    const ids = new Set(next?.rows.map((r) => r.id));
    for (const row of set.rows)
      if (!ids.has(row.id))
        changes.push({
          setId: set.id,
          rowId: row.id,
          name: String(row.name ?? row.id),
          kind: 'removed',
          fields: [],
        });
  }
  return changes;
}
export function deckStructure(doc: DocumentState): string {
  return hashString(
    stableStringify(
      doc.sets.map((s) => ({ id: s.id, rows: s.rows.map((r) => ({ id: r.id, qty: quantity(r) })) })),
    ),
  );
}
export function outputRecord(doc: DocumentState, profile: ExportProfile, name: string): SavedOutput {
  const sets = doc.sets.filter(
    (s) =>
      (!profile.setIds.length || profile.setIds.includes(s.id)) &&
      (profile.destination !== 'tts' || s.kind === 'card'),
  );
  const componentHashes = Object.fromEntries(
    sets.flatMap((set) =>
      set.rows.map((row) => [
        JSON.stringify([set.id, row.id]),
        hashString(stableStringify(componentFingerprint(doc, set, row.id, row))),
      ]),
    ),
  );
  return {
    id: uid('output'),
    name,
    createdAt: new Date().toISOString(),
    destination: profile.destination,
    setIds: sets.map((s) => s.id),
    componentHashes,
  };
}
export function outputImpacts(doc: DocumentState) {
  if (!doc.outputs?.length) return [];
  const needed = new Set(doc.outputs.flatMap((o) => o.setIds));
  const current = new Map<string, string>();
  for (const set of doc.sets.filter((s) => needed.has(s.id)))
    for (const row of set.rows) {
      const key = JSON.stringify([set.id, row.id]);
      try {
        current.set(key, hashString(stableStringify(componentFingerprint(doc, set, row.id, row))));
      } catch {
        current.set(key, 'invalid');
      }
    }
  return doc.outputs.map((output) => {
    const keys = new Set([
      ...Object.keys(output.componentHashes),
      ...doc.sets
        .filter((s) => output.setIds.includes(s.id))
        .flatMap((s) => s.rows.map((r) => JSON.stringify([s.id, r.id]))),
    ]);
    return {
      ...output,
      changed: [...keys].filter((key) => output.componentHashes[key] !== current.get(key)).length,
    };
  });
}
export function statistics(set: ComponentSet) {
  const total = set.rows.reduce((s, r) => s + quantity(r), 0);
  const types: Record<string, number> = {};
  const costs: Record<string, number> = {};
  const effects = new Map<string, string[]>();
  let costSum = 0;
  for (const row of set.rows) {
    const qty = quantity(row);
    const type = String(row.type ?? 'Uncategorized');
    types[type] = (types[type] ?? 0) + qty;
    const cost = ['cost', 'salt', 'reed', 'clay'].reduce((n, k) => n + (Number(row[k]) || 0), 0);
    costs[String(cost)] = (costs[String(cost)] ?? 0) + qty;
    costSum += cost * qty;
    const effect = String(row.effect ?? '')
      .trim()
      .toLowerCase();
    if (effect) {
      const group = effects.get(effect) ?? [];
      group.push(String(row.name));
      effects.set(effect, group);
    }
  }
  return {
    total,
    types,
    costs,
    average: total ? costSum / total : 0,
    duplicates: [...effects.values()].filter((g) => g.length > 1),
  };
}
export function drawProbability(total: number, matching: number, draws: number, atLeast = 1): number {
  if (
    ![total, matching, draws, atLeast].every(Number.isInteger) ||
    total < 0 ||
    matching < 0 ||
    matching > total ||
    draws < 0 ||
    draws > total
  )
    throw new Error('Invalid draw parameters');
  if (atLeast <= 0) return 1;
  if (atLeast > Math.min(matching, draws)) return 0;
  const logChoose = (n: number, k: number) => {
    if (k < 0 || k > n) return -Infinity;
    let sum = 0;
    for (let i = 1; i <= Math.min(k, n - k); i++) sum += Math.log(n - i + 1) - Math.log(i);
    return sum;
  };
  let p = 0;
  for (let k = atLeast; k <= Math.min(matching, draws); k++)
    p += Math.exp(logChoose(matching, k) + logChoose(total - matching, draws - k) - logChoose(total, draws));
  return Math.min(1, Math.max(0, p));
}

export function feedbackSummary(notes: Note[]) {
  const observations = new Map<string, { category: string; target: string; count: number; open: number }>(),
    metrics = new Map<string, { metric: string; session: string; values: number[] }>();
  for (const note of notes) {
    const key = note.category + '/' + note.target;
    const group = observations.get(key) ?? {
      category: note.category,
      target: note.target,
      count: 0,
      open: 0,
    };
    group.count++;
    if (!note.resolved) group.open++;
    observations.set(key, group);
    if (note.metric && Number.isFinite(note.value)) {
      const key = note.metric + '/' + note.session;
      const group = metrics.get(key) ?? { metric: note.metric, session: note.session, values: [] };
      group.values.push(note.value!);
      metrics.set(key, group);
    }
  }
  return {
    observations: [...observations.values()].sort((a, b) => b.count - a.count),
    metrics: [...metrics.values()].map((m) => ({
      ...m,
      mean: m.values.reduce((a, b) => a + b, 0) / m.values.length,
    })),
  };
}
