# Tableloom architecture

Tableloom is a local-first Electron desktop application, with Vue 3, TypeScript, Vite, and a framework-independent document engine.

## Why this stack

The most consequential requirement is reliable geometry between editor, component outputs, and printed pages. Electron ships the same Chromium version across supported systems. SVG is the common document surface; native PDF output uses Chromium. A narrow, sandboxed preload bridge owns filesystem dialogs and atomic writes. The browser build supports local IndexedDB projects and portable file downloads for development and browser review.

Vue components provide five working views. The engine is plain TypeScript, so CLI, tests, and extensions can operate on the same records and layouts. No web service is required for authoring or standard export. Fonts and starter artwork are bundled.

## Boundaries

- `src/core`: versioned project model, validation, layouts, formulas, generators, preflight, comparison, statistics, packages and imposition.
- `src/store.ts`: document transactions, bounded undo, persistence, selection, and workspace operations.
- `src/components` / `src/views`: accessible editing and inspection controls.
- `desktop`: isolated Electron bridge, project storage, watched sources, native PDF output.
- `src/cli.ts`: offline batch creation, validation, rendering, conversion and reports.
- `server`: optional self-hosted collaboration, with authenticated roles and persisted shared documents.
- `tests`: behavior tests and real HTTP/WebSocket collaboration integration tests.

## Source format

The `.tableloom` format is a ZIP with `project.json`, original assets and a manifest. The archive can be inspected with ordinary ZIP tools; `project.json` references its packaged originals. All content has stable IDs. Formats newer than the installed reader are rejected without modifying the file. Saved snapshots retain exact project data. Local autosave does not require account access.

## Verification

Tests must exercise real design-to-revision behavior: correct edit scope, quantities/backs in imposition, malicious import handling, reproducible generators and shuffle, data import fidelity, archived assets, recovery and export. OS packaging configuration does not establish tested platform parity.

References: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Vue TypeScript](https://vuejs.org/guide/typescript/composition-api).
