# WeLife — Architecture

## Layers

```
┌──────────────────────── UI thread ─────────────────────────┐
│ src/app        React 19 · React Router · Zustand · Tailwind │
│   bridge/      EngineClient: typed request/response over     │
│                postMessage, one id per call                  │
└───────────────────────────┬────────────────────────────────┘
                            │ validated messages (src/contracts)
┌───────────────────────────▼──────── Web Worker ────────────┐
│ src/worker     host: validates requests (Zod), dispatches   │
│ src/engine     pure TypeScript simulation (no DOM, no I/O)  │
│ src/persistence Dexie/IndexedDB schema and repositories     │
└─────────────────────────────────────────────────────────────┘
src/contracts  shared Zod schemas and protocol types (depends only on zod)
```

### Rules (enforced automatically)

| Rule                                                                                               | Enforced by                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Engine has no React, DOM, IndexedDB or UI imports                                                  | `.dependency-cruiser.cjs` (`engine-is-pure`) and `tsconfig.engine.json` (no DOM lib) |
| Engine and contracts never use `Math.random`, `Date`, `performance.now`, timers or browser globals | ESLint determinism rules in `eslint.config.js`                                       |
| UI never imports persistence, the worker or Dexie; all writes are validated requests               | `ui-uses-commands-not-storage` rule                                                  |
| Contracts depend only on Zod                                                                       | `contracts-are-leaf` rule                                                            |
| No circular imports                                                                                | `no-circular` rule                                                                   |

A deliberate violation (an engine file importing React, reading `window` and calling
`Math.random`) was confirmed to fail all three checks during Milestone 0.

## Request flow

1. A screen calls a store action (e.g. `updateSettings({ theme: 'dark' })`).
2. The store calls `getEngine().call('settings.update', patch)`; the client assigns a unique
   request id and posts the message to the worker.
3. The worker host validates the message against `RpcRequestSchema`. Invalid requests are
   answered with `INVALID_REQUEST` and field paths (e.g. `params.textScale`); nothing is stored.
4. The handler runs inside a Dexie transaction and returns the stored result.
5. The client matches the response by id and resolves the caller; the store updates state.

If the worker crashes, every pending and future call rejects with `UNAVAILABLE`, and the
Home screen offers **Retry**, which starts a fresh worker.

## Persistence

- Database `welife`, schema version 1: `meta`, `settings`.
- New schema versions are added as new `this.version(n)` blocks; old blocks are never edited.
- Stored rows are validated on read; a corrupt row falls back to defaults and is repaired on
  the next valid write.

From Milestone 1 the worker also owns the world state, the command log, snapshots and branches.

## Appearance

App preferences (theme, contrast, text size, motion, shortcuts) are stored in IndexedDB.
A copy is mirrored to `localStorage` only so the inline script in `index.html` can apply the
right theme before first paint. The resolved values are set as `data-theme`, `data-contrast`,
`data-motion` and the root font size on `<html>`; design tokens are CSS variables in
`src/app/styles.css`.

## Offline and installation

`vite-plugin-pwa` (Workbox `generateSW`) precaches the app shell, the engine worker chunk and
icons. Navigation falls back to the cached `index.html`, so deep links work offline. Updates
are never applied silently: a "new version ready" prompt asks before reloading.
If service-worker registration fails, Home says offline mode is unavailable instead of waiting.

## Testing

| Layer                                          | Tool                                                            | Location                 |
| ---------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| Unit (pure rules, schemas, repositories)       | Vitest + fake-indexeddb                                         | `tests/unit`             |
| Integration (UI client ↔ real worker host)     | Vitest, in-process worker with structured cloning               | `tests/integration`      |
| End-to-end (production build + service worker) | Playwright: desktop Chromium/WebKit/Firefox, Pixel 7, iPhone 15 | `tests/e2e`              |
| Accessibility                                  | axe-core (WCAG 2.2 A/AA tags) in e2e, light and dark            | `tests/e2e/boot.spec.ts` |
