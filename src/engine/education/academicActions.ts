import { clamp } from '../core/data';
import { spendHours, timeBudget } from '../calendar/time';
import { changeSkill, changeStat } from '../characters/stats';
import type { World, Character } from '../state/schema';
import { getProgram } from './catalog';
import { EducationError, academicOf } from './school';

/** Player-controlled academic work, isolated from school-year processing to avoid cycles. */
export type AcademicAction = 'coursework' | 'groupProject' | 'meetLecturer' | 'research' | 'internship';
export const ACADEMIC_ACTIONS: readonly AcademicAction[] = [
  'coursework', 'groupProject', 'meetLecturer', 'research', 'internship',
];
export function academicActionBlock(world: World, c: Character, action: AcademicAction): string | null {
  const current = c.education.current;
  if (current?.stage !== 'tertiary') return 'You must be enrolled in higher education.';
  const a = current.academic;
  if (a?.lastActionTick === world.tick) return 'Already completed an academic activity this month.';
  if (action === 'research' && current.level !== 'master') return 'Research is for master’s students.';
  if (action === 'internship' && current.level === 'master') return 'Internships are offered during diploma and degree study.';
  if (timeBudget(world).used + 4 > timeBudget(world).total) return 'Not enough free time this month.';
  if (c.stats.energy < 50) return 'Not enough energy for this activity.';
  return null;
}
export function academicAction(world: World, c: Character, action: AcademicAction): void {
  const reason = academicActionBlock(world, c, action);
  if (reason) throw new EducationError('notEligible', reason);
  const current = c.education.current;
  if (!current) throw new EducationError('notStudying', CLUB_MESSAGES.notStudying);
  const a = academicOf(current);
  spendHours(world, 4);
  changeStat(world, c, 'energy', -50, 'school:academic');
  a.lastActionTick = world.tick;
  if (action === 'coursework') { a.coursework = clamp(a.coursework + 100, 0, 1000); current.grade = clamp(current.grade + 30, 0, 1000); }
  if (action === 'groupProject') { a.project = clamp(a.project + 120, 0, 1000); changeSkill(world, c, 'socializing', 6, 'school:project'); }
  if (action === 'meetLecturer') { a.coursework = clamp(a.coursework + 50, 0, 1000); changeSkill(world, c, 'reading', 6, 'school:lecturer'); }
  if (action === 'research') { a.research = clamp(a.research + 120, 0, 1000); a.project = clamp(a.project + 60, 0, 1000); }
  if (action === 'internship') { a.internshipMonths = Math.min(36, a.internshipMonths + 1); a.project = clamp(a.project + 30, 0, 1000); const skill = getProgram(current.programId ?? 'business').skills[0]; if (skill) changeSkill(world, c, skill, 12, 'school:internship'); }
}

