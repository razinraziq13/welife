import { ageOf } from '../core/clock';
import { sortedValues } from '../core/data';
import { addBiography, addNotification, activeCharacter, nextId, withRng } from '../core/world';
import { EVENTS, getEvent } from '../content';
import { holdersOf } from '../social/memories';
import { FAMILY_TYPES, kinship } from '../social/relationships';
import { getLocation } from '../world/countries';
import type {
  BiographyEntry,
  Character,
  EventInstance,
  NotificationCategory,
  World,
} from '../state/schema';
import { applyEffects } from './effects';
import { evaluate } from './predicates';
import type { EventDefinition, Subject } from './schema';

/** At most this many events without choices fire for the player in one month. */
export const MAX_AUTOMATIC_EVENTS_PER_MONTH = 2;

function bioCategory(def: EventDefinition): BiographyEntry['category'] {
  switch (def.category) {
    case 'health':
      return 'health';
    case 'family':
      return 'family';
    case 'school':
      return 'school';
    case 'work':
      return 'work';
    case 'money':
      return 'money';
    case 'social':
    case 'romance':
      return 'social';
    default:
      return 'event';
  }
}
function notificationCategory(def: EventDefinition): NotificationCategory {
  const bio = bioCategory(def);
  return bio === 'activity' || bio === 'rules' || bio === 'life' ? 'event' : bio;
}

/** People who could be the subject of an event, in id order. */
export function subjectCandidates(world: World, subject: Subject): Character[] {
  const player = activeCharacter(world);
  const holders = subject.memory ? new Set(holdersOf(world, subject.memory, player.id)) : null;
  const out: Character[] = [];
  for (const rel of sortedValues(world.relationships)) {
    if (rel.aId !== player.id) continue;
    const other = world.characters[rel.bId];
    // People who moved away can still get in touch about something they remember.
    if (other?.death !== null || (other.tier === 'archived' && !holders)) continue;
    if (holders && !holders.has(other.id)) continue;
    if (rel.closeness < subject.minCloseness || rel.closeness > subject.maxCloseness) continue;
    const age = ageOf(other.birth, world.clock).years;
    if (age < subject.minAge || age > subject.maxAge) continue;
    const matches = (() => {
      switch (subject.role) {
        case 'anyone':
          return true;
        case 'relative': {
          const kin = kinship(world, player.id, other.id);
          return (
            kin !== null &&
            FAMILY_TYPES.has(kin) &&
            kin !== 'parent' &&
            kin !== 'sibling' &&
            kin !== 'child'
          );
        }
        case 'partner':
          return player.partnership?.partnerId === other.id;
        case 'parent':
        case 'sibling':
        case 'grandparent':
        case 'child':
          return kinship(world, player.id, other.id) === subject.role;
        default:
          return rel.type === subject.role;
      }
    })();
    if (matches) out.push(other);
  }
  return out;
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

/** Eligibility is checked before probability: predicate, cooldown, limits, subject. */
export function isEligible(def: EventDefinition, world: World): boolean {
  if (def.scheduledOnly) return false;
  const fired = world.events.firedCount[def.id] ?? 0;
  if (def.maxOccurrences !== null && fired >= def.maxOccurrences) return false;
  const last = world.events.lastFiredTick[def.id];
  if (last !== undefined && def.cooldownMonths > 0 && world.tick - last < def.cooldownMonths)
    return false;
  if (!evaluate(def.when, world, activeCharacter(world))) return false;
  if (def.asset !== null && assetCandidates(world, def.asset).length === 0) return false;
  return def.subject === null || subjectCandidates(world, def.subject).length > 0;
}

/** The player's companies or properties an event could be about, in id order. */
export function assetCandidates(
  world: World,
  asset: NonNullable<EventDefinition['asset']>,
): { id: string; name: string }[] {
  const player = world.activeCharacterId;
  if (asset === 'business') {
    return sortedValues(world.businesses)
      .filter((b) => b.status === 'active' && b.owners.some((o) => o.ownerId === player))
      .map((b) => ({ id: b.id, name: b.name }));
  }
  return sortedValues(world.properties)
    .filter(
      (p) =>
        p.status === 'owned' &&
        p.owners.some((o) => o.ownerId === player) &&
        (asset === 'property' || p.tenant !== null),
    )
    .map((p) => ({ id: p.id, name: getLocation(p.locationId).location.name }));
}

/** Adds the chosen company or property to an event's context (or null if none). */
function pickAsset(
  world: World,
  def: EventDefinition,
  context: EventInstance['context'],
): EventInstance['context'] | null {
  if (def.asset === null) return context;
  const candidates = assetCandidates(world, def.asset);
  // A follow-up stays about the same company or property while it is still yours.
  const kept = def.asset === 'business' ? context.businessId : context.propertyId;
  if (typeof kept === 'string' && candidates.some((c) => c.id === kept)) return context;
  if (candidates.length === 0) return null;
  const chosen = withRng(world, 'events', (rng) => rng.pick(candidates));
  return def.asset === 'business'
    ? { ...context, businessId: chosen.id, business: chosen.name }
    : { ...context, propertyId: chosen.id, property: chosen.name };
}

function pickSubject(world: World, def: EventDefinition, preferred: string | null): string | null {
  if (!def.subject) return null;
  const candidates = subjectCandidates(world, def.subject);
  if (preferred && candidates.some((c) => c.id === preferred)) return preferred;
  if (candidates.length === 0) return null;
  return withRng(world, 'events', (rng) => rng.pick(candidates)).id;
}

function createInstance(
  world: World,
  def: EventDefinition,
  sourceInstanceId: string | null,
  subjectId: string | null,
  context: EventInstance['context'],
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
    subjectId,
    context,
  };
  world.events.instances[instance.id] = instance;
  world.events.lastFiredTick[def.id] = world.tick;
  world.events.firedCount[def.id] = (world.events.firedCount[def.id] ?? 0) + 1;
  return instance;
}

/** Parameters for text: the subject's first name and the engine context. */
export function textParams(world: World, instance: EventInstance): Record<string, string | number> {
  const subject = instance.subjectId ? world.characters[instance.subjectId] : undefined;
  return { ...instance.context, subject: subject?.identity.firstName ?? '' };
}

function fireAutomatic(
  world: World,
  def: EventDefinition,
  sourceInstanceId: string | null,
  subjectId: string | null,
  context: EventInstance['context'],
): void {
  const instance = createInstance(world, def, sourceInstanceId, subjectId, context);
  const character = activeCharacter(world);
  applyEffects(world, character, def.effects, `event:${def.id}`, instance.id, {
    subjectId,
    context,
  });
  const params = textParams(world, instance);
  addBiography(world, character.id, bioCategory(def), 'bio.event', {
    eventId: def.id,
    choiceId: '',
    ...params,
  });
  addNotification(
    world,
    notificationCategory(def),
    'ntf.event',
    { eventId: def.id, ...params },
    subjectId ? 'person' : 'life',
    subjectId,
  );
}

function firePending(
  world: World,
  def: EventDefinition,
  sourceInstanceId: string | null,
  subjectId: string | null,
  context: EventInstance['context'],
): string {
  const instance = createInstance(world, def, sourceInstanceId, subjectId, context);
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
    // Decisions come one at a time; the next due one follows when this one is answered.
    if (def.choices.length > 0 && pending !== null) continue;
    world.events.scheduled = world.events.scheduled.filter((s) => s.id !== consequence.id);
    const subjectId = pickSubject(world, def, consequence.subjectId);
    if (def.subject && subjectId === null) continue; // the person is gone: the follow-up lapses
    const scheduledContext = pickAsset(world, def, consequence.context);
    if (scheduledContext === null) continue;
    if (def.exclusiveGroup !== null) groups.add(def.exclusiveGroup);
    if (def.choices.length > 0)
      pending = firePending(world, def, consequence.sourceInstanceId, subjectId, scheduledContext);
    else {
      fireAutomatic(world, def, consequence.sourceInstanceId, subjectId, scheduledContext);
      automatic += 1;
    }
  }
  // Drop consequences for characters who are no longer the active one (e.g. after death).
  world.events.scheduled = world.events.scheduled.filter(
    (s) => world.characters[s.characterId]?.death === null,
  );

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
    const subjectId = pickSubject(world, def, null);
    if (def.subject && subjectId === null) continue;
    const context = pickAsset(world, def, {});
    if (context === null) continue;
    if (def.exclusiveGroup !== null) groups.add(def.exclusiveGroup);
    if (hasChoices) pending = firePending(world, def, null, subjectId, context);
    else {
      fireAutomatic(world, def, null, subjectId, context);
      automatic += 1;
    }
  }
  return pending;
}

/**
 * After a decision is answered, the next scheduled decision due this month (e.g. a second
 * job interview) becomes the waiting decision, so the month still commits only once.
 */
export function fireNextDueDecision(world: World): string | null {
  const due = world.events.scheduled
    .filter((s) => s.dueTick <= world.tick && s.characterId === world.activeCharacterId)
    .sort((a, b) => a.dueTick - b.dueTick || (a.id < b.id ? -1 : 1));
  for (const consequence of due) {
    const def = getEvent(consequence.eventId);
    if (def.choices.length === 0) continue;
    world.events.scheduled = world.events.scheduled.filter((s) => s.id !== consequence.id);
    const subjectId = pickSubject(world, def, consequence.subjectId);
    if (def.subject && subjectId === null) continue;
    const context = pickAsset(world, def, consequence.context);
    if (context === null) continue;
    return firePending(world, def, consequence.sourceInstanceId, subjectId, context);
  }
  return null;
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
    {
      subjectId: instance.subjectId,
      context: instance.context,
    },
  );
  addBiography(world, character.id, bioCategory(def), 'bio.event', {
    eventId: def.id,
    choiceId,
    ...textParams(world, instance),
  });
}

/** Old resolved instances are compacted to keep the world bounded (counts stay). */
export function pruneEventInstances(world: World, keep = 400): void {
  const ids = Object.keys(world.events.instances);
  if (ids.length <= keep + 100) return;
  const resolved = sortedValues(world.events.instances)
    .filter((i) => i.status === 'resolved')
    .sort((a, b) => a.tick - b.tick || (a.id < b.id ? -1 : 1));
  for (const i of resolved.slice(0, ids.length - keep))
    Reflect.deleteProperty(world.events.instances, i.id);
}
