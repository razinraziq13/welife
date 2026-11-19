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

## User-approved changes after the plan

| #   | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D11 | 2026-11-19 | **One click of Advance plays four months** (replacing "one click advances one month", spec §1/§4). Each month is still a separate validated command with its own snapshot, so the monthly turn order, rewind to any month, replay and the once-per-month guarantees are unchanged. The run stops early when a decision is waiting, the life ends or a month is refused; the button stays locked for the whole run. |

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

## Milestone 3-4 engineering decisions

| #   | Topic                                           | Decision and reason                                                                                                                                                                                                          |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E9  | Branch for M3+M4                                | Built together on `milestone-3-4` (from `milestone-1-2`) because both were requested at once.                                                                                                                                |
| E10 | World schema v2 and upgrade                     | Old saves upgrade deterministically (`engine/state/upgrade.ts`); snapshots are rebuilt in their stored format, hash-checked, then upgraded; a new engine version always starts a fresh keyframe so deltas never mix formats. |
| E11 | Tracked households                              | Only the player's household and the parents' household have ledger accounts; other NPCs keep jobs and salaries without accounts (keeps the world small enough for 150 NPCs).                                                 |
| E12 | Journal retention                               | Individual transactions stay in the live world for 3 months and summaries are monthly for 2 years then yearly; every monthly snapshot still contains that month's transactions.                                              |
| E13 | Read-only RPCs                                  | `game.person` and `game.family` are fetched on demand, so each turn's response stays small.                                                                                                                                  |
| E14 | Adult-only romance                              | Dating, engagement, marriage and family planning need both people to be 18+; teenagers get friendships and crushes only (spec: consent and age gating, non-explicit).                                                        |
| E15 | Memory-based events reach people who moved away | People archived after moving away can still be the subject of an event about something they remember.                                                                                                                        |
| E16 | Hand-drawn cash-flow chart, no Recharts         | A small CSS bar chart with a table alternative avoids a large charting dependency for now; Recharts can be added in M5 if richer charts are needed.                                                                          |
| E17 | e2e builds adult saves in Node                  | `tests/e2e/adultSave.ts` plays an adult life with the real engine and exports it; Playwright uses `tsconfig.node.json` for path aliases.                                                                                     |

## Proposed tuning values added in Milestones 3-4 (not yet user-approved)

- Population: 8 neighbour households, 10 classmates per primary cohort (8 later), at most 150 active and 30 close NPCs; NPC choices weighted against "nothing" (1,200 monthly, 100 yearly).
- Memory decay per year: fast 25, slow 8, permanent 0 salience; 24 memories per person.
- Relationship drift targets: 70 living together, 65 partners, 45-55 family, 35-60 friends, 10-35 others, adjusted by memories and conflict.
- School: grade target formula, effort (relaxed/steady/focused: 60/100/140% gains, -60/0/+70 grade), pass mark 30 (35 for further study), report cards twice a year; admission = 70% results + 30% programme skills + awards + noise vs selectivity; scholarships at +150/+220 over the threshold (need-based at +60).
- Clubs: 6-12 hours and 0-3% of the median wage a month; competition placings at 680/780/900.
- Jobs: pay as a percentage of the median wage per occupation, level multipliers 100/130/170/230/320%, experience 0/12/36/60/96 months per level, layoffs about 2.4% a year scaled by unemployment and performance, raises of inflation plus performance.
- Money: lifestyle spending 70/100/150/260% of a base of 40% (adult) and 15% (child) of the median wage times local costs; rent 18/32/50% of the median wage by home size; childcare 5-35% by circumstances; family support 8% per child below 160% of the median wage; opening savings 1-1,000 months of the median wage by wealth.
- Loans: personal = policy rate + 6% (+4% or +10% for weak credit); student = policy rate + 1%, 120 months, starting 6 months after study; repayments may take at most 40% (Casual 50%, Challenging 33%) of take-home pay.
- Economy: monthly random walk of the cycle, inflation and unemployment around each country's baseline; fund return 0.45% a month plus cycle and noise.

## Milestone 5 engineering decisions

| #   | Topic                                    | Decision and reason                                                                                                                                                                    |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E18 | World schema v3                          | Adds companies, competitors, properties and listings, and new economy indices; v2 saves upgrade deterministically (`upgradeWorldV2`).                                                  |
| E19 | Companies have their own books           | Each company owns accounts in its home currency; owners hold a stake account marked to their share of book equity (never below zero), so net worth reconciles without double counting. |
| E20 | Limited liability                        | A company's debts belong to it; after 6 months unable to pay, it fails, its assets settle what they can and the rest is written off. Owners lose only their stake.                     |
| E21 | Aggregate competitors                    | Rival firms are aggregate records (quality, brand, price, size), not NPCs, to keep the world within the 150-NPC budget.                                                                |
| E22 | Mark-to-market                           | Funds, properties and stakes are revalued monthly through gain and loss accounts, so the ledger stays balanced and net worth matches booked income and expenses.                       |
| E23 | Same-month decisions chain               | When several decisions are due in one month, the next is shown right after the previous choice and the month commits only after the last.                                              |
| E24 | Family covers an adult child's shortfall | An adult living with their parents who cannot pay their share has it covered by the household, instead of falling into arrears and ruining their credit.                               |
| E25 | Simulated exchange rates                 | Baseline USD rates for 20 currencies drift with each economy; conversions use integer maths. Baseline, unverified (M6).                                                                |

## Proposed tuning values added in Milestone 5 (not yet user-approved)

- Businesses: demand per outlet × outlets in the market (yours plus competitors) × economic cycle × a rural factor; share = your offer score ÷ (yours + competitors'), from quality, brand and price with a per-type price sensitivity.
- Costs: employer on-costs 10% of wages; overheads 8% of revenue plus 5% of the median wage per outlet; supplier tiers change cost and quality; a hired manager costs two wages; owner-managed takes 40 hours a month.
- Starting quality 500 and brand 300; quality drifts toward 380 + owner skill ÷ 3 + supplier + wage effect − overload; brand toward 250 + marketing + quality ÷ 5.
- Minimum capital = set-up cost + 3 months of running costs; at most 6 companies; failure after 6 distressed months; 1 month's wages severance on closing.
- Outside investment requires 6 profitable months; acquisition price from the rival's size, quality and local costs.
- Property value = median wage × 70 (apartment), 110 (house) or 90 (commercial) months × local costs × house-price index × condition (80% + condition ÷ 50) plus renovation premium.
- Rental yield 5.5% a year; upkeep 1% a year; selling fee 2%; transfer costs by country (baseline).
- Mortgages: personal rate − 4.5% (policy rate + 1.5%), deposit 10% (Casual 5%, Challenging 20%), 5-30 years, affordability = the loan limit + 5%; repossession after 6 missed payments at 85% of value.
- Tenancy: finding a tenant depends on rent versus market and condition; missed rent rises with unemployment; 12-month leases, 65% renewal.
- Renovation: light 3% of value, 2 months, +3% value; major 10%, 5 months, +10%.
- Markets: bond, house-price and exchange-rate indices drift monthly with the cycle and inflation; the stock fund uses the retirement-fund return.

## Milestone 6 engineering decisions

| #   | Topic                                  | Decision and reason                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E26 | World schema v4                        | Adds citizenship, residence, religion and custody to every person, and visa, health, legal, service, political and royal records; v3 saves upgrade deterministically (immigrant parents keep their origin citizenship as permanent residents).                                                               |
| E27 | Researched institutions as data        | One validated profile per country (`world/institutions.ts`) with sources and an as-of date; rules are simplified for play and labelled as such.                                                                                                                                                              |
| E28 | Money across currencies                | Exchanges are two balanced transactions (one per currency) booked as currency-exchange expense and income, so each currency reconciles. Category accounts in a second currency get a currency-suffixed id. Property and loans left abroad pay through an account abroad that is topped up and swept monthly. |
| E29 | Easy Migration semantics               | Applies to applications made while it is on (no qualification, experience or age limits; half the funds, time and fee; at least 95% approval; faster) and to renewals; it never changes citizenship law and never removes a status.                                                                          |
| E30 | Only the player is simulated in detail | NPCs carry citizenship and religion; visas, cases, service and careers are for the player (keeps the 150-NPC budget). Dependants move with the player.                                                                                                                                                       |
| E31 | Gendered conscription                  | Conscription follows the law's binary categories (men); national-service programmes (Malaysia) select every gender; non-binary characters are not called up.                                                                                                                                                 |
| E32 | Sensitive-topic filter is display-only | A device setting cannot change which events fire without breaking replay of a save, so it hides explanations of sensitive laws instead.                                                                                                                                                                      |
| E33 | Custody blocks free actions            | While in custody most commands are refused with a reason, free time is minimal, and jobs end; non-graphic.                                                                                                                                                                                                   |

## Proposed tuning values added in Milestone 6 (not yet user-approved)

- Visa fees, processing months, approval chances and visa lengths per country (`world/institutions.ts`); approved visas must be used within 12 months; permanent residence fee 60% and citizenship fee 40% of the local median wage; moving costs 150% (abroad) or 50% (same country) of the destination median.
- Citizenship test approval: 92% less 7-12 points for language or civics tests, adjusted by intelligence (50-97%).
- Health: onset chances and risk factors per condition, treatment costs (4-1500% of the median wage), cure rates, monthly medication for long-term conditions, public waits by country (+1 month in recessions).
- Law: case strengths from events; defence = lawyer bonus (legal aid +10, private +25 points) + ability + reputation + chance (wider with juries); private lawyer 120% of the median; settlement 70%; contesting and losing costs 150%; community service 12 hours a month for 6 months; probation 12 months.
- Military: enlisted and officer pay 70-280% of the median by rank, conscripts 25%; promotion after 6-84 months in rank with discipline and social skill; volunteer terms 48 months; may leave after 24; 60 hours a month while serving.
- Politics: salaries 30% (local), 220% (legislature), 400% (head of government) of the median; 15/60/90 hours a month; deposits 10/60/300%; campaigns of 4/6/9 months; party standing 30-49% varying by year; election share from standing, support and chance against a rival at 30-48%.
- Royal duties: about 24 engagements a year (royal) or 6 (noble); allowance 300% of the median while approval is at least 30%.
- Religion: 4/10/20 hours a month by participation; German church tax approximated as 1% of gross salary.

## Milestone 7-8 engineering decisions

| #   | Topic                             | Decision and reason                                                                                                                                                             |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E34 | World schema v5                   | Adds the lineage, wills, estates, succession state, social media, achievements and the packs enabled for the world; v4 saves upgrade with the current player as generation 1.   |
| E35 | Succession state                  | A player's death puts the world in `succession` until an heir is chosen; months cannot advance meanwhile, and choosing is a normal command (so rewinds and replays include it). |
| E36 | Estates settle at death           | The estate is settled the month someone with accounts dies, independently of who is played next (control is not ownership). Heirs without accounts get a savings account.       |
| E37 | Category ids in a second currency | (From M6) inheritance can move money between currencies; transfers are booked per currency so every currency reconciles.                                                        |
| E38 | Packs live in the world           | Enabled pack events are copied into the world (validated), never referenced from the library, so a save is self-contained and deterministic. Disabled packs stay for history.   |
| E39 | Re-validation on load             | Stored packs are validated again when a save is loaded or imported; the bundle checksum is the first defence.                                                                   |
| E40 | Achievements as data              | Achievements use the event predicate language and whitelisted facts; the gallery is a separate IndexedDB table written in the same transaction as the month.                    |
| E41 | Pack text is plain                | Markup, links, control characters and unknown placeholders are rejected; the UI renders text, never HTML.                                                                       |

## Proposed tuning values added in Milestones 7-8 (not yet user-approved)

- Heirs: adult descendants (nearest generation, then oldest); otherwise siblings, nieces and nephews, parents, cousins.
- Intestacy: married partner 50% and children 50% equally; no children: partner 100%; then parents, then siblings; none: the state.
- Forced heirship: children together at least 50% where the country reserves a share.
- Inheritance tax allowances (months of the median wage): TH 6,600; JP 120; KR 165; US 2,800; GB 108; FR 37; DE 100; IT 435; BR 0; ZA 390; tax at the country's top rate above it.
- Social media: base reach 20 + 4 x the square root of followers, scaled by quality, style (casual 100%, informative 90%, funny 130%, personal 100%, controversial 180% with a 25% backlash risk) and trend; 35% diminishing returns per repeat in a month; ad income 8/12/25 bp of the median wage per 1,000 followers (Murmur/Glimpse/Streamline) from 10,000/10,000/1,000 followers; sponsorship offers (15% a month) from 5,000 followers.
- Player packs: at most 50 events, 10% monthly chance, value changes of 20 points, 500% of the median wage.

## Milestone 9 engineering decisions

| #   | Topic                   | Decision and reason                                                                                                                                                                                                                                                                                                                               |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E42 | Off-screen ageing       | Archived people who are still alive face a year's mortality once a year. The draw is a hash of the world seed, the person and the year, so no existing random stream changes. Before this, archived people never died, and the world grew without limit.                                                                                          |
| E43 | Yearly clean-up         | Once a year, people who died more than 30 years ago are removed with their relationships, memories and applications, unless something lasting names them: lineage and all ancestors, owners, estates, wills, house heads, achievements, biography, civic and media records, calendar items, household budgets. Empty homes with no budget go too. |
| E44 | Closing the books       | The ledger accounts of someone dead for 30+ years are removed when their money and debts are at zero and no live record uses them. Lifetime income and expense totals move into one archive equity account per currency (owned by an empty `hh_archive` household), so the trial balance is unchanged.                                            |
| E45 | Old jobs                | Ended jobs of people outside the lineage are forgotten 30 years after they end; the lineage keeps its full careers.                                                                                                                                                                                                                               |
| E46 | Soak runs on its own    | The 10,000-month soak takes about 4 minutes, so it runs as `npm run soak` and as its own CI job, not inside `npm run verify`.                                                                                                                                                                                                                     |
| E47 | Refusal keys            | Refused commands carry `key: err.<ErrorName>.<code>`. The engine message tables are the English source (`i18n/en-errors.ts`); the UI uses the key when it resolves and falls back to the engine's English message otherwise.                                                                                                                      |
| E48 | Royal succession        | A royal or noble house has a head, separate from inheritance and from who is played. Rules: agnatic (MY, ID, AE, SA), male-preference primogeniture (TH, ZA, GB, FR, DE, IT, IN), otherwise absolute. With no descendants, the line passes to the siblings' lines.                                                                                |
| E49 | Code-splitting          | Every screen except the start screen and the Life tab loads on demand (react-router `lazy`). The service worker still precaches every chunk, so offline play is unchanged.                                                                                                                                                                        |
| E50 | Content Security Policy | Production builds get a CSP meta tag (own origin only; the inline theme snippet allowed by its build-time hash). The dev server has none, because Vite injects inline scripts for hot reload.                                                                                                                                                     |
| E51 | Version 0.9.0           | The release candidate is 0.9.0, not 1.0.0, because the 400-event content target (D8) and a physical-device install check (P-01) are still open.                                                                                                                                                                                                   |
| E52 | Firefox in CI           | Firefox pages crashed under parallel load on the 2-core CI runner, so CI runs Firefox as its own step with one worker.                                                                                                                                                                                                                            |

## Proposed tuning values added in Milestone 9 (not yet user-approved)

- Clean-up horizon: 30 years after death (people, accounts, old jobs).
- Difficulty and business rivals: competitor strength 85% on Casual, 100% on Realistic and 120% on Challenging.

## Roadmap R1 decisions (story feed, pop-ups, life summary)

| #   | Topic               | Decision and reason                                                                                                                                                                                                                |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E53 | Story voice         | The story feed reads in the second person ("You moved to Penang."): the 131 event outcomes already speak to the player, and biography lines get a "You". A first-person diary would need the outcomes rewritten (roadmap R6).      |
| E54 | Pop-ups are UI-only | Achievement pop-ups compare the unlocked list before and after each update; no engine or save change. Unlocks present when a life opens are not announced; after a rewind, unlocking again on the new timeline is announced again. |
| E55 | Life titles         | Computed from recorded facts by fixed rules in a fixed order (first match wins), so the same life always gets the same title. Titles describe what a life was about, never its worth; lives under 18 get "Remembered with love".   |
| E56 | Defining moments    | Up to five biography lines, chosen by kind (family, legacy, business and politics first, routine activity never), one of each kind, shown in the order they happened.                                                              |

## Proposed tuning values added in R1 (not yet user-approved)

- Life title thresholds: public office ever held; at least one business founded; 3+ countries lived in; 10,000+ followers; 4+ children and grandchildren; a bachelor's or master's degree; 3+ jobs; 5+ friends.

## Gameplay expansion phase 1 decisions (interactions, careers, activities hub)

| #   | Topic                     | Decision and reason                                                                                                                                                                                                                                                               |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E57 | One interaction registry  | The 15 new interactions join the existing registry (same command, eligibility check, time cost, diminishing returns and seeded `social` stream), in `social/contextual.ts`, rather than a parallel system.                                                                        |
| E58 | Money from family         | Asking family for money moves funds from their household's account to the player's, booked as their expense and the player's income (four balanced postings). Only relatives whose household keeps a budget can give.                                                             |
| E59 | Additive character fields | `career` (professional reputation, specialism, progress) and `projects` were added to schema 5 with defaults, not a version bump. Defaults are filled by the schema on load, by the V4 upgrade and by the save migration step (snapshots used for rewinds are not schema-parsed). |
| E60 | Career tracks             | Teaching (education), medicine (healthcare), performing (arts) and office (everything else) get different actions. Business and politics already have full systems and are linked, not duplicated.                                                                                |
| E61 | Satisfaction is derived   | Job satisfaction is computed each month from pay within the band, stress, the manager, performance, reputation and a specialism; it is never stored.                                                                                                                              |
| E62 | Activities hub            | The hub lists the original personal activities and the new lifestyle activities together. Recurring plans can run either kind. Favourites are a per-life UI preference saved with the dashboard layout (optional field).                                                          |
| E63 | Travel stays simple       | A holiday abroad is a short visit paid in the home currency; it does not change residence or need a visa in the game.                                                                                                                                                             |

## Proposed tuning values added in the gameplay expansion (not yet user-approved)

- Interaction chances combine closeness, trust, conflict, the other person's agreeableness and stress, and the player's social skill; money requests are 1% (under 13), 3% (13-17) or 15% (adults) of the median monthly wage, once per six months per relative.
- Work actions: 3-8 hours, once a month each; overtime at time and a half; a paid role is 30% of the median wage; a course is 5%; a specialism needs 100 progress points.
- Lifestyle costs: 0-25% of the median wage (holiday abroad 25%); projects advance 2-20 points a session from skills and discipline; a novel is published (25% of the median wage) at reading 45+, an app earns 35% at technology 45+.

## Dating fixes (2026-11-19)

| #   | Topic                   | Decision and reason                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E64 | Prospects wait          | A single adult NPC within ten years of the single adult player's age, not family, with closeness 30+, does not choose "seek a partner" in its yearly decisions. Before this, most people the player courted paired off within months.                                                                                                                                                              |
| E65 | Look for love           | 18+ and single, 6 hours: 85% chance (with monthly diminishing returns) to meet someone single and interested (closeness 38-52, chemistry at least 65, an "interested in you" memory that adds 15 to the chance they say yes to a date).                                                                                                                                                            |
| E66 | Date threshold is shown | Asking someone on a date still needs closeness 45; the reason and the Dating card show the number needed and the current one.                                                                                                                                                                                                                                                                      |
| E67 | Rival offers            | While employed (6+ months in the job, not intern or casual, performance 450+, below pension age), a rival may offer the same occupation (30% one level up if performance 650+) for 10-30% more. Chance 1-8% a month from reputation, a specialism and performance; one at a time, 12 months apart. Stored as an offered application with an optional `headhunted` flag (no schema version change). |
| E68 | Ask for a match         | For a rival offer only, once: chance 10-85% from performance, reputation and the manager. Matched: pay rises to the offer and the rival is declined. Refused: the offer stays open and the manager loses 5 closeness.                                                                                                                                                                              |
| E69 | Offers stop Advance     | Multi-month advance stops when a new job offer appears, because offers expire after two months.                                                                                                                                                                                                                                                                                                    |
