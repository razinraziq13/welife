import type { Effect, EventDefinition, Predicate, Subject, SubjectRole } from '../../events/schema';

/**
 * Small helpers for writing built-in events as plain data. They only build objects; every
 * event is validated against the schema when content loads.
 *
 * Writing rules: non-graphic, no instructions for harmful acts, neutral tone; adult
 * relationship content only between adults and never explicit (decisions D6, D9).
 */

export type EventInput = Partial<EventDefinition> &
  Pick<EventDefinition, 'id' | 'category' | 'when' | 'text'>;

export function define(input: EventInput): EventDefinition {
  return {
    version: 1,
    scheduledOnly: false,
    subject: null,
    chancePpm: 0,
    multipliers: [],
    cooldownMonths: 0,
    maxOccurrences: null,
    exclusiveGroup: null,
    effects: [],
    choices: [],
    ...input,
  };
}

export const cmp = (
  fact: string,
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte',
  value: string | number | boolean,
): Predicate => ({ kind: 'cmp', fact, op, value });
export const all = (...of: Predicate[]): Predicate => ({ kind: 'all', of });
export const any = (...of: Predicate[]): Predicate => ({ kind: 'any', of });
export const not = (of: Predicate): Predicate => ({ kind: 'not', of });
export const isIn = (fact: string, values: (string | number)[]): Predicate => ({
  kind: 'in',
  fact,
  values,
});
export const ageYears = (min: number, max?: number): Predicate =>
  max === undefined
    ? cmp('age.years', 'gte', min)
    : all(cmp('age.years', 'gte', min), cmp('age.years', 'lte', max));
export const atSchool = isIn('school.stage', ['primary', 'lowerSecondary', 'upperSecondary']);
export const studying = isIn('school.stage', [
  'primary',
  'lowerSecondary',
  'upperSecondary',
  'tertiary',
]);
export const employed = cmp('job.employed', 'eq', true);
export const partnered = cmp('social.partnered', 'eq', true);

export function subject(role: SubjectRole, options: Partial<Omit<Subject, 'role'>> = {}): Subject {
  return {
    role,
    minCloseness: options.minCloseness ?? 0,
    maxCloseness: options.maxCloseness ?? 100,
    minAge: options.minAge ?? 0,
    maxAge: options.maxAge ?? 120,
    memory: options.memory ?? null,
  };
}

type StatKey = Extract<Effect, { kind: 'stat' }>['key'];
type NeedKey = Extract<Effect, { kind: 'need' }>['key'];
type SkillKey = Extract<Effect, { kind: 'skill' }>['key'];

export const stat = (key: StatKey, delta: number): Effect => ({ kind: 'stat', key, delta });
export const need = (key: NeedKey, delta: number): Effect => ({ kind: 'need', key, delta });
export const skill = (key: SkillKey, delta: number): Effect => ({ kind: 'skill', key, delta });
export const flag = (name: string, value = true): Effect => ({ kind: 'flag', flag: name, value });
export const family = (
  who: 'parents' | 'siblings' | 'friends' | 'partner',
  closeness: number,
): Effect => ({
  kind: 'relationship',
  with: who,
  closeness,
});
export const bond = (closeness: number, trust = 0, respect = 0, conflict = 0): Effect => ({
  kind: 'subjectRelationship',
  closeness,
  trust,
  respect,
  conflict,
});
export const befriend: Effect = { kind: 'subjectFriend' };
/** The subject remembers this about the player. */
export const theyRemember = (
  key: string,
  valence: number,
  salience: number,
  decay: 'fast' | 'slow' | 'permanent' = 'slow',
): Effect => ({
  kind: 'memory',
  owner: 'subject',
  key,
  valence,
  salience,
  decay,
});
/** The player remembers this about the subject. */
export const youRemember = (
  key: string,
  valence: number,
  salience: number,
  decay: 'fast' | 'slow' | 'permanent' = 'fast',
): Effect => ({
  kind: 'memory',
  owner: 'player',
  key,
  valence,
  salience,
  decay,
});
/** Money: percent of the local median monthly wage (negative = cost). */
export const money = (percent: number, category: string): Effect => ({
  kind: 'money',
  percent,
  category,
});
export const medical = (percent: number): Effect => ({ kind: 'medical', percent });
export const grade = (delta: number): Effect => ({ kind: 'grade', delta });
export const performance = (delta: number): Effect => ({ kind: 'performance', delta });
export const schedule = (
  eventId: string,
  inMonths: number,
  chancePercent = 100,
  keepSubject = false,
): Effect => ({
  kind: 'schedule',
  eventId,
  inMonths,
  chancePercent,
  keepSubject,
});

/** Text for an event without choices. */
export function auto(title: string, body: string, outcome: string): EventDefinition['text'] {
  return { en: { title, body, choices: {}, outcomes: { default: outcome } } };
}

/** Text for an event with choices: [id, label, outcome][] */
export function decide(
  title: string,
  body: string,
  options: [string, string, string][],
): EventDefinition['text'] {
  const choices: Record<string, string> = {};
  const outcomes: Record<string, string> = {};
  for (const [id, label, outcome] of options) {
    choices[id] = label;
    outcomes[id] = outcome;
  }
  return { en: { title, body, choices, outcomes } };
}
