import { NEED_KEYS, SKILL_KEYS, STAT_KEYS } from '../state/schema';
import type { EventDefinition } from '../events/schema';

/**
 * Building blocks for the visual event editor (spec §7): the facts a condition can test, the
 * effects an editor row can produce, and templates. Everything maps onto the same validated
 * declarative schema as built-in content.
 */

export interface EditorFact {
  fact: string;
  label: string;
  type: 'number' | 'boolean' | 'string';
  /** Values shown 0-100 to players are stored in tenths (0-1000). */
  scale: 1 | 10;
  options?: readonly string[];
}

export const EDITOR_FACTS: readonly EditorFact[] = [
  ...STAT_KEYS.map((k) => ({
    fact: `stats.${k}`,
    label: `Stat: ${k}`,
    type: 'number' as const,
    scale: 10 as const,
  })),
  ...SKILL_KEYS.map((k) => ({
    fact: `skills.${k}`,
    label: `Skill: ${k}`,
    type: 'number' as const,
    scale: 10 as const,
  })),
  ...NEED_KEYS.map((k) => ({
    fact: `needs.${k}`,
    label: `Need: ${k}`,
    type: 'number' as const,
    scale: 10 as const,
  })),
  {
    fact: 'gender',
    label: 'Gender',
    type: 'string',
    scale: 1,
    options: ['female', 'male', 'nonbinary'],
  },
  { fact: 'country', label: 'Country code', type: 'string', scale: 1 },
  {
    fact: 'wealth',
    label: 'Family wealth',
    type: 'string',
    scale: 1,
    options: ['low', 'lower-middle', 'middle', 'upper-middle', 'wealthy', 'very-wealthy', 'royal'],
  },
  {
    fact: 'school.stage',
    label: 'School stage',
    type: 'string',
    scale: 1,
    options: ['none', 'preschool', 'primary', 'lowerSecondary', 'upperSecondary', 'tertiary'],
  },
  { fact: 'job.employed', label: 'Has a job', type: 'boolean', scale: 1 },
  { fact: 'job.level', label: 'Job level (0-4)', type: 'number', scale: 1 },
  {
    fact: 'money.savingsMonths',
    label: 'Savings (months of median wage)',
    type: 'number',
    scale: 1,
  },
  {
    fact: 'money.netWorthMonths',
    label: 'Net worth (months of median wage)',
    type: 'number',
    scale: 1,
  },
  { fact: 'money.inDebt', label: 'In debt', type: 'boolean', scale: 1 },
  { fact: 'social.friends', label: 'Number of friends', type: 'number', scale: 1 },
  { fact: 'social.partnered', label: 'Has a partner', type: 'boolean', scale: 1 },
  { fact: 'social.married', label: 'Married', type: 'boolean', scale: 1 },
  { fact: 'social.children', label: 'Number of children', type: 'number', scale: 1 },
  { fact: 'home.own', label: 'Owns their home', type: 'boolean', scale: 1 },
  { fact: 'business.count', label: 'Companies owned', type: 'number', scale: 1 },
  { fact: 'property.count', label: 'Properties owned', type: 'number', scale: 1 },
  { fact: 'civic.religion', label: 'Religion', type: 'string', scale: 1 },
  { fact: 'civic.serving', label: 'In military service', type: 'boolean', scale: 1 },
  {
    fact: 'civic.office',
    label: 'Public office',
    type: 'string',
    scale: 1,
    options: ['none', 'local', 'legislature', 'leader'],
  },
  { fact: 'media.followers', label: 'Social media followers', type: 'number', scale: 1 },
  { fact: 'legacy.generation', label: 'Generation', type: 'number', scale: 1 },
  { fact: 'economy.cycle', label: 'Economy (-1000 slump to 1000 boom)', type: 'number', scale: 1 },
];

export const EDITOR_EFFECTS = [
  'stat',
  'need',
  'skill',
  'money',
  'medical',
  'flag',
  'condition',
  'schedule',
] as const;
export type EditorEffectKind = (typeof EDITOR_EFFECTS)[number];

export function blankEvent(id: string): EventDefinition {
  return {
    id,
    version: 1,
    category: 'adult',
    scheduledOnly: false,
    when: { kind: 'all', of: [{ kind: 'cmp', fact: 'age.years', op: 'gte', value: 18 }] },
    subject: null,
    asset: null,
    chancePpm: 10_000,
    multipliers: [],
    cooldownMonths: 12,
    maxOccurrences: null,
    exclusiveGroup: null,
    effects: [],
    choices: [
      { id: 'yes', requires: null, effects: [{ kind: 'stat', key: 'happiness', delta: 20 }] },
      { id: 'no', requires: null, effects: [] },
    ],
    text: {
      en: {
        title: 'A new event',
        body: 'Describe what happens.',
        choices: { yes: 'Go for it', no: 'Not this time' },
        outcomes: { yes: 'It went well.', no: 'You let it pass.' },
      },
    },
  };
}

export function blankPack(): {
  format: 'welife-pack';
  formatVersion: 1;
  id: string;
  name: string;
  packVersion: string;
  mode: 'player' | 'developer';
  author: string;
  description: string;
  events: EventDefinition[];
  scenarios: never[];
} {
  return {
    format: 'welife-pack',
    formatVersion: 1,
    id: 'my-pack',
    name: 'My pack',
    packVersion: '1.0.0',
    mode: 'player',
    author: '',
    description: '',
    events: [blankEvent('my-first-event')],
    scenarios: [],
  };
}

/** Increments the patch number of a version like 1.2.3. */
export function bumpVersion(version: string): string {
  const parts = version.split('.').map((x) => Number.parseInt(x, 10));
  if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) return '1.0.0';
  return `${String(parts[0])}.${String(parts[1])}.${String((parts[2] ?? 0) + 1)}`;
}
