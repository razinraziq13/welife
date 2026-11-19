# WeLife roadmap after 0.9.0

_Adopted 2026-11-19 from the expanded game design specification (a proposal written from `docs/IMPROVEMENT_BRIEF.md`), corrected against the code. The original specification and `docs/DECISIONS.md` still take precedence; numbers in the proposal are proposed tuning, not approved rules._

## Corrections to the proposal

1. **Four months per click only.** The proposal's data model still listed `advanceMonths: 4 | 12`; decision D11 is a fixed four-month advance, so there is no 12-month option.
2. **No "appearance" stat.** WeLife has no looks stat. The headline stats are health, happiness, intelligence and energy. Adding a looks stat changes the save schema and needs a migration and a decision.
3. **Phases, not milestones.** The proposal's M0-M9 clash with WeLife's completed M0-M9, so its stages are renamed R1-R9 here.
4. **Diary voice.** The proposal asks for a first-person diary. The 131 built-in event outcomes are written in the second person ("You took your first steps."), so the story feed reads in the second person for now. A first-person diary needs the outcomes rewritten (content work, R6).
5. **Weekly challenges** may use the device date only to choose which challenges are offered, never in outcomes.
6. **Already built** (the proposal did not know): four-month advance (D11), the Life header and headline stats, reasons on closed choices, 10-generation and 10,000-month soak, cross-browser determinism, rewind with branching timelines, 12 scenario starts, estates and succession, civil cases and health conditions (partial).

## Status of the 34 ideas

Legend: **Done**, **Partial**, **Next** (current slice), **Later**.

| #   | Idea                         | Status  | Notes                                                                   |
| --- | ---------------------------- | ------- | ----------------------------------------------------------------------- |
| 01  | Four-month advance           | Done    | D11; stops early for decisions, death and refusals                      |
| 02  | Simplified Life home         | Done    | Header, four stats, action grid; story feed added in this slice         |
| 03  | Simple and detailed modes    | Later   | UI preference only                                                      |
| 04  | End-of-life summary          | Done    | This slice: summary, title and milestones; share card not yet           |
| 05  | Achievement pop-ups          | Done    | This slice                                                              |
| 06  | 400+ events                  | Later   | 131 today; R6                                                           |
| 07  | Story lines                  | Partial | Second-person feed from recorded biography (see correction 4)           |
| 08  | Activities hub               | Later   | Activities exist on the Life tab; groups, search and favourites to come |
| 09  | Quick activities             | Later   |                                                                         |
| 10  | Pets                         | Later   | New entity; needs schema migration                                      |
| 11  | Appearance and wardrobe      | Later   |                                                                         |
| 12  | Adult chance activities      | Later   | Optional                                                                |
| 13  | Health choices               | Partial | Conditions and treatment exist                                          |
| 14  | Civil lawsuits               | Partial | Civil claims exist as events; no player-started case flow yet           |
| 15  | Grouped person menus         | Later   | 19 interactions exist; regroup                                          |
| 16  | Ask family for things        | Later   |                                                                         |
| 17  | Shared outings               | Later   |                                                                         |
| 18  | Conflict and repair          | Partial | Argue and apologise exist                                               |
| 19  | Dating depth                 | Partial | Dating, engagement, marriage exist                                      |
| 20  | School hub                   | Partial | Education card on the Career tab                                        |
| 21  | Popularity and friend groups | Later   |                                                                         |
| 22  | School events                | Later   |                                                                         |
| 23  | Attendance, nurse, teachers  | Later   |                                                                         |
| 24  | University life              | Partial | Further study, scholarships and loans exist                             |
| 25  | Fame careers                 | Partial | Social media exists                                                     |
| 26  | Freelance and side work      | Later   |                                                                         |
| 27  | Abstract crime and prison    | Partial | Legal cases and custody exist                                           |
| 28  | Collectibles                 | Later   |                                                                         |
| 29  | Weekly challenges            | Later   |                                                                         |
| 30  | Life titles gallery          | Partial | This slice: titles on the summary and in the family line                |
| 31  | Mini-games                   | Later   |                                                                         |
| 32  | Scenario starts              | Done    | 12 scenarios (W-01)                                                     |
| 33  | Fantasy packs                | Later   | Content packs exist; packs only, never core                             |
| 34  | Era packs                    | Later   | After 1.0                                                               |

## Phases

| Phase | Scope                                                                 | Exit criteria                                             |
| ----- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| R1    | Story feed, achievement pop-ups, life summary and titles (this slice) | Deterministic summary; verify and browser tests pass      |
| R2    | Simple and detailed modes                                             | No gameplay difference between modes                      |
| R3    | Activities hub: groups, search, favourites, suggestions, reasons      | Every existing activity reachable; keyboard and reader QA |
| R4    | Person menus, shared outings, asking family, school hub, teachers     | NPC memory and autonomy regression tests                  |
| R5    | Quick activities, health hub, appearance, pets                        | Ledger, time and household invariants pass                |
| R6    | Content to 400+ events; first-person outcomes if chosen               | 400+ validated unique events; repeat-rate checks          |
| R7    | Fame slice, gigs, titles gallery, weekly challenges                   | 10-generation runs and import/export pass                 |
| R8    | Collectibles, civil case flow, abstract crime path, mini-games        | Accessibility and balance checks                          |
| R9    | 1.0 hardening: device install, country data review, docs              | Full release checklist                                    |

Build order rule: finish and test one slice before multiplying content.

## Open decisions

- Add a looks stat (schema change) or keep energy as the fourth headline stat?
- Rewrite event outcomes to first person, or keep the second-person story?
- Which R3-R5 features are required for 1.0?
