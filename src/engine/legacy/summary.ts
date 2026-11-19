import { ageOf } from '../core/clock';
import { factValue } from '../events/predicates';
import type { BiographyEntry, Character, World } from '../state/schema';

/**
 * End-of-life summary (roadmap 04 and 30). Everything comes from what the world recorded, so the
 * same life always gets the same summary. The title is the first rule that matches, in a fixed
 * order; titles describe what a life was about, never how "good" it was, and short lives get a
 * gentle one.
 */

export const LIFE_TITLES = [
  'remembered',
  'publicServant',
  'entrepreneur',
  'explorer',
  'publicFigure',
  'familyAnchor',
  'lifelongLearner',
  'hardWorker',
  'goodFriend',
  'quietLife',
] as const;
export type LifeTitle = (typeof LIFE_TITLES)[number];

export interface LifeFacts {
  ageYears: number;
  countries: number;
  children: number;
  grandchildren: number;
  jobs: number;
  degree: string;
  businessesFounded: number;
  heldOffice: boolean;
  followers: number;
  friends: number;
}

export function lifeTitle(f: LifeFacts): LifeTitle {
  if (f.ageYears < 18) return 'remembered';
  if (f.heldOffice) return 'publicServant';
  if (f.businessesFounded > 0) return 'entrepreneur';
  if (f.countries >= 3) return 'explorer';
  if (f.followers >= 10_000) return 'publicFigure';
  if (f.children + f.grandchildren >= 4) return 'familyAnchor';
  if (f.degree === 'master' || f.degree === 'bachelor') return 'lifelongLearner';
  if (f.jobs >= 3) return 'hardWorker';
  if (f.friends >= 5) return 'goodFriend';
  return 'quietLife';
}

/** How much a kind of biography line says about a life (higher first). */
const WEIGHT: Record<string, number> = {
  family: 5,
  legacy: 5,
  business: 5,
  politics: 5,
  work: 4,
  school: 4,
  world: 4,
  property: 4,
  military: 4,
  social: 3,
  media: 3,
  legal: 3,
  health: 2,
  money: 2,
  religion: 2,
  event: 1,
  life: 1,
};
const LEFT_OUT = new Set(['bio.born', 'bio.died', 'bio.birthday']);

/** Up to five moments that define a life, one of each kind, in the order they happened. */
export function lifeMilestones(entries: readonly BiographyEntry[], limit = 5): BiographyEntry[] {
  const seenKeys = new Set<string>();
  const picked: BiographyEntry[] = [];
  const candidates = entries
    .filter((e) => (WEIGHT[e.category] ?? 0) > 0 && !LEFT_OUT.has(e.key))
    .sort(
      (a, b) =>
        (WEIGHT[b.category] ?? 0) - (WEIGHT[a.category] ?? 0) ||
        a.tick - b.tick ||
        (a.id < b.id ? -1 : 1),
    );
  for (const e of candidates) {
    // Event outcomes differ by event; other lines by their kind (one promotion is enough).
    const key = e.key === 'bio.event' ? `event:${String(e.params.eventId)}` : e.key;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    picked.push(e);
    if (picked.length >= limit) break;
  }
  return picked.sort((a, b) => a.tick - b.tick || (a.id < b.id ? -1 : 1));
}

export interface LifeSummary {
  characterId: string;
  title: LifeTitle;
  facts: LifeFacts;
  milestones: BiographyEntry[];
}

export function lifeFacts(world: World, c: Character): LifeFacts {
  const until = c.death ?? world.clock;
  const own = world.biography.filter((b) => b.characterId === c.id);
  const num = (fact: string) => {
    const v = factValue(world, c, fact);
    return typeof v === 'number' ? v : 0;
  };
  return {
    ageYears: ageOf(c.birth, until).years,
    countries: num('civic.countriesLived'),
    children: num('social.children'),
    grandchildren: num('social.grandchildren'),
    jobs: num('career.jobs'),
    degree: String(factValue(world, c, 'education.degree')),
    businessesFounded: own.filter((b) => b.key === 'bio.businessStarted').length,
    heldOffice: own.some((b) => b.key === 'bio.office'),
    followers: num('media.followers'),
    friends: num('social.friends'),
  };
}

export function lifeSummary(world: World, c: Character): LifeSummary {
  const facts = lifeFacts(world, c);
  return {
    characterId: c.id,
    title: lifeTitle(facts),
    facts,
    milestones: lifeMilestones(world.biography.filter((b) => b.characterId === c.id)),
  };
}
