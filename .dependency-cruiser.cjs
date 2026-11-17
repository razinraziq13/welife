/**
 * Module boundary rules for WeLife (see docs/ARCHITECTURE.md).
 *
 *   engine  <-  contracts  <-  app      (app talks to the worker only via messages)
 *     ^            ^
 *     └── worker (host) ──>  persistence  ->  engine, contracts (types)
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports make module ownership unclear and break tree-shaking.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contracts-are-leaf',
      severity: 'error',
      comment:
        'Contracts are shared by the UI and the worker. They may use engine types/schemas and zod, never UI, worker or storage code.',
      from: { path: '^src/contracts' },
      to: {
        pathNot: ['^src/contracts', '^src/engine', 'node_modules/zod'],
      },
    },
    {
      name: 'engine-is-pure',
      severity: 'error',
      comment:
        'The simulation engine must stay framework- and storage-independent (spec §2): no React, no IndexedDB, no UI or worker code.',
      from: { path: '^src/engine' },
      to: {
        pathNot: ['^src/engine', 'node_modules/zod'],
      },
    },
    {
      name: 'persistence-not-to-ui',
      severity: 'error',
      from: { path: '^src/persistence' },
      to: {
        path: ['^src/app', '^src/worker', 'node_modules/(react|react-dom|react-router|zustand)'],
      },
    },
    {
      name: 'worker-not-to-ui',
      severity: 'error',
      from: { path: '^src/worker' },
      to: { path: ['^src/app', 'node_modules/(react|react-dom|react-router|zustand)'] },
    },
    {
      name: 'ui-uses-commands-not-storage',
      severity: 'error',
      comment:
        'All gameplay writes go through validated commands to the engine worker (spec §2); the UI never touches IndexedDB directly.',
      from: { path: '^src/app' },
      to: { path: ['^src/persistence', '^src/worker', 'node_modules/dexie'] },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true, pathNot: ['^virtual:'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.d.ts'],
    },
  },
};
