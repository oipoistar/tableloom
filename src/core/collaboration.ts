import * as Y from 'yjs';
import type { Project } from './model';
import { parseProject, stableStringify } from './model';
export type Role = 'owner' | 'editor' | 'commenter' | 'viewer';
const escape = (value: string) => encodeURIComponent(value);
export function flattenProject(project: Project): Map<string, string> {
  const result = new Map<string, string>();
  const visit = (value: unknown, key: string) => {
    if (
      Array.isArray(value) &&
      value.every((v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'string')
    ) {
      result.set(key, JSON.stringify({ $kind: 'ids' }));
      value.forEach((item, index) => {
        visit(item, `${key}/@${escape(item.id)}`);
        result.set(`${key}/@${escape(item.id)}/$order`, String(index));
      });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result.set(key, JSON.stringify({ $kind: 'object' }));
      for (const [k, v] of Object.entries(value)) visit(v, `${key}/${escape(k)}`);
    } else result.set(key, JSON.stringify({ $value: value }));
  };
  visit(project, 'project');
  return result;
}
export function inflateProject(entries: Map<string, string>): Project {
  const children = new Map<string, string[]>();
  for (const key of entries.keys()) {
    const index = key.lastIndexOf('/');
    if (index < 0) continue;
    const parent = key.slice(0, index);
    const list = children.get(parent) ?? [];
    list.push(key);
    children.set(parent, list);
  }
  const visit = (key: string, depth = 0): unknown => {
    if (depth > 100) throw new Error('Shared document is nested too deeply');
    const raw = entries.get(key);
    if (!raw) throw new Error('Shared document is incomplete');
    const value = JSON.parse(raw);
    if (value.$kind === 'ids')
      return (children.get(key) ?? [])
        .filter((k) => k.slice(key.length + 1).startsWith('@'))
        .sort(
          (a, b) =>
            Number(entries.get(a + '/$order') ?? 0) - Number(entries.get(b + '/$order') ?? 0) ||
            a.localeCompare(b),
        )
        .map((k) => visit(k, depth + 1));
    if (value.$kind === 'object') {
      const result: Record<string, unknown> = {};
      for (const child of children.get(key) ?? []) {
        const name = decodeURIComponent(child.slice(key.length + 1));
        if (name === '$order') continue;
        if (['__proto__', 'constructor', 'prototype'].includes(name))
          throw new Error('Reserved document property');
        result[name] = visit(child, depth + 1);
      }
      return result;
    }
    return value.$value;
  };
  return parseProject(visit('project'));
}
export function writeShared(doc: Y.Doc, project: Project, origin: unknown = 'local') {
  const map = doc.getMap<string>('project');
  const next = flattenProject(project);
  doc.transact(() => {
    for (const key of map.keys()) if (!next.has(key)) map.delete(key);
    for (const [key, value] of next) if (map.get(key) !== value) map.set(key, value);
  }, origin);
}
export function readShared(doc: Y.Doc): Project {
  return inflateProject(new Map(doc.getMap<string>('project')));
}
export function permittedChanges(
  role: Role,
  before: Map<string, string>,
  after: Map<string, string>,
): boolean {
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
    (k) => before.get(k) !== after.get(k),
  );
  if (!changed.length) return true;
  if (role === 'viewer') return false;
  if (role === 'owner' || role === 'editor') return true;
  return changed.every(
    (key) => key === 'project/updatedAt' || key === 'project/notes' || key.startsWith('project/notes/'),
  );
}
export function encodeUpdate(update: Uint8Array): string {
  let binary = '';
  for (const b of update) binary += String.fromCharCode(b);
  return btoa(binary);
}
export function decodeUpdate(value: string): Uint8Array {
  if (value.length > 40_000_000) throw new Error('Shared update is too large');
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
