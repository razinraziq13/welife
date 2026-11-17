# WeLife — Development Progress

Spec: `WeLife_Claude_Development_Specification.md` v1.0 · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md) ·
Requirement map: [docs/TRACEABILITY.md](docs/TRACEABILITY.md)

| Milestone                        | Status                        | Branch        |
| -------------------------------- | ----------------------------- | ------------- |
| M0 Repository and architecture   | **Complete, awaiting review** | `milestone-0` |
| M1 Deterministic core            | Not started                   | —             |
| M2 New Life and character        | Not started                   | —             |
| M3 Social, childhood, education  | Not started                   | —             |
| M4 Careers and household economy | Not started                   | —             |
| M5 Business and real estate      | Not started                   | —             |
| M6 Global institutions           | Not started                   | —             |
| M7 Media, legacy, narrative      | Not started                   | —             |
| M8 Event editor and content      | Not started                   | —             |
| M9 Integration, balance, release | Not started                   | —             |

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

### Next: Milestone 1, deterministic core (awaiting approval)

World clock, seeded RNG streams, command bus with idempotency, two-phase transactional monthly
tick, invariant checker, event log, event runtime v1, notification store, snapshots (keyframes

- compressed deltas + integrity hashes), branches/rewind, save slots, export/import with
  checksum and migrations, Save Slots and Timeline screens. Exit: 1,000-tick determinism and
  rewind tests pass.
