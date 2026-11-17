import { monthIndex } from './clock';
import { findEvent } from '../content';
import { findLocation } from '../world/countries';
import type { World } from '../state/schema';

/**
 * World invariants (spec §6 "Important invariants"). Checked after creation, after every
 * command and at the end of every monthly tick; a violation aborts the change so a broken
 * state is never committed.
 */
export class InvariantError extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super(`World invariants violated:\n- ${violations.join('\n- ')}`);
    this.name = 'InvariantError';
    this.violations = violations;
  }
}

export function checkInvariants(world: World): string[] {
  const v: string[] = [];

  // Clock.
  if (world.tick !== monthIndex(world.clock) - world.startIndex) {
    v.push(`tick ${String(world.tick)} does not match the clock`);
  }

  // Exactly one active, player-controlled character.
  const active = world.characters[world.activeCharacterId];
  if (!active) v.push('active character does not exist');
  else if ((active.death === null) !== (world.lifeStatus === 'alive')) {
    v.push('lifeStatus does not match the active character');
  }

  // Characters and households reference each other consistently.
  for (const id of Object.keys(world.characters)) {
    const c = world.characters[id];
    if (!c) continue;
    if (c.id !== id) v.push(`character key ${id} != id ${c.id}`);
    const household = world.households[c.householdId];
    if (!household) v.push(`character ${id} has missing household ${c.householdId}`);
    else if (!household.memberIds.includes(id))
      v.push(`character ${id} not listed in its household`);
    const location = findLocation(c.locationId);
    if (!location) v.push(`character ${id} has unknown location ${c.locationId}`);
    else if (location.country.code !== c.countryCode)
      v.push(`character ${id} country/location mismatch`);
    if (monthIndex(c.birth) > monthIndex(world.clock)) v.push(`character ${id} born in the future`);
    if (c.death && monthIndex(c.death) < monthIndex(c.birth))
      v.push(`character ${id} died before birth`);
  }
  for (const id of Object.keys(world.households)) {
    const h = world.households[id];
    if (!h) continue;
    if (new Set(h.memberIds).size !== h.memberIds.length)
      v.push(`household ${id} has duplicate members`);
    for (const memberId of h.memberIds) {
      const member = world.characters[memberId];
      if (!member) v.push(`household ${id} has missing member ${memberId}`);
      else if (member.householdId !== id) v.push(`member ${memberId} points to another household`);
    }
  }

  // Family links: valid references and no ancestry cycles.
  const parentsOf = new Map<string, string[]>();
  for (const link of Object.values(world.familyLinks)) {
    if (!world.characters[link.parentId] || !world.characters[link.childId]) {
      v.push(`family link ${link.id} references a missing character`);
      continue;
    }
    if (link.parentId === link.childId) v.push(`family link ${link.id} is self-referential`);
    const list = parentsOf.get(link.childId) ?? [];
    list.push(link.parentId);
    parentsOf.set(link.childId, list);
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const parent of parentsOf.get(id) ?? []) if (hasCycle(parent)) return true;
    visiting.delete(id);
    done.add(id);
    return false;
  };
  for (const id of [...parentsOf.keys()].sort()) {
    if (hasCycle(id)) {
      v.push(`ancestry cycle involving ${id}`);
      break;
    }
  }

  for (const rel of Object.values(world.relationships)) {
    if (!world.characters[rel.aId] || !world.characters[rel.bId]) {
      v.push(`relationship ${rel.id} references a missing character`);
    }
  }

  // Events: one pending decision at most, all definitions known, effects applied once.
  let pendingCount = 0;
  for (const instance of Object.values(world.events.instances)) {
    if (!findEvent(instance.definitionId))
      v.push(`event instance ${instance.id} has unknown definition`);
    if (instance.status === 'pending') pendingCount += 1;
    if (instance.status === 'resolved' && instance.choiceId === null) {
      const def = findEvent(instance.definitionId);
      if (def && def.choices.length > 0)
        v.push(`choice event ${instance.id} resolved without a choice`);
    }
  }
  if (pendingCount > 1) v.push('more than one pending event');
  const pendingId = world.events.pendingInstanceId;
  if (pendingId !== null) {
    const instance = world.events.instances[pendingId];
    if (instance?.status !== 'pending')
      v.push('pendingInstanceId does not point to a pending event');
  } else if (pendingCount > 0) {
    v.push('pending event without pendingInstanceId');
  }
  for (const s of world.events.scheduled) {
    if (!findEvent(s.eventId)) v.push(`scheduled consequence ${s.id} has unknown event`);
    if (!world.characters[s.characterId])
      v.push(`scheduled consequence ${s.id} has unknown character`);
  }

  // Command ids are never applied twice.
  if (new Set(world.recentCommandIds).size !== world.recentCommandIds.length) {
    v.push('duplicate command ids');
  }

  // Bounded state.
  for (const entry of world.biography) {
    if (!world.characters[entry.characterId]) {
      v.push(`biography entry ${entry.id} references a missing character`);
      break;
    }
  }
  return v;
}

export function assertInvariants(world: World): void {
  const violations = checkInvariants(world);
  if (violations.length > 0) throw new InvariantError(violations);
}
