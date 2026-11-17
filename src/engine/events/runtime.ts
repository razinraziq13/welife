import { addBiography, addNotification, activeCharacter, nextId, withRng } from '../core/world';
import { EVENTS, getEvent } from '../content';
import type { BiographyEntry, EventInstance, NotificationCategory, World } from '../state/schema';
import { applyEffects } from './effects';
import { evaluate } from './predicates';
import type { EventDefinition } from './schema';

/** At most this many events without choices fire for the player in one month. */
export const MAX_AUTOMATIC_EVENTS_PER_MONTH = 2;

function bioCategory(def: EventDefinition): BiographyEntry['category'] {
  return def.category === 'health' ? 'health' : def.category === 'family' ? 'family' : 'event';
}
function notificationCategory(def: EventDefinition): NotificationCategory {
  return def.category === 'health' ? 'health' : def.category === 'family' ? 'family' : 'event';
}

/** Effective chance in ppm: clamp(base x multipliers, 0, 1) as integers (spec §4 Events). */
export function eventChancePpm(def: EventDefinition, world: World): number {
  const character = activeCharacter(world);
  let chance = def.chancePpm;
  for (const multiplier of def.multipliers) {
    if (evaluate(multiplier.when, world, character))
      chance = Math.floor((chance * multiplier.percent) / 100);
  }
  return Math.max(0, Math.min(1_000_000, chance));
}

/** Eligibility is checked before probability: predicate, cooldown and occurrence limits. */
export function isEligible(def: EventDefinition, world: World): boolean {
  if (def.scheduledOnly) return false;
  const fired = world.events.firedCount[def.id] ?? 0;
  if (def.maxOccurrences !== null && fired >= def.maxOccurrences) return false;
  const last = world.events.lastFiredTick[def.id];
  if (last !== undefined && def.cooldownMonths > 0 && world.tick - last < def.cooldownMonths)
    return false;
  return evaluate(def.when, world, activeCharacter(world));
}

function createInstance(
  world: World,
  def: EventDefinition,
  sourceInstanceId: string | null,
): EventInstance {
  const instance: EventInstance = {
    id: nextId(world, 'evt'),
    definitionId: def.id,
    definitionVersion: def.version,
    tick: world.tick,
    characterId: world.activeCharacterId,
    status: def.choices.length > 0 ? 'pending' : 'resolved',
    choiceId: null,
    sourceInstanceId,
  };
  world.events.instances[instance.id] = instance;
  world.events.lastFiredTick[def.id] = world.tick;
  world.events.firedCount[def.id] = (world.events.firedCount[def.id] ?? 0) + 1;
  return instance;
}

function fireAutomatic(world: World, def: EventDefinition, sourceInstanceId: string | null): void {
  const instance = createInstance(world, def, sourceInstanceId);
  const character = activeCharacter(world);
  applyEffects(world, character, def.effects, `event:${def.id}`, instance.id);
  addBiography(world, character.id, bioCategory(def), 'bio.event', {
    eventId: def.id,
    choiceId: '',
  });
  addNotification(world, notificationCategory(def), 'ntf.event', { eventId: def.id }, 'life');
}

function firePending(world: World, def: EventDefinition, sourceInstanceId: string | null): string {
  const instance = createInstance(world, def, sourceInstanceId);
  world.events.pendingInstanceId = instance.id;
  return instance.id;
}

/**
 * Step 9 of the monthly tick: delayed consequences first, then random events.
 * Never more than one decision per month and never two events from the same exclusive
 * group, so the month's events cannot contradict each other. Returns the pending
 * decision's instance id, if any.
 */
export function runMonthlyEvents(world: World): string | null {
  if (world.lifeStatus !== 'alive') return null;
  let pending: string | null = null;
  let automatic = 0;
  const groups = new Set<string>();

  // 1. Delayed consequences that are due.
  const due = world.events.scheduled
    .filter((s) => s.dueTick <= world.tick && s.characterId === world.activeCharacterId)
    .sort((a, b) => a.dueTick - b.dueTick || (a.id < b.id ? -1 : 1));
  for (const consequence of due) {
    const def = getEvent(consequence.eventId);
    if (def.choices.length > 0 && pending !== null) {
      consequence.dueTick = world.tick + 1; // defer: one decision per month
      continue;
    }
    world.events.scheduled = world.events.scheduled.filter((s) => s.id !== consequence.id);
    if (def.exclusiveGroup !== null) groups.add(def.exclusiveGroup);
    if (def.choices.length > 0) pending = firePending(world, def, consequence.sourceInstanceId);
    else {
      fireAutomatic(world, def, consequence.sourceInstanceId);
      automatic += 1;
    }
  }

  // 2. Random events, in a seeded random order.
  const eligible = EVENTS.filter((def) => isEligible(def, world));
  const order = withRng(world, 'events', (rng) => rng.shuffle(eligible));
  for (const def of order) {
    if (def.exclusiveGroup !== null && groups.has(def.exclusiveGroup)) continue;
    const hasChoices = def.choices.length > 0;
    if (hasChoices && pending !== null) continue;
    if (!hasChoices && automatic >= MAX_AUTOMATIC_EVENTS_PER_MONTH) continue;
    const chance = eventChancePpm(def, world);
    const fires = withRng(world, 'events', (rng) => rng.chancePpm(chance));
    if (!fires) continue;
    if (def.exclusiveGroup !== null) groups.add(def.exclusiveGroup);
    if (hasChoices) pending = firePending(world, def, null);
    else {
      fireAutomatic(world, def, null);
      automatic += 1;
    }
  }
  return pending;
}

export class ChoiceError extends Error {
  readonly code: 'NO_PENDING' | 'WRONG_INSTANCE' | 'UNKNOWN_CHOICE' | 'CHOICE_UNAVAILABLE';
  constructor(code: ChoiceError['code'], message: string) {
    super(message);
    this.name = 'ChoiceError';
    this.code = code;
  }
}

/** Which choices of a pending event the character may pick (spec §3.5 eligibility cues). */
export function choiceAvailability(
  world: World,
  instanceId: string,
): { id: string; available: boolean }[] {
  const instance = world.events.instances[instanceId];
  if (!instance) return [];
  const def = getEvent(instance.definitionId);
  const character = activeCharacter(world);
  return def.choices.map((choice) => ({
    id: choice.id,
    available: choice.requires === null || evaluate(choice.requires, world, character),
  }));
}

/** Applies the chosen option of the pending event exactly once and clears the pending state. */
export function resolveChoice(world: World, instanceId: string, choiceId: string): void {
  const pendingId = world.events.pendingInstanceId;
  if (pendingId === null) throw new ChoiceError('NO_PENDING', 'No decision is waiting.');
  if (pendingId !== instanceId)
    throw new ChoiceError('WRONG_INSTANCE', 'That decision is no longer waiting.');
  const instance = world.events.instances[instanceId];
  if (instance?.status !== 'pending') {
    throw new ChoiceError('WRONG_INSTANCE', 'That decision is no longer waiting.');
  }
  const def = getEvent(instance.definitionId);
  const choice = def.choices.find((c) => c.id === choiceId);
  if (!choice) throw new ChoiceError('UNKNOWN_CHOICE', `Unknown choice ${choiceId}.`);
  const character = activeCharacter(world);
  if (choice.requires !== null && !evaluate(choice.requires, world, character)) {
    throw new ChoiceError('CHOICE_UNAVAILABLE', 'That choice is not available.');
  }
  instance.status = 'resolved';
  instance.choiceId = choiceId;
  world.events.pendingInstanceId = null;
  applyEffects(
    world,
    character,
    [...def.effects, ...choice.effects],
    `event:${def.id}`,
    instance.id,
  );
  addBiography(world, character.id, bioCategory(def), 'bio.event', { eventId: def.id, choiceId });
}
