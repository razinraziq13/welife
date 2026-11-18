import { describe, expect, it } from 'vitest';
import { ageOf } from '@engine/core/clock';
import { checkInvariants } from '@engine/core/invariants';
import { getEvent } from '@engine/content';
import { isEligible, subjectCandidates } from '@engine/events/runtime';
import { findReferrer } from '@engine/career/jobs';
import { memorySentiment } from '@engine/social/memories';
import { meetPeople } from '@engine/social/npcs';
import {
  MAX_ACTIVE_NPCS,
  MAX_CLOSE_NPCS,
  activeNpcCount,
  rebalancePopulation,
} from '@engine/social/population';
import { kinship } from '@engine/social/relationships';
import type { SimState } from '@engine/core/commands';
import type { World } from '@engine/state/schema';
import { advanceMonths, newState, playerOf, run, settle } from '../../helpers/sim';

function counts(world: World) {
  let active = 0;
  let close = 0;
  for (const c of Object.values(world.characters)) {
    if (c.id === world.activeCharacterId || c.death !== null || c.tier === 'archived') continue;
    active += 1;
    if (c.tier === 'close') close += 1;
  }
  return { active, close };
}

describe('people and population (Milestone 3)', () => {
  it('a new life starts with extended family and a neighbourhood', () => {
    const { world } = newState({ seed: 'community' });
    const player = world.characters[world.activeCharacterId];
    if (!player) throw new Error('no player');
    const kin = Object.values(world.characters).filter(
      (c) => c.id !== player.id && kinship(world, player.id, c.id),
    );
    expect(kin.some((c) => kinship(world, player.id, c.id) === 'grandparent')).toBe(true);
    expect(counts(world).active).toBeGreaterThanOrEqual(25);
    // Everyone active (except the player) has a relationship with the player or a family member.
    const known = new Set(
      Object.values(world.relationships)
        .filter((r) => r.aId === player.id)
        .map((r) => r.bId),
    );
    expect(known.size).toBeGreaterThanOrEqual(20);
    expect(checkInvariants(world)).toEqual([]);
  });

  it('keeps at most 150 individually simulated NPCs (30 close), archiving the least relevant', () => {
    const state = newState({ seed: 'crowd' });
    const world = structuredClone(state.world);
    const player = world.characters[world.activeCharacterId];
    if (!player) throw new Error('no player');
    meetPeople(world, player, 200, 'acquaintance', [20, 60]);
    expect(activeNpcCount(world)).toBeGreaterThan(MAX_ACTIVE_NPCS);
    rebalancePopulation(world);
    const c = counts(world);
    expect(c.active).toBeLessThanOrEqual(MAX_ACTIVE_NPCS);
    expect(c.close).toBeLessThanOrEqual(MAX_CLOSE_NPCS);
    // Close family is never the one archived.
    for (const npc of Object.values(world.characters)) {
      if (npc.householdId === player.householdId && npc.death === null)
        expect(npc.tier).not.toBe('archived');
    }
  });

  it('NPCs progress independently: partners, children, jobs and ageing without the player (M3 exit)', () => {
    const start = newState({ seed: 'independent-lives' });
    const end = advanceMonths(start, 360);
    const w = end.world;
    const startIds = new Set(Object.keys(start.world.characters));
    const bornLater = Object.values(w.characters).filter(
      (c) =>
        !startIds.has(c.id) &&
        ageOf(c.birth, w.clock).totalMonths < 360 &&
        c.id !== w.activeCharacterId,
    );
    expect(bornLater.length).toBeGreaterThan(0);
    const newCouples = Object.values(w.characters).filter(
      (c) => c.partnership && c.partnership.since > 0 && c.id !== w.activeCharacterId,
    );
    expect(newCouples.length).toBeGreaterThan(0);
    const laterJobs = Object.values(w.employment).filter(
      (e) => e.startTick > 0 && e.characterId !== w.activeCharacterId,
    );
    expect(laterJobs.length).toBeGreaterThan(0);
    // The world's NPCs have aged by 30 years.
    const grandparent = Object.values(start.world.characters).find(
      (c) =>
        kinship(start.world, start.world.activeCharacterId, c.id) === 'grandparent' &&
        c.death === null,
    );
    if (grandparent) {
      const later = w.characters[grandparent.id];
      expect(
        later?.death !== null ||
          ageOf(later.birth, w.clock).years >=
            ageOf(grandparent.birth, start.world.clock).years + 30,
      ).toBe(true);
    }
    const c = counts(w);
    expect(c.active).toBeLessThanOrEqual(MAX_ACTIVE_NPCS);
    expect(checkInvariants(w)).toEqual([]);
  }, 60_000);
});

/** Plays from birth until the player is in primary school with classmates. */
function toPrimarySchool(seed: string): SimState {
  let state = newState({ seed, countryCode: 'GB' });
  for (let i = 0; i < 120 && playerOf(state).education.current?.stage !== 'primary'; i++)
    state = advanceMonths(state, 1);
  return state;
}

function classmateOf(state: SimState): string {
  const player = playerOf(state);
  const rel = Object.values(state.world.relationships).find(
    (r) => r.aId === player.id && r.type === 'classmate',
  );
  if (!rel) throw new Error('no classmate');
  return rel.bId;
}

function forceEvent(state: SimState, eventId: string, subjectId: string): SimState {
  const world = structuredClone(state.world);
  world.events.scheduled.push({
    id: 'csq_test',
    sourceInstanceId: 'test',
    eventId,
    characterId: world.activeCharacterId,
    dueTick: world.tick + 1,
    subjectId,
    context: {},
  });
  return { world, pending: null };
}

describe('persistent choices influence later events (M3 exit)', () => {
  const base = toPrimarySchool('butterfly');
  const classmate = classmateOf(base);
  const decide = (choice: string): SimState => {
    let state = forceEvent(base, 'playground-teasing', classmate);
    state = run(state, { type: 'advance', expectedTick: state.world.tick }).state;
    return settle(state, (id) => (id === 'playground-teasing' ? choice : null));
  };
  const brave = decide('standUp');
  const bystander = decide('walkAway');

  it('the classmate remembers what you did', () => {
    expect(memorySentiment(brave.world, classmate, playerOf(brave).id)).toBeGreaterThanOrEqual(60);
    expect(memorySentiment(bystander.world, classmate, playerOf(bystander).id)).toBeLessThan(0);
  });

  it('the memory lasts and makes a different event possible years later', () => {
    const later = advanceMonths(brave, 192);
    const laterBystander = advanceMonths(bystander, 192);
    const subject = getEvent('old-classmate-referral').subject;
    if (!subject) throw new Error('event has no subject');
    expect(subjectCandidates(later.world, subject).map((c) => c.id)).toContain(classmate);
    expect(subjectCandidates(laterBystander.world, subject)).toHaveLength(0);
    // In the brave timeline the referral either already happened or is now possible; in the
    // other timeline it can never happen.
    const fired = later.world.events.firedCount['old-classmate-referral'] ?? 0;
    const player = playerOf(later);
    const possible =
      ageOf(player.birth, later.world.clock).years >= 19 && player.employmentId === null
        ? isEligible(getEvent('old-classmate-referral'), later.world)
        : true;
    expect(fired > 0 || possible).toBe(true);
    expect(laterBystander.world.events.firedCount['old-classmate-referral'] ?? 0).toBe(0);
    expect(isEligible(getEvent('old-classmate-referral'), laterBystander.world)).toBe(false);
    // The bystander's choice makes the reunion apology possible instead.
    const reunion = getEvent('school-reunion').subject;
    if (!reunion) throw new Error('event has no subject');
    expect(subjectCandidates(laterBystander.world, reunion).map((c) => c.id)).toContain(classmate);
  }, 60_000);

  it('someone who remembers you fondly will refer you in their industry (helps, never guarantees)', () => {
    const world = structuredClone(brave.world);
    const npc = world.characters[classmate];
    if (!npc) throw new Error('no classmate');
    world.employment.emp_test = {
      id: 'emp_test',
      characterId: npc.id,
      terms: {
        occupationId: 'software-developer',
        level: 1,
        employer: 'Test',
        industryId: 'technology',
        contract: 'permanent',
        hours: 160,
        salaryMinMinor: 1n,
        salaryMaxMinor: 2n,
        locationId: npc.locationId,
      },
      title: 'Software developer',
      salaryMinor: 1n,
      performance: 500,
      managerId: null,
      startTick: world.tick,
      endTick: null,
      status: 'active',
      endReason: null,
      lastReviewTick: world.tick,
      warnings: 0,
      effort: 'steady',
      raiseRequestedTick: null,
    };
    npc.employmentId = 'emp_test';
    const player = world.characters[world.activeCharacterId];
    if (!player) throw new Error('no player');
    expect(findReferrer(world, player, 'technology')).toBe(classmate);
    const other = structuredClone(bystander.world);
    const otherPlayer = other.characters[other.activeCharacterId];
    if (!otherPlayer) throw new Error('no player');
    expect(findReferrer(other, otherPlayer, 'technology')).not.toBe(classmate);
  });
});

describe('relationships and family (Milestone 3)', () => {
  it('romance is for adults only', () => {
    const state = advanceMonths(newState({ seed: 'teen' }), 15 * 12);
    const player = playerOf(state);
    const other = Object.values(state.world.relationships).find(
      (r) => r.aId === player.id && r.type === 'classmate',
    );
    if (!other) throw new Error('no classmate');
    const result = run(state, { type: 'interact', personId: other.bId, interactionId: 'askOut' });
    expect(result.outcome).toMatchObject({ status: 'rejected', reason: 'ineligible' });
  }, 60_000);

  it('an adult can date, marry, move in and start a family (non-explicit)', () => {
    let state = advanceMonths(
      newState({
        seed: 'family-life',
        identity: { firstName: 'Sam', lastName: null, gender: 'female' },
      }),
      24 * 12,
    );
    // Earn some savings so moving out is possible.
    const world = structuredClone(state.world);
    const player = world.characters[world.activeCharacterId];
    if (!player?.finance?.savingsId) throw new Error('no accounts');
    const savings = world.ledger.accounts[player.finance.savingsId];
    const equity = `${player.id}~equity~test`;
    world.ledger.accounts[equity] = {
      id: equity,
      ownerId: player.id,
      type: 'equity',
      category: 'test',
      currency: savings?.currency ?? 'MYR',
      balance: 50_000_000n,
      rateBp: 0,
      openedTick: world.tick,
      closedTick: null,
      loan: null,
    };
    if (savings) savings.balance += 50_000_000n;
    state = { world, pending: null };
    // Meet people until someone new appears, then spend time with them.
    let partnerId: string | null = null;
    for (let i = 0; i < 24 && !partnerId; i++) {
      const met = run(state, { type: 'meetPeople' });
      state = met.state;
      if (
        met.outcome.status === 'applied' &&
        met.outcome.kind === 'done' &&
        met.outcome.params.personId
      ) {
        const id = String(met.outcome.params.personId);
        if (state.world.characters[id]?.identity.gender === 'male') partnerId = id;
      }
      if (!partnerId) state = advanceMonths(state, 1);
    }
    if (!partnerId) throw new Error('met nobody');
    for (let month = 0; month < 36 && !playerOf(state).partnership; month++) {
      for (let k = 0; k < 3; k++)
        state = run(state, {
          type: 'interact',
          personId: partnerId,
          interactionId: 'hangOut',
        }).state;
      const asked = run(state, { type: 'interact', personId: partnerId, interactionId: 'askOut' });
      state = asked.state;
      state = advanceMonths(state, 1);
    }
    expect(playerOf(state).partnership?.status).toBe('dating');
    state = advanceMonths(state, 6);
    for (let i = 0; i < 12 && playerOf(state).partnership?.status === 'dating'; i++) {
      state = run(state, { type: 'interact', personId: partnerId, interactionId: 'propose' }).state;
      state = advanceMonths(state, 1);
    }
    expect(playerOf(state).partnership?.status).toBe('engaged');
    state = advanceMonths(state, 7);
    expect(playerOf(state).partnership?.status).toBe('married');
    state = run(state, { type: 'moveOut', size: 'apartment' }).state;
    expect(state.world.households[playerOf(state).householdId]?.finance?.headId).toBe(
      playerOf(state).id,
    );
    expect(state.world.characters[partnerId]?.householdId).toBe(playerOf(state).householdId);
    state = run(state, {
      type: 'interact',
      personId: partnerId,
      interactionId: 'planFamily',
    }).state;
    expect(playerOf(state).partnership?.planningFamily).toBe(true);
    const before = Object.keys(state.world.characters).length;
    for (let i = 0; i < 48; i++) {
      state = advanceMonths(state, 1);
      const kids = Object.values(state.world.familyLinks).filter(
        (l) => l.parentId === playerOf(state).id,
      );
      if (kids.length > 0) break;
    }
    const child = Object.values(state.world.familyLinks).find(
      (l) => l.parentId === playerOf(state).id,
    );
    expect(child).toBeDefined();
    expect(Object.keys(state.world.characters).length).toBeGreaterThan(before);
    if (child) expect(kinship(state.world, playerOf(state).id, child.childId)).toBe('child');
    expect(checkInvariants(state.world)).toEqual([]);
  }, 120_000);
});

describe('school (Milestone 3)', () => {
  it('follows the country school structure from preschool to secondary qualifications', () => {
    let state = newState({ seed: 'school-gb', countryCode: 'GB' });
    const stages: string[] = [];
    for (let m = 0; m < 19 * 12; m++) {
      state = advanceMonths(state, 1);
      const stage = playerOf(state).education.current?.stage;
      if (stage && stages[stages.length - 1] !== stage) stages.push(stage);
    }
    expect(stages).toEqual(['preschool', 'primary', 'lowerSecondary', 'upperSecondary']);
    const player = playerOf(state);
    expect(player.education.qualifications).toEqual(
      expect.arrayContaining(['primary', 'lowerSecondary']),
    );
    const gcse = player.education.history.find((h) => h.stage === 'lowerSecondary');
    expect(gcse?.examScore).not.toBeNull();
    expect(player.education.reports.length).toBeGreaterThan(10);
  }, 60_000);

  it('clubs cost time and fees, and you can belong to at most three', () => {
    let state = advanceMonths(newState({ seed: 'clubs', countryCode: 'MY' }), 8 * 12);
    for (const clubId of ['football', 'chess', 'art'])
      state = run(state, { type: 'joinClub', clubId }).state;
    expect(playerOf(state).education.clubs).toEqual(['football', 'chess', 'art']);
    const fourth = run(state, { type: 'joinClub', clubId: 'choir' });
    expect(fourth.outcome).toMatchObject({ status: 'rejected', reason: 'ineligible' });
    state = run(state, { type: 'leaveClub', clubId: 'art' }).state;
    expect(playerOf(state).education.clubs).toEqual(['football', 'chess']);
    state = advanceMonths(state, 24);
    const fees = Object.values(state.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.clubFees');
    expect(fees.length).toBeGreaterThan(0);
  }, 60_000);

  it('cannot leave school before the legal leaving age', () => {
    const state = advanceMonths(newState({ seed: 'stay-in-school', countryCode: 'MY' }), 10 * 12);
    expect(run(state, { type: 'leaveSchool' }).outcome).toMatchObject({ status: 'rejected' });
  }, 60_000);

  it('applies for further study, is admitted, enrols and graduates', () => {
    let state = newState({ seed: 'graduate', countryCode: 'DE' });
    // Reach the final school year.
    for (let m = 0; m < 22 * 12; m++) {
      const current = playerOf(state).education.current;
      if (current?.stage === 'upperSecondary' && current.yearsCompleted >= current.years - 1) break;
      state = advanceMonths(state, 1);
    }
    const applied = run(state, { type: 'applyStudy', programId: 'trades', level: 'diploma' });
    expect(applied.outcome).toMatchObject({ status: 'applied' });
    state = applied.state;
    for (let m = 0; m < 14; m++) {
      state = advanceMonths(state, 1);
      const offer = playerOf(state).education.applications.find((a) => a.status === 'accepted');
      if (offer) {
        state = run(state, { type: 'respondStudy', applicationId: offer.id, accept: true }).state;
        break;
      }
    }
    expect(playerOf(state).education.current?.stage).toBe('tertiary');
    state = advanceMonths(state, 30);
    expect(playerOf(state).education.qualifications).toContain('diploma:trades');
  }, 60_000);
});
