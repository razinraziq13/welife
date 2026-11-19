import { addMonths, monthIndex } from '../core/clock';
import { sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { addBiography, addNotification, ageYears, nextId } from '../core/world';
import { ACTIVITIES } from '../activities/activities';
import { activityHours, isPlannable, performPlanned } from '../activities/hub';
import { changeNeed, changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { payExpense, payMedicalCost, payerFor } from '../economy/finance';
import { getClub } from '../education/catalog';
import { setPartnershipStatus, shareMoment } from '../social/family';
import { findRelationship } from '../social/relationships';
import { getRules } from '../world/rules';
import type { CalendarItem, Character, World } from '../state/schema';

/**
 * Calendar (spec §3.6): recurring activity plans, appointments, holidays, weddings and
 * every dated milestone of the coming year, with cost/time previews and conflicts.
 */

export const MAX_PLANS = 10;

export interface VacationOption {
  id: string;
  costPercent: number;
  hours: number;
  happiness: number;
  stress: number;
  leisure: number;
}

export const VACATIONS: readonly VacationOption[] = [
  { id: 'staycation', costPercent: 10, hours: 20, happiness: 60, stress: -80, leisure: 300 },
  { id: 'domestic', costPercent: 40, hours: 40, happiness: 100, stress: -120, leisure: 500 },
  { id: 'abroad', costPercent: 120, hours: 60, happiness: 160, stress: -160, leisure: 700 },
];

export const CHECKUP_COST_PERCENT = 6;

export type CalendarRejection =
  | 'unknownActivity'
  | 'tooManyPlans'
  | 'alreadyPlanned'
  | 'unknownPlan'
  | 'unknownOption'
  | 'badMonth'
  | 'tooYoung'
  | 'unknownItem'
  | 'notCancellable'
  | 'clash';

export const CALENDAR_MESSAGES: Record<CalendarRejection, string> = {
  unknownActivity: 'Unknown activity.',
  tooManyPlans: 'You can have at most ten recurring plans.',
  alreadyPlanned: 'That activity is already in your monthly plan.',
  unknownPlan: 'Unknown plan.',
  unknownOption: 'Unknown option.',
  badMonth: 'Choose a month within the next two years.',
  tooYoung: 'Holidays are planned by adults (18+).',
  unknownItem: 'Unknown calendar item.',
  notCancellable: 'This can no longer be cancelled.',
  clash: 'Something is already booked that month.',
};

export class CalendarError extends Error {
  readonly code: CalendarRejection;
  constructor(code: CalendarRejection) {
    super(CALENDAR_MESSAGES[code]);
    this.name = 'CalendarError';
    this.code = code;
  }
}

export function planActivity(world: World, activityId: string, timesPerMonth: number): void {
  if (!isPlannable(activityId)) throw new CalendarError('unknownActivity');
  if (world.calendar.plans.some((p) => p.activityId === activityId))
    throw new CalendarError('alreadyPlanned');
  if (world.calendar.plans.length >= MAX_PLANS) throw new CalendarError('tooManyPlans');
  world.calendar.plans.push({
    id: nextId(world, 'pln'),
    activityId,
    timesPerMonth,
    createdTick: world.tick,
  });
}

export function cancelPlan(world: World, planId: string): void {
  if (!world.calendar.plans.some((p) => p.id === planId)) throw new CalendarError('unknownPlan');
  world.calendar.plans = world.calendar.plans.filter((p) => p.id !== planId);
}

export function itemCost(
  world: World,
  c: Character,
  kind: 'vacation' | 'checkup',
  option: string,
): { cost: bigint; hours: number } {
  const median = medianWage(world, c.countryCode);
  if (kind === 'checkup') return { cost: applyPercent(median, CHECKUP_COST_PERCENT), hours: 4 };
  const v = VACATIONS.find((x) => x.id === option);
  if (!v) throw new CalendarError('unknownOption');
  return { cost: applyPercent(median, v.costPercent), hours: v.hours };
}

export function scheduleItem(
  world: World,
  c: Character,
  kind: 'vacation' | 'checkup',
  option: string,
  tick: number,
): CalendarItem {
  if (tick <= world.tick || tick > world.tick + 24) throw new CalendarError('badMonth');
  if (kind === 'vacation' && ageYears(world, c) < 18) throw new CalendarError('tooYoung');
  if (kind === 'checkup' && option !== 'general') throw new CalendarError('unknownOption');
  if (
    world.calendar.items.some((i) => i.tick === tick && i.status === 'scheduled' && i.kind === kind)
  )
    throw new CalendarError('clash');
  const { cost, hours } = itemCost(world, c, kind, option);
  const item: CalendarItem = {
    id: nextId(world, 'cal'),
    kind,
    option,
    tick,
    costMinor: cost,
    hours,
    status: 'scheduled',
    withId: null,
  };
  world.calendar.items.push(item);
  trimItems(world);
  return item;
}

export function cancelItem(world: World, itemId: string): void {
  const item = world.calendar.items.find((i) => i.id === itemId);
  if (!item) throw new CalendarError('unknownItem');
  if (item.status !== 'scheduled' || item.kind === 'wedding')
    throw new CalendarError('notCancellable');
  item.status = 'cancelled';
}

function trimItems(world: World): void {
  if (world.calendar.items.length <= 60) return;
  const finished = world.calendar.items.filter((i) => i.status !== 'scheduled');
  const drop = new Set(finished.slice(0, world.calendar.items.length - 60).map((i) => i.id));
  world.calendar.items = world.calendar.items.filter((i) => !drop.has(i.id));
}

/** Step 2: recurring plans run for the month that is ending (same time and energy rules). */
export function runPlans(world: World): void {
  const player = world.characters[world.activeCharacterId];
  if (player?.death !== null) return;
  let skipped = 0;
  for (const plan of world.calendar.plans) {
    for (let i = 0; i < plan.timesPerMonth; i++) {
      const status = performPlanned(world, plan.activityId);
      if (status === 'no-time') skipped += 1;
      if (status !== 'done' && status !== 'tired') break;
    }
  }
  if (skipped > 0)
    addNotification(world, 'life', 'ntf.planSkipped', { count: skipped }, 'calendar');
}

/** Calendar items that fall in the new month. */
export function processCalendarItems(world: World): void {
  const player = world.characters[world.activeCharacterId];
  if (player?.death !== null) return;
  for (const item of world.calendar.items) {
    if (item.status !== 'scheduled' || item.tick !== world.tick) continue;
    const payer = payerFor(world, player);
    const funds = payer
      ? (world.ledger.accounts[payer.checkingId]?.balance ?? 0n) +
        (payer.savingsId ? (world.ledger.accounts[payer.savingsId]?.balance ?? 0n) : 0n)
      : 0n;
    if (item.kind === 'vacation') {
      const v = VACATIONS.find((x) => x.id === item.option);
      if (!v || !payer || funds < item.costMinor) {
        item.status = 'missed';
        addNotification(world, 'money', 'ntf.vacationMissed', { option: item.option }, 'calendar');
        continue;
      }
      payExpense(
        world,
        payer,
        'travel',
        item.costMinor,
        'tx.vacation',
        { option: item.option },
        item.id,
      );
      changeStat(world, player, 'happiness', v.happiness, `calendar:vacation`);
      changeStat(world, player, 'stress', v.stress, `calendar:vacation`);
      changeNeed(player, 'leisure', v.leisure);
      changeNeed(player, 'rest', 200);
      item.status = 'done';
      addBiography(world, player.id, 'life', 'bio.vacation', { option: item.option });
    } else if (item.kind === 'checkup') {
      payMedicalCost(world, player, item.costMinor, item.id);
      changeStat(world, player, 'health', 25, 'calendar:checkup');
      changeStat(world, player, 'stress', -10, 'calendar:checkup');
      item.status = 'done';
      addNotification(world, 'health', 'ntf.checkupDone', {}, 'calendar');
    } else {
      const partner = item.withId ? world.characters[item.withId] : undefined;
      if (
        partner?.death !== null ||
        player.partnership?.partnerId !== partner.id ||
        player.partnership.status !== 'engaged'
      ) {
        item.status = 'cancelled';
        continue;
      }
      if (payer) payExpense(world, payer, 'wedding', item.costMinor, 'tx.wedding', {}, item.id);
      setPartnershipStatus(player, partner, 'married');
      shareMoment(world, player, partner, 'wedding', 90, 100, item.id);
      changeStat(world, player, 'happiness', 200, 'calendar:wedding');
      item.status = 'done';
      addBiography(world, player.id, 'family', 'bio.married', { name: partner.identity.firstName });
      addNotification(
        world,
        'family',
        'ntf.married',
        { name: partner.identity.firstName },
        'person',
        partner.id,
      );
    }
  }
  trimItems(world);
}

export interface UpcomingEntry {
  tick: number;
  kind: string;
  /** Localisation key. */
  key: string;
  params: Record<string, string | number>;
  /** Screen to open. */
  target: 'career' | 'finance' | 'social' | 'calendar' | 'character' | 'person' | 'family';
  targetId: string | null;
  /** Calendar item id when cancellable. */
  itemId: string | null;
}

/** Everything dated in the next `months` months (birthdays, school, work, money, plans). */
export function upcoming(world: World, months = 12): UpcomingEntry[] {
  const player = world.characters[world.activeCharacterId];
  if (player?.death !== null) return [];
  const out: UpcomingEntry[] = [];
  const end = world.tick + months;
  const inWindow = (tick: number) => tick > world.tick && tick <= end;
  const tickOfMonth = (month: number) => {
    const offset = (month - world.clock.month + 12) % 12 || 12;
    return world.tick + offset;
  };
  const add = (
    e: Omit<UpcomingEntry, 'targetId' | 'itemId'> &
      Partial<Pick<UpcomingEntry, 'targetId' | 'itemId'>>,
  ) => {
    if (inWindow(e.tick)) out.push({ targetId: null, itemId: null, ...e });
  };
  add({
    tick: tickOfMonth(player.birth.month),
    kind: 'birthday',
    key: 'cal.yourBirthday',
    params: { age: ageYears(world, player) + 1 },
    target: 'character',
  });
  for (const rel of sortedValues(world.relationships)) {
    if (rel.aId !== player.id) continue;
    const other = world.characters[rel.bId];
    if (other?.death !== null || other.tier === 'archived') continue;
    const important =
      other.householdId === player.householdId ||
      rel.type === 'friend' ||
      rel.type === 'partner' ||
      rel.closeness >= 70;
    if (!important) continue;
    add({
      tick: tickOfMonth(other.birth.month),
      kind: 'birthday',
      key: 'cal.birthday',
      params: { name: other.identity.firstName, age: ageYears(world, other) + 1 },
      target: 'person',
      targetId: other.id,
    });
  }
  const education = getRules(player.countryCode).education;
  const school = player.education.current;
  if (school || player.education.applications.some((a) => a.status === 'pending')) {
    const start = tickOfMonth(education.schoolYearStartMonth);
    add({ tick: start, kind: 'school', key: 'cal.schoolYear', params: {}, target: 'career' });
    if (school && school.stage !== 'preschool' && school.yearsCompleted >= school.years - 1) {
      add({
        tick: start,
        kind: 'exam',
        key: school.stage === 'tertiary' ? 'cal.graduation' : 'cal.finalExams',
        params: { stage: school.stage },
        target: 'career',
      });
    }
    if (school && school.stage !== 'preschool') {
      for (const offset of [5, 11])
        add({
          tick: tickOfMonth(((education.schoolYearStartMonth - 1 + offset) % 12) + 1),
          kind: 'report',
          key: 'cal.reportCard',
          params: {},
          target: 'career',
        });
    }
  }
  for (const clubId of player.education.clubs) {
    const club = getClub(clubId);
    if (club.competition) {
      add({
        tick: tickOfMonth(
          ((education.schoolYearStartMonth - 1 + club.competition.monthOffset) % 12) + 1,
        ),
        kind: 'competition',
        key: 'cal.competition',
        params: { clubId },
        target: 'career',
      });
    }
  }
  for (const app of player.education.applications) {
    if (app.status === 'pending')
      add({
        tick: app.decisionTick,
        kind: 'decision',
        key: 'cal.studyDecision',
        params: { programId: app.programId },
        target: 'career',
      });
  }
  for (const app of sortedValues(world.jobs.applications)) {
    if (app.characterId !== player.id) continue;
    if (app.status === 'interview' && app.interviewTick !== null)
      add({
        tick: app.interviewTick,
        kind: 'interview',
        key: 'cal.interview',
        params: { employer: app.terms.employer },
        target: 'career',
      });
    if (app.status === 'offered' && app.offerExpiresTick !== null)
      add({
        tick: app.offerExpiresTick,
        kind: 'offer',
        key: 'cal.offerExpires',
        params: { employer: app.terms.employer },
        target: 'career',
      });
  }
  const job = player.employmentId ? world.employment[player.employmentId] : undefined;
  if (job?.status === 'active')
    add({
      tick: job.lastReviewTick + 12,
      kind: 'review',
      key: 'cal.review',
      params: { employer: job.terms.employer },
      target: 'career',
    });
  if (player.finance) {
    if (player.finance.taxYear.gross > 0n || player.employmentId !== null) {
      add({
        tick: tickOfMonth(getRules(player.countryCode).tax.yearStartMonth),
        kind: 'tax',
        key: 'cal.taxYear',
        params: {},
        target: 'finance',
      });
    }
    for (const account of sortedValues(world.ledger.accounts)) {
      if (
        account.ownerId === player.id &&
        account.loan &&
        account.closedTick === null &&
        account.loan.firstPaymentTick > world.tick
      ) {
        add({
          tick: account.loan.firstPaymentTick,
          kind: 'loan',
          key: 'cal.loanStarts',
          params: { product: account.loan.product },
          target: 'finance',
        });
      }
    }
    const stateAge = getRules(player.countryCode).pension.stateAge;
    const pensionTick = monthIndex(addMonths(player.birth, stateAge * 12)) - world.startIndex;
    add({
      tick: pensionTick,
      kind: 'pension',
      key: 'cal.statePension',
      params: { age: stateAge },
      target: 'finance',
    });
  }
  for (const e of world.expecting) {
    if (e.parentIds.includes(player.id))
      add({
        tick: e.dueTick,
        kind: 'family',
        key: e.kind === 'birth' ? 'cal.babyDue' : 'cal.adoption',
        params: {},
        target: 'family',
      });
  }
  for (const item of world.calendar.items) {
    if (item.status !== 'scheduled') continue;
    const partner = item.withId ? world.characters[item.withId] : undefined;
    add({
      tick: item.tick,
      kind: item.kind,
      key: `cal.${item.kind}`,
      params: {
        option: item.option,
        name: partner?.identity.firstName ?? '',
        cost: item.costMinor.toString(),
      },
      target: item.kind === 'wedding' ? 'person' : 'calendar',
      targetId: item.withId,
      itemId: item.kind === 'wedding' ? null : item.id,
    });
  }
  return out.sort((a, b) => a.tick - b.tick || a.kind.localeCompare(b.kind));
}

/** Clashes for a proposed calendar item (shown before booking). */
export function conflictsFor(world: World, tick: number): string[] {
  const player = world.characters[world.activeCharacterId];
  if (!player) return [];
  const clashes: string[] = [];
  for (const entry of upcoming(world, 24)) {
    if (entry.tick !== tick) continue;
    if (
      entry.kind === 'exam' ||
      entry.kind === 'interview' ||
      entry.kind === 'wedding' ||
      entry.kind === 'vacation' ||
      entry.kind === 'family'
    ) {
      clashes.push(entry.key);
    }
  }
  return clashes;
}

/** Hours that recurring plans will use each month. */
export function plannedHours(world: World): number {
  let total = 0;
  for (const plan of world.calendar.plans)
    total += activityHours(plan.activityId) * plan.timesPerMonth;
  return total;
}

export function relationshipCloseness(world: World, aId: string, bId: string): number | null {
  return findRelationship(world, aId, bId)?.closeness ?? null;
}

export { ACTIVITIES };
