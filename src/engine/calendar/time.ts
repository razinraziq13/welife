import { ageOf } from '../core/clock';
import { activeCharacter } from '../core/world';
import { findClub } from '../education/catalog';
import type { Character, Difficulty, World } from '../state/schema';

/**
 * Free time each month (spec §4 Actions: time and energy are soft limits on *effective*
 * actions, never a click cap). The base already assumes a normal school or working week;
 * commitments the player chooses (clubs, extra effort, part-time work) take time from it,
 * and having neither school nor work gives more. PROPOSED TUNING.
 */

export function baseFreeHours(ageYears: number): number {
  return ageYears < 2
    ? 30
    : ageYears < 6
      ? 50
      : ageYears < 13
        ? 60
        : ageYears < 18
          ? 70
          : ageYears < 65
            ? 80
            : 100;
}

export interface TimeLine {
  /** Localisation key for the line. */
  key: string;
  hours: number;
  params?: Record<string, string | number>;
}

export interface TimeBudget {
  total: number;
  used: number;
  lines: TimeLine[];
}

function difficultyAdjust(hours: number, difficulty: Difficulty): number {
  if (difficulty === 'casual') return hours * 2;
  if (difficulty === 'challenging') return Math.floor((hours * 80) / 100);
  return hours;
}

/** Free-time budget with an itemised breakdown (shown in the calendar). */
export function timeBudgetFor(world: World, c: Character): TimeBudget {
  const age = ageOf(c.birth, world.clock).years;
  const lines: TimeLine[] = [{ key: 'time.base', hours: baseFreeHours(age) }];
  const school = c.education.current;
  const job = c.employmentId ? world.employment[c.employmentId] : undefined;
  const working = job?.status === 'active' ? job : undefined;
  if (school && school.stage !== 'preschool') {
    const effort = c.education.effort;
    if (effort === 'relaxed') lines.push({ key: 'time.studyRelaxed', hours: 10 });
    if (effort === 'focused') lines.push({ key: 'time.studyFocused', hours: -12 });
  }
  // Running your own companies takes time unless a manager is hired (Milestone 5).
  for (const business of Object.values(world.businesses)) {
    if (
      business.status === 'active' &&
      business.manager === 'owner' &&
      business.owners.some((o) => o.ownerId === c.id)
    ) {
      lines.push({ key: 'time.business', hours: -40, params: { business: business.name } });
    }
  }
  if (working) {
    if (school || age < 18)
      lines.push({ key: 'time.partTimeWork', hours: -Math.ceil(working.terms.hours / 4) });
    else if (working.terms.contract === 'partTime' || working.terms.contract === 'casual')
      lines.push({ key: 'time.partTimeHours', hours: 25 });
    if (working.effort === 'hard') lines.push({ key: 'time.workHard', hours: -15 });
    if (working.effort === 'coast') lines.push({ key: 'time.workCoast', hours: 10 });
  }
  if (!school && !working && age >= 6 && age < 65)
    lines.push({ key: 'time.noSchoolOrWork', hours: 40 });
  for (const id of c.education.clubs) {
    const club = findClub(id);
    if (club) lines.push({ key: 'time.club', hours: -club.hours, params: { clubId: id } });
  }
  for (const item of world.calendar.items) {
    if (item.tick === world.tick && item.status === 'done' && item.kind === 'vacation') {
      lines.push({ key: 'time.vacation', hours: item.hours });
    }
  }
  const raw = lines.reduce((sum, l) => sum + l.hours, 0);
  const total = Math.max(10, difficultyAdjust(raw, world.rules.difficulty));
  if (world.rules.difficulty !== 'realistic')
    lines.push({
      key: `time.difficulty.${world.rules.difficulty}`,
      hours: total - Math.max(10, raw),
    });
  const used = world.activity.tick === world.tick ? world.activity.hoursUsed : 0;
  return { total, used, lines };
}

export function timeBudget(world: World): { total: number; used: number } {
  const b = timeBudgetFor(world, activeCharacter(world));
  return { total: b.total, used: b.used };
}

/** Uses free hours; returns false (and uses nothing) when there is not enough left. */
export function spendHours(world: World, hours: number): boolean {
  if (world.activity.tick !== world.tick)
    world.activity = { tick: world.tick, counts: {}, hoursUsed: 0 };
  const budget = timeBudget(world);
  if (budget.used + hours > budget.total) return false;
  world.activity.hoursUsed += hours;
  return true;
}
