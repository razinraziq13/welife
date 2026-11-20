# WeLife

**One Life. Endless Generations.** An offline-first, multigenerational life simulator built as
an installable Progressive Web App for desktop, Android and iOS.

> Status: **0.9.0 release candidate.** Milestones 0-8 are complete and Milestone 9 (integration, balance, release) is awaiting review. See [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md), [CHANGELOG.md](CHANGELOG.md) and [docs/SECURITY.md](docs/SECURITY.md).

**Play it:** https://razinraziq13.github.io/welife/ (works offline once loaded). On iPhone or iPad, open it in Safari and choose Share, then Add to Home Screen. On Android, use Chrome's Install app.

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
| `npm run soak`      | 10,000-month, multi-generation soak test (about 4 minutes)                   |
| `npm run e2e`       | End-to-end tests (Playwright) against a production build                     |
| `npm run verify`    | typecheck + lint + boundaries + format check + tests + build                 |
| `npm run icons`     | Regenerates PNG/ICO icons from `public/favicon.svg`                          |

End-to-end tests cover Chromium and WebKit (desktop and mobile); Firefox is not tested.

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
