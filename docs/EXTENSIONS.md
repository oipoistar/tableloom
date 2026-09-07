# Automation and extension API

The shared engine lives in `src/core`. Extensions consume the published TypeScript interfaces in `model.ts` and `automation.ts`. CLI and GUI use the same project and layout engine.

`ExtensionRegistry` registers named, versioned generators, data connectors, validators and exporters. Permissions are explicit: read-project, propose-edits, import-data, export. The registry supplies copies of the document, isolates validator failures, and validates proposed operations before they can become the next document. This API is for trusted application modules; it is not an arbitrary-code security sandbox.

The desktop GUI accepts declarative resource packages and safe formulas. Arbitrary scripts run only through the explicitly named CLI `script` command, with ordinary user permissions. Do not run a script you have not reviewed.

```ts
import { ExtensionRegistry } from './src/core/automation';
const registry = new ExtensionRegistry();
registry.register({
  manifest: { id: 'my.costs', name: 'Total cost', version: '1.0.0', permissions: ['read-project', 'propose-edits'] },
  generate: (document) => document.sets.map(set => ({
    type: 'calculate', setId: set.id, field: 'totalCost', formula: 'salt + reed + clay'
  }))
});
const result = registry.propose('my.costs', project, {});
// Present result.operations and result.preview before applying the update.
```

Batch JSON supports set-cell, calculate, add-row, delete-row, edit-element, generate, and rename. Operations apply atomically to a cloned document and are validated before output is written.

Sample commands:

```sh
npm run cli -- create saltmarsh example.tableloom
npm run cli -- validate example.tableloom
npm run cli -- render example.tableloom ./exported-components
npm run cli -- print example.tableloom ./print.html
npm run cli -- stats example.tableloom
```

Data connectors implement `connect(inputBytes, parameters)` and declare `import-data`. Returned rows and typed fields are schema-validated, including stable IDs, duplicate IDs, finite values, and reserved-key rejection. The caller presents the resulting import preview before committing it. A generator or exporter that receives a project also needs `read-project`. Connector modules may use their own private service credentials; Tableloom does not ship a third-party spreadsheet account connector.
