import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { checkLedger } from '@engine/economy/ledger';
import { ensurePlayerAccounts } from '@engine/economy/finance';
import { createNpc } from '@engine/social/npcs';
import { expect as expectChild, formPartnership } from '@engine/social/family';
import { linkPair } from '@engine/social/relationships';
import { moveToHousehold } from '@engine/characters/factory';
import { ACHIEVEMENTS } from '@engine/achievements/achievements';
import { FactSchema } from '@engine/events/schema';
import { WorldSchema, type Character, type World } from '@engine/state/schema';
import type { SimState } from '@engine/core/commands';
import { checked, findWork, giveMoney, monthChecked } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/**
 * Milestone 7 exit criterion (spec §9): a 10-generation simulation with coherent family
 * records. Plus succession on death, inheritance, wills, social media and achievements.
 */

function me(world: World): Character {
  const c = world.characters[world.activeCharacterId];
  if (!c) throw new Error('no player');
  return c;
}

/** Test setup: the player marries someone in their household and a baby is on the way. */
function startFamily(state: SimState, children = 1): SimState {
  const world = structuredClone(state.world);
  const player = me(world);
  const gender = player.identity.gender === 'female' ? 'male' : 'female';
  const age = Math.max(18, world.clock.year - player.birth.year);
  // Reuse a partner the player already has; otherwise someone new.
  const existing = player.partnership ? world.characters[player.partnership.partnerId] : undefined;
  const partner =
    existing?.death === null
      ? existing
      : createNpc(world, {
          countryCode: player.countryCode,
          householdId: player.householdId,
          ageYears: age,
          gender,
          tier: 'close',
        });
  moveToHousehold(world, partner, player.householdId);
  formPartnership(world, player, partner, 'married');
  linkPair(world, player, partner, 'partner', 'partner', { closeness: 85 });
  for (let i = 0; i < children; i++)
    expectChild(world, 'birth', [player.id, partner.id], player.householdId, 1 + i * 12);
  return { world, pending: null };
}

function eldestAdultChild(world: World): Character | undefined {
  const player = me(world);
  return Object.values(world.familyLinks)
    .filter((l) => l.parentId === player.id)
    .map((l) => world.characters[l.childId])
    .filter(
      (c): c is Character =>
        c?.death === null &&
        world.clock.year * 12 + world.clock.month - (c.birth.year * 12 + c.birth.month) >= 18 * 12,
    )
    .sort((a, b) => a.birth.year * 12 + a.birth.month - (b.birth.year * 12 + b.birth.month))[0];
}

function hasCycle(world: World): boolean {
  const parentsOf = new Map<string, string[]>();
  for (const l of Object.values(world.familyLinks))
    parentsOf.set(l.childId, [...(parentsOf.get(l.childId) ?? []), l.parentId]);
  const state = new Map<string, number>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const p of parentsOf.get(id) ?? []) if (visit(p)) return true;
    state.set(id, 2);
    return false;
  };
  return Object.keys(world.characters).some((id) => visit(id));
}

describe('ten generations (M7 exit)', () => {
  it('hands control down ten generations with coherent family records', () => {
    let state = newState({ seed: 'dynasty', countryCode: 'GB', scenario: 'middle' });
    // Play on until the tenth generation: start a family at 18, hand over to the eldest child
    // at 18, and when a player dies early, choose an heir as the game asks.
    for (let step = 0; step < 30 && state.world.legacy.generation < 10; step++) {
      if (state.world.lifeStatus === 'succession') {
        const candidates = state.world.legacy.succession?.candidates ?? [];
        const heirId = candidates[0] ?? '';
        const next = run(state, { type: 'continueAs', characterId: heirId });
        expect(next.outcome).toMatchObject({ status: 'applied' });
        state = next.state;
        continue;
      }
      expect(state.world.lifeStatus).toBe('alive');
      const player = playerOf(state);
      const ageMonths =
        state.world.clock.year * 12 +
        state.world.clock.month -
        (player.birth.year * 12 + player.birth.month);
      state = advanceMonths(state, Math.max(0, 18 * 12 - ageMonths));
      if (state.world.lifeStatus !== 'alive') continue;
      state = startFamily(state, 2);
      for (
        let m = 0;
        m < 30 * 12 && state.world.lifeStatus === 'alive' && !eldestAdultChild(state.world);
        m += 12
      )
        state = advanceMonths(state, 12);
      if (state.world.lifeStatus !== 'alive') continue;
      const heir = eldestAdultChild(state.world);
      // A birth can fall through (the mother dies before it is due): start a family again.
      if (!heir) continue;
      const switched = run(state, { type: 'continueAs', characterId: heir.id });
      expect(switched.outcome).toMatchObject({ status: 'applied' });
      state = switched.state;
      expect(state.world.activeCharacterId).toBe(heir.id);
      expect(checkInvariants(state.world)).toEqual([]);
    }
    const world = state.world;
    const lineage = world.legacy.lineage;
    expect(world.legacy.generation).toBe(10);
    expect(lineage.at(-1)?.generation).toBe(10);
    lineage.forEach((entry, i) => {
      const prev = lineage[i - 1];
      if (!prev) {
        expect(entry).toMatchObject({ generation: 1, reason: 'start' });
        return;
      }
      // Control passed without gaps, to a relative, never back up the generations; a
      // voluntary hand-over goes to a child of the previous player.
      expect(prev.toTick).toBe(entry.fromTick);
      expect(entry.generation).toBeGreaterThanOrEqual(prev.generation);
      const isChild = Object.values(world.familyLinks).some(
        (l) => l.parentId === prev.characterId && l.childId === entry.characterId,
      );
      if (entry.reason === 'switch') expect(isChild).toBe(true);
      if (isChild) expect(entry.generation).toBe(prev.generation + 1);
      expect(
        world.biography.some(
          (b) =>
            b.characterId === entry.characterId &&
            (b.key === 'bio.tookOver' || b.key === 'bio.tookOverHeir'),
        ),
      ).toBe(true);
    });
    expect(hasCycle(world)).toBe(false);
    // Every earlier player still exists in the records; those who died have a recorded death,
    // and anyone who left money behind has a settled estate.
    for (const entry of lineage.slice(0, -1)) {
      const c = world.characters[entry.characterId];
      expect(c).toBeDefined();
      if (c?.death) {
        expect(world.biography.some((b) => b.characterId === c.id && b.key === 'bio.died')).toBe(
          true,
        );
        const owned = Object.values(world.ledger.accounts).some(
          (acc) =>
            acc.ownerId === c.id &&
            acc.closedTick === null &&
            [
              'checking',
              'savings',
              'retirement',
              'investment',
              'property',
              'stake',
              'loan',
              'arrears',
            ].includes(acc.type),
        );
        expect(owned).toBe(false);
      }
    }
    expect(world.achievements['tenth-generation']).toMatchObject({ generation: 10 });
    expect(checkInvariants(world)).toEqual([]);
    expect(checkLedger(world)).toEqual([]);
    expect(WorldSchema.safeParse(world).success).toBe(true);
    // Bounded growth over about two centuries of play.
    expect(
      Object.values(world.characters).filter((c) => c.tier !== 'archived' && c.death === null)
        .length,
    ).toBeLessThanOrEqual(151);
    expect(world.notifications.length).toBeLessThanOrEqual(400);
    expect(Object.keys(world.ledger.journal).length).toBeLessThanOrEqual(4);
  }, 600_000);
});

describe('succession on death (decision D7)', () => {
  it('a child taken over after primary school carries on into secondary school', () => {
    let state = advanceMonths(newState({ seed: 'takeover-school', countryCode: 'MY' }), 25 * 12);
    state = advanceMonths(startFamily(state, 1), 14 * 12);
    const parent = playerOf(state);
    const child = Object.values(state.world.familyLinks)
      .filter((l) => l.parentId === parent.id)
      .map((l) => state.world.characters[l.childId])
      .find((c) => c?.death === null);
    if (!child) throw new Error('no child');
    state = checked(state, { type: 'continueAs', characterId: child.id }).state;
    state = advanceMonths(state, 12);
    // Before the fix they were never enrolled again after primary.
    expect(playerOf(state).education.current?.stage).toMatch(/Secondary$/);
    state = advanceMonths(state, 5 * 12);
    expect(playerOf(state).education.qualifications).toContain('upperSecondary');
  }, 120_000);

  it('a child raised off-screen has skills fitting their age, also when taken over', () => {
    let state = advanceMonths(newState({ seed: 'child-skills', countryCode: 'GB' }), 25 * 12);
    state = advanceMonths(startFamily(state, 1), 10 * 12);
    const parent = playerOf(state);
    const child = Object.values(state.world.familyLinks)
      .filter((l) => l.parentId === parent.id)
      .map((l) => state.world.characters[l.childId])
      .find((c) => c?.death === null);
    if (!child) throw new Error('no child');
    const average = (c: Character) =>
      Object.values(c.skills).reduce((sum, v) => sum + v, 0) / Object.keys(c.skills).length;
    // Learnt as an NPC, a school year at a time.
    expect(average(child)).toBeGreaterThan(80);
    // A save from before this fix: the child has no skills at all until taken over.
    const world = structuredClone(state.world);
    const old = world.characters[child.id];
    if (!old) throw new Error('no child');
    for (const k of Object.keys(old.skills) as (keyof typeof old.skills)[]) old.skills[k] = 0;
    const taken = checked(
      { world, pending: null },
      { type: 'continueAs', characterId: child.id },
    ).state;
    const now = taken.world.characters[child.id];
    if (!now) throw new Error('no child');
    expect(Math.min(...Object.values(now.skills))).toBeGreaterThan(0);
  }, 120_000);

  it('a young child can be taken over while alive and grows up in the family home', () => {
    let state = advanceMonths(newState({ seed: 'young-heir', countryCode: 'GB' }), 25 * 12);
    state = advanceMonths(startFamily(state, 1), 3);
    const parent = playerOf(state);
    const child = Object.values(state.world.familyLinks)
      .filter((l) => l.parentId === parent.id)
      .map((l) => state.world.characters[l.childId])
      .find((c) => c?.death === null);
    if (!child) throw new Error('no child');
    state = checked(state, { type: 'continueAs', characterId: child.id }).state;
    expect(state.world.activeCharacterId).toBe(child.id);
    expect(state.world.characters[parent.id]?.death).toBeNull();
    for (let i = 0; i < 12; i++) state = monthChecked(state);
    expect(state.world.lifeStatus).toBe('alive');
    expect(checkInvariants(state.world)).toEqual([]);
  }, 60_000);

  it('an adult child takes over when the player dies; the estate passes to the heirs', () => {
    let state = newState({ seed: 'succession', countryCode: 'GB' });
    state = advanceMonths(state, 18 * 12);
    state = startFamily(state, 1);
    state = advanceMonths(state, 20 * 12);
    state = giveMoney(state, 10_000_000n);
    // Make death certain this month (test setup): very old and in very poor health.
    const world = structuredClone(state.world);
    const player = me(world);
    player.birth = { year: world.clock.year - 110, month: world.clock.month };
    player.stats.health = 0;
    state = { world, pending: null };
    // About 11% a month at this age and health: 120 months makes survival vanishingly unlikely.
    for (let i = 0; i < 120 && state.world.lifeStatus === 'alive'; i++)
      state = advanceMonths(state, 1);
    expect(state.world.lifeStatus).toBe('succession');
    const deceased = state.world.characters[state.world.legacy.succession?.deceasedId ?? ''];
    expect(deceased?.death).not.toBeNull();
    expect(run(state, { type: 'advance', expectedTick: state.world.tick }).outcome).toMatchObject({
      status: 'rejected',
    });
    const estate = state.world.legacy.estates.find((e) => e.deceasedId === deceased?.id);
    expect(estate).toBeDefined();
    // Intestacy: a married partner and the children share everything.
    const shares = estate?.heirs ?? [];
    expect(shares.reduce((sum, h) => sum + h.sharesBp, 0)).toBe(10_000);
    const children = new Set(
      Object.values(state.world.familyLinks)
        .filter((l) => l.parentId === deceased?.id)
        .map((l) => l.childId),
    );
    const spouse =
      deceased?.partnership?.status === 'married' ? deceased.partnership.partnerId : null;
    for (const h of shares)
      expect(children.has(h.characterId) || h.characterId === spouse).toBe(true);
    if (spouse && state.world.characters[spouse]?.death === null)
      expect(shares.find((h) => h.characterId === spouse)?.sharesBp).toBe(5000);
    expect(
      Object.values(state.world.ledger.accounts).filter(
        (a) =>
          a.ownerId === deceased?.id &&
          a.closedTick === null &&
          a.type !== 'income' &&
          a.type !== 'expense' &&
          a.type !== 'equity',
      ),
    ).toEqual([]);
    const heirId = state.world.legacy.succession?.candidates[0] ?? '';
    const next = run(state, { type: 'continueAs', characterId: heirId });
    expect(next.outcome).toMatchObject({ status: 'applied' });
    expect(next.state.world.lifeStatus).toBe('alive');
    expect(next.state.world.legacy.lineage.at(-1)).toMatchObject({
      characterId: heirId,
      generation: 2,
      reason: 'heir',
    });
    const after = monthChecked(next.state);
    expect(checkLedger(after.world)).toEqual([]);
    expect(checkInvariants(after.world)).toEqual([]);
  }, 300_000);

  it('the life ends when there is no adult relative', () => {
    let state = newState({ seed: 'alone', countryCode: 'JP' });
    const world = structuredClone(state.world);
    for (const c of Object.values(world.characters)) {
      if (c.id === world.activeCharacterId) continue;
      c.death = { ...world.clock };
      const job = c.employmentId ? world.employment[c.employmentId] : undefined;
      if (job) {
        job.status = 'ended';
        job.endTick = world.tick;
        job.endReason = 'died';
      }
      c.employmentId = null;
      c.partnership = null;
    }
    me(world).partnership = null;
    const player = me(world);
    player.birth = { year: world.clock.year - 110, month: world.clock.month };
    player.stats.health = 0;
    state = { world, pending: null };
    for (let i = 0; i < 24 && state.world.lifeStatus === 'alive'; i++)
      state = advanceMonths(state, 1);
    expect(state.world.lifeStatus).toBe('ended');
  }, 120_000);
});

describe('wills and forced heirship (country-specific)', () => {
  it('France reserves half the estate for children; the UK allows free disposal', () => {
    let fr = newState({ seed: 'will-fr', countryCode: 'FR' });
    fr = advanceMonths(fr, 18 * 12);
    fr = startFamily(fr, 1);
    fr = advanceMonths(fr, 2);
    const partnerFr = me(fr.world).partnership?.partnerId ?? '';
    expect(
      run(fr, { type: 'setWill', beneficiaries: [{ characterId: partnerFr, sharesBp: 10_000 }] })
        .outcome,
    ).toMatchObject({ status: 'rejected' });
    let gb = newState({ seed: 'will-gb', countryCode: 'GB' });
    gb = advanceMonths(gb, 18 * 12);
    gb = startFamily(gb, 1);
    gb = advanceMonths(gb, 2);
    const partnerGb = me(gb.world).partnership?.partnerId ?? '';
    expect(
      run(gb, { type: 'setWill', beneficiaries: [{ characterId: partnerGb, sharesBp: 10_000 }] })
        .outcome,
    ).toMatchObject({ status: 'applied' });
  }, 300_000);
});

describe('social media', () => {
  it('posting grows an audience with diminishing returns; income reconciles', () => {
    let state = newState({ seed: 'creator', countryCode: 'US' });
    const world = structuredClone(state.world);
    const player = me(world);
    player.birth = { year: world.clock.year - 25, month: world.clock.month };
    player.education.current = null;
    // Steady, skilled creator so the post-to-post noise is small next to the effect measured.
    player.stats.creativity = 900;
    player.stats.socialSkill = 900;
    player.skills.technology = 900;
    ensurePlayerAccounts(world, player);
    state = { world, pending: null };
    state = checked(state, {
      type: 'createProfile',
      platformId: 'streamline',
      niche: 'gaming',
      handle: 'test_creator',
    }).state;
    const id = Object.keys(state.world.media.profiles)[0] ?? '';
    // Diminishing returns: the same post from the same state counts for far less when it is
    // the sixth this month (identical random draw, only the repeat count differs).
    const first = checked(state, { type: 'post', profileId: id, style: 'informative' });
    const tired = structuredClone(state.world);
    tired.activity = { tick: tired.tick, counts: { [`post:${id}`]: 5 }, hoursUsed: 0 };
    const sixth = checked(
      { world: tired, pending: null },
      { type: 'post', profileId: id, style: 'informative' },
    );
    const gain = (w: World) =>
      (w.media.profiles[id]?.followers ?? 0) - (state.world.media.profiles[id]?.followers ?? 0);
    expect(gain(sixth.state.world)).toBeLessThan(gain(first.state.world) / 2);
    state = first.state;
    for (let m = 0; m < 3; m++) state = monthChecked(state);
    expect(checkLedger(state.world)).toEqual([]);
    expect(
      run(state, {
        type: 'createProfile',
        platformId: 'streamline',
        niche: 'music',
        handle: 'again',
      }).outcome,
    ).toMatchObject({ status: 'rejected' });
  }, 120_000);
});

describe('achievements', () => {
  it('has at least 100 achievements, all using whitelisted facts', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const facts = (p: unknown): string[] => {
      const node = p as { kind: string; fact?: string; of?: unknown };
      if (node.kind === 'cmp' || node.kind === 'in') return [node.fact ?? ''];
      if (node.kind === 'not') return facts(node.of);
      return (node.of as unknown[]).flatMap(facts);
    };
    for (const a of ACHIEVEMENTS)
      for (const f of facts(a.when))
        expect(FactSchema.safeParse(f).success, `${a.id}: ${f}`).toBe(true);
  });

  it('unlocks once per timeline with provenance', () => {
    const state = advanceMonths(newState({ seed: 'achieve' }), 13);
    const unlock = state.world.achievements['first-birthday'];
    expect(unlock).toMatchObject({ characterId: state.world.activeCharacterId, generation: 1 });
    const again = advanceMonths(state, 12);
    expect(again.world.achievements['first-birthday']?.tick).toBe(unlock?.tick);
  }, 60_000);
});

describe('ownership after handing over (spec §4 Legacy, F-05)', () => {
  it('a company keeps its owner and is accounted once a month after the player switches', () => {
    let state = newState({ seed: 'founder', countryCode: 'GB' });
    state = advanceMonths(state, 18 * 12);
    state = startFamily(state, 1);
    state = advanceMonths(state, 19 * 12);
    state = giveMoney(state, 3_000_000_00n);
    const founder = playerOf(state);
    const started = run(state, {
      type: 'startBusiness',
      typeId: 'consultancy',
      locationId: founder.locationId,
      name: 'Founders Ltd',
      capitalMinor: '150000000',
    });
    expect(started.outcome.status === 'rejected' ? started.outcome.message : 'applied').toBe(
      'applied',
    );
    state = started.state;
    // A personal loan keeps being repaid from the former player's own money after the switch.
    state = findWork(state);
    for (let m = 0; m < 3; m++) state = advanceMonths(state, 1);
    state = structuredClone(state);
    const borrower = state.world.characters[state.world.activeCharacterId];
    if (borrower?.finance) borrower.finance.creditScore = 800; // fixture: a good credit history
    const loan = run(state, { type: 'takeLoan', amountMinor: '1000000', termMonths: 24 });
    expect(loan.outcome.status === 'rejected' ? loan.outcome.message : 'applied').toBe('applied');
    state = loan.state;
    const loanAccount = Object.values(state.world.ledger.accounts).find(
      (a) => a.ownerId === founder.id && a.type === 'loan' && a.closedTick === null,
    );
    if (!loanAccount) throw new Error('no loan account');
    const owedAtSwitch = loanAccount.balance;
    const heir = eldestAdultChild(state.world);
    if (!heir) throw new Error('no adult child');
    state = run(state, { type: 'continueAs', characterId: heir.id }).state;
    for (let m = 0; m < 3; m++) state = advanceMonths(state, 1);
    expect(state.world.ledger.accounts[loanAccount.id]?.balance).toBeLessThan(owedAtSwitch);
    const company = Object.values(state.world.businesses).find((b) => b.name === 'Founders Ltd');
    // Control passed; ownership did not.
    expect(company?.owners.map((o) => o.ownerId)).toEqual([founder.id]);
    expect(company?.statement?.tick).toBe(state.world.tick);
    expect(new Set(company?.history.map((h) => h.tick)).size).toBe(company?.history.length);
    expect(checkLedger(state.world)).toEqual([]);
    expect(checkInvariants(state.world)).toEqual([]);
  }, 300_000);
});
