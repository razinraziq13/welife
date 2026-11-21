import type { InterestKey, SkillKey, StatKey } from '../state/schema';

/**
 * Education content: tertiary programmes and clubs (spec §1 "full childhood education,
 * hobbies, competitions, scholarships"). Numbers are PROPOSED TUNING.
 */

export const PROGRAM_LEVELS = ['diploma', 'bachelor', 'master'] as const;
export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];

export interface ProgramDefinition {
  id: string;
  name: string;
  /** Admission threshold before competition (fixed-point tenths). */
  selectivity: number;
  /** Skills that count for admission and grow while studying. */
  skills: readonly SkillKey[];
  levels: readonly ProgramLevel[];
  /** Overrides the country's usual bachelor length (e.g. medicine). */
  bachelorYears: number | null;
}

export const PROGRAMS: readonly ProgramDefinition[] = [
  {
    id: 'computing',
    name: 'Computer science',
    selectivity: 600,
    skills: ['technology', 'logic'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'engineering',
    name: 'Engineering',
    selectivity: 620,
    skills: ['science', 'logic'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'medicine',
    name: 'Medicine',
    selectivity: 820,
    skills: ['science', 'care'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: 6,
  },
  {
    id: 'nursing',
    name: 'Nursing',
    selectivity: 520,
    skills: ['care', 'science'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'law',
    name: 'Law',
    selectivity: 700,
    skills: ['reading', 'logic'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'business',
    name: 'Business administration',
    selectivity: 500,
    skills: ['business', 'logic'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'economics',
    name: 'Economics and finance',
    selectivity: 600,
    skills: ['logic', 'business'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'education',
    name: 'Education (teaching)',
    selectivity: 480,
    skills: ['reading', 'care'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'arts',
    name: 'Fine arts and music',
    selectivity: 450,
    skills: ['art', 'music'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'design',
    name: 'Design',
    selectivity: 480,
    skills: ['art', 'technology'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'media',
    name: 'Media and communication',
    selectivity: 480,
    skills: ['reading', 'socializing'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'sciences',
    name: 'Natural sciences',
    selectivity: 580,
    skills: ['science', 'logic'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'humanities',
    name: 'Humanities',
    selectivity: 450,
    skills: ['reading'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'hospitality',
    name: 'Hospitality and tourism',
    selectivity: 400,
    skills: ['socializing', 'business'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'trades',
    name: 'Skilled trades (vocational)',
    selectivity: 300,
    skills: ['craft'],
    levels: ['diploma'],
    bachelorYears: null,
  },
  {
    id: 'agriculture',
    name: 'Agriculture',
    selectivity: 420,
    skills: ['science', 'craft'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'sport',
    name: 'Sport and exercise science',
    selectivity: 480,
    skills: ['fitness', 'science'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'architecture',
    name: 'Architecture',
    selectivity: 680,
    skills: ['art', 'logic'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'psychology',
    name: 'Psychology',
    selectivity: 600,
    skills: ['care', 'science'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
  {
    id: 'socialwork',
    name: 'Social work',
    selectivity: 450,
    skills: ['care', 'socializing'],
    levels: ['diploma', 'bachelor', 'master'],
    bachelorYears: null,
  },
];

const PROGRAM_BY_ID = new Map(PROGRAMS.map((p) => [p.id, p]));

export function findProgram(id: string): ProgramDefinition | undefined {
  return PROGRAM_BY_ID.get(id);
}

export function getProgram(id: string): ProgramDefinition {
  const program = PROGRAM_BY_ID.get(id);
  if (!program) throw new Error(`Unknown programme ${id}`);
  return program;
}

/** Countries where a first degree usually takes four years. */
const FOUR_YEAR_BACHELOR = new Set([
  'US',
  'CA',
  'JP',
  'KR',
  'CN',
  'ID',
  'TH',
  'BR',
  'SA',
  'AE',
  'SG',
  'MY',
]);

export function programYears(
  program: ProgramDefinition,
  level: ProgramLevel,
  countryCode: string,
): number {
  if (level === 'diploma') return 2;
  if (level === 'master') return countryCode === 'GB' ? 1 : 2;
  if (program.bachelorYears !== null)
    return countryCode === 'GB' ? program.bachelorYears - 1 : program.bachelorYears;
  return FOUR_YEAR_BACHELOR.has(countryCode) ? 4 : 3;
}

export interface ClubDefinition {
  id: string;
  name: string;
  minAge: number;
  /** Null: open to adults too (community clubs). */
  maxAge: number | null;
  hours: number;
  /** Monthly fee, percent of the median monthly wage. */
  feePercent: number;
  skills: readonly { key: SkillKey; gain: number }[];
  stats: readonly { key: StatKey; gain: number }[];
  interest: InterestKey | null;
  /** Yearly competition, held this many months after the school year starts. */
  competition: { name: string; monthOffset: number; skill: SkillKey } | null;
}

export const CLUBS: readonly ClubDefinition[] = [
  {
    id: 'football',
    name: 'Football team',
    minAge: 6,
    maxAge: null,
    hours: 12,
    feePercent: 2,
    skills: [
      { key: 'fitness', gain: 12 },
      { key: 'socializing', gain: 5 },
    ],
    stats: [{ key: 'health', gain: 6 }],
    interest: 'sports',
    competition: { name: 'League final', monthOffset: 8, skill: 'fitness' },
  },
  {
    id: 'swimming',
    name: 'Swim squad',
    minAge: 6,
    maxAge: null,
    hours: 10,
    feePercent: 3,
    skills: [{ key: 'fitness', gain: 14 }],
    stats: [{ key: 'health', gain: 8 }],
    interest: 'sports',
    competition: { name: 'Swimming gala', monthOffset: 5, skill: 'fitness' },
  },
  {
    id: 'choir',
    name: 'Choir',
    minAge: 6,
    maxAge: null,
    hours: 8,
    feePercent: 1,
    skills: [
      { key: 'music', gain: 12 },
      { key: 'socializing', gain: 4 },
    ],
    stats: [{ key: 'happiness', gain: 4 }],
    interest: 'music',
    competition: { name: 'Choir festival', monthOffset: 10, skill: 'music' },
  },
  {
    id: 'band',
    name: 'Band',
    minAge: 9,
    maxAge: 25,
    hours: 10,
    feePercent: 2,
    skills: [{ key: 'music', gain: 15 }],
    stats: [{ key: 'discipline', gain: 4 }],
    interest: 'music',
    competition: { name: 'Band competition', monthOffset: 7, skill: 'music' },
  },
  {
    id: 'art',
    name: 'Art club',
    minAge: 6,
    maxAge: null,
    hours: 8,
    feePercent: 2,
    skills: [{ key: 'art', gain: 14 }],
    stats: [{ key: 'creativity', gain: 6 }],
    interest: 'art',
    competition: { name: 'Art exhibition', monthOffset: 9, skill: 'art' },
  },
  {
    id: 'chess',
    name: 'Chess club',
    minAge: 7,
    maxAge: null,
    hours: 8,
    feePercent: 1,
    skills: [{ key: 'logic', gain: 15 }],
    stats: [{ key: 'intelligence', gain: 4 }],
    interest: 'games',
    competition: { name: 'Chess tournament', monthOffset: 4, skill: 'logic' },
  },
  {
    id: 'debate',
    name: 'Debate society',
    minAge: 11,
    maxAge: 25,
    hours: 10,
    feePercent: 1,
    skills: [
      { key: 'reading', gain: 8 },
      { key: 'socializing', gain: 8 },
      { key: 'leadership', gain: 4 },
    ],
    stats: [{ key: 'confidence', gain: 6 }],
    interest: 'books',
    competition: { name: 'Debate championship', monthOffset: 6, skill: 'socializing' },
  },
  {
    id: 'science',
    name: 'Science club',
    minAge: 9,
    maxAge: 25,
    hours: 8,
    feePercent: 1,
    skills: [
      { key: 'science', gain: 15 },
      { key: 'logic', gain: 5 },
    ],
    stats: [],
    interest: 'science',
    competition: { name: 'Science fair', monthOffset: 7, skill: 'science' },
  },
  {
    id: 'robotics',
    name: 'Robotics and coding club',
    minAge: 10,
    maxAge: 25,
    hours: 10,
    feePercent: 3,
    skills: [
      { key: 'technology', gain: 15 },
      { key: 'craft', gain: 5 },
    ],
    stats: [],
    interest: 'technology',
    competition: { name: 'Robotics competition', monthOffset: 9, skill: 'technology' },
  },
  {
    id: 'drama',
    name: 'Drama club',
    minAge: 8,
    maxAge: null,
    hours: 10,
    feePercent: 1,
    skills: [
      { key: 'socializing', gain: 8 },
      { key: 'art', gain: 6 },
    ],
    stats: [{ key: 'confidence', gain: 8 }],
    interest: 'film',
    competition: { name: 'Drama festival', monthOffset: 10, skill: 'socializing' },
  },
  {
    id: 'scouts',
    name: 'Scouts and guides',
    minAge: 7,
    maxAge: 18,
    hours: 8,
    feePercent: 1,
    skills: [
      { key: 'care', gain: 6 },
      { key: 'leadership', gain: 8 },
      { key: 'craft', gain: 4 },
    ],
    stats: [{ key: 'health', gain: 4 }],
    interest: 'nature',
    competition: { name: 'Badge challenge', monthOffset: 6, skill: 'leadership' },
  },
  {
    id: 'volunteering',
    name: 'Volunteering group',
    minAge: 12,
    maxAge: null,
    hours: 8,
    feePercent: 0,
    skills: [
      { key: 'care', gain: 15 },
      { key: 'leadership', gain: 3 },
    ],
    stats: [{ key: 'happiness', gain: 6 }],
    interest: 'nature',
    competition: null,
  },
  {
    id: 'student-council',
    name: 'Student council',
    minAge: 12,
    maxAge: 25,
    hours: 8,
    feePercent: 0,
    skills: [
      { key: 'leadership', gain: 15 },
      { key: 'socializing', gain: 6 },
    ],
    stats: [{ key: 'reputation', gain: 6 }],
    interest: null,
    competition: null,
  },
  {
    id: 'book-club',
    name: 'Book club',
    minAge: 14,
    maxAge: null,
    hours: 6,
    feePercent: 0,
    skills: [{ key: 'reading', gain: 12 }],
    stats: [{ key: 'happiness', gain: 3 }],
    interest: 'books',
    competition: null,
  },
];

const CLUB_BY_ID = new Map(CLUBS.map((c) => [c.id, c]));

export function findClub(id: string): ClubDefinition | undefined {
  return CLUB_BY_ID.get(id);
}

export function getClub(id: string): ClubDefinition {
  const club = CLUB_BY_ID.get(id);
  if (!club) throw new Error(`Unknown club ${id}`);
  return club;
}

/** Gains shrink as a skill approaches its maximum (harder to improve at the top). */
export function scaledGain(gain: number, current: number): number {
  return Math.trunc((gain * (1000 - current)) / 1000);
}

/** Deterministic two-module semester catalogue. The parent programme ID never changes
 * across diploma, bachelor's and master's qualifications. All modules are fictional. */
export interface SemesterModule {
  id: string;
  name: string;
  skill: SkillKey;
  credits: number;
}
const MODULE_TOPICS: Partial<Record<SkillKey, readonly string[]>> = {
  technology: ['Computing Foundations', 'Software Design', 'Digital Systems', 'Applied Computing'],
  logic: ['Analytical Reasoning', 'Problem Solving', 'Methods and Models', 'Advanced Analysis'],
  science: ['Scientific Foundations', 'Laboratory Reasoning', 'Research Methods', 'Applied Science'],
  reading: ['Academic Communication', 'Critical Reading', 'Evidence and Argument', 'Literature Review'],
  business: ['Business Foundations', 'Operations', 'Finance and Strategy', 'Organizational Studies'],
  art: ['Design Principles', 'Creative Practice', 'Portfolio Development', 'Studio Research'],
  music: ['Music Theory', 'Composition', 'Performance Studies', 'Music Research'],
  care: ['Professional Practice', 'Community Needs', 'Care Coordination', 'Ethical Practice'],
  socializing: ['Communication', 'Group Dynamics', 'Collaboration', 'Professional Relations'],
  fitness: ['Movement Science', 'Coaching', 'Performance Analysis', 'Sport Research'],
  craft: ['Practical Methods', 'Technical Workshop', 'Project Practice', 'Applied Techniques'],
  leadership: ['Team Leadership', 'Organizational Practice', 'Project Coordination', 'Strategic Leadership'],
};
export function semesterModules(programId: string, level: ProgramLevel, semester: number): SemesterModule[] {
  const program = getProgram(programId);
  const tier = level === 'diploma' ? 'Foundations' : level === 'bachelor' ? 'Applied' : 'Advanced';
  return [0, 1].map((slot) => {
    const key = program.skills[(semester * 2 + slot) % program.skills.length] ?? 'reading';
    const titles = MODULE_TOPICS[key] ?? ['Professional Studies'];
    const name = titles[(semester - 1 + slot) % titles.length] ?? 'Professional Studies';
    return { id: `${programId}:${level}:${semester}:${slot}`, name: `${tier} ${name}`, skill: key, credits: 12 };
  });
}
