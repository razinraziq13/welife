import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { applyBp } from '@engine/core/money';
import { bookEquity, competitorsAt, minimumCapital, ownerShare } from '@engine/business/business';
import { FAILURE_MONTHS, getBusinessType } from '@engine/business/catalog';
import { convert } from '@engine/economy/economy';
import { monthTotals } from '@engine/economy/ledger';
import { upgradeWorldV2, upgradeWorldV3, upgradeWorldV4 } from '@engine/state/upgrade';
import { WorldSchema, type Business, type World } from '@engine/state/schema';
import type { SimState } from '@engine/core/commands';
import { checked, findWork, giveMoney, monthChecked } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf } from '../../helpers/sim';

function adult(seed: string, countryCode = 'MY'): SimState {
  return advanceMonths(newState({ seed, countryCode, scenario: 'wealthy' }), 24 * 12);
}

function start(state: SimState, typeId: string, locationId: string, name: string): SimState {
  const player = playerOf(state);
  const capital = convert(
    state.world,
    minimumCapital(state.world, getBusinessType(typeId), locationId) * 2n,
    locationId.slice(0, 2).toUpperCase(),
    player.countryCode,
  );
  const result = checked(state, {
    type: 'startBusiness',
    typeId,
    locationId,
    name,
    capitalMinor: capital.toString(),
  });
  expect(result.outcome).toMatchObject({ status: 'applied' });
  return result.state;
}

function business(world: World, name: string): Business {
  const found = Object.values(world.businesses).find((b) => b.name === name);
  if (!found) throw new Error(`no business ${name}`);
  return found;
}

/** Statement identities and stake consistency for every active company this month. */
function companiesConsistent(world: World): void {
  for (const b of Object.values(world.businesses)) {
    if (b.status !== 'active') continue;
    const s = b.statement;
    expect(s?.tick).toBe(world.tick);
    if (!s) continue;
    expect(s.operatingProfit).toBe(s.revenue - s.cogs - s.wages - s.rent - s.marketing - s.other);
    expect(s.netProfit).toBe(s.operatingProfit - s.interest - s.tax);
    // Processed exactly once per month: one history entry per tick.
    expect(new Set(b.history.map((h) => h.tick)).size).toBe(b.history.length);
    expect(b.owners.reduce((sum, o) => sum + o.sharesBp, 0)).toBe(10_000);
    for (const owner of b.owners) {
      if (!owner.stakeAccountId) continue;
      const person = world.characters[owner.ownerId];
      const stake = world.ledger.accounts[owner.stakeAccountId];
      if (!person || !stake) throw new Error('missing stake');
      const equity = bookEquity(world, b);
      const expected = convert(
        world,
        applyBp(equity > 0n ? equity : 0n, owner.sharesBp),
        b.countryCode,
        person.countryCode,
      );
      expect(stake.balance).toBe(expected);
    }
  }
}

describe('companies (Milestone 5)', () => {
  it('several companies in two countries are accounted once a month, reconcile and keep ownership at 100% (M5 exit)', () => {
    let state = giveMoney(adult('tycoon'), 50_000_000_00n);
    const home = playerOf(state).locationId;
    state = start(state, 'cafe', home, 'Kopi Corner');
    state = start(state, 'consultancy', home, 'Bright Advice');
    state = start(state, 'online-store', home, 'Shop Online');
    // International expansion: a café branch in Singapore.
    state = checked(state, {
      type: 'openBranch',
      businessId: business(state.world, 'Kopi Corner').id,
      locationId: 'sg-central-area',
    }).state;
    expect(business(state.world, 'Kopi Corner').branches).toHaveLength(2);
    // Management: price, staff, stock, marketing, supplier, manager.
    const cafe = business(state.world, 'Kopi Corner');
    const firstBranch = cafe.branches[0];
    if (!firstBranch) throw new Error('no branch');
    state = checked(state, {
      type: 'setPrice',
      businessId: cafe.id,
      branchId: firstBranch.id,
      pricePercent: 105,
    }).state;
    state = checked(state, {
      type: 'setStaff',
      businessId: cafe.id,
      branchId: firstBranch.id,
      staff: 5,
    }).state;
    state = checked(state, {
      type: 'setStock',
      businessId: cafe.id,
      branchId: firstBranch.id,
      units: 4200,
    }).state;
    state = checked(state, { type: 'setSupplier', businessId: cafe.id, supplier: 'premium' }).state;
    state = checked(state, {
      type: 'setManager',
      businessId: business(state.world, 'Shop Online').id,
      manager: 'hired',
    }).state;
    state = checked(state, {
      type: 'businessLoan',
      businessId: business(state.world, 'Bright Advice').id,
      amountMinor: '100000',
      termMonths: 24,
    }).state;

    for (let m = 0; m < 12; m++) {
      state = monthChecked(state);
      companiesConsistent(state.world);
    }
    // Owners take money out and bring investors in.
    const online = business(state.world, 'Shop Online');
    state = checked(state, {
      type: 'payDividend',
      businessId: online.id,
      amountMinor: '100000',
    }).state;
    const raise = checked(state, { type: 'raiseInvestment', businessId: online.id, percent: 20 });
    if (raise.outcome.status === 'applied') {
      state = raise.state;
      const after = business(state.world, 'Shop Online');
      expect(after.owners).toHaveLength(2);
      expect(ownerShare(after, playerOf(state).id)?.sharesBp).toBe(8000);
    } else {
      expect(raise.outcome).toMatchObject({ status: 'rejected' });
    }
    // An acquisition.
    const competitor = competitorsAt(state.world, 'cafe', home)[0];
    if (competitor) {
      const bought = checked(state, {
        type: 'acquireCompetitor',
        businessId: business(state.world, 'Kopi Corner').id,
        competitorId: competitor.id,
      });
      if (bought.outcome.status === 'applied') state = bought.state;
    }
    for (let m = 0; m < 12; m++) {
      state = monthChecked(state);
      companiesConsistent(state.world);
    }
    // Sell one company and close another; the books still reconcile.
    state = checked(state, {
      type: 'sellBusiness',
      businessId: business(state.world, 'Bright Advice').id,
    }).state;
    state = checked(state, {
      type: 'closeBusiness',
      businessId: business(state.world, 'Kopi Corner').id,
    }).state;
    expect(business(state.world, 'Bright Advice').status).toBe('sold');
    expect(business(state.world, 'Kopi Corner').status).toBe('closed');
    for (let m = 0; m < 3; m++) state = monthChecked(state);
    expect(checkInvariants(state.world)).toEqual([]);
    expect(WorldSchema.safeParse(state.world).success).toBe(true);
  }, 120_000);

  it('an unviable company fails after repeated unpaid bills; its debts are written off (limited liability)', () => {
    let state = giveMoney(adult('failure'), 5_000_000_00n);
    const home = playerOf(state).locationId;
    state = start(state, 'guesthouse', home, 'Empty Rooms');
    const b = business(state.world, 'Empty Rooms');
    const branch = b.branches[0];
    if (!branch) throw new Error('no branch');
    state = checked(state, {
      type: 'setPrice',
      businessId: b.id,
      branchId: branch.id,
      pricePercent: 250,
    }).state;
    state = checked(state, {
      type: 'setStaff',
      businessId: b.id,
      branchId: branch.id,
      staff: 30,
    }).state;
    for (let m = 0; m < 24 && business(state.world, 'Empty Rooms').status === 'active'; m++)
      state = monthChecked(state);
    const failed = business(state.world, 'Empty Rooms');
    expect(failed.status).toBe('closed');
    expect(failed.distressMonths).toBeGreaterThanOrEqual(FAILURE_MONTHS);
    const stake = failed.owners[0]?.stakeAccountId;
    expect(stake ? state.world.ledger.accounts[stake]?.closedTick : null).not.toBeNull();
    expect(state.world.biography.some((e) => e.key === 'bio.businessFailed')).toBe(true);
  }, 120_000);

  it('ownership must add up to 100%', () => {
    let state = giveMoney(adult('shares'), 10_000_000_00n);
    state = start(state, 'salon', playerOf(state).locationId, 'Snip');
    const world = structuredClone(state.world);
    const b = business(world, 'Snip');
    const first = b.owners[0];
    if (first) first.sharesBp = 9_000;
    expect(checkInvariants(world).some((v) => v.includes('shares add up'))).toBe(true);
  }, 60_000);

  it('refuses to start a company without enough capital, with a reason', () => {
    const state = adult('broke');
    const result = checked(state, {
      type: 'startBusiness',
      typeId: 'restaurant',
      locationId: playerOf(state).locationId,
      name: 'Too Small',
      capitalMinor: '100',
    });
    expect(result.outcome).toMatchObject({ status: 'rejected', reason: 'ineligible' });
  }, 60_000);
});

describe('property and investments (Milestone 5)', () => {
  it('buy with a mortgage, let, renovate and sell: every month reconciles', () => {
    let state = findWork(giveMoney(adult('landlord', 'GB'), 80_000_000n));
    expect(playerOf(state).employmentId).not.toBeNull();
    // Wait for a listing, then buy it with the minimum deposit.
    let listing = Object.values(state.world.propertyListings).find((l) => l.kind !== 'commercial');
    for (let m = 0; m < 6 && !listing; m++) {
      state = monthChecked(state);
      listing = Object.values(state.world.propertyListings).find((l) => l.kind !== 'commercial');
    }
    if (!listing) throw new Error('no listings');
    // The cheapest home, with a deposit large enough for the repayments to fit an entry salary.
    listing =
      Object.values(state.world.propertyListings)
        .filter((l) => l.kind !== 'commercial')
        .sort((x, y) => (x.askingMinor < y.askingMinor ? -1 : 1))[0] ?? listing;
    // The smallest deposit (from 70%) whose repayments fit the player's income.
    const chosen = listing;
    let bought = checked(state, {
      type: 'buyProperty',
      listingId: chosen.id,
      depositMinor: ((chosen.askingMinor * 70n) / 100n).toString(),
      termMonths: 300,
    });
    for (const percent of [80n, 90n, 95n]) {
      if (bought.outcome.status !== 'rejected') break;
      bought = checked(state, {
        type: 'buyProperty',
        listingId: chosen.id,
        depositMinor: ((chosen.askingMinor * percent) / 100n).toString(),
        termMonths: 300,
      });
    }
    expect(bought.outcome.status === 'rejected' ? bought.outcome.message : 'applied').toBe(
      'applied',
    );
    state = bought.state;
    const property = Object.values(state.world.properties)[0];
    if (!property) throw new Error('no property');
    expect(property.mortgageAccountId).not.toBeNull();
    state = checked(state, {
      type: 'letProperty',
      propertyId: property.id,
      rentMinor: ((property.rentMinor * 95n) / 100n).toString(),
    }).state;
    for (let m = 0; m < 12; m++) state = monthChecked(state);
    const let1 = state.world.properties[property.id];
    expect(
      Object.values(state.world.ledger.history[playerOf(state).id] ?? []).length,
    ).toBeGreaterThan(0);
    expect(let1?.status).toBe('owned');
    const rentPaid = Object.values(state.world.ledger.journal)
      .flat()
      .some((t) => t.kind === 'tx.rentReceived');
    expect(rentPaid || let1?.tenant === null).toBe(true);
    for (let m = 0; m < 24 && state.world.properties[property.id]?.tenant; m++)
      state = monthChecked(state);
    if (!state.world.properties[property.id]?.tenant) {
      state = checked(state, { type: 'stopLetting', propertyId: property.id }).state;
      state = checked(state, { type: 'renovate', propertyId: property.id, level: 'light' }).state;
      for (let m = 0; m < 3; m++) state = monthChecked(state);
      expect(state.world.properties[property.id]?.premiumBp).toBeGreaterThan(0);
    }
    state = checked(state, { type: 'listProperty', propertyId: property.id, list: true }).state;
    for (let m = 0; m < 24 && state.world.properties[property.id]?.status === 'owned'; m++)
      state = monthChecked(state);
    expect(state.world.properties[property.id]?.status).toBe('sold');
    expect(checkInvariants(state.world)).toEqual([]);
  }, 120_000);

  it('moving into your own home stops rent and charges upkeep through the property', () => {
    let state = giveMoney(adult('homeowner', 'AU'), 500_000_000n);
    let listing = Object.values(state.world.propertyListings).find(
      (l) => l.kind === 'apartment' || l.kind === 'house',
    );
    for (let m = 0; m < 12 && !listing; m++) {
      state = monthChecked(state);
      listing = Object.values(state.world.propertyListings).find(
        (l) => l.kind === 'apartment' || l.kind === 'house',
      );
    }
    if (!listing) throw new Error('no listings');
    state = checked(state, {
      type: 'buyProperty',
      listingId: listing.id,
      depositMinor: listing.askingMinor.toString(),
      termMonths: 120,
    }).state;
    const property = Object.values(state.world.properties)[0];
    if (!property) throw new Error('no property');
    state = checked(state, { type: 'moveIntoProperty', propertyId: property.id }).state;
    const home = state.world.households[playerOf(state).householdId];
    expect(home?.finance?.propertyId).toBe(property.id);
    expect(home?.finance?.rentMinor).toBe(0n);
    for (let m = 0; m < 3; m++) state = monthChecked(state);
    const ownTotals = monthTotals(state.world, playerOf(state).id);
    const homeTotals = monthTotals(state.world, playerOf(state).householdId);
    expect(ownTotals.byCategory.has('expense:propertyUpkeep')).toBe(true);
    expect(homeTotals.byCategory.has('expense:home')).toBe(false);
    expect(homeTotals.byCategory.has('expense:rent')).toBe(false);
  }, 120_000);

  it('investment funds move with simulated prices and can be sold', () => {
    let state = giveMoney(adult('investor', 'US'), 10_000_000n);
    state = checked(state, { type: 'buyFund', fund: 'stocks', amountMinor: '5000000' }).state;
    state = checked(state, { type: 'buyFund', fund: 'bonds', amountMinor: '2000000' }).state;
    for (let m = 0; m < 12; m++) state = monthChecked(state);
    const stocks = Object.values(state.world.ledger.accounts).find(
      (a) => a.ownerId === playerOf(state).id && a.category === 'stocks',
    );
    expect(stocks?.balance).not.toBe(5_000_000n);
    state = checked(state, { type: 'sellFund', fund: 'stocks', amountMinor: '1000000' }).state;
    const tooMuch = checked(state, {
      type: 'sellFund',
      fund: 'bonds',
      amountMinor: '999999999999',
    });
    expect(tooMuch.outcome).toMatchObject({ status: 'rejected' });
  }, 120_000);

  it('converts money between currencies at simulated exchange rates', () => {
    const world = newState().world;
    const gbp = convert(world, 100_00n, 'GB', 'US');
    expect(gbp).toBe(130_00n);
    expect(convert(world, 1_000n, 'JP', 'JP')).toBe(1_000n);
    const back = convert(world, convert(world, 1_000_000n, 'MY', 'SG'), 'SG', 'MY');
    expect(back > 999_000n && back < 1_001_000n).toBe(true);
  });
});

describe('decisions and upgrades', () => {
  it('two decisions due in the same month are answered one after another before the month commits', () => {
    let state = newState({ seed: 'two-decisions' });
    const world = structuredClone(state.world);
    for (const id of ['a', 'b']) {
      world.events.scheduled.push({
        id: `csq_${id}`,
        sourceInstanceId: 'test',
        eventId: 'test-answers-found',
        characterId: world.activeCharacterId,
        dueTick: world.tick + 1,
        subjectId: null,
        context: {},
      });
    }
    world.events.scheduled.push({
      id: 'csq_c',
      sourceInstanceId: 'test',
      eventId: 'car-trouble',
      characterId: world.activeCharacterId,
      dueTick: world.tick + 1,
      subjectId: null,
      context: {},
    });
    world.events.scheduled.push({
      id: 'csq_d',
      sourceInstanceId: 'test',
      eventId: 'study-abroad',
      characterId: world.activeCharacterId,
      dueTick: world.tick + 1,
      subjectId: null,
      context: {},
    });
    state = { world, pending: null };
    const advanced = checked(state, { type: 'advance', expectedTick: 0 });
    expect(advanced.outcome).toMatchObject({ kind: 'pending' });
    const first = advanced.state.pending?.events.pendingInstanceId ?? '';
    const r1 = checked(advanced.state, { type: 'choose', instanceId: first, choiceId: 'fix' });
    const r1b =
      r1.outcome.status === 'applied'
        ? r1
        : checked(advanced.state, { type: 'choose', instanceId: first, choiceId: 'go' });
    expect(r1b.outcome).toMatchObject({ kind: 'chainedChoice' });
    expect(r1b.state.world.tick).toBe(0);
    const second = r1b.state.pending?.events.pendingInstanceId ?? '';
    const def = r1b.state.pending?.events.instances[second]?.definitionId;
    const r2 = checked(r1b.state, {
      type: 'choose',
      instanceId: second,
      choiceId: def === 'car-trouble' ? 'fix' : 'go',
    });
    expect(r2.outcome).toMatchObject({ kind: 'chosen' });
    expect(r2.state.world.tick).toBe(1);
  });

  it('a version-2 world upgrades to version 3 (and on to 4)', () => {
    const world = structuredClone(newState().world) as unknown as Record<string, unknown>;
    for (const key of ['businesses', 'competitors', 'properties', 'propertyListings'])
      Reflect.deleteProperty(world, key);
    world.schemaVersion = 2;
    for (const e of Object.values(world.economy as Record<string, Record<string, unknown>>)) {
      Reflect.deleteProperty(e, 'fxIndexBp');
      Reflect.deleteProperty(e, 'housePriceBp');
      Reflect.deleteProperty(e, 'bondIndexBp');
    }
    const upgraded = upgradeWorldV4(upgradeWorldV3(upgradeWorldV2(world))) as World;
    expect(WorldSchema.safeParse(upgraded).success).toBe(true);
    expect(checkInvariants(upgraded)).toEqual([]);
  });
});
