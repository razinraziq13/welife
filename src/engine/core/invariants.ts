import { monthIndex } from './clock';
import { findEvent } from '../content';
import { findLocation } from '../world/countries';
import { checkLedger } from '../economy/ledger';
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

  // Money (spec §6: debits = credits; no illegal negative balances).
  v.push(...checkLedger(world));
  for (const h of Object.values(world.households)) {
    if (!h.finance) continue;
    for (const id of [h.finance.checkingId, h.finance.savingsId]) {
      if (!world.ledger.accounts[id]) v.push(`household ${h.id} has a missing account`);
    }
    if (!world.characters[h.finance.headId]) v.push(`household ${h.id} has an unknown head`);
  }

  // Ownership (spec §6): shares of every company and property add up to 100%.
  for (const b of Object.values(world.businesses)) {
    const total = b.owners.reduce((sum, o) => sum + o.sharesBp, 0);
    if (total !== 10_000) v.push(`business ${b.id} shares add up to ${String(total)} bp`);
    if (new Set(b.owners.map((o) => o.ownerId)).size !== b.owners.length)
      v.push(`business ${b.id} lists an owner twice`);
    for (const o of b.owners) {
      if (!world.characters[o.ownerId]) v.push(`business ${b.id} has a missing owner`);
      if (o.stakeAccountId && !world.ledger.accounts[o.stakeAccountId])
        v.push(`business ${b.id} has a missing stake account`);
    }
    if (!world.ledger.accounts[b.cashAccountId]) v.push(`business ${b.id} has no cash account`);
    if (b.status === 'active' && b.branches.length === 0)
      v.push(`active business ${b.id} has no branches`);
    for (const branch of b.branches)
      if (!findLocation(branch.locationId)) v.push(`branch ${branch.id} has an unknown location`);
  }
  for (const p of Object.values(world.properties)) {
    const total = p.owners.reduce((sum, o) => sum + o.sharesBp, 0);
    if (total !== 10_000) v.push(`property ${p.id} shares add up to ${String(total)} bp`);
    for (const o of p.owners)
      if (!world.characters[o.ownerId]) v.push(`property ${p.id} has a missing owner`);
    if (p.mortgageAccountId && !world.ledger.accounts[p.mortgageAccountId])
      v.push(`property ${p.id} has a missing mortgage`);
    if (p.status === 'owned' && p.tenant && p.use !== 'rental')
      v.push(`property ${p.id} has a tenant but is not let`);
  }
  for (const h of Object.values(world.households)) {
    const pid = h.finance?.propertyId;
    if (pid && world.properties[pid]?.status !== 'owned')
      v.push(`household ${h.id} lives in a property it no longer owns`);
  }

  // Partnerships are mutual and between adults.
  for (const c of Object.values(world.characters)) {
    const p = c.partnership;
    if (!p) continue;
    const partner = world.characters[p.partnerId];
    if (!partner) {
      v.push(`character ${c.id} has a missing partner`);
      continue;
    }
    if (partner.partnership?.partnerId !== c.id) v.push(`partnership of ${c.id} is not mutual`);
    if (c.death === null && partner.death !== null)
      v.push(`character ${c.id} is partnered to someone who died`);
    if (monthIndex(world.clock) - monthIndex(c.birth) < 18 * 12 && c.death === null) {
      v.push(`character ${c.id} is partnered under 18`);
    }
  }

  // Employment: one active job per person, records consistent.
  const activeJobs = new Map<string, number>();
  for (const e of Object.values(world.employment)) {
    const owner = world.characters[e.characterId];
    if (!owner) v.push(`employment ${e.id} has a missing character`);
    if (e.status === 'active') {
      activeJobs.set(e.characterId, (activeJobs.get(e.characterId) ?? 0) + 1);
      if (owner && owner.employmentId !== e.id) v.push(`active employment ${e.id} is not linked`);
      if (owner && owner.death !== null) v.push(`employment ${e.id} belongs to someone who died`);
    }
  }
  for (const [id, n] of activeJobs)
    if (n > 1) v.push(`character ${id} has ${String(n)} active jobs`);
  for (const c of Object.values(world.characters)) {
    if (c.employmentId && world.employment[c.employmentId]?.status !== 'active') {
      v.push(`character ${c.id} points to an inactive job`);
    }
  }

  // Population (spec §4: at most 150 individually simulated NPCs, 30 of them close).
  let activeNpcs = 0;
  let close = 0;
  for (const c of Object.values(world.characters)) {
    if (c.id === world.activeCharacterId || c.death !== null || c.tier === 'archived') continue;
    activeNpcs += 1;
    if (c.tier === 'close') close += 1;
  }
  if (activeNpcs > 150) v.push(`too many active NPCs (${String(activeNpcs)})`);
  if (close > 30) v.push(`too many close NPCs (${String(close)})`);

  for (const m of Object.values(world.memories)) {
    if (!world.characters[m.ownerId] || m.subjectIds.some((s) => !world.characters[s])) {
      v.push(`memory ${m.id} references a missing character`);
      break;
    }
  }
  for (const e of world.expecting) {
    if (e.parentIds.some((id) => !world.characters[id]))
      v.push(`expecting ${e.id} has a missing parent`);
  }
  for (const item of world.calendar.items) {
    if (item.withId !== null && !world.characters[item.withId])
      v.push(`calendar item ${item.id} references a missing person`);
  }
  for (const a of Object.values(world.jobs.applications)) {
    if (!world.characters[a.characterId]) v.push(`application ${a.id} has a missing character`);
  }

  // Citizenship, residence and civic records (Milestone 6).
  for (const c of Object.values(world.characters)) {
    const cits = c.civic.citizenships;
    if (cits.length === 0 || new Set(cits).size !== cits.length)
      v.push(`${c.id} has invalid citizenships`);
    const r = c.civic.residence;
    if (cits.includes(r.countryCode) && r.status !== 'citizen')
      v.push(`${c.id} is a citizen but not recorded as one`);
    if (!cits.includes(r.countryCode) && r.status === 'citizen')
      v.push(`${c.id} is recorded as a citizen without citizenship`);
    if (r.status === 'visa' && (r.route === null || r.expiresTick === null))
      v.push(`${c.id} has a visa without a route or expiry`);
  }
  const current = world.characters[world.activeCharacterId];
  if (current?.death === null && current.civic.residence.countryCode !== current.countryCode)
    v.push('the player lives somewhere other than their residence country');
  const civicRecords = [
    ...Object.values(world.civics.applications),
    ...Object.values(world.civics.conditions),
    ...Object.values(world.civics.cases),
    ...Object.values(world.civics.service),
    ...Object.values(world.civics.politics),
  ];
  for (const record of civicRecords) {
    if (!world.characters[record.characterId])
      v.push(`civic record ${record.id} references a missing person`);
  }
  for (const [key, duty] of Object.entries(world.civics.royal)) {
    if (key !== duty.characterId || !world.characters[key]) v.push(`royal duty ${key} is invalid`);
  }
  const serving = Object.values(world.civics.service).filter((s) => s.status === 'serving');
  if (new Set(serving.map((s) => s.characterId)).size !== serving.length)
    v.push('someone is serving twice');

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
