# WeLife — Development Progress

Spec: `WeLife_Claude_Development_Specification.md` v1.0 · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md) ·
Requirement map: [docs/TRACEABILITY.md](docs/TRACEABILITY.md)

| Milestone                        | Status                        | Branch          |
| -------------------------------- | ----------------------------- | --------------- |
| M0 Repository and architecture   | Complete (commit e6ea3ee)     | `milestone-0`   |
| M1 Deterministic core            | **Complete, awaiting review** | `milestone-1-2` |
| M2 New Life and character        | **Complete, awaiting review** | `milestone-1-2` |
| M3 Social, childhood, education  | Not started                   | —               |
| M4 Careers and household economy | Not started                   | —               |
| M5 Business and real estate      | Not started                   | —               |
| M6 Global institutions           | Not started                   | —               |
| M7 Media, legacy, narrative      | Not started                   | —               |
| M8 Event editor and content      | Not started                   | —               |
| M9 Integration, balance, release | Not started                   | —               |

---

## Milestones 1 and 2: Deterministic core · New Life and character

Built together on branch `milestone-1-2` at the user's request ("Start Milestone 1 and Milestone 2"), with a single review gate at the end.

**Exit criteria (spec §9):**

- M1: 1,000 deterministic ticks and rewind tests pass. **Met.**
- M2: create/restore lives in every scenario; avatar ages appropriately. **Met.**

### Milestone 1 checklist (deterministic core)

- [x] World clock (year/month); one successful Advance moves exactly one month; creation does not advance
- [x] Seeded `sfc32` RNG with independent per-subsystem streams; integer-only simulation maths
- [x] Validated command bus: each command has a unique id, is applied at most once, and is logged per timeline
- [x] Double-click guard (`expectedTick`) and retry idempotency (stored outcomes are returned again)
- [x] Two-phase monthly tick following the spec's 12-step order; pending decisions hold the next month uncommitted
- [x] Invariant checker after every command and month (references, ancestry cycles, single pending decision, duplicate command ids, clock consistency)
- [x] Event runtime v1: declarative, schema-validated events (predicates, weights, multipliers, cooldowns, occurrence limits, exclusive groups, 2-5 choices, delayed consequences), with cycle and reference validation
- [x] 21 built-in events, including chained delayed consequences (for example, the lost wallet leads to a thank-you note or a guilty conscience months later)
- [x] Notifications in the world state (categories, read/unread, targets); notification centre screen
- [x] Monthly snapshots: a full keyframe every 12 months plus compressed deltas; SHA-256 integrity hash per month
- [x] Rewind to any month creates a new branch; the old timeline is untouched; switch between timelines; delete leaf branches only on request
- [x] Save slots with autosave on every command: create, list, rename, duplicate, delete
- [x] Export/import bundle with checksum, versions, every branch, snapshot, head and command log; ids remapped on import
- [x] Migration framework for world schema and bundle versions (no migrations needed yet; newer versions are refused)
- [x] Corrupted-save detection with "repair from last complete month"; atomic commits; multi-window conflict detection
- [x] Replay-equivalence warning when a timeline contains months recorded by another engine/content version
- [x] Worker processes requests strictly in order (no interleaving)

### Milestone 2 checklist (New Life and character)

- [x] Baseline profiles for all 20 countries: 4 locations each (Singapore has no rural area), currency, approximate wages and costs, life expectancy, name lists and name order, monarchy and nobility status with reasons
- [x] 12 starting scenarios with per-country availability: royal only in AE, ID, MY, SA, TH, ZA (decisions D4/D5); noble only where hereditary or social nobility exists; rural only with a rural area
- [x] Family generation: one or two parents (adoptive for Adopted), older siblings, family links, relationships, inherited personality and appearance, name conventions (for example, mothers keep their surname in KR/CN), noble particles and courtesy titles
- [x] Character model: 10 stats with explicit causes, 4 needs, 6 skills, hidden personality traits, 4 habits; fixed-point integers
- [x] Ageing: birthdays, 8 life stages, monthly needs, energy, stress, health, habits, family care for children, non-graphic mortality by age, health, country and difficulty; life ends correctly
- [x] Unlimited activities with time and energy costs, diminishing returns (1 / (1 + 0.35n)), age gates and household training quality; Casual is relaxed but still bounded
- [x] Layered 2D SVG avatars: 8 stages, 10 skin tones, 8 hair colours and 8 styles, eyes, face shapes, freckles, greying hair, age lines and glasses
- [x] New Life wizard: country and location, scenario with reasons for unavailable options, name, gender, custom or inherited appearance with an age-progression preview, difficulty, per-save Easy Migration, world seed, save name
- [x] Five tabs (Life, Career, Finance, Social, More): sidebar on desktop, bottom bar plus Advance on phones
- [x] Customisable Life dashboard (8 widgets: reorder and hide, saved with the life)
- [x] Character detail (stats, needs, skills, recent changes with causes, life story), Timeline/Rewind, Notifications and Game rules screens
- [x] Life Event dialog with eligibility cues; a decision can be postponed but blocks Advance, with the reason shown
- [x] All English text resolved through localisation keys

### Verification results (actual runs, 2026-11-18)

| Command                         | Result                                                                                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                | exit 0: typecheck (5 projects) ✔, ESLint 0 problems ✔, dependency-cruiser "no dependency violations found (105 modules, 421 dependencies)" ✔, Prettier ✔, Vitest **105/105 passed** (12 files) ✔, production build ✔ |
| `npm run e2e`                   | exit 0: **122 passed, 2 skipped** (desktop Chromium, desktop WebKit, Pixel 7 Chromium, iPhone 15 WebKit). The skips are the Chromium-only offline test on the two WebKit projects                                    |
| 1,000-month determinism         | 1,000 scripted months replayed from the same start produce an identical canonical world (`simulation.test.ts`)                                                                                                       |
| Rewind reproduction             | Rewind to month 20, replay the original commands, and the world hash equals the original timeline's month-40 hash (`saves.test.ts`)                                                                                  |
| Every scenario × country        | All 20 countries × 12 scenarios create valid worlds; unavailable combinations are refused with a reason                                                                                                              |
| Anti-exploit                    | 500 attempts of one activity in a month: all accepted, fewer than 25 effective, under 25 skill points gained, on every difficulty                                                                                    |
| Performance (engine only, Node) | monthly turn p95 **0.24 ms** over 600 months. Worlds currently hold only the family (3-6 people); the 150-NPC benchmark applies from M3                                                                              |
| Storage efficiency              | 15 months of history: 11.6 KB (keyframes + deltas, gzip)                                                                                                                                                             |
| Manual check (in-app browser)   | Created a noble life in Edinburgh, advanced 14 months (first words, first steps, birthday), rewound to March 2027 into Timeline 2                                                                                    |

### Known issues and limitations (M1 and M2)

1. **Country figures are baseline approximations** (rounded, about 2023-2024) and marked "unverified" in data and UI. Dated research is scheduled for M6.
2. **Several systems are not simulated yet**, and the screens say so plainly: school, jobs, money accounts (M3/M4), friends and partners (M3), migration rules behind the Easy Migration switch (M6), heirs and descendant switching after death (M7).
3. **The 150-NPC p95 target is not measured yet**: NPC populations arrive in M3.
4. **Content volume is 21 events** against the target of 400+ (D8); more content arrives each milestone through M8.
5. **Firefox e2e** is still blocked on this machine by Windows policy; it runs in CI.
6. **The desktop app's built-in browser** refuses service-worker registration, so it cannot test offline mode; Playwright Chromium does.
7. **The main bundle grew to 598 KB (183 KB gzip)** because country and event content ships with the UI. Code-splitting is planned for M9.
8. **Snapshot keyframe interval (12), family care, diminishing coefficient (0.35), mortality curve and activity numbers** are proposed tuning values (docs/DECISIONS.md).

### Next: Milestone 3, social, childhood and education (awaiting approval)

---

## Milestone 0: Repository and architecture

**Exit criterion (spec §9):** app installs, boots offline, tests pass.

### Checklist

- [x] Vite 8 + React 19 + strict TypeScript 6.0 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] Per-layer tsconfigs; the engine and contracts compile **without** DOM/Worker libs
- [x] ESLint 9 type-aware strict rules + React Hooks + jsx-a11y strict + engine determinism rules
- [x] Prettier; `.editorconfig`; LF line endings via `.gitattributes`
- [x] dependency-cruiser module boundaries (engine pure, UI → worker only via messages, no cycles)
- [x] Tailwind CSS v4 design tokens: light, dark, high-contrast (light and dark), reduced motion
- [x] shadcn-pattern components (Button, Card, ChoiceGroup, Switch, Dialog) on native accessible elements
- [x] React Router: Home, Settings, Not found, crash screen. Focus moves to the page heading on navigation and is announced
- [x] Engine Web Worker + typed request/response protocol, validated with Zod (field-path errors)
- [x] IndexedDB via Dexie inside the worker (schema v1: `meta`, `settings`); corrupt rows recover to defaults
- [x] Settings screen (theme, contrast, text size, motion, keyboard shortcuts), stored in IndexedDB, with a pre-paint mirror so the theme never flashes
- [x] Keyboard shortcuts (`?`, `g h`, `g s`) with a help dialog; can be turned off
- [x] PWA: manifest, generated icons (incl. maskable and Apple touch), Workbox precache, offline navigation fallback, update prompt (never auto-reloads), install button / iOS instructions
- [x] Storage usage/quota display and "Protect my data" (`navigator.storage.persist()`)
- [x] Engine crash handling: pending calls reject, Home shows Retry, which restarts the worker
- [x] Vitest unit + integration tests; Playwright e2e across 4 local browser profiles (+ Firefox in CI)
- [x] axe-core WCAG 2.2 A/AA scans in light and dark themes
- [x] `npm run verify` script and GitHub Actions workflow (`.github/workflows/ci.yml`)
- [x] Docs: README, CLAUDE.md, ARCHITECTURE, DECISIONS, TRACEABILITY

### Verification results (actual runs, 2026-11-18)

| Command                                                                                     | Result                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                                                                            | exit 0: typecheck (5 projects) ✔, ESLint 0 problems ✔, dependency-cruiser "no dependency violations found (50 modules, 114 dependencies)" ✔, Prettier ✔, Vitest **44/44 passed** (7 files) ✔, production build ✔ (precache 21 entries, 672 KiB) |
| `npm run e2e`                                                                               | exit 0: **54 passed, 2 skipped** (desktop Chromium, desktop WebKit, Pixel 7 Chromium, iPhone 15 WebKit). The 2 skips are the Chromium-only offline test on WebKit projects                                                                      |
| Flake check: `settings.spec.ts` ×6 repeats, 8 workers, 3 projects                           | **90/90 passed**                                                                                                                                                                                                                                |
| Guard check: temporary engine file importing React, reading `window`, calling `Math.random` | Rejected by all three guards (depcruise `engine-is-pure`, `tsc` "Cannot find name 'window'", ESLint `no-restricted-globals` / `no-restricted-properties`); file removed                                                                         |
| Manual check in the desktop app's browser pane (production preview)                         | Home and Settings render correctly in dark and light; theme change saves and applies                                                                                                                                                            |

**Offline proof:** `tests/e2e/offline.spec.ts` loads the app, waits for the service worker to
take control, switches the browser offline, reloads, confirms the engine reconnects (worker script
and IndexedDB served offline), deep-links to `/settings` offline, and saves a setting offline.

### Known issues and limitations

1. **Firefox e2e cannot run on this machine.** Windows blocks the unsigned Playwright Firefox
   binary ("Permission denied"). Firefox is configured and runs in CI; locally it is opt-in
   (`WELIFE_E2E_FIREFOX=1`). I did not change any OS security setting.
2. **Physical-device install is not verified.** iOS/Android install and Home Screen behaviour
   need a manual check on real devices (planned for M9; you can try it now with `npm run preview`
   on your local network).
3. **The desktop app's built-in browser pane refuses service-worker registration.** Home now
   reports "Offline mode could not be set up in this browser" instead of waiting forever. In
   Playwright Chromium the service worker registers and the offline test passes.
4. **`npm audit`: 4 moderate advisories** in `glob`/`minimatch`, pulled in by `workbox-build`
   (build-time only; nothing ships to users). The suggested "fix" downgrades vite-plugin-pwa to
   1.x, so it is not applied. Re-check when Workbox updates.
5. **Main bundle is 460 KB (143 KB gzip),** mostly React, React Router and Zod. Acceptable for M0;
   code-splitting per screen will come with the gameplay screens (M2+).
6. **Toolchain pins:** TypeScript 6.0 (typescript-eslint does not support 7.x yet) and ESLint 9
   (jsx-a11y does not support 10 yet).
7. **The five gameplay tabs are not shown yet.** They arrive with their screens in M2, so no placeholder tabs ship.
