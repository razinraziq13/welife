import { addBiography, addNotification } from '../core/world';
import { evaluate } from '../events/predicates';
import type { Predicate } from '../events/schema';
import type { World } from '../state/schema';

/**
 * Achievements (spec §3.18, decision D10): at least 100, unlocked once per timeline branch
 * with provenance (who, when, which generation). The cross-save gallery is kept by the
 * persistence layer. Conditions use the same whitelisted facts as events, so they are data.
 */

export const ACHIEVEMENT_CATEGORIES = [
  'life',
  'skills',
  'family',
  'education',
  'career',
  'money',
  'enterprise',
  'world',
  'civic',
  'media',
  'legacy',
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  when: Predicate;
}

const cmp = (
  fact: string,
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte',
  value: string | number | boolean,
): Predicate => ({ kind: 'cmp', fact, op, value });
const all = (...of: Predicate[]): Predicate => ({ kind: 'all', of });
const isIn = (fact: string, values: string[]): Predicate => ({ kind: 'in', fact, values });
const atLeast = (fact: string, value: number) => cmp(fact, 'gte', value);

type Row = [string, string, string, AchievementCategory, Predicate];

const ROWS: Row[] = [
  // Life
  ['first-birthday', 'First candle', 'Turn one.', 'life', atLeast('age.years', 1)],
  ['school-days', 'School days', 'Turn six.', 'life', atLeast('age.years', 6)],
  ['teenager', 'Teenager', 'Turn thirteen.', 'life', atLeast('age.years', 13)],
  ['coming-of-age', 'Coming of age', 'Turn eighteen.', 'life', atLeast('age.years', 18)],
  ['thirty', 'Thirty and thriving', 'Turn thirty.', 'life', atLeast('age.years', 30)],
  ['half-century', 'Half a century', 'Turn fifty.', 'life', atLeast('age.years', 50)],
  ['sixty-five', 'Golden years', 'Turn sixty-five.', 'life', atLeast('age.years', 65)],
  ['eighty', 'Octogenarian', 'Turn eighty.', 'life', atLeast('age.years', 80)],
  ['ninety', 'Nonagenarian', 'Turn ninety.', 'life', atLeast('age.years', 90)],
  ['hundred', 'Centenarian', 'Turn one hundred.', 'life', atLeast('age.years', 100)],
  [
    'picture-of-health',
    'Picture of health',
    'Reach 95 health as an adult over 30.',
    'life',
    all(atLeast('age.years', 30), atLeast('stats.health', 950)),
  ],
  [
    'zen',
    'Zen',
    'Bring stress down to 5 or less as an adult.',
    'life',
    all(atLeast('age.years', 18), cmp('stats.stress', 'lte', 50)),
  ],
  ['joyful', 'Pure joy', 'Reach 95 happiness.', 'life', atLeast('stats.happiness', 950)],
  [
    'genius',
    'Brilliant mind',
    'Reach 90 intelligence.',
    'life',
    atLeast('stats.intelligence', 900),
  ],
  ['iron-will', 'Iron will', 'Reach 90 discipline.', 'life', atLeast('stats.discipline', 900)],
  [
    'creative-spark',
    'Creative spark',
    'Reach 90 creativity.',
    'life',
    atLeast('stats.creativity', 900),
  ],
  [
    'people-person',
    'People person',
    'Reach 90 social skill.',
    'life',
    atLeast('stats.socialSkill', 900),
  ],
  [
    'household-name',
    'Household name',
    'Reach 90 reputation.',
    'life',
    atLeast('stats.reputation', 900),
  ],
  [
    'self-assured',
    'Self-assured',
    'Reach 90 confidence.',
    'life',
    atLeast('stats.confidence', 900),
  ],
  [
    'healthy-ageing',
    'Ageing well',
    'Reach sixty with no health conditions.',
    'life',
    all(atLeast('age.years', 60), cmp('health.conditions', 'eq', 0)),
  ],
  // Skills and habits
  ['athlete', 'Athlete', 'Reach 80 in fitness.', 'skills', atLeast('skills.fitness', 800)],
  ['bookworm', 'Bookworm', 'Reach 80 in reading.', 'skills', atLeast('skills.reading', 800)],
  ['logician', 'Logician', 'Reach 80 in logic.', 'skills', atLeast('skills.logic', 800)],
  ['virtuoso', 'Virtuoso', 'Reach 80 in music.', 'skills', atLeast('skills.music', 800)],
  ['artist', 'Artist', 'Reach 80 in art.', 'skills', atLeast('skills.art', 800)],
  ['scientist', 'Scientist', 'Reach 80 in science.', 'skills', atLeast('skills.science', 800)],
  ['techie', 'Techie', 'Reach 80 in technology.', 'skills', atLeast('skills.technology', 800)],
  ['maker', 'Maker', 'Reach 80 in craft.', 'skills', atLeast('skills.craft', 800)],
  ['caregiver', 'Caregiver', 'Reach 80 in care.', 'skills', atLeast('skills.care', 800)],
  [
    'born-leader',
    'Born leader',
    'Reach 80 in leadership.',
    'skills',
    atLeast('skills.leadership', 800),
  ],
  ['dealmaker', 'Dealmaker', 'Reach 80 in business.', 'skills', atLeast('skills.business', 800)],
  ['charmer', 'Charmer', 'Reach 80 in socializing.', 'skills', atLeast('skills.socializing', 800)],
  [
    'early-riser',
    'Early riser',
    'Build a strong sleep routine.',
    'skills',
    atLeast('habits.sleepRoutine', 80),
  ],
  [
    'gym-regular',
    'Gym regular',
    'Build a strong exercise habit.',
    'skills',
    atLeast('habits.exercise', 80),
  ],
  [
    'avid-reader',
    'Avid reader',
    'Build a strong reading habit.',
    'skills',
    atLeast('habits.reading', 80),
  ],
  [
    'daily-practice',
    'Daily practice',
    'Build a strong creative habit.',
    'skills',
    atLeast('habits.creativePractice', 80),
  ],
  // Family and friends
  ['first-friend', 'First friend', 'Make a friend.', 'family', atLeast('social.friends', 1)],
  ['popular', 'Popular', 'Have five friends at once.', 'family', atLeast('social.friends', 5)],
  [
    'inner-circle',
    'Inner circle',
    'Have ten friends at once.',
    'family',
    atLeast('social.friends', 10),
  ],
  ['in-love', 'In love', 'Start a relationship.', 'family', cmp('social.partnered', 'eq', true)],
  ['married', 'Tied the knot', 'Get married.', 'family', cmp('social.married', 'eq', true)],
  ['parent', 'Parenthood', 'Have or adopt a child.', 'family', atLeast('social.children', 1)],
  ['big-family', 'Big family', 'Have three children.', 'family', atLeast('social.children', 3)],
  [
    'grandparent',
    'Grandparent',
    'Welcome a grandchild.',
    'family',
    atLeast('social.grandchildren', 1),
  ],
  [
    'matriarch-patriarch',
    'Head of the family',
    'Have five grandchildren.',
    'family',
    atLeast('social.grandchildren', 5),
  ],
  // Education
  [
    'school-leaver',
    'School leaver',
    'Finish upper secondary school.',
    'education',
    isIn('education.degree', ['upperSecondary', 'diploma', 'bachelor', 'master']),
  ],
  [
    'diploma',
    'Qualified',
    'Earn a diploma or higher.',
    'education',
    isIn('education.degree', ['diploma', 'bachelor', 'master']),
  ],
  [
    'graduate',
    'Graduate',
    'Earn a bachelor’s degree.',
    'education',
    isIn('education.degree', ['bachelor', 'master']),
  ],
  [
    'master',
    'Master',
    'Earn a master’s degree.',
    'education',
    cmp('education.degree', 'eq', 'master'),
  ],
  ['joiner', 'Joiner', 'Join a club.', 'education', atLeast('clubs.count', 1)],
  [
    'club-hopper',
    'Club hopper',
    'Belong to three clubs at once.',
    'education',
    atLeast('clubs.count', 3),
  ],
  [
    'top-of-class',
    'Top of the class',
    'Reach a grade of 90 at school.',
    'education',
    atLeast('school.grade', 900),
  ],
  // Career
  ['first-job', 'First pay cheque', 'Get a job.', 'career', cmp('job.employed', 'eq', true)],
  [
    'job-hopper',
    'Career explorer',
    'Hold five different jobs.',
    'career',
    atLeast('career.jobs', 5),
  ],
  ['senior', 'Senior', 'Reach a senior role.', 'career', atLeast('job.level', 3)],
  [
    'top-of-the-ladder',
    'Top of the ladder',
    'Reach the highest level in a job.',
    'career',
    atLeast('job.level', 4),
  ],
  [
    'star-performer',
    'Star performer',
    'Reach 90 performance at work.',
    'career',
    atLeast('job.performance', 900),
  ],
  [
    'long-service',
    'Long service',
    'Stay ten years with one employer.',
    'career',
    atLeast('job.tenure', 120),
  ],
  // Money
  [
    'saver',
    'Saver',
    'Save six months of the median wage.',
    'money',
    atLeast('money.savingsMonths', 6),
  ],
  [
    'nest-egg',
    'Nest egg',
    'Save two years of the median wage.',
    'money',
    atLeast('money.savingsMonths', 24),
  ],
  [
    'in-the-black',
    'In the black',
    'Build a net worth of a year’s median wage.',
    'money',
    atLeast('money.netWorthMonths', 12),
  ],
  [
    'comfortable',
    'Comfortable',
    'Build a net worth of ten years’ median wage.',
    'money',
    atLeast('money.netWorthMonths', 120),
  ],
  [
    'wealthy',
    'Wealthy',
    'Build a net worth of fifty years’ median wage.',
    'money',
    atLeast('money.netWorthMonths', 600),
  ],
  [
    'fortune',
    'A fortune',
    'Build a net worth of 250 years’ median wage.',
    'money',
    atLeast('money.netWorthMonths', 3000),
  ],
  [
    'debt-free',
    'Debt free',
    'Reach thirty without any debt.',
    'money',
    all(atLeast('age.years', 30), cmp('money.inDebt', 'eq', false)),
  ],
  // Business and property
  [
    'entrepreneur',
    'Entrepreneur',
    'Start or own a company.',
    'enterprise',
    atLeast('business.count', 1),
  ],
  [
    'serial-entrepreneur',
    'Serial entrepreneur',
    'Own three companies at once.',
    'enterprise',
    atLeast('business.count', 3),
  ],
  [
    'business-empire',
    'Business empire',
    'Own five companies at once.',
    'enterprise',
    atLeast('business.count', 5),
  ],
  ['homeowner', 'Homeowner', 'Live in a home you own.', 'enterprise', cmp('home.own', 'eq', true)],
  [
    'landlord',
    'Landlord',
    'Let a property to a tenant.',
    'enterprise',
    atLeast('property.rentals', 1),
  ],
  [
    'portfolio',
    'Property portfolio',
    'Own three properties.',
    'enterprise',
    atLeast('property.count', 3),
  ],
  [
    'property-baron',
    'Property baron',
    'Own six properties.',
    'enterprise',
    atLeast('property.count', 6),
  ],
  // World
  ['abroad', 'Abroad', 'Live in a second country.', 'world', atLeast('civic.countriesLived', 2)],
  ['nomad', 'Nomad', 'Live in four countries.', 'world', atLeast('civic.countriesLived', 4)],
  [
    'dual-citizen',
    'Dual citizen',
    'Hold two citizenships.',
    'world',
    atLeast('civic.citizenships', 2),
  ],
  [
    'citizen-of-the-world',
    'Citizen of the world',
    'Hold three citizenships.',
    'world',
    atLeast('civic.citizenships', 3),
  ],
  [
    'new-beginnings',
    'New beginnings',
    'Start a new life in another country.',
    'world',
    cmp('civic.newcomer', 'eq', true),
  ],
  // Civic life
  ['voter', 'Civic duty', 'Vote in an election.', 'civic', cmp('flags.voted', 'eq', true)],
  [
    'activist',
    'Activist',
    'Organise a local campaign.',
    'civic',
    cmp('flags.activist', 'eq', true),
  ],
  [
    'public-servant',
    'Public servant',
    'Hold public office.',
    'civic',
    cmp('civic.office', 'ne', 'none'),
  ],
  [
    'lawmaker',
    'Lawmaker',
    'Sit in the national legislature.',
    'civic',
    cmp('civic.office', 'eq', 'legislature'),
  ],
  [
    'head-of-government',
    'Head of government',
    'Lead the country.',
    'civic',
    cmp('civic.office', 'eq', 'leader'),
  ],
  [
    'candidate',
    'Throwing your hat in',
    'Run for office or seek an appointment.',
    'civic',
    cmp('civic.candidate', 'eq', true),
  ],
  [
    'in-uniform',
    'In uniform',
    'Serve in the armed forces or national service.',
    'civic',
    cmp('civic.serving', 'eq', true),
  ],
  ['veteran', 'Veteran', 'Complete military service.', 'civic', cmp('civic.veteran', 'eq', true)],
  [
    'public-duty',
    'Public duty',
    'Take up royal or noble duties.',
    'civic',
    isIn('civic.duty', ['royal', 'noble']),
  ],
  [
    'devout',
    'Devoted',
    'Take part devoutly in a faith.',
    'civic',
    cmp('civic.participation', 'eq', 'devout'),
  ],
  ['risk-taker', 'Risk taker', 'Accept a dare.', 'civic', cmp('flags.dare.accepted', 'eq', true)],
  // Media
  [
    'posting',
    'Hello, world',
    'Open a social media account.',
    'media',
    atLeast('media.profiles', 1),
  ],
  [
    'multi-platform',
    'Everywhere at once',
    'Run accounts on all three platforms.',
    'media',
    atLeast('media.profiles', 3),
  ],
  [
    'thousand-followers',
    'A thousand followers',
    'Reach 1,000 followers.',
    'media',
    atLeast('media.followers', 1_000),
  ],
  [
    'influencer',
    'Influencer',
    'Reach 10,000 followers.',
    'media',
    atLeast('media.followers', 10_000),
  ],
  ['star', 'Star', 'Reach 100,000 followers.', 'media', atLeast('media.followers', 100_000)],
  [
    'megastar',
    'Megastar',
    'Reach a million followers.',
    'media',
    atLeast('media.followers', 1_000_000),
  ],
  // Legacy
  [
    'second-generation',
    'The next generation',
    'Play as a second generation.',
    'legacy',
    atLeast('legacy.generation', 2),
  ],
  [
    'third-generation',
    'Three generations',
    'Play as a third generation.',
    'legacy',
    atLeast('legacy.generation', 3),
  ],
  [
    'fifth-generation',
    'Five generations',
    'Play as a fifth generation.',
    'legacy',
    atLeast('legacy.generation', 5),
  ],
  [
    'tenth-generation',
    'A dynasty',
    'Play as a tenth generation.',
    'legacy',
    atLeast('legacy.generation', 10),
  ],
  ['heir', 'Inheritance', 'Inherit from a relative.', 'legacy', atLeast('legacy.inherited', 1)],
  ['last-will', 'Last will', 'Make a will.', 'legacy', cmp('legacy.hasWill', 'eq', true)],
  [
    'completionist',
    'Completionist',
    'Unlock fifty achievements on one timeline.',
    'legacy',
    atLeast('achievements.count', 50),
  ],
];

export const ACHIEVEMENTS: readonly Achievement[] = ROWS.map(
  ([id, title, description, category, when]) => ({
    id,
    title,
    description,
    category,
    when,
  }),
);

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function findAchievement(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

/** Checks the player against every locked achievement (once a month and after a switch). */
export function checkAchievements(world: World): string[] {
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null) return [];
  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (world.achievements[a.id]) continue;
    if (!evaluate(a.when, world, c)) continue;
    world.achievements[a.id] = {
      achievementId: a.id,
      characterId: c.id,
      tick: world.tick,
      generation:
        world.legacy.lineage.find((l) => l.characterId === c.id)?.generation ??
        world.legacy.generation,
    };
    unlocked.push(a.id);
    addNotification(
      world,
      'achievement',
      'ntf.achievement',
      { achievement: a.title },
      'achievements',
    );
    addBiography(world, c.id, 'achievement', 'bio.achievement', { achievement: a.title });
  }
  return unlocked;
}
