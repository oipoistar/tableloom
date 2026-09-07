import { describe, it, expect } from 'vitest';
import { ExtensionRegistry } from '../src/core/automation';
import { fileId, parseProject, validateElementPatch } from '../src/core/model';
import { createStarter } from '../src/core/starters';
import { renderComponent } from '../src/core/layout';
import { exportRelatedData, parseRelatedData } from '../src/core/data';

describe('import and export boundaries', () => {
  it('round-trips related CSVs with stable parent links and deeply typed values', () => {
    const fields = [
        { key: 'name', type: 'text' as const },
        { key: 'actions', type: 'list' as const },
      ],
      rows = [
        {
          id: 'card-1',
          name: '=Literal formula',
          actions: [
            { id: 'action-a', cost: 3, modifiers: [{ id: 'm', active: true }], label: '3' },
            null,
            'Text',
          ],
        },
        { id: 'card-2', name: 'No actions', actions: [] },
      ];
    expect(parseRelatedData(exportRelatedData(rows, fields))).toEqual({ rows, fields });
  });
  it('rejects invalid layout overrides before they reach the renderer', () => {
    expect(() => validateElementPatch({ w: -10 })).toThrow();
    const p = createStarter('orchard');
    p.sets[0]!.overrides[p.sets[0]!.rows[0]!.id] = { title: { opacity: 2 } };
    expect(() => parseProject(p)).toThrow(/Invalid project/);
  });
  it('escapes imported element attributes and text in exported SVG', () => {
    const p = createStarter('orchard'),
      set = p.sets[0]!,
      row = set.rows[0]!;
    row.name = '<script>alert(1)</script>';
    set.overrides[row.id] = {
      title: { color: 'red" onload="alert(1)', font: 'Source Sans 3"/><script>bad</script>' },
    };
    const svg = renderComponent(parseProject(p), set, row);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain(' onload="');
    expect(svg).toContain('&lt;script&gt;');
  });
  it('keeps arbitrary stable IDs within a single output filename', () => {
    for (const id of ['../outside', '..', 'folder\\file', 'a/b:c']) {
      const name = fileId(id);
      expect(name).not.toMatch(/[\\/:]/);
      expect(name).not.toContain('..');
    }
  });
  it('validates connector values, typed fields and unique stable IDs', async () => {
    const registry = new ExtensionRegistry();
    registry.register({
      manifest: { id: 'csv', name: 'Fixture connector', version: '1', permissions: ['import-data'] },
      connect: async () => ({
        rows: [{ id: 'a', actions: [{ id: 'child', cost: 3 }] }],
        fields: [{ key: 'actions', type: 'list' }],
      }),
    });
    const result = await registry.connect('csv', new Uint8Array(), {});
    expect(result.rows[0]!.actions).toEqual([{ id: 'child', cost: 3 }]);
    registry.register({
      manifest: { id: 'duplicate', name: 'Broken connector', version: '1', permissions: ['import-data'] },
      connect: async () => ({ rows: [{ id: 'a' }, { id: 'a' }], fields: [] }),
    });
    await expect(registry.connect('duplicate', new Uint8Array(), {})).rejects.toThrow(/Duplicate/);
    registry.register({
      manifest: { id: 'invalid', name: 'Broken values', version: '1', permissions: ['import-data'] },
      connect: async () => ({ rows: [{ id: 'a', cost: Infinity }], fields: [] }),
    });
    await expect(registry.connect('invalid', new Uint8Array(), {})).rejects.toThrow();
  });
  it('requires project-read permission before exposing a project to an exporter', () => {
    const registry = new ExtensionRegistry();
    let called = false;
    registry.register({
      manifest: { id: 'export', name: 'Undeclared reader', version: '1', permissions: ['export'] },
      export: () => {
        called = true;
        return {};
      },
    });
    expect(() => registry.export('export', createStarter())).toThrow();
    expect(called).toBe(false);
  });
});
