# WeLife

**One Life. Endless Generations.** An offline-first, multigenerational life simulator built as
an installable Progressive Web App for desktop, Android and iOS.

> Status: **Milestone 0 (foundation)** complete. See [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md).

## Requirements

- Node.js 22.22 or newer (developed on Node 26)
- npm 10+

## Getting started

```bash
npm install
npx playwright install chromium webkit   # once, for end-to-end tests
npm run dev                               # http://localhost:5173
```

## Scripts

| Command             | What it does                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`       | Development server with hot reload (service worker disabled)                 |
| `npm run build`     | Production build with service worker into `dist/`                            |
| `npm run preview`   | Serves `dist/` at http://localhost:4173 (use this to test offline/install)   |
| `npm run typecheck` | Strict TypeScript checks per layer (contracts, engine, worker, app, tooling) |
| `npm run lint`      | ESLint (type-aware, accessibility, determinism rules)                        |
| `npm run lint:deps` | Module boundary and circular-import checks                                   |
| `npm run test`      | Unit and integration tests (Vitest)                                          |
| `npm run e2e`       | End-to-end tests (Playwright) against a production build                     |
| `npm run verify`    | typecheck + lint + boundaries + format check + tests + build                 |
| `npm run icons`     | Regenerates PNG/ICO icons from `public/favicon.svg`                          |

Firefox end-to-end tests are opt-in locally: `WELIFE_E2E_FIREFOX=1 npm run e2e`.

## Project layout

```
src/
  app/          React UI (screens, components, stores, engine bridge)
  contracts/    Shared Zod schemas and the UI ↔ engine message protocol
  engine/       Pure TypeScript simulation (no DOM, no storage, deterministic)
  persistence/  IndexedDB (Dexie) schema and repositories
  worker/       Engine worker host: validates requests, owns storage
tests/          unit · integration · e2e
docs/           ARCHITECTURE · DECISIONS · TRACEABILITY
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing module boundaries.
