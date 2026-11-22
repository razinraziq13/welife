import { clamp, sortedKeys } from '../core/data';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { changeSkill, changeStat } from '../characters/stats';
import { catchUpSkills } from '../characters/factory';
import { getLocation } from '../world/countries';
import { getRules } from '../world/rules';
import { meetPeople, schoolCohort } from '../social/npcs';
import type {
  Character,
  EducationStage,
  Enrollment,
  SkillKey,
  StudyApplication,
  World,
} from '../state/schema';
import {
  CLUBS,
  findClub,
  findProgram,
  getClub,
  getProgram,
  programYears,
  semesterModules,
  scaledGain,
  type ProgramLevel,
} from './catalog';

/**
 * School and further education (spec §4 Education/career; §3.7): country-specific stages,
 * grades, report cards, exams, qualifications, clubs, competitions, applications and
 * scholarships. All numbers PROPOSED TUNING.
 */

const EFFORT_PERCENT = { relaxed: 60, steady: 100, focused: 140 } as const;
const EFFORT_GRADE = { relaxed: -60, steady: 0, focused: 70 } as const;
const EFFORT_STRESS = { relaxed: -4, steady: 4, focused: 12 } as const;

const STAGE_SKILLS: Record<
  Exclude<EducationStage, 'tertiary' | 'preschool'>,
  [SkillKey, number][]
> = {
  primary: [
    ['reading', 6],
    ['logic', 5],
    ['science', 2],
    ['art', 2],
    ['music', 1],
    ['fitness', 2],
    ['socializing', 2],
  ],
  lowerSecondary: [
    ['reading', 4],
    ['logic', 5],
    ['science', 5],
    ['technology', 2],
    ['fitness', 2],
    ['art', 1],
  ],
  upperSecondary: [
    ['reading', 4],
    ['logic', 5],
    ['science', 5],
    ['technology', 3],
    ['business', 2],
  ],
};

const NEXT_STAGE: Partial<Record<EducationStage, EducationStage>> = {
  preschool: 'primary',
  primary: 'lowerSecondary',
  lowerSecondary: 'upperSecondary',
};

export function stageRule(
  countryCode: string,
  stage: Exclude<EducationStage, 'preschool' | 'tertiary'>,
) {
  const rule = getRules(countryCode).education.stages.find((s) => s.stage === stage);
  if (!rule) throw new Error(`No ${stage} rule for ${countryCode}`);
  return rule;
}

/** Display name of a stage in the character's country. */
export function stageName(countryCode: string, stage: EducationStage): string {
  if (stage === 'preschool') return 'Preschool';
  if (stage === 'tertiary') return 'Further education';
  return stageRule(countryCode, stage).name;
}

function institutionName(
  world: World,
  c: Character,
  stage: EducationStage,
  kind: 'public' | 'private',
): string {
  const { location } = getLocation(c.locationId);
  const town = location.name.replace(/ countryside$/, '');
  const suffix: Record<EducationStage, string> = {
    preschool: 'Kindergarten',
    primary: 'Primary School',
    lowerSecondary: 'Secondary School',
    upperSecondary: 'High School',
    tertiary: kind === 'public' ? 'University' : 'Institute',
  };
  const flavour = withRng(world, 'school', (rng) =>
    rng.pick(
      kind === 'private'
        ? ['St. Clare', 'Westbrook', 'Riverside', 'Kingsway', 'Hillcrest']
        : ['Central', 'North', 'East', 'Park', 'Valley'],
    ),
  );
  return `${flavour} ${town} ${suffix[stage]}`;
}

/** Private schooling for upper-middle families and above (fees apply). */
function schoolKind(world: World, c: Character): 'public' | 'private' {
  const wealth = world.households[c.householdId]?.wealth ?? 'middle';
  return wealth === 'wealthy' || wealth === 'very-wealthy' || wealth === 'royal'
    ? 'private'
    : 'public';
}

function enroll(
  world: World,
  c: Character,
  stage: EducationStage,
  options: {
    programId?: string;
    level?: ProgramLevel;
    kind?: 'public' | 'private';
    scholarshipPercent?: number;
  } = {},
): Enrollment {
  const rules = getRules(c.countryCode).education;
  const kind = options.kind ?? schoolKind(world, c);
  let years = 1;
  if (stage === 'preschool') years = Math.max(1, rules.primaryStartAge - rules.preschoolAge);
  else if (stage === 'tertiary')
    years = programYears(
      getProgram(options.programId ?? 'business'),
      options.level ?? 'bachelor',
      c.countryCode,
    );
  else years = stageRule(c.countryCode, stage).years;
  const enrollment: Enrollment = {
    id: nextId(world, 'edu'),
    stage,
    institution: institutionName(world, c, stage, kind),
    kind,
    programId: options.programId ?? null,
    level: stage === 'tertiary' ? (options.level ?? 'bachelor') : 'school',
    startTick: world.tick,
    yearsCompleted: 0,
    years,
    grade: clamp(c.stats.intelligence - 50, 300, 900),
    scholarshipPercent: options.scholarshipPercent ?? 0,
    ...(stage === 'tertiary' ? { academic: newAcademic() } : {}),
  };
  c.education.current = enrollment;
  return enrollment;
}

/** All tertiary programmes share a bounded, save-compatible academic state. */
function newAcademic(): NonNullable<Enrollment['academic']> {
  return {
    semester: 1,
    credits: 0,
    coursework: 300,
    project: 0,
    research: 0,
    internshipMonths: 0,
    lastActionTick: null,
    lastAssessmentTick: 0,
    modules: [],
  };
}

/** Existing saves that lack academic details resume with earned time credited. */
export function academicOf(current: Enrollment): NonNullable<Enrollment['academic']> {
  if (!current.academic) {
    const completed = current.yearsCompleted * 48;
    current.academic = {
      ...newAcademic(),
      semester: current.yearsCompleted * 2 + 1,
      credits: completed,
      coursework: current.grade,
      project: current.yearsCompleted > 0 ? current.grade : 0,
      research: current.yearsCompleted > 0 ? current.grade : 0,
    };
  }
  return current.academic;
}

function finish(
  world: World,
  c: Character,
  status: 'completed' | 'left',
  examScore: number | null,
): void {
  const current = c.education.current;
  if (!current) return;
  c.education.history.push({ ...current, endTick: world.tick, status, examScore });
  if (c.education.history.length > 16)
    c.education.history.splice(0, c.education.history.length - 16);
  c.education.current = null;
  if (status === 'completed') {
    const q =
      current.stage === 'tertiary'
        ? `${current.level}:${current.programId ?? 'general'}`
        : current.stage;
    if (!c.education.qualifications.includes(q)) c.education.qualifications.push(q);
  }
  // Clubs belong to school life; adult community clubs stay.
  c.education.clubs = c.education.clubs.filter((id) => findClub(id)?.maxAge === null);
}

function examScore(world: World, c: Character): number {
  const skills = Math.floor((c.skills.reading + c.skills.logic + c.skills.science) / 3);
  const effort = EFFORT_GRADE[c.education.effort];
  const noise = withRng(world, 'school', (rng) => rng.range(-80, 80));
  return clamp(
    Math.floor(((c.education.current?.grade ?? 500) * 6) / 10) +
      Math.floor((skills * 3) / 10) +
      effort +
      noise +
      60,
    0,
    1000,
  );
}

/** The player's monthly grade, skills and stress while studying. */
function updateStudies(world: World, c: Character): void {
  const current = c.education.current;
  if (!current || current.stage === 'preschool') return;
  const teacher = Object.values(world.relationships).find(
    (r) => r.aId === c.id && r.type === 'teacher',
  );
  const skillKeys: SkillKey[] =
    current.stage === 'tertiary'
      ? [...getProgram(current.programId ?? 'business').skills]
      : ['reading', 'logic', 'science'];
  const skillAverage = Math.floor(
    skillKeys.reduce((sum, k) => sum + c.skills[k], 0) / skillKeys.length,
  );
  const target = clamp(
    260 +
      Math.floor(c.stats.intelligence / 4) +
      Math.floor((c.stats.discipline * 15) / 100) +
      Math.floor(skillAverage / 5) +
      EFFORT_GRADE[c.education.effort] +
      (current.kind === 'private' ? 40 : 0) +
      (teacher ? Math.floor((teacher.respect - 50) / 2) : 0) +
      Math.floor(c.habits.reading / 2) -
      (c.stats.stress > 600 ? Math.floor((c.stats.stress - 600) / 4) : 0),
    0,
    1000,
  );
  const noise = withRng(world, 'school', (rng) => rng.range(-15, 15));
  current.grade = clamp(current.grade + Math.trunc((target - current.grade) / 5) + noise, 0, 1000);
  const percent = EFFORT_PERCENT[c.education.effort];
  const gains: [SkillKey, number][] =
    current.stage === 'tertiary'
      ? skillKeys.map((k) => [k, 10] as [SkillKey, number])
      : STAGE_SKILLS[current.stage];
  for (const [key, gain] of gains) {
    changeSkill(
      world,
      c,
      key,
      scaledGain(Math.floor((gain * percent) / 100), c.skills[key]),
      'school',
    );
  }
  changeStat(world, c, 'stress', EFFORT_STRESS[c.education.effort], 'school');
  changeStat(world, c, 'intelligence', Math.floor((2 * percent) / 100), 'school');
  if (current.stage === 'tertiary') {
    const academic = academicOf(current);
    academic.coursework = clamp(
      academic.coursework + Math.floor((current.grade - academic.coursework) / 7),
      0,
      1000,
    );
    academic.project = clamp(academic.project + (current.level === 'diploma' ? 7 : 13), 0, 1000);
    if (current.level === 'master') academic.research = clamp(academic.research + 15, 0, 1000);
  }

  const startMonth = getRules(c.countryCode).education.schoolYearStartMonth;
  const offset = (world.clock.month - startMonth + 12) % 12;
  if (offset === 5 || offset === 11) {
    if (current.stage === 'tertiary') assessSemester(world, current);
    c.education.reports.push({ tick: world.tick, grade: current.grade });
    if (c.education.reports.length > 48)
      c.education.reports.splice(0, c.education.reports.length - 48);
    addNotification(
      world,
      'school',
      'ntf.reportCard',
      { grade: Math.round(current.grade / 10) },
      'career',
    );
    if (current.grade >= 850)
      addBiography(world, c.id, 'school', 'bio.excellentReport', {
        institution: current.institution,
      });
  }
}

/** A semester awards 24 credits only if its modules pass; failed semesters can be retried.
 * Use grade and coursework combined, rather than time alone, for academic progression. */
function assessSemester(world: World, current: Enrollment): void {
  const a = academicOf(current);
  if (!current.programId || current.level === 'school') return;
  if (a.lastAssessmentTick === world.tick) return;
  a.lastAssessmentTick = world.tick;
  const tasks = semesterModules(current.programId, current.level, a.semester);
  const result = clamp(
    Math.floor((current.grade * 7 + a.coursework * 3) / 10) +
      withRng(world, 'school', (rng) => rng.range(-50, 50)),
    0,
    1000,
  );
  const passed = result >= 350;
  for (const m of tasks) {
    a.modules.push({
      semester: a.semester,
      title: m.name,
      grade: result,
      credits: passed ? m.credits : 0,
      passed,
    });
  }
  a.modules = a.modules.slice(-48);
  if (passed) {
    a.credits += 24;
    a.semester += 1;
  } else {
    a.coursework = clamp(a.coursework + 50, 0, 1000);
    addNotification(world, 'school', 'ntf.repeatYear', {}, 'career');
  }
}

function clubCompetitions(world: World, c: Character): void {
  const startMonth = getRules(c.countryCode).education.schoolYearStartMonth;
  const offset = (world.clock.month - startMonth + 12) % 12;
  for (const clubId of c.education.clubs) {
    const club = getClub(clubId);
    // Monthly practice.
    for (const { key, gain } of club.skills)
      changeSkill(world, c, key, scaledGain(gain, c.skills[key]), `club:${club.id}`);
    for (const { key, gain } of club.stats) changeStat(world, c, key, gain, `club:${club.id}`);
    if (club.competition?.monthOffset !== offset) continue;
    const skill = c.skills[club.competition.skill];
    const score =
      skill +
      withRng(world, 'school', (rng) => rng.range(0, 250)) +
      Math.floor(c.stats.confidence / 10);
    const place = score >= 900 ? 1 : score >= 780 ? 2 : score >= 680 ? 3 : 0;
    if (place > 0) {
      c.education.awards.push({
        id: nextId(world, 'awd'),
        key: 'award.competition',
        tick: world.tick,
        params: { clubId: club.id, place },
      });
      if (c.education.awards.length > 40)
        c.education.awards.splice(0, c.education.awards.length - 40);
      changeStat(world, c, 'confidence', 40 - place * 8, `club:${club.id}:award`);
      changeStat(world, c, 'happiness', 50 - place * 10, `club:${club.id}:award`);
      addBiography(world, c.id, 'school', 'bio.competition', { clubId: club.id, place });
      addNotification(
        world,
        'school',
        'ntf.competitionPlace',
        { clubId: club.id, place },
        'career',
      );
    } else {
      addNotification(world, 'school', 'ntf.competitionTook', { clubId: club.id }, 'career');
    }
  }
}

/** Admission decisions that are due, and expiry of unanswered offers. */
function decideApplications(world: World, c: Character): void {
  for (const app of c.education.applications) {
    if (app.status === 'accepted' && world.tick > app.decisionTick + 3) {
      app.status = 'expired';
      continue;
    }
    if (app.status !== 'pending' || app.decisionTick > world.tick) continue;
    const program = getProgram(app.programId);
    const lastExam =
      [...c.education.history].reverse().find((h) => h.examScore !== null)?.examScore ?? null;
    const base =
      lastExam ?? c.education.current?.grade ?? [...c.education.history].reverse()[0]?.grade ?? 500;
    const skillAverage = Math.floor(
      program.skills.reduce((sum, k) => sum + c.skills[k], 0) / program.skills.length,
    );
    const awards = Math.min(60, c.education.awards.length * 15);
    const noise = withRng(world, 'school', (rng) => rng.range(-60, 60));
    const score = clamp(
      Math.floor((base * 7) / 10) + Math.floor((skillAverage * 3) / 10) + awards + noise + 120,
      0,
      1000,
    );
    const difficulty =
      world.rules.difficulty === 'casual' ? -60 : world.rules.difficulty === 'challenging' ? 60 : 0;
    const threshold =
      program.selectivity +
      (app.level === 'master' ? 80 : app.level === 'diploma' ? -120 : 0) +
      difficulty +
      (app.kind === 'private' ? -40 : 0);
    app.score = score;
    if (score >= threshold) {
      app.status = 'accepted';
      app.decisionTick = world.tick;
      const wealth = world.households[c.householdId]?.wealth ?? 'middle';
      let scholarship = score >= threshold + 220 ? 100 : score >= threshold + 150 ? 50 : 0;
      if ((wealth === 'low' || wealth === 'lower-middle') && score >= threshold + 60)
        scholarship = Math.max(scholarship, 50);
      app.scholarshipPercent = scholarship;
      addNotification(
        world,
        'school',
        'ntf.studyOffer',
        { programId: program.id, level: app.level, scholarship },
        'career',
      );
      if (scholarship > 0) {
        c.education.awards.push({
          id: nextId(world, 'awd'),
          key: 'award.scholarship',
          tick: world.tick,
          params: { programId: program.id, percent: scholarship },
        });
        addBiography(world, c.id, 'school', 'bio.scholarship', {
          programId: program.id,
          percent: scholarship,
        });
      }
    } else {
      app.status = 'rejected';
      addNotification(
        world,
        'school',
        'ntf.studyRejected',
        { programId: program.id, level: app.level },
        'career',
      );
    }
  }
}

/** The school-year transition for one character: progress, finish stages, enrol in the next. */
function startSchoolYear(world: World, c: Character, isPlayer: boolean): void {
  const rules = getRules(c.countryCode).education;
  const age = ageYears(world, c);
  const current = c.education.current;
  if (current) {
    if (current.stage === 'preschool') {
      if (age >= rules.primaryStartAge) finish(world, c, 'completed', null);
    } else {
      const passMark = current.stage === 'tertiary' ? 350 : 300;
      const academicReady =
        current.stage !== 'tertiary' ||
        (academicOf(current).credits >= (current.yearsCompleted + 1) * 48 &&
          (current.yearsCompleted + 1 < current.years ||
            ((current.level === 'diploma' || academicOf(current).project >= 100) &&
              (current.level !== 'master' || academicOf(current).research >= 150))));
      const passed =
        academicReady &&
        (current.stage === 'primary' ||
          current.grade >= passMark ||
          c.flags['school.repeated'] === true);
      if (passed) {
        current.yearsCompleted += 1;
        c.flags['school.repeated'] = false;
      } else if (current.stage === 'tertiary') {
        // Academic failure delays progress instead of deleting earned credits.
        if (isPlayer) addNotification(world, 'school', 'ntf.repeatYear', {}, 'career');
        return;
      } else {
        c.flags['school.repeated'] = true;
        if (isPlayer) addNotification(world, 'school', 'ntf.repeatYear', {}, 'career');
      }
      if (current.yearsCompleted >= current.years) {
        const stage = current.stage;
        const exam = stage === 'tertiary' ? null : stageRule(c.countryCode, stage).exam;
        const score = exam !== null || stage === 'upperSecondary' ? examScore(world, c) : null;
        const programId = current.programId;
        const level = current.level;
        finish(world, c, 'completed', score);
        if (isPlayer) {
          if (stage === 'tertiary') {
            addBiography(world, c.id, 'school', 'bio.graduated', {
              programId: programId ?? '',
              level,
            });
            addNotification(
              world,
              'school',
              'ntf.graduated',
              { programId: programId ?? '', level },
              'career',
            );
          } else {
            addBiography(world, c.id, 'school', 'bio.finishedStage', {
              stage,
              country: c.countryCode,
              exam: exam ?? '',
              score: score === null ? '' : Math.round(score / 10),
            });
            addNotification(
              world,
              'school',
              'ntf.finishedStage',
              {
                stage,
                country: c.countryCode,
                exam: exam ?? '',
                score: score === null ? '' : Math.round(score / 10),
              },
              'career',
            );
          }
        }
        const next = NEXT_STAGE[stage];
        if (next) {
          enroll(world, c, next);
          if (isPlayer) startStage(world, c, next);
        } else if (isPlayer && stage === 'upperSecondary') {
          decideApplications(world, c);
        }
      }
    }
  }
  if (!c.education.current) {
    const done = (s: string) =>
      c.education.qualifications.includes(s) || c.education.history.some((h) => h.stage === s);
    // The next school stage not yet done, entered in the year that fits their age. This also
    // picks up a child taken over from an NPC, who has qualifications but no enrolment.
    let start = rules.primaryStartAge;
    let next: 'primary' | 'lowerSecondary' | 'upperSecondary' | null = null;
    for (const stage of ['primary', 'lowerSecondary', 'upperSecondary'] as const) {
      if (!done(stage)) {
        next = stage;
        break;
      }
      start += stageRule(c.countryCode, stage).years;
    }
    if (next && age >= rules.primaryStartAge && age < 19) {
      const enrolled = enroll(world, c, next);
      enrolled.yearsCompleted = clamp(age - start, 0, enrolled.years - 1);
      if (isPlayer) startStage(world, c, next);
    } else if (age >= rules.preschoolAge && age < rules.primaryStartAge && !done('preschool')) {
      enroll(world, c, 'preschool');
      if (isPlayer)
        addNotification(
          world,
          'school',
          'ntf.startedStage',
          { stage: 'preschool', country: c.countryCode },
          'career',
        );
    }
  }
}

function startStage(world: World, c: Character, stage: EducationStage): void {
  addNotification(world, 'school', 'ntf.startedStage', { stage, country: c.countryCode }, 'career');
  addBiography(world, c.id, 'school', 'bio.startedStage', {
    stage,
    country: c.countryCode,
    institution: c.education.current?.institution ?? '',
  });
  if (stage === 'primary' || stage === 'lowerSecondary' || stage === 'upperSecondary') {
    schoolCohort(
      world,
      c,
      stage === 'primary' ? 10 : 8,
      stage === 'primary' ? 'education' : 'sciences',
    );
  }
}

/** Simplified education for NPC children: stages by age, qualifications by ability. */
function npcSchoolYear(world: World, c: Character): void {
  const rules = getRules(c.countryCode).education;
  const age = ageYears(world, c);
  // NPCs do not have the player's monthly lessons: their skills catch up once a school year.
  if (age <= 26)
    withRng(world, 'npc', (rng) => {
      catchUpSkills(rng, c.skills, age);
    });
  if (age < rules.preschoolAge || age > 26) return;
  let start = rules.primaryStartAge;
  for (const s of rules.stages) {
    const end = start + s.years;
    if (age === end && !c.education.qualifications.includes(s.stage)) {
      const passes = withRng(
        world,
        'school',
        (rng) => rng.int(1000) < clamp(600 + c.stats.intelligence / 2, 500, 990),
      );
      if (passes) c.education.qualifications.push(s.stage);
    }
    start = end;
  }
  if (
    age === start + 1 &&
    c.education.qualifications.includes('upperSecondary') &&
    !c.education.qualifications.some((q) => q.includes(':'))
  ) {
    const goes = withRng(
      world,
      'school',
      (rng) => rng.int(1000) < clamp(c.stats.intelligence - 150, 100, 800),
    );
    if (goes) {
      const field = withRng(world, 'school', (rng) =>
        rng.pick([
          'computing',
          'engineering',
          'nursing',
          'business',
          'education',
          'sciences',
          'humanities',
          'media',
          'design',
          'law',
        ]),
      );
      c.flags[`studying.${field}`] = true;
      // NPCs also follow the same course-specific educational progression.
      c.education.qualifications.push(`diploma:${field}`);
    }
  }
  if (age === start + 3) {
    const diploma = c.education.qualifications.find((q) => q.startsWith('diploma:'));
    if (diploma && withRng(world, 'school', (rng) => rng.int(100) < 75))
      c.education.qualifications.push(`bachelor:${diploma.slice(8)}`);
  }
  if (age === start + 5) {
    const bachelor = c.education.qualifications.find((q) => q.startsWith('bachelor:'));
    if (bachelor && withRng(world, 'school', (rng) => rng.int(100) < 45))
      c.education.qualifications.push(`master:${bachelor.slice(9)}`);
  }
}

/** Step 6 (education part): school-year transitions, studies, clubs and applications. */
export function processEducation(world: World): void {
  const player = world.characters[world.activeCharacterId];
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (c?.death !== null || c.tier === 'archived') continue;
    const isPlayer = id === world.activeCharacterId;
    const startMonth = getRules(c.countryCode).education.schoolYearStartMonth;
    if (world.clock.month === startMonth) {
      if (isPlayer) startSchoolYear(world, c, true);
      else npcSchoolYear(world, c);
    }
  }
  if (player?.death === null) {
    decideApplications(world, player);
    updateStudies(world, player);
    clubCompetitions(world, player);
  }
}

export type EducationRejection =
  | 'notStudying'
  | 'unknownClub'
  | 'clubAge'
  | 'clubFull'
  | 'alreadyMember'
  | 'notMember'
  | 'unknownProgram'
  | 'missingPrerequisite'
  | 'alreadyQualified'
  | 'levelUnavailable'
  | 'notEligible'
  | 'tooMany'
  | 'alreadyApplied'
  | 'noOffer'
  | 'cannotLeave'
  | 'noChange';

export class EducationError extends Error {
  readonly code: EducationRejection;
  constructor(code: EducationRejection, message: string) {
    super(message);
    this.name = 'EducationError';
    this.code = code;
  }
}

export function clubEligibility(
  world: World,
  c: Character,
  clubId: string,
): EducationRejection | null {
  const club = findClub(clubId);
  if (!club) return 'unknownClub';
  if (c.education.clubs.includes(clubId)) return 'alreadyMember';
  const age = ageYears(world, c);
  if (age < club.minAge || (club.maxAge !== null && age > club.maxAge)) return 'clubAge';
  if (club.maxAge !== null && c.education.current === null && age < 18) return 'notStudying';
  if (c.education.clubs.length >= 3) return 'clubFull';
  return null;
}

export function joinClub(world: World, c: Character, clubId: string): void {
  const reason = clubEligibility(world, c, clubId);
  if (reason) throw new EducationError(reason, CLUB_MESSAGES[reason]);
  const club = getClub(clubId);
  c.education.clubs.push(clubId);
  const age = ageYears(world, c);
  meetPeople(world, c, 2, 'acquaintance', [
    Math.max(club.minAge, age - 1),
    Math.max(club.minAge, age + (age >= 18 ? 12 : 1)),
  ]);
  addBiography(world, c.id, 'school', 'bio.joinedClub', { clubId });
}

export function leaveClub(c: Character, clubId: string): void {
  if (!c.education.clubs.includes(clubId))
    throw new EducationError('notMember', 'You are not a member of that club.');
  c.education.clubs = c.education.clubs.filter((id) => id !== clubId);
}

const CLUB_MESSAGES: Record<EducationRejection, string> = {
  notStudying: 'School clubs need you to be enrolled in school or studies.',
  unknownClub: 'Unknown club.',
  clubAge: 'You are not the right age for this club.',
  clubFull: 'You can belong to at most three clubs.',
  alreadyMember: 'You already belong to this club.',
  notMember: 'You are not a member of that club.',
  unknownProgram: 'Unknown programme.',
  missingPrerequisite: 'Complete the previous qualification in this exact course first.',
  alreadyQualified: 'You already hold this qualification.',
  levelUnavailable: 'That level is not offered for this programme.',
  notEligible: 'You do not meet the entry requirements yet.',
  tooMany: 'You can have at most four applications waiting at once.',
  alreadyApplied: 'You have already applied for this programme.',
  noOffer: 'There is no open offer to answer.',
  cannotLeave: 'You cannot leave school before the legal leaving age.',
  noChange: 'That is already your setting.',
};

/** Why the character may (not) apply for a programme at a level. */
export function applicationEligibility(
  c: Character,
  programId: string,
  level: ProgramLevel,
): EducationRejection | null {
  const program = findProgram(programId);
  if (!program) return 'unknownProgram';
  if (!program.levels.includes(level)) return 'levelUnavailable';
  const q = c.education.qualifications;
  const current = c.education.current;
  const finalSchoolYear =
    current?.stage === 'upperSecondary' && current.yearsCompleted >= current.years - 1;
  if (q.includes(`${level}:${programId}`)) return 'alreadyQualified';
  if (level === 'master' && !q.includes(`bachelor:${programId}`)) return 'missingPrerequisite';
  if (level === 'bachelor' && !q.includes(`diploma:${programId}`)) return 'missingPrerequisite';
  if (level === 'diploma' && !q.includes('upperSecondary') && !finalSchoolYear)
    return 'notEligible';
  if (current?.stage === 'tertiary') return 'notEligible';
  const open = c.education.applications.filter(
    (a) => a.status === 'pending' || a.status === 'accepted',
  );
  if (open.length >= 4) return 'tooMany';
  if (open.some((a) => a.programId === programId && a.level === level)) return 'alreadyApplied';
  return null;
}

export function applyForStudy(
  world: World,
  c: Character,
  programId: string,
  level: ProgramLevel,
  kind: 'public' | 'private' = 'public',
): StudyApplication {
  const reason = applicationEligibility(c, programId, level);
  if (reason) throw new EducationError(reason, CLUB_MESSAGES[reason]);
  const current = c.education.current;
  const rules = getRules(c.countryCode).education;
  // Final-year students hear back when school ends; others after two months.
  const monthsToYearStart = (rules.schoolYearStartMonth - world.clock.month + 12) % 12 || 12;
  const decisionTick =
    current?.stage === 'upperSecondary' ? world.tick + monthsToYearStart : world.tick + 2;
  const app: StudyApplication = {
    id: nextId(world, 'sap'),
    programId,
    level,
    tick: world.tick,
    decisionTick,
    status: 'pending',
    scholarshipPercent: 0,
    kind,
    score: null,
  };
  c.education.applications.push(app);
  if (c.education.applications.length > 24)
    c.education.applications.splice(0, c.education.applications.length - 24);
  return app;
}

/** Accepting an offer enrols immediately and declines the others. */
export function respondToStudyOffer(
  world: World,
  c: Character,
  applicationId: string,
  accept: boolean,
): void {
  const app = c.education.applications.find((a) => a.id === applicationId);
  if (app?.status !== 'accepted') throw new EducationError('noOffer', CLUB_MESSAGES.noOffer);
  if (!accept) {
    app.status = 'declined';
    return;
  }
  // Revalidate at enrollment to prevent expired prerequisites or old offers bypassing the engine.
  const required =
    app.level === 'master'
      ? `bachelor:${app.programId}`
      : app.level === 'bachelor'
        ? `diploma:${app.programId}`
        : 'upperSecondary';
  if (
    !c.education.qualifications.includes(required) &&
    !(
      app.level === 'diploma' &&
      c.education.current?.stage === 'upperSecondary' &&
      c.education.current.yearsCompleted >= c.education.current.years - 1
    )
  )
    throw new EducationError('missingPrerequisite', CLUB_MESSAGES.missingPrerequisite);
  if (c.education.current && c.education.current.stage !== 'tertiary')
    finish(world, c, 'left', null);
  if (c.education.current?.stage === 'tertiary')
    throw new EducationError('notEligible', 'You are already studying.');
  app.status = 'enrolled';
  for (const other of c.education.applications) {
    if (other !== app && (other.status === 'accepted' || other.status === 'pending'))
      other.status = 'declined';
  }
  enroll(world, c, 'tertiary', {
    programId: app.programId,
    level: app.level,
    kind: app.kind ?? 'public',
    scholarshipPercent: app.scholarshipPercent,
  });
  addBiography(world, c.id, 'school', 'bio.startedStudies', {
    programId: app.programId,
    level: app.level,
  });
  addNotification(
    world,
    'school',
    'ntf.startedStudies',
    { programId: app.programId, level: app.level },
    'career',
  );
  const age = ageYears(world, c);
  meetPeople(world, c, 4, 'classmate', [Math.max(16, age - 3), age + 5]);
}

export function leavingAge(countryCode: string): number {
  return Math.max(15, Math.min(16, getRules(countryCode).education.compulsoryUntilAge));
}

/** Leaving school or studies (school only after the legal leaving age). */
export function leaveEducation(world: World, c: Character): void {
  const current = c.education.current;
  if (!current) throw new EducationError('notStudying', 'You are not studying.');
  if (current.stage !== 'tertiary' && ageYears(world, c) < leavingAge(c.countryCode)) {
    throw new EducationError('cannotLeave', CLUB_MESSAGES.cannotLeave);
  }
  addBiography(
    world,
    c.id,
    'school',
    current.stage === 'tertiary' ? 'bio.leftStudies' : 'bio.leftSchool',
    { programId: current.programId ?? '' },
  );
  finish(world, c, 'left', null);
}

export { CLUBS };
