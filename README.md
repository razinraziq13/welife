# WeLife

**One Life. Endless Generations.** An offline-first, multigenerational life simulator built as
an installable Progressive Web App for desktop, Android and iOS.

> Status: **0.9.0**, with post-release expansions (careers, sport, music, influencers and more)
> shipped continuously from `main`. What changed is in [CHANGELOG.md](CHANGELOG.md); why, in
> [docs/DECISIONS.md](docs/DECISIONS.md).

**Play it:** https://razinraziq13.github.io/welife/ (works offline once loaded). On iPhone or iPad, open it in Safari and choose Share, then Add to Home Screen. On Android, use Chrome's Install app.

## What you can do

- **Live a life, then the next:** monthly ageing, school and university (same-course diploma,
  bachelor's and master's), relationships, children, death and succession across generations,
  with rewind to any past month.
- **Work:** a job board, applications and interviews, and careers started from Career, Paths:
  acting, music, film directing, sport (football, basketball, tennis), and licensed professions
  (lawyer, journalist, doctor) with real degree and admission gates.
- **Money:** a double-entry ledger in integer minor units, banking, loans, investments and
  bonds, property, shopping, a business engine (staff, prices, products, client contracts,
  market research), your own law firm or clinic, gambling, and taxes by country.
- **World:** 20 countries with their own rules, an economy in today's money, politics, the law,
  the military, health and religion, plus social media with an influencer feed.
- **Your saves stay on your device:** everything runs in the browser, offline, with no
  account or server.

The four-month **Advance** plays one month at a time and stops when a decision needs you.

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
  app/          React UI (screens, tabs, components, stores, engine bridge)
  contracts/    Shared Zod schemas and the UI ↔ engine message protocol
  engine/       Pure TypeScript simulation (no DOM, no storage, deterministic)
  persistence/  IndexedDB (Dexie) schema and repositories
  worker/       Engine worker host: validates requests, owns storage
tests/          unit · integration · soak · e2e (Playwright) · fixtures
docs/           design, decisions and plans (see below)
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing module boundaries.

## Documentation

| Document                                                               | What it is                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                           | Layers, boundaries, the command pipeline and determinism       |
| [docs/DECISIONS.md](docs/DECISIONS.md)                                 | Every approved design and engineering decision (D-, E- and R-) |
| [docs/TRACEABILITY.md](docs/TRACEABILITY.md)                           | Specification requirements mapped to code and tests            |
| [docs/SECURITY.md](docs/SECURITY.md)                                   | Threat model and privacy                                       |
| [docs/ROADMAP.md](docs/ROADMAP.md)                                     | The plan after 0.9.0                                           |
| [docs/IMPROVEMENT_BRIEF.md](docs/IMPROVEMENT_BRIEF.md)                 | Historical brief the roadmap was drawn from                    |
| [docs/IMPROVEMENTS_FROM_BITLIFE.md](docs/IMPROVEMENTS_FROM_BITLIFE.md) | Historical comparison notes behind the roadmap                 |
| [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md)                     | Milestone checklists and verification records                  |

## Contributing

1. Branch from `main`; keep each commit to one change.
2. Rules the code enforces and reviews expect:
   - The engine (`src/engine`) is pure and deterministic: no `Math.random`, `Date`, timers or
     browser globals, and building the game view must never change the game.
   - Every gameplay write goes through a validated command; the UI never touches IndexedDB.
   - Money is integer minor units (`bigint`) through the balanced ledger.
   - Save data only grows: add optional fields (or a new Dexie `version(n)` block); never
     edit old ones. Saves from earlier versions must keep loading.
   - No placeholder screens; a disabled control says why.
3. Run `npm run verify` (and `npm run e2e` for UI changes) before opening a pull request.
