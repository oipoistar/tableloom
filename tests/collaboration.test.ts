import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createStarter } from '../src/core/starters';
import {
  flattenProject,
  inflateProject,
  writeShared,
  readShared,
  permittedChanges,
} from '../src/core/collaboration';
import { clone } from '../src/core/model';
import { applyOperations, ExtensionRegistry } from '../src/core/automation';
import { suggestCleanup } from '../src/core/assistance';
describe('shared project convergence', () => {
  it('round trips a complete project through stable entity keys', () => {
    const p = createStarter();
    expect(inflateProject(flattenProject(p))).toEqual(p);
  });
  it('merges simultaneous edits to independent fields', () => {
    const p = createStarter();
    const a = new Y.Doc();
    writeShared(a, p);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const left = readShared(a),
      right = readShared(b);
    left.sets[0]!.rows[0]!.name = 'Left';
    right.sets[0]!.rows[0]!.salt = 8;
    writeShared(a, left);
    writeShared(b, right);
    const au = Y.encodeStateAsUpdate(a),
      bu = Y.encodeStateAsUpdate(b);
    Y.applyUpdate(a, bu);
    Y.applyUpdate(b, au);
    expect(readShared(a)).toEqual(readShared(b));
    expect(readShared(a).sets[0]!.rows[0]).toMatchObject({ name: 'Left', salt: 8 });
  });
  it('retains independently added rows', () => {
    const a = new Y.Doc();
    writeShared(a, createStarter());
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const left = readShared(a),
      right = readShared(b);
    left.sets[0]!.rows.push({ id: 'new-a', name: 'A', qty: 1 });
    right.sets[0]!.rows.push({ id: 'new-b', name: 'B', qty: 1 });
    writeShared(a, left);
    writeShared(b, right);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(readShared(a).sets[0]!.rows.map((r) => r.id)).toEqual(expect.arrayContaining(['new-a', 'new-b']));
  });
  it('enforces commenter and viewer field boundaries', () => {
    const p = createStarter();
    const before = flattenProject(p);
    p.notes.push({
      id: 'note-1',
      target: 'STR-01',
      session: '1',
      category: 'balance',
      text: 'Try reducing cost',
      resolved: false,
      createdAt: new Date().toISOString(),
    });
    expect(permittedChanges('commenter', before, flattenProject(p))).toBe(true);
    expect(permittedChanges('viewer', before, flattenProject(p))).toBe(false);
    p.name = 'Changed';
    expect(permittedChanges('commenter', before, flattenProject(p))).toBe(false);
    expect(permittedChanges('editor', before, flattenProject(p))).toBe(true);
  });
});
describe('batch and extension boundaries', () => {
  it('does not mutate the source if any operation fails', () => {
    const p = createStarter();
    const original = clone(p);
    expect(() =>
      applyOperations(p, [
        { type: 'set-cell', setId: 'structures', rowId: 'STR-01', field: 'name', value: 'changed' },
        { type: 'set-cell', setId: 'missing', rowId: 'a', field: 'name', value: 'x' },
      ]),
    ).toThrow();
    expect(p).toEqual(original);
  });
  it('generates validated previews for declared extension capabilities', () => {
    const p = createStarter();
    const registry = new ExtensionRegistry();
    registry.register({
      manifest: { id: 'test', name: 'Test', version: '1', permissions: ['read-project', 'propose-edits'] },
      generate: () => [
        { type: 'calculate', setId: 'structures', field: 'cost', formula: 'salt + reed + clay' },
      ],
    });
    const result = registry.propose('test', p, {});
    expect(result.preview.sets[0]!.rows[0]!.cost).toBe(1);
    expect(p.sets[0]!.rows[0]!.cost).toBeUndefined();
    expect(() => registry.export('test', p)).toThrow(/cannot export/);
  });
  it('contains a failing validator and reports its identity', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      manifest: { id: 'test', name: 'Faulty validator', version: '1', permissions: ['read-project'] },
      validate: () => {
        throw new Error('failure');
      },
    });
    expect(registry.validate(createStarter())[0]?.message).toContain('Faulty validator');
  });
  it('produces optional cleanup changes without applying them', () => {
    const p = createStarter();
    p.sets[0]!.rows[0]!.effect = '  Harvest  resources. ';
    const suggestions = suggestCleanup(p);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(p.sets[0]!.rows[0]!.effect).toBe('  Harvest  resources. ');
  });
});
