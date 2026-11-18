# WeLife — Development Progress

Spec: `WeLife_Claude_Development_Specification.md` v1.0 · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md) ·
Requirement map: [docs/TRACEABILITY.md](docs/TRACEABILITY.md)

| Milestone                        | Status                        | Branch          |
| -------------------------------- | ----------------------------- | --------------- |
| M0 Repository and architecture   | Complete (commit e6ea3ee)     | `milestone-0`   |
| M1 Deterministic core            | Complete (commit 26ffa4e)     | `milestone-1-2` |
| M2 New Life and character        | Complete (commit 26ffa4e)     | `milestone-1-2` |
| M3 Social, childhood, education  | Complete (commit 98e24fb)     | `milestone-3-4` |
| M4 Careers and household economy | Complete (commit 98e24fb)     | `milestone-3-4` |
| M5 Business and real estate      | Complete (commit 11d2504)     | `milestone-5`   |
| M6 Global institutions           | Complete (commit 5d35fb1)     | `milestone-6`   |
| M7 Media, legacy, narrative      | **Complete, awaiting review** | `milestone-7-8` |
| M8 Event editor and content      | **Complete, awaiting review** | `milestone-7-8` |
| M9 Integration, balance, release | Not started                   | —               |

---

## Milestones 7 and 8: Media, legacy and narrative · Event editor and content

Built together on branch `milestone-7-8` (from `milestone-6`) at the user's request ("Start Milestone 7 and milestone 8"), with a single review gate at the end.

**Exit criteria (spec §9):**

- M7: a 10-generation simulation with coherent family records. **Met.** `legacy.test.ts` plays about two centuries in one world: each player starts a family, hands over to their eldest child at 18, and when a player dies young the game's succession picks an heir. It checks:
  - the lineage reaches generation 10, and each hand-over goes to a relative without gaps;
  - every voluntary hand-over goes to a child of the previous player, one generation down;
  - there are no ancestry cycles;
  - every earlier player who died has a recorded death and no open accounts left (their estate was settled);
  - the generation-10 achievement is unlocked;
  - ledger, invariants and schema are valid, and growth stays bounded (at most 150 active people, at most 400 notifications, a 3-month journal).
- M8: custom packs load safely and trigger deterministically. **Met.**
  - `packs.test.ts`: malformed and dangerous packs are refused with field paths (shape, bounds, unknown facts, markup, links, unknown placeholders, clashes, missing follow-ups, scheduling cycles, player-pack limits).
  - An enabled pack's event fires, and its follow-up fires exactly three months later. Replaying the same commands gives a byte-identical world.
  - An invalid pack leaves the life unchanged.
  - A tampered stored pack is refused when a save loads.
  - `milestone78.test.ts` covers the same through the worker: the library never stores invalid files, a pack travels with an exported save, and a tampered import is refused.

### Milestone 7 checklist (media, legacy, narrative)

- [x] World schema v5 with a deterministic upgrade from v4; engine 0.7.0
- [x] Succession on death (decision D7): adult descendants first, then the nearest adult relatives (siblings, nieces and nephews, parents, cousins); with nobody the life ends. Advancing waits until an heir is chosen.
- [x] Handing over while alive to an adult child or grandchild: control passes, ownership does not; the previous character lives on as an autonomous person
- [x] Inheritance: debts paid from the estate (the rest written off), inheritance tax by country with simplified allowances, then distribution by will or intestacy (married partner and children, then parents, then siblings). Property, mortgages and company shares pass to the main heir; heirs book the inheritance as income. Every estate is recorded.
- [x] Wills, with forced heirship where the country reserves half for children (for example France); free disposal elsewhere (for example the UK)
- [x] Lineage record: generation, dates played, how control passed, peak net worth
- [x] Social media: three fictional platforms, ten topics with simulated trends, five post styles (controversial posts can backfire), diminishing returns, followers, engagement, trust, ad income, fictional brand sponsorships, fame raising reputation
- [x] 101 achievements in 11 categories, unlocked once per timeline with provenance; a cross-save gallery
- [x] Detailed biographies for anyone in the family line: summary (jobs, partners, children, countries, offices, companies, peak wealth) and chapters by life stage
- [x] Screens: Legacy (succession chooser, family line, hand-over, will editor, estates), Social media, Achievements and biography, Biography, Achievement gallery

### Milestone 8 checklist (event editor and content)

- [x] Content packs as plain data in the built-in event schema, with optional New Life scenario presets; no code, scripts or links accepted
- [x] Validation with field paths: shape, bounds, whitelisted facts and operators, follow-up references, scheduling cycles, clashes with built-in or other enabled content, unsafe text and placeholders; player packs have stricter limits (event count, chances, value changes, no engine actions or economic policy)
- [x] Packs enabled for a life are copied into the world, so saves, rewinds and exports carry them and replays stay deterministic; disabling stops them firing while past events stay readable; newer versions replace older ones
- [x] Stored packs are re-validated when a save is loaded or imported
- [x] Device library (IndexedDB v3): import, export, delete, version history (10 earlier versions kept)
- [x] Event creator: visual editing of conditions (age range plus comparisons on 45 facts), chance, cooldown, follow-up-only events, 0 or 2-5 choices, effects (stats, needs, skills, money, medical costs, flags, health conditions, follow-ups); JSON view; live validation; seeded simulation preview; save as a new version; developer and player modes
- [x] Starting a new life from a pack's scenario preset (the pack is enabled for that life)
- [x] Content packs section on each life's Rules screen

### Verification results (actual runs, 2026-11-18)

| Command          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run verify` | exit 0: typecheck ✔, ESLint 0 problems ✔, dependency-cruiser "no dependency violations found (179 modules, 1114 dependencies cruised)" ✔, Prettier ✔, Vitest **204/204 passed** (21 files) ✔, production build ✔                                                                                                                                                                                                                                                         |
| `npm run e2e`    | exit 0: **198 passed, 2 skipped** (desktop Chromium, desktop WebKit, Pixel 7 Chromium, iPhone 15 WebKit); the skips are the Chromium-only offline test on WebKit. New: social media, a will, achievements and a biography in an imported adult life; making a pack in the event creator, testing it, saving it and enabling it for a life; the gallery; accessibility scans of every new screen, and Legacy, Social media and Achievements added to the per-screen sweep |
| M7 exit          | `legacy.test.ts` 10-generation run, as above (about 12 seconds in Node)                                                                                                                                                                                                                                                                                                                                                                                                  |
| M8 exit          | `packs.test.ts` and `milestone78.test.ts`, as above                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Performance      | a month through the worker (engine, view and storage) takes 14 ms median, 18 ms at p95 in Node                                                                                                                                                                                                                                                                                                                                                                           |

### Known issues and limitations (M7 and M8)

1. **Royal succession is not separate yet.** Royal duties pass to whoever is played next if they are in the royal family; there is no line of succession to a throne.
2. **Inheritance is simplified**: allowances and tax are one rate per country; estates of NPCs who were never players are not settled (they hold no ledger accounts).
3. **The previous character's money stays frozen when they become an NPC** (only the active player's finances run monthly) until they die and their estate is settled.
4. **The visual editor covers common conditions and effects**; subjects (events about another person), memories, assets and multipliers are edited in the JSON view.
5. **Achievement provenance** records the save, timeline, person, generation and month; rewinding does not copy earlier unlocks into the new timeline's gallery rows (the new timeline records its own).
6. **Phone accessibility scans start at the top of the page.** The fixed bottom tab bar can cover a control at some scroll positions, and axe then reports it as too small.
7. **Event content is 131 of the 400+ target** (D8); the editor makes more possible, but authoring the remaining built-in events is M9 content work.
8. **The main bundle is 991 KB (283 KB gzip)**; code-splitting is planned for M9.
9. **Firefox e2e** is still blocked locally by Windows policy (it runs in CI).
10. Not clicked through by hand in the in-app browser (the pane was hidden); the browser tests drive the new screens in four profiles.

### Next: Milestone 9, integration, balance and release (awaiting approval)

---

## Milestone 6: Global institutions

Built on branch `milestone-6` (from `milestone-5`) at the user's request ("Start Milestone 6", then "start now").

**Exit criterion (spec §9): country-specific eligibility tests and Easy Migration behaviour pass. Met** (`civics.test.ts`, 33 tests). Eligibility tests cover:

- citizenship at birth: the United States (unconditional), Japan (none), the United Kingdom (settled parent) and France (at 18);
- descent;
- naturalisation and dual citizenship: Australia keeps it, Japanese citizens lose it, Singapore requires renunciation;
- naturalisation practically unavailable in the UAE, Saudi Arabia and China;
- routes to permanent residence (UAE no, UK yes);
- closed routes and age limits;
- conscription: Korean men liable, women and Germans not; Singapore permanent residents liable;
- candidacy: US House at 25, presidency for citizens from birth, Australian MPs with one citizenship only, Saudi Arabia appointed and without parties;
- foreign buyers: banned in New Zealand, a 60% surcharge in Singapore;
- student work rights;
- criminal records.

Easy Migration tests check that it relaxes new applications (age, qualification, time, fee, approval), that it is per save and logged, that turning it off never removes a status already held, and that visas renew while it is on but end (with a return home) while it is off.

### Checklist

- [x] World schema v4 with a deterministic upgrade from v3 (tested); engine 0.6.0, content core-2026.11.4
- [x] Researched institutions for all 20 countries (`world/institutions.ts`) with official sources, an as-of date, and spot checks of recent changes on 2026-11-18 (UK settlement, German naturalisation and military service, Canadian and Australian foreign-buyer bans, the Saudi property law, Malaysia's PLKN, the Thai draft)
- [x] Citizenship for everyone: birthright rules, descent, immigrant families (parents permanent residents), citizenship at 18 (France, Italy)
- [x] Migration: work, study, family and investor routes, permanent residence and naturalisation per country, with every reason shown; fees, processing time, approval, visa length, work rights; points-tested routes that grant permanent residence (Australia, New Zealand, Canada); renunciation and loss of other citizenships where the law requires it
- [x] Moving to another city or abroad: the household moves, the job ends, insurance ends, and money converts at the simulated exchange rate. Property and mortgages left abroad keep their currency through an account abroad that is topped up and swept automatically. Every step reconciles.
- [x] Visa expiry and renewal; time counted towards permanent residence and citizenship; notifications when eligible
- [x] Easy Migration rules (spec §5): per save, logged, applies only to new applications, never revokes
- [x] Health care: 10 conditions, onset by age, stress and habits, public care with waiting lists or private care, coverage by system and residence status, long-term medication, non-graphic
- [x] Law: seven abstract case kinds, lawyers (none, legal aid, private), pleas, juries where used, fines, community service, probation and custody, records spent after each country's period; records affect jobs, visas and candidacy; custody blocks most actions
- [x] Religion: affiliation and participation, neutral; country landscapes; restricted leaving where the law says so; German church tax
- [x] Military: conscription (men, lottery, short programme), permanent residents where liable, call-up, study deferment, volunteer enlistment (enlisted or officer), ranks, pay, promotion, re-enlisting, leaving, veterans
- [x] Politics: fictional parties, offices by country (ages, terms, term limits, election or appointment or party route), campaigns with diminishing returns, elections, salary, approval, policy decisions with economic effects for heads of government, resignation
- [x] Royal and noble duties where the country supports them: engagements, patronages, approval, royal allowance
- [x] Foreign property buyer rules (bans, permitted kinds, minimum prices, residence, surcharges)
- [x] Inheritance rules recorded per country (used in M7)
- [x] 31 new events (law, health, migration, religion, service, politics, royal), 131 in total
- [x] Screens: World and migration, Health care, Law, Religion and belief, Military service, Politics and public life (with royal duties); links from More
- [x] Sensitive-topic filter (D6) in Settings: hides explanations of sensitive laws; display only, never changes rules

### Verification results (actual runs, 2026-11-18)

| Command                 | Result                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`        | exit 0: typecheck ✔, ESLint 0 problems ✔, dependency-cruiser "no dependency violations found (162 modules, 948 dependencies cruised)" ✔, Prettier ✔, Vitest **180/180 passed** (18 files) ✔, production build ✔                                                                                                                                                                               |
| `npm run e2e`           | exit 0: **178 passed, 2 skipped** (desktop Chromium, desktop WebKit, Pixel 7 Chromium, iPhone 15 WebKit); the skips are the Chromium-only offline test on WebKit. New: apply for a visa, join a party and choose a belief in an imported adult life, with accessibility scans of all six new screens; the six screens are also in the per-screen accessibility and no-horizontal-scroll sweep |
| M6 exit                 | `civics.test.ts` as above                                                                                                                                                                                                                                                                                                                                                                     |
| Moving abroad           | Britain to Australia (approved, moved, money converted to AUD, six months reconciling) and Britain to Canada with a let property and a loan (the loan converts to CAD; the property stays in GBP; eight months reconcile)                                                                                                                                                                     |
| Performance             | game view built in about 5 ms (median) for an adult world, including about 200 eligibility checks                                                                                                                                                                                                                                                                                             |
| Browser-test robustness | the Milestone 5 test now answers chained decisions until the month commits and picks only available choices (it failed intermittently before); repeated 16 times across four browsers with no failures                                                                                                                                                                                        |

### Known issues and limitations (M6)

1. **Rules are simplified** (one route per kind of visa, typical fees and processing times, approval chances). They are recorded as researched facts with sources, but they stood in 2025-2026 and the spot checks used secondary sources (news and law-firm summaries).
2. **Tax, wage and school figures from M2-M4 are still baseline approximations.** M6 researched the institutions; re-checking every tax band is left for M9 content review.
3. **Only the player's institutional life is simulated in detail.** Most NPCs have citizenship and religion but no visas, cases or service records; partners and children move with the player as dependants.
4. **Inheritance and royal succession** rules are recorded but used from M7.
5. **The sensitive-topic filter is display-only**; it hides explanations, not events (events must stay deterministic for every player of a save).
6. **Money moved abroad is converted at once** (pensions included), a simplification.
7. **The main bundle is 920 KB (265 KB gzip)**; code-splitting is planned for M9.
8. **Firefox e2e** is still blocked locally by Windows policy (it runs in CI).
9. Command rejection messages are still plain English rather than localisation keys.
10. Not clicked through by hand in the in-app browser this milestone (the pane was hidden); the browser tests drive the new screens in four browser profiles.

---

## Milestone 5: Business and real estate

Built on branch `milestone-5` (from `milestone-3-4`) at the user's request ("Start Milestone 5").

**Exit criterion (spec §9): multi-company monthly accounting and ownership invariants pass. Met** (`enterprise.test.ts`: three companies, one with a branch in Singapore, run for 24 months through price, staff, stock, supplier, manager, loan, dividend, outside investment, an acquisition, a sale and a closure; after every command and month the change in net worth equals booked income minus expenses, the ledger balances, each company is accounted exactly once a month and ownership adds up to 100%).

### Checklist

- [x] World schema v3 with a deterministic upgrade from v2 (tested); engine 0.5.0, content core-2026.11.3
- [x] 12 business types (café, restaurant, boutique, online store, consultancy, software, fitness studio, salon, contractor, workshop, delivery, guesthouse), services or goods with inventory
- [x] Start, run, sell and close companies (at most 6); limited liability: a company that cannot pay its bills for 6 months fails and its debts are written off
- [x] Each company has its own ledger accounts in its home currency; owners hold a stake account valued at their share of book equity
- [x] Branches in any of the 80 locations, including abroad (international expansion with currency conversion)
- [x] Pricing, staff, stock targets, marketing, supplier tier (budget, standard, premium), owner-managed (40 hours a month) or a hired manager
- [x] Demand from each market's size, the economic cycle, price, quality and brand; simulated competitors that grow, shrink, close and open
- [x] Acquisitions of competitors, business loans, dividends, the owner investing more, raising outside investment (new co-owner)
- [x] Monthly operating statements (revenue, cost of sales, wages, rent, marketing, overheads, interest, tax, net profit) and history; corporate tax on profit (baseline rates per country, unverified)
- [x] Property market: listings refreshed monthly (apartments, houses, commercial units) priced from local wages, costs, the house-price index and condition
- [x] Buying with a mortgage (deposit, term, affordability check, transfer costs), moving in, letting to tenants (12-month leases, renewals, missed rent), renovating, maintaining, selling; repossession after 6 missed payments
- [x] Investment funds (stocks and bonds) with simulated prices; simulated exchange rates for all 20 currencies
- [x] Events: 12 about companies and 8 about property, with follow-ups (100 events in total); events can be about a specific company or property
- [x] Decisions due in the same month are answered one after another before the month commits (fixes job interviews waiting for months)
- [x] Screens: Business (start, companies, past companies), company detail (statement, branches, competitors, management, owners, money, sell/close), Property (owned, listings with a payment preview), Finance investments; links from Career, Finance and More

### Verification results (actual runs, 2026-11-18)

| Command                                    | Result                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                           | exit 0: typecheck ✔, ESLint 0 problems ✔, dependency-cruiser "no dependency violations found (146 modules, 787 dependencies cruised)" ✔, Prettier ✔, Vitest **146/146 passed** (17 files) ✔, production build ✔                                                                                                                                 |
| `npm run e2e`                              | exit 0: **150 passed, 2 skipped** (desktop Chromium, desktop WebKit, Pixel 7 Chromium, iPhone 15 WebKit); the skips are the Chromium-only offline test on WebKit. New: start a company, hire, trade a month and see the statement, the Property screen, buying an investment, with accessibility scans of Business, company detail and Property |
| M5 exit                                    | `enterprise.test.ts`: multi-company accounting and ownership, as above                                                                                                                                                                                                                                                                          |
| Other M5 tests                             | failure with write-off; ownership must total 100%; refusal without enough capital; buy with a mortgage, let, renovate and sell with every month reconciling; moving into your own home; funds; currency conversion; chained decisions; v2→v3 upgrade                                                                                            |
| Tuning probe                               | with default settings most business types earn 5-17% net margins in their first year; the workshop is about break-even                                                                                                                                                                                                                          |
| Accessibility fixes found by the new scans | the notification badge label now matches "99+"; competitor "Buy for …" buttons' names start with their visible text                                                                                                                                                                                                                             |

### Known issues and limitations (M5)

1. **Numbers are proposed tuning** (demand, costs, margins, property prices, yields, mortgage terms, exchange-rate baselines); see docs/DECISIONS.md.
2. **Exchange rates, corporate tax and property transfer costs are baseline approximations** (about 2024-2025), labelled unverified; researched with sources in M6, along with migration.
3. **Payroll after switching to another character** (F-05) depends on character switching in M7; companies are already accounted independently of the player each month.
4. **Competitors are aggregate firms**, not individually simulated people; NPC co-owners exist only when you raise investment.
5. **Charts** are still the small CSS chart and tables; no chart library was added.
6. **The main bundle is 807 KB (237 KB gzip)**; code-splitting is planned for M9.
7. **Firefox e2e** is still blocked locally by Windows policy (it runs in CI).
8. Command rejection messages are still plain English rather than localisation keys.
9. Not manually checked in the in-app browser this milestone; the e2e test drives the new screens in four browser profiles.

---

## Milestones 3 and 4: Social, childhood and education · Careers and household economy

Built together on branch `milestone-3-4` (from `milestone-1-2`) at the user's request ("Start Milestone 3 and 4"), with a single review gate at the end.

**Exit criteria (spec §9):**

- M3: NPCs progress independently and persistent choices influence later events. **Met** (`life.test.ts`: over 30 years NPCs form partnerships, have children, change jobs and age without the player; standing up for a teased classmate leaves a permanent memory that later makes a job referral possible, while walking away makes a different reunion event possible instead).
- M4: finances reconcile through employment changes. **Met** (`economy.test.ts`: after every command of an adult life with jobs, a move, a loan, insurance, a layoff, benefits and a new job, the change in net worth equals booked income minus expenses, and the ledger balances).

### Milestone 3 checklist (social, childhood, education)

- [x] World schema v2 with a deterministic upgrade from v1 (tested with a real Milestone 2 world and a stored v1 save)
- [x] Individually simulated people: grandparents, aunts and uncles, cousins, neighbours, classmates, teachers, club members, colleagues, partners
- [x] Population tiers: close NPCs monthly, relevant NPCs yearly, archived NPCs kept for history; at most 150 active and 30 close (invariant)
- [x] NPC autonomy with weighted utility: dating, marriage, children, separation, moving away, job search, promotions, layoffs, retirement
- [x] Relationships with chemistry (personality and interests), trust, respect, conflict, shared history and last contact; drift from living together, contact and memories
- [x] Durable memories (valence, salience, decay rules) that shape relationships and make events eligible years later; people who moved away can still get in touch
- [x] 19 interactions with time costs and per-person diminishing returns; romance, engagement, weddings, moving in and family planning for adults only (18+), non-explicit; adoption
- [x] Births and adoptions; family links and relationships for new relatives
- [x] Country school structures for all 20 countries (stage names, ages, school-year month, national exams; baseline, unverified)
- [x] Preschool to upper secondary with grades, study effort, report cards, repeat years, exams and qualifications; legal leaving age
- [x] Further study: 20 programmes at diploma, bachelor and master level; applications, admission scores, offers, scholarships, tuition, student loans, graduation
- [x] 14 clubs with fees, hours, skill gains and yearly competitions with awards
- [x] Calendar: itemised free time, recurring activity plans, holidays, check-ups, weddings, clash warnings, cost previews and the next 12 months
- [x] Event system: events about a specific person (subject), memory facts, new effects (money, medical, grade, performance, engine actions); 59 new events (80 in total)
- [x] Screens: Social (partner, family, friends, others, meet people), person profile with memories and interactions, family tree, calendar; four new dashboard widgets

### Milestone 4 checklist (careers and household economy)

- [x] Balanced double-entry ledger in BigInt minor units; trial-balance and no-negative-asset invariants; bounded journal (snapshots keep every month)
- [x] Aggregate country economy: business cycle, inflation, wages, unemployment, policy rate, retirement-fund index
- [x] Baseline tax bands, social contributions, pensions, unemployment benefits and healthcare coverage for all 20 countries (unverified, researched in M6)
- [x] Payroll with monthly withholding and year-end tax reconciliation (refund or bill)
- [x] Tracked households: parents' jobs matching the family's circumstances, living costs, rent or home upkeep, childcare, school fees, family support, lifestyle adjustment
- [x] The player's accounts: child savings, birthday money, a current account at 16, retirement fund, transfers
- [x] 150 occupations in 25 industries (decision D8), seniority titles, salary bands by location and economy
- [x] Job board refreshed monthly (teen jobs for minors), eligibility with reasons, screening, interview decision, offers, negotiation, acceptance
- [x] Employment: effort, performance, skill growth, annual reviews and raises, promotions, warnings and dismissal, fixed-term renewals, layoffs, raise requests, quitting, retirement
- [x] Personal loans with affordability checks and amortised repayment; student loans that start after study; early repayment
- [x] Health and life insurance; medical costs after public coverage; life insurance pays the household
- [x] State pensions (basic and earnings-related) and retirement-fund drawdown; voluntary contributions with employer match where relevant
- [x] Moving out to a rented room, apartment or house; moving back home; lifestyle choice
- [x] Screens: Career (education, clubs, further study, job, applications, job board, history), Finance (overview, accounts, cash flow with a table view, tax, loans, insurance, retirement, home, transactions, economy)

### Verification results (actual runs, 2026-11-18)

| Command                       | Result                                                                                                                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`              | exit 0: typecheck (5 projects) ✔, ESLint 0 problems ✔, dependency-cruiser "no dependency violations found (136 modules, 697 dependencies)" ✔, Prettier ✔, Vitest **136/136 passed** (16 files) ✔, production build ✔                                                                |
| `npm run e2e`                 | exit 0: **138 passed, 2 skipped** (desktop Chromium, desktop WebKit, Pixel 7 Chromium, iPhone 15 WebKit); the skips are the Chromium-only offline test on WebKit. New: people, family tree, calendar, and an imported adult life (career, finance, person) with accessibility scans |
| M3 exit                       | `life.test.ts`: independent NPC lives over 30 years; the butterfly-effect chain from a playground choice to a later referral or reunion                                                                                                                                             |
| M4 exit                       | `economy.test.ts`: net-worth change equals booked income minus expenses after every command of an adult life with job changes                                                                                                                                                       |
| Performance                   | engine p95 **15.5 ms** per month in a 150-NPC world (Node); target 250 ms                                                                                                                                                                                                           |
| Save upgrade                  | a real Milestone 2 world (generated with the old engine) upgrades to a valid v2 world, deterministically; a stored v1 save opens, plays, starts a fresh keyframe and can be rewound into                                                                                            |
| Property tests                | ledger invariants over random postings; loan schedules always clear within their term (fast-check found a rounding edge case, now fixed and pinned)                                                                                                                                 |
| Manual check (in-app browser) | new life in George Town: Social, person profile, family tree, Finance, Career and Calendar screens; months advanced with household money flowing                                                                                                                                    |

### Known issues and limitations (M3 and M4)

1. **Country institutions are baseline approximations** (tax bands, contributions, pensions, benefits, school structures, tuition; about 2024-2025, single earner, regional taxes folded in, caps ignored). Labelled unverified; researched with sources in M6.
2. **Event content is 80 of the 400+ target** (D8). More arrive through M8.
3. **Romance and family planning are for adults only (18+)**; teenagers have crushes and friendships but no partnerships.
4. **NPC households are background**: only the player's and the parents' households are tracked in the ledger; other NPCs have jobs and salaries but no accounts.
5. **Buying property, mortgages, investments beyond the retirement fund, and businesses** arrive in M5; healthcare depth, migration and citizenship in M6; inheritance in M7.
6. **Command rejection messages** are still plain English rather than localisation keys.
7. **The main bundle is 754 KB (224 KB gzip)**; code-splitting is planned for M9.
8. **Firefox e2e** is still blocked locally by Windows policy (it runs in CI).
9. Many numbers are **proposed tuning** (see docs/DECISIONS.md).

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
