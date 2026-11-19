# WeLife improvement brief

_Compiled 2026-11-19. A self-contained brief to hand to another assistant (for example GPT) so it can expand each idea into a detailed design. BitLife details are from screenshots and general knowledge of the game._

---

## Prompt to paste

> You are a game designer helping improve **WeLife**, an offline life-simulation game. Below is a brief describing the game, its rules and constraints, what already exists, and a list of improvement ideas inspired by studying BitLife.
>
> For each improvement idea, write a detailed design covering:
>
> 1. **Player experience:** what the player sees and does, step by step, on a phone.
> 2. **Rules and numbers:** costs, chances, age limits, effects on stats, relationships and money. Keep numbers integer and simple.
> 3. **Example content:** 5-10 short example events or results, written originally in a warm, lightly humorous tone (never copied from BitLife).
> 4. **How it connects** to systems WeLife already has (listed in the brief).
> 5. **Edge cases:** what happens when the player is too young, broke, abroad, in prison, dead or switching to an heir.
> 6. **Effort:** small, medium or large, and what to build first.
>
> Respect every constraint in the brief, especially: original content only, no ads or paywalls, realistic tone (fantasy only as optional content packs), every unavailable action explains why, and no instructions for real-world crime. Start with the ideas marked **Priority 1**.

---

## 1. What WeLife is

- An **offline, multigenerational life simulator**, played in the browser and installable on phones (iPhone, iPad, Android) and desktops. Live at https://razinraziq13.github.io/welife/.
- You live a life from birth: childhood, school, work, relationships, money, and death. Then you **continue as an heir**, generation after generation.
- **20 real countries** (Malaysia, Singapore, Indonesia, Thailand, Japan, South Korea, China, India, Australia, New Zealand, US, Canada, UK, France, Germany, Italy, Brazil, South Africa, UAE, Saudi Arabia) with their own laws, schools, taxes, health care, visas, military service, politics and monarchies.
- **Version 0.9.0** (release candidate). Free, open source, no account, no ads, no tracking.

## 2. Design constraints (any proposal must respect these)

- **Original content only.** No names, wording, icons, layouts or scenarios copied from BitLife or any other game.
- **No ads, no paywalls, no premium modes.** Everything is free and works offline.
- **Realistic tone with light humour.** Supernatural or fantasy features (vampires, magic, cults) only as **optional content packs**, never in the core game.
- **Every disabled action explains why** (for example "Available from age 12" or "You need $500").
- **No real-world how-to for crime or harm.** Crime is abstract choices with risks and consequences.
- **Gambling and adult themes are 18+** in game age; intimacy is non-explicit.
- **Time costs:** actions use hours from a monthly time budget, so the player can't do everything.
- **Money is a real double-entry ledger** in minor units, per currency. Every gain or cost must have a source and a destination (for example "Mother's account → your account").
- **Deterministic simulation:** the same seed and the same choices always give the same life. Random outcomes come from seeded random numbers, never from the clock.
- **Accessible:** works with screen readers and the keyboard, has light, dark and high-contrast themes, and supports text scaling and phone-sized screens.
- **Data-driven events:** events are written as data (conditions, choices, effects, follow-ups), so a built-in **event editor** and **content packs** can add more.

## 3. What WeLife already has

| Area                      | Already in WeLife                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Time**                  | Monthly simulation; one click of Advance plays 4 months and stops early for decisions. Calendar with recurring plans, holidays and clash warnings.                                                                                  |
| **Character**             | Stats (health, happiness, intelligence, looks, fitness, social and more), needs, habits, life stages, layered avatar that ages.                                                                                                     |
| **People**                | 25-50 people around you at birth; up to 150 simulated in detail. Relationships with closeness, trust, respect and conflict; memories that matter years later.                                                                       |
| **Interactions (19)**     | Chat, Play, Hang out, Deep talk, Help, Compliment, Gift, Apologize, Argue, Ask advice, Befriend, End friendship, Ask out, Propose, Move in, Break up, Plan a family, Stop planning, Adopt. Each costs hours and has an age minimum. |
| **School**                | Country-specific school systems, grades and report cards, exams, study effort, 14 clubs with competitions, applications, scholarships, student loans, leaving school.                                                               |
| **Work**                  | Job market with postings and applications, interviews, promotions, work effort, retirement, pensions.                                                                                                                               |
| **Money**                 | Accounts, salary, tax by country, household budgets, rent, loans, credit score, insurance, investments with simulated prices, 20 currencies and exchange.                                                                           |
| **Business and property** | Start or buy companies with branches, staff, stock and competitors; buy, let, renovate and sell property with mortgages.                                                                                                            |
| **Institutions**          | Citizenship, visas and emigration; health conditions and treatment; legal cases (as a party, not crime how-to); religion; military service; politics and elections; royal and noble duties and succession.                          |
| **Legacy**                | Wills, estates, inheritance tax, choosing an heir, family tree, lineage across 10+ generations, biographies.                                                                                                                        |
| **Social media**          | Fictional platforms, posts in different styles, followers, trends, ad income, sponsorships.                                                                                                                                         |
| **Achievements**          | 101 achievements and a gallery.                                                                                                                                                                                                     |
| **Tools**                 | Rewind and branch timelines; event editor; content packs; save export and import.                                                                                                                                                   |
| **Content**               | 131 built-in events (target 400+).                                                                                                                                                                                                  |

## 4. What BitLife does better (observed)

- **Pace:** one big central "Age" button; one tap is a year; a whole life takes minutes.
- **Story feed:** the home screen is a first-person diary ("I was born in Bruges… We have a family dog named…").
- **Four headline stats** on the home screen (happiness, health, smarts, looks).
- **One Activities hub** listing everything you can do, with **Favorites** and "Just for you" suggestions.
- **Short menus per person:** tap Mother → Conversation, Spend time, Compliment, Gift, Ask for money, Ask for a bike, Movies together, Insult.
- **School screen:** grades, popularity, cliques, teachers, school dance, skip school, nurse, extracurriculars, change school, drop out.
- **Pets** shown in the relationships list with their own relationship bar.
- **Lots of quick activities:** doctor, gym, salon and spa, accessories, shopping, nightlife, cinema, holidays, zoo, lottery, casino, horse races, sweepstakes, plastic surgery, licences, lawsuits, fertility clinic, rehab, emigration.
- **Special careers:** business, politician, street hustler, fame paths (acting, music, sport).
- **Collectibles and luxury assets:** auctions, a museum for collections, garages, even owning a zoo or casino.
- **Achievement pop-ups**, an end-of-life summary with a playful label, weekly challenges.
- **Humour:** short, surprising, shareable outcomes.

What WeLife should **not** copy: ads in menus, paywalled modes (God Mode, premium activities, "Bitizen"), greyed-out actions with no explanation, supernatural features in the core game, and alphabetical lists of 30+ items.

---

## 5. Improvement ideas

### Priority 1: pace and presentation

1. **Faster play.** A "next year" option (12 months per tap, stopping on decisions), alongside today's 4-month step.
2. **Simple home screen for phones.** A big central Advance button, a first-person **story feed** of the latest happenings, and **four headline stat bars**; deeper screens one tap away.
3. **Simple mode vs detailed mode.** Hide finance, business and institution screens until they matter (for example, unlock Finance at the first job), with a setting to show everything.
4. **Life summary at death.** A "how this life went" screen: key stats, milestones, money, family, a playful label for the life ("The Workaholic", "The Romantic", "The Globetrotter"), and a shareable card image.
5. **Achievement pop-ups** when something unlocks, plus a progress counter.

### Priority 1: content

6. **Reach 400+ events** (270+ more), with light humour and memorable moments in every life stage and country, not only realistic ones. Include short follow-ups years later.
7. **First-person life story lines** generated from facts (birth, family, moves, jobs, deaths) to fill the story feed.

### Priority 2: everyday activities

8. **Activities hub:** one screen with groups (Health, Self-improvement, Leisure, Money, Social, Legal, Family) and search, **Favorites** pinning, and **"Just for you"** suggestions based on age, country and situation.
9. **Quick activities:** doctor and dentist visits, gym and sports, salon and spa, shopping and accessories, nightlife, cinema, concerts, zoo and museums, holidays (domestic and abroad, linked to visas and currencies), driving licence and other licences.
10. **Pets:** adopt or buy (dog, cat, rabbit, fish, bird and more), feed and play, vet bills, a pet's age and personality, and losing them. Pets appear in the family list with a relationship bar and in the biography.
11. **Appearance:** haircuts and styles, clothes and accessories affecting looks and confidence; cosmetic surgery (18+, with costs, recovery and risks).
12. **Chance and gambling (18+):** lottery tickets, scratch cards, casino visits, betting on races or matches. Realistic odds, spending limits, and a possible gambling-habit storyline with help available.
13. **Health choices:** rehab for addictions (alcohol, smoking, gambling), fertility clinic, therapy, diet plans.
14. **Lawsuits:** sue or be sued (neighbour disputes, injuries, contracts), using WeLife's existing legal system.

### Priority 2: people and relationships

15. **Grouped person menus:** sections Kind, Talk, Fun together, Romance, Conflict, Family, each with icons; unavailable actions say why.
16. **Ask family for things:** ask for money, and age-based requests (a toy as a small child, a bike, a phone, a car, help with a house deposit). The answer depends on family wealth and the relationship, and is booked in the ledger.
17. **Do things together:** take someone to a film, a meal, sport, a concert or a trip, so the relationship grows.
18. **More conflict and repair:** insult, prank, gossip, give the silent treatment; make up, write a letter, plan a surprise.
19. **Dating depth:** meeting places (school, work, apps, friends, travel), dates with outcomes, compatibility, long-distance relationships.

### Priority 2: school life

20. **School hub screen** gathering grades, clubs, classmates, teachers and actions on one page.
21. **Popularity bar and friend groups** (sporty, studious, artsy, gamers, rebels) affecting friends, events and grades.
22. **School events:** dances and proms, sports days, school trips, talent shows, exams.
23. **Skip school** (risk of getting caught, effect on grades and parents), **school nurse**, **teacher interactions** (ask for help, flatter, complain, argue).
24. **University life:** societies, parties, internships, study abroad, graduation.

### Priority 3: careers and status

25. **Fame careers:** acting, music, sport, modelling, writing, streaming. Auditions, gigs and matches, fame level, fans, scandals, linked to the existing social media.
26. **Hustle and freelance work:** quick gigs (tutoring, deliveries, design, crafts), side businesses, part-time jobs for teens.
27. **Crime and prison (abstract, no how-to):** risky choices ("fall in with a bad crowd", "shoplift", "fraud at work"), getting caught, court via the existing legal system, sentences, prison life (friends, rivals, education, parole, good behaviour), and life after release (criminal record affecting jobs and visas).
28. **Collectibles and luxury:** cars, jewellery, art, rare items, auctions, a personal collection display; values that rise and fall.

### Priority 3: replay and goals

29. **Weekly challenges** that work offline (seeded by the week), for example "Become a millionaire before 30 in Japan" or "Raise five children in Brazil".
30. **Ribbons or titles for each life** (see idea 4), collected in the achievement gallery.
31. **Mini-games:** short skill moments for an exam, a job interview, a court case, a sports match or an audition.
32. **Scenario starts:** pick an unusual start (born royal, immigrant, orphan, twin, rural farm) with its own goals.

### Priority 3: optional content packs (not core)

33. **Fantasy packs:** supernatural lives, secret societies, time travel. Opt-in only, built with the existing event editor.
34. **Era packs:** start a life in a past decade (1950s, 1980s) with era-appropriate jobs, prices and events.

---

## 6. Things WeLife does better and should keep

- Real countries with researched laws, schools, taxes, visas and monarchies.
- A balanced money ledger with currencies, loans, tax and investments.
- Generations, estates, wills and royal succession.
- Free rewind and branching timelines, and a free event editor and content packs.
- Fully offline, private, no ads or purchases.
- Accessibility and explained disabled actions.

## 7. Known open items (separate from the ideas)

- Tax, wage and school figures are approximations that haven't been checked against official sources.
- Installation on a physical phone needs a manual check.
- Some interface labels are still hard-coded English (translation-ready keys are partial).
