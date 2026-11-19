/**
 * English UI strings. Every player-facing string the engine produces is a key with
 * parameters, resolved here, so the game is ready for other languages (spec §1, P-10).
 * Event texts live with their event definitions (`text.en`).
 */
import { enCivic } from './en-civic';
import { enLegacy } from './en-legacy';
import { enErrors } from './en-errors';
import { enEnterprise } from './en-enterprise';
import { enLife } from './en-life';

const base: Record<string, string> = {
  // Stats, needs, skills, habits
  'stat.health': 'Health',
  'stat.happiness': 'Happiness',
  'stat.intelligence': 'Intelligence',
  'stat.energy': 'Energy',
  'stat.stress': 'Stress',
  'stat.socialSkill': 'Social skill',
  'stat.discipline': 'Discipline',
  'stat.reputation': 'Reputation',
  'stat.confidence': 'Confidence',
  'stat.creativity': 'Creativity',
  'need.rest': 'Rest',
  'need.nutrition': 'Nutrition',
  'need.social': 'Company',
  'need.leisure': 'Fun',
  'skill.reading': 'Reading',
  'skill.logic': 'Logic',
  'skill.fitness': 'Fitness',
  'skill.music': 'Music',
  'skill.art': 'Art',
  'skill.socializing': 'Socializing',
  'habit.exercise': 'Exercise routine',
  'habit.reading': 'Reading habit',
  'habit.sleepRoutine': 'Sleep routine',
  'habit.creativePractice': 'Creative practice',

  // Life stages
  'stage.baby': 'Baby',
  'stage.toddler': 'Toddler',
  'stage.child': 'Child',
  'stage.teen': 'Teenager',
  'stage.youngAdult': 'Young adult',
  'stage.adult': 'Adult',
  'stage.middleAge': 'Middle age',
  'stage.senior': 'Senior',

  // Wealth and family
  'wealth.low': 'Low income',
  'wealth.lower-middle': 'Lower-middle income',
  'wealth.middle': 'Middle income',
  'wealth.upper-middle': 'Upper-middle income',
  'wealth.wealthy': 'Wealthy',
  'wealth.very-wealthy': 'Very wealthy',
  'wealth.royal': 'Royal household',
  'relation.parent': 'Parent',
  'relation.child': 'Child',
  'relation.sibling': 'Sibling',
  'trade.restaurants': 'restaurant group',
  'trade.textiles': 'textile company',
  'trade.logistics': 'logistics firm',
  'trade.construction': 'construction company',
  'trade.hotels': 'hotel group',
  'trade.electronics': 'electronics distributor',

  // Scenarios
  'scenario.royal': 'Royal family',
  'scenario.royal.desc':
    'Born into a fictional branch of a real royal institution, with duties and expectations.',
  'scenario.noble': 'Noble family',
  'scenario.noble.desc':
    'An old family with a hereditary title or name, heritage and social standing.',
  'scenario.wealthy': 'Wealthy family',
  'scenario.wealthy.desc': 'Comfortable from day one, with high expectations attached.',
  'scenario.middle': 'Middle-class family',
  'scenario.middle.desc': 'A stable, ordinary start with two working parents.',
  'scenario.lowIncome': 'Low-income family',
  'scenario.lowIncome.desc': 'Money is tight, and every opportunity counts.',
  'scenario.immigrant': 'Immigrant family',
  'scenario.immigrant.desc': 'Your parents moved here from another country before you were born.',
  'scenario.singleParent': 'Single parent',
  'scenario.singleParent.desc': 'Raised by one devoted parent.',
  'scenario.adopted': 'Adopted',
  'scenario.adopted.desc': 'Adopted at birth by a loving family.',
  'scenario.political': 'Political family',
  'scenario.political.desc': 'Your family is active in public life, and people know your surname.',
  'scenario.businessHeir': 'Family business heir',
  'scenario.businessHeir.desc': 'Your family runs a business that may one day be yours.',
  'scenario.rural': 'Rural family',
  'scenario.rural.desc': 'Grow up in the countryside, far from the big cities.',
  'scenario.random': 'Surprise me',
  'scenario.random.desc': 'A random scenario that is available in your chosen country.',
  'scenario.unavailable.royal': 'Royal births are not offered here.',
  'scenario.unavailable.noble': 'There is no hereditary nobility to be born into here.',
  'scenario.unavailable.rural': 'This country has no rural areas in the game.',

  // Difficulty
  'difficulty.casual': 'Casual',
  'difficulty.casual.desc': 'More free time, lower energy costs and gentler health risks.',
  'difficulty.realistic': 'Realistic',
  'difficulty.realistic.desc': 'Standard time, energy and risks.',
  'difficulty.challenging': 'Challenging',
  'difficulty.challenging.desc': 'Less free time each month; every choice matters more.',

  // Activities
  'activity.play-toys': 'Play with toys',
  'activity.family-time': 'Spend time with family',
  'activity.rest-well': 'Rest well',
  'activity.play-outside': 'Play outside',
  'activity.read': 'Read',
  'activity.draw-paint': 'Draw and paint',
  'activity.puzzles': 'Solve puzzles',
  'activity.exercise': 'Exercise',
  'activity.practice-music': 'Practise music',
  'activity.socialize': 'See friends',
  'activity.meditate': 'Meditate',
  'activityCategory.play': 'Play',
  'activityCategory.learn': 'Learning',
  'activityCategory.health': 'Health',
  'activityCategory.creative': 'Creative',
  'activityCategory.social': 'Social',
  'activityCategory.rest': 'Rest',
  'activityStatus.done': 'Done.',
  'activityStatus.tired': 'You were tired, so it did less good than usual.',
  'activityStatus.no-time': 'No free time left this month.',
  'activityStatus.too-young': 'Too young for this yet.',
  'activityStatus.too-old': 'You have outgrown this.',
  'activityStatus.unknown': 'Unknown activity.',
  'activityStatus.life-ended': 'This life has ended.',

  // Biography
  'bio.born': 'Born in {location}, {country}.',
  'bio.scenario.royal': 'Born into a branch of a royal family.',
  'bio.scenario.noble': 'Born into a noble family.',
  'bio.scenario.wealthy': 'Born into a wealthy family.',
  'bio.scenario.middle': 'Born into a middle-class family.',
  'bio.scenario.lowIncome': 'Born into a family on a low income.',
  'bio.scenario.immigrant': 'Born to parents who emigrated from {origin}.',
  'bio.scenario.singleParent': 'Born to a single parent.',
  'bio.scenario.adopted': 'Adopted at birth.',
  'bio.scenario.political': 'Born into a political family.',
  'bio.scenario.businessHeir': 'Born into the family behind a {trade}.',
  'bio.scenario.rural': 'Born into a rural family.',
  'bio.birthday': 'Turned {age}.',
  'bio.stage': 'Entered a new stage of life: {stageName}.',
  'bio.activity': '{activityName}.',
  'bio.died': 'Died at the age of {age} ({causeName}).',
  'bio.familyDeath': 'Lost {name}, a beloved {relationName}, aged {age}.',
  'bio.ruleChange': 'Changed the game rule "{ruleName}" to {valueName}.',
  'cause.natural': 'natural causes',
  'cause.illness': 'illness',
  'cause.accident': 'an accident',
  'rule.difficulty': 'Difficulty',
  'rule.easyMigration': 'Easy Migration',

  // Notifications
  'ntf.welcome': 'Welcome to the world, {name}!',
  'ntf.birthday': 'Happy birthday! You are now {age}.',
  'ntf.stage': 'A new chapter begins: {stageName}.',
  'ntf.event': '{eventTitle}',
  'ntf.lifeEnded': 'Your life has ended at the age of {age}.',
  'ntf.familyDeath': '{name} has died.',
  'notificationCategory.life': 'Life',
  'notificationCategory.event': 'Events',
  'notificationCategory.health': 'Health',
  'notificationCategory.family': 'Family',
  'notificationCategory.system': 'System',

  // Dashboard widgets
  'widget.profile': 'Profile',
  'widget.vitals': 'Vitals',
  'widget.time': 'This month',
  'widget.activities': 'Activities',
  'widget.feed': 'Life feed',
  'widget.needs': 'Needs',
  'widget.family': 'Family',
  'widget.country': 'Where you live',
};

export const en: Record<string, string> = {
  ...base,
  ...enLife,
  ...enEnterprise,
  ...enCivic,
  ...enLegacy,
  ...enErrors,
};

/** Resolves a key with `{param}` placeholders. Unknown keys fall back to the key itself. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}
