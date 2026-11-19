# Changelog

## Unreleased

### Changed

- **New Life tab header:** a large portrait, your name, age, what you are doing and where you live, with four headline stats (health, happiness, intelligence, energy). On this tab the top bar shows just the month. The old Profile and Vitals sections start hidden; turn them back on with Customise.
- **"What do you want to do?" grid:** Activities, School or Work, People, Money, Calendar and More.
- **Redesigned profile:** portrait banner, Generation and life-stage badges, personal details with icons, and key statistics.
- **Clearer decisions:** each decision shows an icon for its kind of event, larger choice cards, and a closed choice now says why it is closed.
- **GitHub Pages:** the game is published at https://razinraziq13.github.io/welife/.

### Added

- **Your story:** the Life tab shows the three latest moments of your life, with a link to the whole story.
- **Achievement pop-ups:** a small, dismissible note when an achievement unlocks, with a link to the collection. Achievements already unlocked when a life is opened are not announced again.
- **Life summary:** when a character dies, their life gets a title (for example "The Explorer" or "The Family Anchor"), a few facts and up to five defining moments, shown above the heir choice. Past players' titles also appear in the family line.
- **Roadmap:** `docs/ROADMAP.md` lists what comes next.
- **Deeper interactions:** 15 new things to do with people, grouped into Talk, Friendship, Family, Romance and Work: share a secret, ask a favour, gossip, make peace, talk it through, ask family for money or permission, host a family get-together, support a relative, make something with a friend, talk about the future with a partner, and at work negotiate your salary, ask for a promotion, network or find a mentor. Outcomes depend on the other person and are never guaranteed; each unavailable option says why.
- **Careers with their own play:** teachers, doctors and nurses, performers and office workers each get their own work actions (lessons, extra shifts paid as overtime, complex cases, auditions with paid roles, projects, paid courses). Professional reputation follows you between jobs and helps at review time; a specialism raises pay by 10%; job satisfaction (and what drives it) affects your happiness. Eight new work decisions: credit taken, leading a project, disagreements, a restless class, covering a night shift, a difficult case, a lead role, being headhunted.
- **Activities Hub:** one searchable place for everything you can do with free time, in nine categories, with costs, favourites, monthly plans and suggestions with reasons. 25 new activities, including doctor and dentist visits, cinema, concerts and museums, day trips and holidays abroad, shopping, family dinners, parties, a driving test, and personal projects that take months (write a novel, build an app, learn a language, grow a garden) and can end in published books or app income.

## 0.9.0 (release candidate, 2026-11-19)

Milestone 9: integration, balance and release preparation.

### Added

- **Royal and noble succession.** A house has a head, separate from inheritance and from who you play. The headship passes by each country's rule (agnatic, male preference or absolute), and the Legacy screen shows the house, its rule, the line of succession and past heads.
- **Long-run stability.** People who have left your life keep ageing off screen and eventually die. Once a year, people who died long ago and matter to no lasting record are cleaned up, and their closed books move into an archive account. A 10,000-month soak (`npm run soak`) checks that the world stays bounded and valid across 10+ generations.
- **Cross-browser determinism test.** A save built in Node is played in the browser and must match a Node replay exactly.
- **Security.** Production builds ship a Content Security Policy; see `docs/SECURITY.md`.
- **Translatable refusals.** Every refused action carries a translation key, with English text from one table.

### Changed

- **Advance plays four months per click** and stops early for a decision or the end of a life (decision D11).
- **Difficulty affects business rivals** (weaker on Casual, stronger on Challenging).
- **Former players keep paying loans and earning interest** after you switch to an heir.
- **Faster first load.** Screens load on demand: the main script is 271 KB instead of 991 KB, and the service worker still caches everything for offline play.
- When someone who ran a household budget dies, the household gets its own accounts and a new head, instead of paying bills from a closed account.

### Known limits

- 131 built-in events against the 400+ target (D8).
- Tax, wage and school figures are baseline approximations that have not been checked against official sources.
- Installing on a physical phone or tablet still needs a manual check.

## 0.7.0 and earlier

Milestones 0-8; see `DEVELOPMENT_PROGRESS.md`.
