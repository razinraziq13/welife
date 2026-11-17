# WeLife — Decision Record

The authoritative design is `WeLife_Claude_Development_Specification.md` (v1.0, 2026-11-17).
This file records decisions that fill gaps in, or clarify, the specification.

## User-approved decisions (2026-11-17)

| #   | Topic                        | Decision                                                                                                                                                     |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Project location             | `Desktop/welife`, git repository, one branch per milestone.                                                                                                  |
| D2  | Review gates                 | Stop for approval after **every** milestone.                                                                                                                 |
| D3  | Fifth tab label              | **Social** (covers relationships, social media and community).                                                                                               |
| D4  | Eras                         | Present-day start only (2026 baseline). Everything after the start is simulated, not real-world fact.                                                        |
| D5  | Real people and institutions | Real institutional frameworks; royal houses, politicians and parties are fictional. No real living person is depicted.                                       |
| D6  | Sensitive real-world laws    | Modelled faithfully but neutrally and non-graphically; can be hidden with the sensitive-topic filter.                                                        |
| D7  | Death with no adult heir     | Player may take control of the nearest adult relative; if none exists, the life ends with a biography and the player may start a new life in the same world. |
| D8  | Content volume targets       | ≥ 400 events, ≥ 150 occupations, ≥ 25 industries, ≥ 100 achievements, 3 fictional social platforms.                                                          |
| D9  | Player crime                 | Abstract choices with risk and legal consequences only; never procedural detail.                                                                             |
| D10 | Achievements                 | Recorded per branch with provenance, plus a gallery across all saves.                                                                                        |

## Engineering resolutions (accepted with the plan)

| #   | Topic                           | Resolution                                                                                                                                                                             |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Event runtime and notifications | Built in M1–M3 (childhood content needs them); the event editor UI remains M8.                                                                                                         |
| R2  | Country data                    | Baseline fields (cities, currency, wages, costs) for all 20 countries in M2; institutional depth in M6.                                                                                |
| R3  | Pending choices                 | Two-phase turns: the next month is held as a persisted pending turn; the committed world stays on the current month until the choice resolves, then commits once (idempotent tick id). |
| R4  | NPC cap                         | Dead and dormant NPCs are archived and do not count toward the 50–150 active cap.                                                                                                      |
| R5  | Currency exchange               | Exchange rates after migration are simulated.                                                                                                                                          |
| R6  | Difficulty                      | Changeable mid-save; the change is recorded in the timeline like Easy Migration.                                                                                                       |
| R7  | Start age                       | Every life starts at birth.                                                                                                                                                            |
| R8  | Replay guarantee                | Identical results for the same engine and content versions in any modern browser; achieved with integer/fixed-point simulation maths and seeded RNG streams.                           |
| R9  | Placeholder policy              | A route/screen is added only when it is fully functional.                                                                                                                              |

## Tooling decisions (Milestone 0)

| #   | Topic                                | Decision and reason                                                                                                                                                   |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | TypeScript 6.0 (not 7.0)             | `typescript-eslint` 8.x supports TypeScript `<6.1`. Revisit when it supports 7.x.                                                                                     |
| T2  | ESLint 9 (not 10)                    | `eslint-plugin-jsx-a11y` 6.10 does not yet support ESLint 10.                                                                                                         |
| T3  | Engine in a Web Worker               | Keeps ticks off the UI thread; the worker owns IndexedDB, the UI sends validated requests.                                                                            |
| T4  | Hand-written shadcn-style components | The shadcn CLI is interactive and network-bound; the same pattern (cva + tailwind-merge, owned source) is used directly.                                              |
| T5  | Firefox e2e opt-in locally           | On this Windows machine the unsigned Playwright Firefox build is blocked from launching (OS security policy). Firefox runs in CI; locally set `WELIFE_E2E_FIREFOX=1`. |

## Milestone 1-2 engineering decisions

| #   | Topic                                    | Decision and reason                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Branch for M1+M2                         | Built together on `milestone-1-2` because both were requested at once.                                                                                                                                                                                                   |
| E2  | Contracts may use engine types           | The protocol needs `NewLifeInput`, `Command` and `GameView`. The engine itself still imports nothing outside itself and zod.                                                                                                                                             |
| E3  | Command log keyed per branch             | `[branchId+commandId]`: a retry on the same timeline is idempotent, while replaying the same commands on a rewound branch is allowed (that is how replay equivalence is tested).                                                                                         |
| E4  | Optimistic concurrency between windows   | Commits check the stored head hash; another window's change produces `CONFLICT` and a reload instead of a silent overwrite.                                                                                                                                              |
| E5  | Royal availability (D5 applied)          | Offered where large or traditional royal families make a fictional member realistic: AE, ID, MY, SA, TH, ZA. Not in GB or JP, where the royal/imperial family is a small group of identifiable people; GB offers Noble instead. Not in AU/CA/NZ (shared monarch abroad). |
| E6  | Noble availability                       | GB (peerage), FR/DE/IT (social nobility, no legal status), ID (Javanese aristocracy), IN (former princely families).                                                                                                                                                     |
| E7  | Casual still has a time budget (doubled) | Without any budget, diminishing returns alone would still let repeated clicks add up to a large monthly gain.                                                                                                                                                            |
| E8  | Notifications are transient              | The newest 300 are kept (pruned in batches at 400) so memory stays bounded; the biography is the permanent record.                                                                                                                                                       |

## Proposed tuning values (not yet user-approved)

- Full snapshot every 12 months, compressed monthly deltas in between.
- 20 close NPCs (detailed) and 100 relevant NPCs (simplified) by default.
- Diminishing returns coefficient 0.35 (from the spec example).
- Monthly free hours by age (30 baby → 80 adult → 100 retired); Casual ×2, Challenging ×0.8.
- Monthly family care for children's needs (rest/company/fun), fading to zero at 18.
- Mortality curve (annual risk per 100,000 by age band), adjusted 4% per year of life expectancy below 80, by health, and ×0.7 on Casual.
- Event chances, cooldowns and effect sizes in `src/engine/content/events/core.ts`.
