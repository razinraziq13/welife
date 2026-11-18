# WeLife — Architecture

## Layers

```
┌──────────────────────── UI thread ─────────────────────────┐
│ src/app        React 19 · React Router · Zustand · Tailwind │
│   bridge/      EngineClient: typed request/response over     │
│                postMessage, one id per call                  │
│   (may import engine *pure* modules for types, catalogs,     │
│    content text; never persistence or the worker)            │
└───────────────────────────┬────────────────────────────────┘
                            │ validated messages (src/contracts)
┌───────────────────────────▼──────── Web Worker ────────────┐
│ src/worker      host: validates requests (Zod), runs them    │
│                 strictly in order, keeps the open session    │
│ src/engine      pure TypeScript simulation (no DOM, no I/O)  │
│ src/persistence Dexie/IndexedDB: saves, branches, snapshots, │
│                 heads, command log, export/import            │
└─────────────────────────────────────────────────────────────┘
src/contracts  protocol + shared shapes (zod + engine types only)
```

### Rules (enforced automatically)

| Rule                                                                                               | Enforced by                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Engine has no React, DOM, IndexedDB, UI, worker or contracts imports                               | `.dependency-cruiser.cjs` (`engine-is-pure`) and `tsconfig.engine.json` (no DOM lib) |
| Engine and contracts never use `Math.random`, `Date`, `performance.now`, timers or browser globals | ESLint determinism rules in `eslint.config.js`                                       |
| UI never imports persistence, the worker or Dexie; all writes are validated requests               | `ui-uses-commands-not-storage` rule                                                  |
| Contracts depend only on zod and engine types/schemas                                              | `contracts-are-leaf` rule                                                            |
| No circular imports                                                                                | `no-circular` rule                                                                   |

## Simulation core (`src/engine`)

| Module                                       | Responsibility                                                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state/schema.ts`                            | The whole `World` as one Zod-validated, JSON-serialisable object. All numbers are integers; stats/needs/skills are fixed-point tenths.                                                                                    |
| `core/rng.ts`                                | `sfc32` generator seeded by `cyrb128`; one stream per subsystem (`creation`, `genetics`, `events`, `npc`, `mortality`) stored in the world.                                                                               |
| `core/commands.ts`                           | `execute(state, command)`: pure, validated, idempotent commands (`advance`, `choose`, `act`, `markRead`, `setDifficulty`, `setEasyMigration`); `replay()` re-runs a command list.                                         |
| `core/tick.ts`                               | Monthly turn in the spec's order; returns a _pending_ turn when a decision is needed; `completePendingMonth` finishes it.                                                                                                 |
| `core/invariants.ts`                         | Consistency checks run after every command and month.                                                                                                                                                                     |
| `core/diff.ts`                               | Structural diff/patch used for monthly delta snapshots (append-only arrays become `append` ops).                                                                                                                          |
| `characters/*`                               | World creation (scenarios, families, names, genetics), monthly updates, mortality, stats with causes.                                                                                                                     |
| `activities/*`                               | Unlimited activities with time/energy costs and diminishing returns.                                                                                                                                                      |
| `events/*`                                   | Declarative event schema, predicate evaluation, effects, monthly selection and decisions.                                                                                                                                 |
| `world/*`                                    | Country profiles (baseline) and locations.                                                                                                                                                                                |
| `content/*`                                  | Built-in content, validated at load.                                                                                                                                                                                      |
| `view.ts`                                    | Read-only projection (`GameView`) sent to the UI.                                                                                                                                                                         |
| `social/*`                                   | People: NPC generation (family, neighbours, classmates, colleagues, partners), relationships and kinship, memories, population tiers (≤150 active, ≤30 close), NPC autonomy, family life, interactions.                   |
| `education/*`                                | Programmes and clubs catalogue; country school stages, grades, reports, exams, applications, scholarships.                                                                                                                |
| `career/*`                                   | 150 occupations in 25 industries; job board, applications, interviews, offers, employment, reviews, layoffs, NPC careers.                                                                                                 |
| `economy/*`                                  | Double-entry ledger (BigInt), country economy, tax and payslips, household finance, loans, insurance, pensions.                                                                                                           |
| `calendar/*`                                 | Free-time budget with its breakdown, recurring plans, holidays, check-ups, weddings, upcoming dates.                                                                                                                      |
| `world/rules.ts`                             | Baseline institutions per country (schools, tax bands, contributions, pensions, benefits, healthcare, rates).                                                                                                             |
| `core/setup.ts`, `state/upgrade.ts`          | Sets up M3-M4 systems for a new world, and upgrades version-1 and version-2 worlds (world schema v3).                                                                                                                     |
| `business/*`                                 | Business catalogue (12 types, suppliers, cost rules); companies, branches, competitors, ownership and valuation, monthly trading, loans, acquisitions.                                                                    |
| `property/*`                                 | Property listings, valuation, mortgages, buying, letting and tenants, renovation, selling, repossession.                                                                                                                  |
| `economy/investments.ts`, `world/markets.ts` | Stock and bond funds; baseline exchange rates, corporate tax and transfer costs per country (`convert()` is in `economy/economy.ts`).                                                                                     |
| `viewEnterprise.ts`                          | Read-only projection of companies, property and investments (part of `GameView`).                                                                                                                                         |
| `world/institutions.ts`                      | Researched institutions for 20 countries: citizenship, visas, health access, law, religion, military, politics, foreign buyers, inheritance, sources.                                                                     |
| `civics/*`                                   | Citizenship and residence (`status`), migration and moving (`migration`), health conditions (`health`), legal cases (`law`), religion, military service, politics, royal duties, civic time lines and monthly processing. |
| `economy/fx.ts`                              | Currency exchange between a person's accounts, converting debts, and accounts kept abroad.                                                                                                                                |
| `viewCivic.ts`                               | Read-only projection of status, country rules with eligibility, applications, moves, health, law, religion, service, politics and royal duties.                                                                           |

`SimState = { world, pending }`: `world` is the committed month; `pending` holds the
next month while a decision waits. A month is committed exactly once: when Advance finishes
without a decision, or when the decision is made.

### Determinism

Same seed + same commands + same engine/content version ⇒ identical world (tested over
1,000 months, and by rewinding and replaying). The rules that make this hold: integer
arithmetic only, seeded RNG streams, sorted iteration over records, no wall-clock time.

## Persistence (`src/persistence`, IndexedDB schema v2)

| Table       | Contents                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saves`     | One row per save slot: name, current branch, summary for the list, dashboard layout, versions, checksum.                                                          |
| `branches`  | Timelines. Rewinding creates a new branch pointing at the snapshot it was rewound from.                                                                           |
| `snapshots` | One per committed month: a **full** gzip keyframe every 12 months, otherwise a gzip **delta** from the previous month; each has a SHA-256 hash of the full world. |
| `heads`     | Latest state per branch (`{ world, pending }`, gzip + hash), including actions taken mid-month.                                                                   |
| `commands`  | Applied command log per branch (key `[branchId+commandId]`): idempotent retries and replay.                                                                       |

**Atomic commit:** every applied command writes head, command log, and (for a new month) the
snapshot, branch head and save summary in one IndexedDB transaction. Compression and
hashing happen _before_ the transaction (awaiting other promises inside one would end it early).
A simulated crash mid-commit leaves storage unchanged (tested).

**Concurrency:** the commit checks that the stored head hash still matches the one the session
loaded; another window's change is reported as `CONFLICT` and the session reloads.

**Integrity:** heads and snapshots are verified against their hashes when loaded. A damaged head
can be rebuilt from the branch's last complete month (`saves.repair`).

**Export/import:** a JSON bundle (format `welife-save`, version 1) with all branches,
snapshots, heads and commands, and a SHA-256 checksum. Imports are validated completely
(structure, references, every snapshot hash) before anything is written; ids are remapped.

**Migrations:** `migrations.ts` upgrades stored worlds/bundles one version at a time (1 → 2 adds
the Milestone 3-4 systems); newer versions are refused with a clear message. Snapshots are
rebuilt in the format they were stored in, hash-checked, and only then upgraded; the first
snapshot written by a new engine version is always a full keyframe. Dexie schema changes add
new `version(n)` blocks.

## Request flow

1. A screen calls a store action (e.g. `useGameStore().advance()`).
2. The store sends `game.command` with a fresh command id (and, for Advance, the tick it was
   issued for, so double clicks are ignored).
3. The worker host validates the request, returns the stored outcome if the command was already
   applied, otherwise runs `execute`, commits atomically and returns the new `GameView`.
4. Requests are processed one at a time in arrival order.

If the worker crashes, every pending and future call rejects with `UNAVAILABLE`, and the
Home screen offers **Retry**, which starts a fresh worker.

## UI (`src/app`)

- Routes: `/` (lives), `/new` (wizard), `/settings`, `/play/:saveId/{life,career,finance,social,more,character,timeline,notifications,rules,calendar,family,people/:personId,business,business/:businessId,property,world,health,legal,religion,military,politics}`. Person details and the family tree are read-only `game.person` / `game.family` requests.
- `play/PlayLayout.tsx`: header, Advance Month, event dialog, banners; five tabs (sidebar on
  desktop, bottom bar on phones).
- Strings produced by the engine are keys resolved in `i18n/en.ts`; event text lives in each
  event definition (`text.en`).
- Avatars are layered SVG (`components/avatar`): proportions by life stage, greying hair, age lines.

## Appearance

App preferences (theme, contrast, text size, motion, shortcuts) are stored in IndexedDB.
A copy is mirrored to `localStorage` only so the inline script in `index.html` can apply the
right theme before first paint.

## Offline and installation

`vite-plugin-pwa` (Workbox `generateSW`) precaches the app shell, the engine worker chunk and
icons. Navigation falls back to the cached `index.html`, so deep links work offline. Updates
are never applied silently. If service-worker registration fails, Home says so.

## Testing

| Layer                                                          | Tool                                                                     | Location                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| Unit (engine rules, schemas, property tests, avatar rendering) | Vitest, fast-check, react-dom/server                                     | `tests/unit`                            |
| Integration (UI client ↔ real worker host ↔ IndexedDB)         | Vitest + fake-indexeddb                                                  | `tests/integration`                     |
| End-to-end (production build + service worker)                 | Playwright: desktop Chromium/WebKit (+Firefox in CI), Pixel 7, iPhone 15 | `tests/e2e`                             |
| Accessibility                                                  | axe-core (WCAG 2.2 A/AA) on every screen, light and dark                 | `tests/e2e`                             |
| Performance                                                    | Monthly turn p95 in a 150-NPC world (engine)                             | `tests/unit/engine/performance.test.ts` |
