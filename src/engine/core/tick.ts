import { addMonths } from './clock';
import { deepClone } from './data';
import { assertInvariants } from './invariants';
import { ensureActivityMonth } from '../activities/activities';
import { processCalendarItems, runPlans } from '../calendar/calendar';
import { processEmployment, refreshJobMarket } from '../career/jobs';
import {
  driftRelationships,
  processMortality,
  updateCharactersMonthly,
} from '../characters/monthly';
import { advanceEconomies } from '../economy/economy';
import { processFinances, rescheduleStudentLoan } from '../economy/finance';
import { processEducation } from '../education/school';
import { pruneEventInstances, resolveChoice, runMonthlyEvents } from '../events/runtime';
import { playerFamilyPlanning, processExpecting, processNpcFamilies } from '../social/family';
import { decayMemories } from '../social/memories';
import { enforcePopulation, rebalancePopulation } from '../social/population';
import type { World } from '../state/schema';

/**
 * The monthly turn (spec §4 "Turn processing order"):
 *
 *  1  validate (alive, no decision pending)
 *  2  scheduled commitments: recurring activity plans for the month that is ending
 *  3  advance the clock exactly once; birthdays and life stages
 *  4  economy, then household money: wages, taxes, benefits, costs, loans, insurance
 *  5  businesses and property (Milestone 5)
 *  6  education, characters (needs, energy, stress, health, habits), work, calendar items
 *  7  NPC lives (partners, children, careers), births, mortality
 *  8  relationships and memories; job market; population tiers
 *  9  events and delayed consequences (seeded)
 * 10  if a decision is needed, return a PENDING turn and wait
 * 11  outcomes, notifications, biography; invariants
 * 12  the caller commits world + snapshot atomically (persistence layer)
 *
 * Every step works on a private copy; the input world is never modified.
 */

export class TickError extends Error {
  readonly code: 'LIFE_ENDED' | 'PENDING_CHOICE';
  constructor(code: TickError['code'], message: string) {
    super(message);
    this.name = 'TickError';
    this.code = code;
  }
}

export interface TickReport {
  fromTick: number;
  toTick: number;
  deaths: string[];
  pendingInstanceId: string | null;
}

export type AdvanceResult =
  | { kind: 'committed'; world: World; report: TickReport }
  | { kind: 'pending'; world: World; report: TickReport };

/** Notifications are transient: keep the latest ones (pruned in batches to keep deltas small). */
export const NOTIFICATION_KEEP = 300;
const NOTIFICATION_PRUNE_AT = 400;

function trimNotifications(world: World): void {
  if (world.notifications.length > NOTIFICATION_PRUNE_AT) {
    world.notifications = world.notifications.slice(-NOTIFICATION_KEEP);
  }
}

export function advanceMonth(committed: World): AdvanceResult {
  // 1. Validate.
  if (committed.lifeStatus !== 'alive') throw new TickError('LIFE_ENDED', 'This life has ended.');
  if (committed.events.pendingInstanceId !== null) {
    throw new TickError('PENDING_CHOICE', 'A decision is waiting.');
  }
  const world = deepClone(committed);
  const fromTick = world.tick;

  // 2. Recurring plans use what is left of this month's time.
  runPlans(world);

  // 3. Clock.
  world.clock = addMonths(world.clock, 1);
  world.tick += 1;
  ensureActivityMonth(world);

  // 4. Economy and money.
  const markets = advanceEconomies(world);
  processFinances(world, markets);

  // 6. Education, characters, work, calendar.
  processEducation(world);
  updateCharactersMonthly(world);
  processEmployment(world);
  const player = world.characters[world.activeCharacterId];
  if (player) rescheduleStudentLoan(world, player);
  processCalendarItems(world);

  // 7. NPC lives, births, mortality.
  processNpcFamilies(world);
  playerFamilyPlanning(world);
  processExpecting(world);
  const deaths = processMortality(world);

  // 8. Relationships, memories, job market, population.
  driftRelationships(world);
  if (world.tick % 12 === 0) decayMemories(world);
  refreshJobMarket(world);
  if (world.tick % 12 === 0 || deaths.length > 0) rebalancePopulation(world);
  else enforcePopulation(world);

  // 9. Events.
  const pendingInstanceId = runMonthlyEvents(world);
  trimNotifications(world);
  pruneEventInstances(world);

  const report: TickReport = { fromTick, toTick: world.tick, deaths, pendingInstanceId };
  assertInvariants(world);
  // 10. Wait for a decision (11 runs in completePendingMonth).
  if (pendingInstanceId !== null) return { kind: 'pending', world, report };
  return { kind: 'committed', world, report };
}

/** Completes a pending month with the player's choice (steps 10-11). */
export function completePendingMonth(
  intermediate: World,
  instanceId: string,
  choiceId: string,
): World {
  const world = deepClone(intermediate);
  resolveChoice(world, instanceId, choiceId);
  trimNotifications(world);
  assertInvariants(world);
  return world;
}
