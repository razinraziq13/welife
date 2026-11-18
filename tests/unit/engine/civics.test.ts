import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { checkLedger } from '@engine/economy/ledger';
import { ensurePlayerAccounts, currencyFor } from '@engine/economy/finance';
import { checkRoute, relocationCheck } from '@engine/civics/migration';
import { liable, processService } from '@engine/civics/military';
import { officeCheck } from '@engine/civics/politics';
import { diagnose } from '@engine/civics/health';
import { openCase } from '@engine/civics/law';
import { birthCivic, majorityCitizenship, workRights } from '@engine/civics/status';
import { foreignRules } from '@engine/property/property';
import { jobEligibility } from '@engine/career/jobs';
import { upgradeWorldV3, upgradeWorldV4 } from '@engine/state/upgrade';
import { WorldSchema, type Character, type World } from '@engine/state/schema';
import type { SimState } from '@engine/core/commands';
import { getInstitutions, INSTITUTIONS } from '@engine/world/institutions';
import { COUNTRIES } from '@engine/world/countries';
import { checked, giveMoney, monthChecked } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/**
 * Milestone 6 exit criterion (spec §9): country-specific eligibility tests and Easy
 * Migration behaviour pass. Plus the systems built with it: moving abroad (money converted
 * and reconciled), healthcare, law, religion, military service, politics and royal duties.
 */

/** A fresh world whose player is made `years` old (clock unchanged, accounts opened). */
function aged(state: SimState, years: number, gender?: Character['identity']['gender']): SimState {
  const world = structuredClone(state.world);
  const player = world.characters[world.activeCharacterId];
  if (!player) throw new Error('no player');
  player.birth = { year: world.clock.year - years, month: world.clock.month };
  if (gender) player.identity.gender = gender;
  player.education.current = null;
  ensurePlayerAccounts(world, player);
  return { world, pending: null };
}

function me(world: World): Character {
  const c = world.characters[world.activeCharacterId];
  if (!c) throw new Error('no player');
  return c;
}

/** Gives the player a status in a country directly (setup only). */
function settleIn(
  world: World,
  code: string,
  status: 'visa' | 'permanent',
  route: 'work' | 'study' | 'family' | 'investor' | null,
  months: number,
): void {
  const c = me(world);
  const loc = COUNTRIES.find((x) => x.code === code)?.locations[0];
  if (!loc) throw new Error('no location');
  c.locationId = loc.id;
  c.countryCode = code;
  const home = world.households[c.householdId];
  if (home) home.locationId = loc.id;
  c.civic.residence = {
    countryCode: code,
    status,
    route: status === 'visa' ? route : null,
    sinceTick: world.tick,
    expiresTick: status === 'visa' ? world.tick + 24 : null,
  };
  c.civic.residedMonths[code] = months;
  if (status === 'permanent') c.civic.permanentMonths[code] = months;
}

describe('country profiles (researched institutions)', () => {
  it('covers all 20 countries with sources and coherent rules', () => {
    expect(INSTITUTIONS.map((i) => i.code).sort()).toEqual(COUNTRIES.map((c) => c.code).sort());
    for (const inst of INSTITUTIONS) {
      expect(inst.sources.length).toBeGreaterThanOrEqual(2);
      const total = inst.religion.shares.reduce((s, [, p]) => s + p, 0);
      expect(total, inst.code).toBe(100);
      if (inst.citizenship.naturalisationYears !== null && inst.citizenship.permanentYears !== null)
        expect(inst.citizenship.permanentYears).toBeLessThanOrEqual(30);
      for (const level of ['local', 'legislature', 'leader'] as const) {
        const office = inst.politics.offices[level];
        if (office) expect(office.minAge).toBeGreaterThanOrEqual(18);
      }
    }
  });
});

describe('citizenship at birth follows the birth country (eligibility)', () => {
  it('United States: a child of immigrants is a citizen at birth (unconditional)', () => {
    const state = newState({
      seed: 'us-born',
      countryCode: 'US',
      scenario: 'immigrant',
      originCountryCode: 'IN',
    });
    const c = playerOf(state);
    expect(c.civic.citizenships).toContain('US');
    expect(c.civic.citizenships).toContain('IN');
    expect(c.civic.residence.status).toBe('citizen');
    expect(checkInvariants(state.world)).toEqual([]);
  });

  it('Japan: no birthright; the child holds the parents’ citizenship and permanent residence', () => {
    const state = newState({
      seed: 'jp-born',
      countryCode: 'JP',
      scenario: 'immigrant',
      originCountryCode: 'US',
    });
    const c = playerOf(state);
    expect(c.civic.citizenships).toEqual(['US']);
    expect(c.civic.residence).toMatchObject({ countryCode: 'JP', status: 'permanent' });
  });

  it('United Kingdom: a child of settled parents is British at birth (parentResident)', () => {
    const state = newState({
      seed: 'gb-born',
      countryCode: 'GB',
      scenario: 'immigrant',
      originCountryCode: 'BR',
    });
    expect(playerOf(state).civic.citizenships).toEqual(['BR', 'GB']);
  });

  it('France: born there to foreign parents, French at 18 after five years’ residence', () => {
    const state = newState({
      seed: 'fr-born',
      countryCode: 'FR',
      scenario: 'immigrant',
      originCountryCode: 'ZA',
    });
    const world = structuredClone(state.world);
    const c = me(world);
    expect(c.civic.citizenships).toEqual(['ZA']);
    c.birth = { year: world.clock.year - 18, month: world.clock.month };
    c.civic.residedMonths.FR = 18 * 12;
    expect(majorityCitizenship(world, c)).toBe(true);
    expect(c.civic.citizenships).toEqual(['FR', 'ZA']);
    expect(c.civic.residence.status).toBe('citizen');
  });

  it('descent passes on citizenship wherever the child is born', () => {
    const state = newState({
      seed: 'desc',
      countryCode: 'DE',
      scenario: 'immigrant',
      originCountryCode: 'KR',
    });
    const world = structuredClone(state.world);
    const parent = Object.values(world.characters).find(
      (x) => x.id !== world.activeCharacterId && x.civic.citizenships.includes('KR'),
    );
    if (!parent) throw new Error('no parent');
    const baby = structuredClone(me(world));
    birthCivic(world, baby, [parent], 'CA');
    expect(baby.civic.citizenships).toEqual(['CA', 'KR']);
  });
});

describe('naturalisation, permanent residence and dual citizenship (eligibility)', () => {
  it('Australia: four years with permanent residence; dual citizenship kept', () => {
    const state = aged(newState({ seed: 'au-nat', countryCode: 'GB' }), 30);
    const world = state.world;
    settleIn(world, 'AU', 'permanent', null, 36);
    let check = checkRoute(world, me(world), 'AU', 'citizenship');
    expect(check.reasons).toContain('notLongEnough');
    me(world).civic.residedMonths.AU = 48;
    check = checkRoute(world, me(world), 'AU', 'citizenship');
    expect(check.reasons.filter((r) => r !== 'cannotAffordFee')).toEqual([]);
    expect(check.wouldLose).toEqual([]);
  });

  it('Japanese citizens lose Japanese nationality on naturalising where dual is allowed', () => {
    const state = aged(newState({ seed: 'jp-out', countryCode: 'JP' }), 30);
    settleIn(state.world, 'CA', 'permanent', null, 40);
    const check = checkRoute(state.world, me(state.world), 'CA', 'citizenship');
    expect(check.wouldLose).toEqual(['JP']);
    expect(check.renounceRequired).toBe(false);
  });

  it('Singapore requires renouncing other citizenships, and the command enforces it', () => {
    let state = aged(newState({ seed: 'sg-nat', countryCode: 'MY' }), 30);
    state = giveMoney(state, 50_000_000n);
    settleIn(state.world, 'SG', 'permanent', null, 30);
    const check = checkRoute(state.world, me(state.world), 'SG', 'citizenship');
    expect(check.renounceRequired).toBe(true);
    const refused = run(state, {
      type: 'applyVisa',
      countryCode: 'SG',
      route: 'citizenship',
      renounce: false,
    });
    expect(refused.outcome).toMatchObject({ status: 'rejected' });
    const ok = run(state, {
      type: 'applyVisa',
      countryCode: 'SG',
      route: 'citizenship',
      renounce: true,
    });
    expect(ok.outcome).toMatchObject({ status: 'applied' });
  });

  it('naturalisation is practically unavailable in the UAE, Saudi Arabia and China', () => {
    for (const code of ['AE', 'SA', 'CN']) {
      const state = aged(newState({ seed: `nat-${code}`, countryCode: 'IN' }), 40);
      settleIn(state.world, code, 'permanent', null, 300);
      expect(checkRoute(state.world, me(state.world), code, 'citizenship').reasons).toContain(
        'noNaturalisation',
      );
    }
  });

  it('UAE work visas do not lead to permanent residence; UK Skilled Worker visas do', () => {
    const ae = aged(newState({ seed: 'ae-pr', countryCode: 'IN' }), 30);
    settleIn(ae.world, 'AE', 'visa', 'work', 200);
    expect(checkRoute(ae.world, me(ae.world), 'AE', 'permanent').reasons).toContain(
      'noPermanentRoute',
    );
    const gb = aged(newState({ seed: 'gb-pr', countryCode: 'IN' }), 30);
    settleIn(gb.world, 'GB', 'visa', 'work', 60);
    expect(
      checkRoute(gb.world, me(gb.world), 'GB', 'permanent').reasons.filter(
        (r) => r !== 'cannotAffordFee',
      ),
    ).toEqual([]);
  });

  it('closed routes and age limits are country-specific', () => {
    const state = aged(newState({ seed: 'routes', countryCode: 'MY' }), 50);
    expect(checkRoute(state.world, me(state.world), 'GB', 'investor').reasons).toContain(
      'routeClosed',
    );
    expect(checkRoute(state.world, me(state.world), 'AU', 'work').reasons).toContain('tooOld');
    expect(checkRoute(state.world, me(state.world), 'GB', 'work').reasons).not.toContain('tooOld');
  });
});

describe('Easy Migration (spec §5)', () => {
  it('relaxes future applications: no qualification or age limits, faster, likelier', () => {
    const off = aged(newState({ seed: 'easy', countryCode: 'MY', easyMigration: false }), 50);
    const offCheck = checkRoute(off.world, me(off.world), 'CA', 'work');
    expect(offCheck.reasons).toEqual(expect.arrayContaining(['tooOld', 'qualification']));
    const on = structuredClone(off.world);
    on.rules.easyMigration = true;
    const onCheck = checkRoute(on, me(on), 'CA', 'work');
    expect(onCheck.reasons).not.toContain('tooOld');
    expect(onCheck.reasons).not.toContain('qualification');
    expect(onCheck.approvalBp).toBeGreaterThanOrEqual(9500);
    expect(onCheck.processingMonths).toBeLessThan(offCheck.processingMonths);
    expect(onCheck.feeMinor).toBeLessThan(offCheck.feeMinor);
  });

  it('is per save, logged, and turning it off never removes a status already held', () => {
    let state = aged(newState({ seed: 'easy-off', countryCode: 'MY', easyMigration: true }), 30);
    settleIn(state.world, 'SG', 'permanent', null, 10);
    state = run(state, { type: 'setEasyMigration', value: false }).state;
    expect(state.world.rules.easyMigration).toBe(false);
    expect(state.world.ruleChanges.at(-1)).toMatchObject({
      rule: 'easyMigration',
      from: true,
      to: false,
    });
    state = advanceMonths(state, 3);
    expect(me(state.world).civic.residence).toMatchObject({
      countryCode: 'SG',
      status: 'permanent',
    });
    expect(me(state.world).civic.citizenships).toEqual(['MY']);
  });

  it('renews visas while on; while off an unrenewable visa ends and the player returns home', () => {
    const base = aged(newState({ seed: 'renew', countryCode: 'MY' }), 30);
    settleIn(base.world, 'SG', 'visa', 'work', 20);
    me(base.world).civic.residence.expiresTick = base.world.tick + 1;
    const on = structuredClone(base);
    on.world.rules.easyMigration = true;
    const afterOn = advanceMonths(on, 2);
    expect(me(afterOn.world).civic.residence).toMatchObject({ countryCode: 'SG', status: 'visa' });
    const afterOff = advanceMonths(base, 2);
    expect(me(afterOff.world).civic.residence).toMatchObject({
      countryCode: 'MY',
      status: 'citizen',
    });
    expect(me(afterOff.world).countryCode).toBe('MY');
    expect(checkInvariants(afterOff.world)).toEqual([]);
  });
});

describe('moving abroad (relocation reconciles across currencies)', () => {
  it('applies, is approved, moves and converts money; every step reconciles', () => {
    let state = aged(newState({ seed: 'emigrate', countryCode: 'GB', easyMigration: true }), 28);
    state = giveMoney(state, 3_000_000_00n);
    const applied = checked(state, {
      type: 'applyVisa',
      countryCode: 'AU',
      route: 'work',
      renounce: false,
    });
    expect(applied.outcome).toMatchObject({ status: 'applied' });
    state = applied.state;
    for (let i = 0; i < 8; i++) state = monthChecked(state);
    const app = Object.values(state.world.civics.applications)[0];
    expect(app?.status).toBe('approved');
    expect(relocationCheck(state.world, me(state.world), 'au-sydney')).toEqual([]);
    const moved = checked(state, { type: 'relocate', locationId: 'au-sydney' });
    expect(moved.outcome).toMatchObject({ status: 'applied' });
    state = moved.state;
    const c = me(state.world);
    expect(c.countryCode).toBe('AU');
    // Skilled Independent (189) grants permanent residence straight away.
    expect(c.civic.residence).toMatchObject({ countryCode: 'AU', status: 'permanent' });
    const aud = currencyFor('AU');
    for (const a of Object.values(state.world.ledger.accounts)) {
      if (a.ownerId !== c.id || a.closedTick !== null) continue;
      if (a.type === 'checking' || a.type === 'savings' || a.type === 'retirement')
        expect(a.currency).toBe(aud);
    }
    for (let i = 0; i < 6; i++) state = monthChecked(state);
    expect(checkLedger(state.world)).toEqual([]);
    expect(checkInvariants(state.world)).toEqual([]);
  }, 120_000);

  it('property and a loan left behind keep reconciling after the move', () => {
    let state = aged(newState({ seed: 'abroad-home', countryCode: 'GB', easyMigration: true }), 30);
    state = giveMoney(state, 5_000_000_00n);
    // A personal loan (set up directly; booked against equity so the books balance).
    const world = structuredClone(state.world);
    const c = me(world);
    const checking = c.finance?.checkingId
      ? world.ledger.accounts[c.finance.checkingId]
      : undefined;
    if (!checking) throw new Error('no account');
    world.ledger.accounts['loan-x'] = {
      ...checking,
      id: 'loan-x',
      type: 'loan',
      category: 'personal',
      balance: 500_000n,
      loan: {
        product: 'personal',
        rateBp: 900,
        termMonths: 24,
        paymentMinor: 23_000n,
        principalMinor: 500_000n,
        firstPaymentTick: world.tick + 1,
        missedPayments: 0,
      },
    };
    checking.balance += 500_000n;
    state = monthChecked({ world, pending: null });
    const listing = Object.values(state.world.propertyListings)
      .filter((l) => l.kind !== 'commercial')
      .sort((a, b) => (a.askingMinor < b.askingMinor ? -1 : 1))[0];
    if (!listing) throw new Error('no listing');
    const bought = checked(state, {
      type: 'buyProperty',
      listingId: listing.id,
      depositMinor: listing.askingMinor.toString(),
      termMonths: 300,
    });
    expect(bought.outcome).toMatchObject({ status: 'applied' });
    state = bought.state;
    const property = Object.values(state.world.properties)[0];
    if (!property) throw new Error('no property');
    state = checked(state, {
      type: 'letProperty',
      propertyId: property.id,
      rentMinor: (property.valueMinor / 300n).toString(),
    }).state;
    expect(
      run(state, { type: 'applyVisa', countryCode: 'CA', route: 'family', renounce: false })
        .outcome,
    ).toMatchObject({ status: 'rejected' });
    state = checked(state, {
      type: 'applyVisa',
      countryCode: 'CA',
      route: 'work',
      renounce: false,
    }).state;
    for (let i = 0; i < 4; i++) state = monthChecked(state);
    const app = Object.values(state.world.civics.applications).find((a) => a.route === 'work');
    expect(app?.status).toBe('approved');
    state = checked(state, { type: 'relocate', locationId: 'ca-toronto' }).state;
    const loan = Object.values(state.world.ledger.accounts).find(
      (a) => a.ownerId === me(state.world).id && a.type === 'loan' && a.closedTick === null,
    );
    expect(loan?.currency).toBe('CAD');
    for (let i = 0; i < 8; i++) state = monthChecked(state);
    expect(state.world.properties[property.id]?.status).toBe('owned');
    expect(state.world.ledger.accounts[property.owners[0]?.stakeAccountId ?? '']?.currency).toBe(
      'GBP',
    );
    expect(checkLedger(state.world)).toEqual([]);
    expect(checkInvariants(state.world)).toEqual([]);
  }, 120_000);

  it('cannot move abroad without a status there', () => {
    const state = aged(newState({ seed: 'nostatus', countryCode: 'MY' }), 25);
    expect(relocationCheck(state.world, me(state.world), 'jp-tokyo')).toContain('noStatus');
  });
});

describe('work rights, property and records depend on status (eligibility)', () => {
  it('student visas allow only part-time or casual work', () => {
    const state = aged(newState({ seed: 'student', countryCode: 'MY' }), 21);
    settleIn(state.world, 'GB', 'visa', 'study', 3);
    const c = me(state.world);
    expect(workRights(c)).toBe('limited');
    const posting = Object.values(state.world.jobs.postings)[0];
    if (!posting) return;
    const reason = jobEligibility(state.world, c, { ...posting.terms, contract: 'permanent' });
    expect(reason).toBe('limitedWorkRights');
  });

  it('New Zealand bans foreign home buyers; Singapore charges foreigners a 60% surcharge', () => {
    const nz = aged(newState({ seed: 'nz-buy', countryCode: 'MY' }), 30);
    settleIn(nz.world, 'NZ', 'visa', 'work', 6);
    const listing = {
      id: 'l1',
      kind: 'house' as const,
      locationId: 'nz-auckland',
      askingMinor: 100_000_000n,
      condition: 700,
      listedTick: 0,
      expiresTick: 9,
    };
    expect(foreignRules(nz.world, me(nz.world), listing).reason).toBe('foreignBanned');
    me(nz.world).civic.residence.status = 'permanent';
    me(nz.world).civic.residence.route = null;
    expect(foreignRules(nz.world, me(nz.world), listing).reason).toBeNull();
    const sg = aged(newState({ seed: 'sg-buy', countryCode: 'MY' }), 30);
    settleIn(sg.world, 'SG', 'visa', 'work', 6);
    const flat = { ...listing, kind: 'apartment' as const, locationId: 'sg-central-area' };
    const rules = foreignRules(sg.world, me(sg.world), flat);
    expect(rules.reason).toBeNull();
    expect(rules.surcharge).toBe(60_000_000n);
    expect(foreignRules(sg.world, me(sg.world), { ...flat, kind: 'house' }).reason).toBe(
      'foreignKind',
    );
  });

  it('an unspent conviction blocks visas (Easy Migration only ignores minor ones)', () => {
    const state = aged(newState({ seed: 'record', countryCode: 'MY' }), 30);
    const k = openCase(state.world, me(state.world), 'minorOffence', 900);
    k.status = 'closed';
    k.convicted = true;
    k.outcome = 'fine';
    k.spentTick = state.world.tick + 120;
    expect(checkRoute(state.world, me(state.world), 'GB', 'study').reasons).toContain('record');
    state.world.rules.easyMigration = true;
    expect(checkRoute(state.world, me(state.world), 'GB', 'study').reasons).not.toContain('record');
  });
});

describe('military service follows each country’s law (eligibility)', () => {
  it('South Korea calls up male citizens at 18; women and Germans are not liable', () => {
    const kr = aged(newState({ seed: 'kr-m', countryCode: 'KR' }), 18, 'male');
    expect(liable(me(kr.world), 'KR')).toBe(true);
    processService(kr.world);
    const record = Object.values(kr.world.civics.service)[0];
    expect(record?.kind).toBe('conscript');
    expect(['called', 'exempt']).toContain(record?.status);
    const krF = aged(newState({ seed: 'kr-f', countryCode: 'KR' }), 18, 'female');
    expect(liable(me(krF.world), 'KR')).toBe(false);
    const de = aged(newState({ seed: 'de-m', countryCode: 'DE' }), 18, 'male');
    expect(liable(me(de.world), 'DE')).toBe(false);
  });

  it('Singapore’s National Service also covers male permanent residents', () => {
    const state = aged(newState({ seed: 'sg-pr', countryCode: 'MY' }), 18, 'male');
    settleIn(state.world, 'SG', 'permanent', null, 60);
    expect(liable(me(state.world), 'SG')).toBe(true);
  });

  it('service starts at the report date and pay reconciles; volunteers can enlist', () => {
    let state = aged(newState({ seed: 'enlist', countryCode: 'GB' }), 20);
    const enlisted = checked(state, { type: 'enlist', branch: 'navy', track: 'enlisted' });
    expect(enlisted.outcome).toMatchObject({ status: 'applied' });
    state = enlisted.state;
    for (let i = 0; i < 4; i++) state = monthChecked(state);
    const record = Object.values(state.world.civics.service)[0];
    expect(record).toMatchObject({ status: 'serving', monthsServed: 4 });
    expect(run(state, { type: 'leaveService' }).outcome).toMatchObject({ status: 'rejected' });
  }, 60_000);
});

describe('politics: offices, ages and term rules (eligibility)', () => {
  it('US House needs 25; the presidency needs citizenship from birth', () => {
    const young = aged(newState({ seed: 'us-24', countryCode: 'US' }), 24);
    expect(officeCheck(young.world, me(young.world), 'legislature')).toContain('tooYoung');
    const ok = aged(newState({ seed: 'us-25', countryCode: 'US' }), 25);
    expect(officeCheck(ok.world, me(ok.world), 'legislature')).not.toContain('tooYoung');
    const naturalised = aged(newState({ seed: 'us-nat', countryCode: 'GB' }), 40);
    settleIn(naturalised.world, 'US', 'permanent', null, 100);
    const c = me(naturalised.world);
    c.civic.citizenships = ['GB', 'US'];
    c.civic.residence = { ...c.civic.residence, status: 'citizen', route: null, expiresTick: null };
    expect(officeCheck(naturalised.world, c, 'leader')).toContain('notBornCitizen');
  });

  it('Australian MPs may hold only one citizenship', () => {
    const state = aged(newState({ seed: 'au-dual', countryCode: 'AU' }), 30);
    expect(officeCheck(state.world, me(state.world), 'legislature')).not.toContain('dualCitizen');
    me(state.world).civic.citizenships = ['AU', 'GB'];
    expect(officeCheck(state.world, me(state.world), 'legislature')).toContain('dualCitizen');
    expect(officeCheck(state.world, me(state.world), 'local')).not.toContain('dualCitizen');
  });

  it('Saudi Arabia has no parties; its Shura Council is appointed', () => {
    const state = aged(newState({ seed: 'sa-pol', countryCode: 'SA' }), 35);
    expect(run(state, { type: 'joinParty', partyId: 'progress' }).outcome).toMatchObject({
      status: 'rejected',
    });
    expect(getInstitutions('SA').politics.offices.legislature?.selection).toBe('appointment');
    expect(getInstitutions('SA').politics.offices.leader).toBeNull();
  });

  it('a campaign runs to election day and the result is recorded', () => {
    let state = aged(newState({ seed: 'campaign', countryCode: 'NZ' }), 30);
    state = giveMoney(state, 50_000_00n);
    state = checked(state, { type: 'joinParty', partyId: 'unity' }).state;
    const stood = checked(state, { type: 'seekOffice', level: 'local' });
    expect(stood.outcome).toMatchObject({ status: 'applied' });
    state = checked(stood.state, { type: 'campaign', action: 'canvass' }).state;
    for (let i = 0; i < 5; i++) state = monthChecked(state);
    const career = Object.values(state.world.civics.politics)[0];
    expect(career?.history.at(-1)?.level).toBe('local');
    expect(['won', 'lost']).toContain(career?.history.at(-1)?.result);
  }, 60_000);
});

describe('healthcare, law and religion', () => {
  it('private care starts now and is charged; public care waits in the UK; both reconcile', () => {
    let state = aged(newState({ seed: 'nhs', countryCode: 'GB' }), 40);
    state = giveMoney(state, 2_000_000n);
    const a = diagnose(state.world, me(state.world), 'backPain');
    const b = diagnose(state.world, me(state.world), 'dental');
    const pub = checked(state, { type: 'treatCondition', conditionId: a.id, care: 'public' });
    expect(pub.state.world.civics.conditions[a.id]?.status).toBe('waiting');
    const priv = checked(pub.state, { type: 'treatCondition', conditionId: b.id, care: 'private' });
    expect(priv.state.world.civics.conditions[b.id]?.status).toBe('treating');
    state = priv.state;
    for (let i = 0; i < 5; i++) state = monthChecked(state);
    expect(state.world.civics.conditions[a.id]?.status).not.toBe('waiting');
  }, 60_000);

  it('a case is heard with the chosen lawyer and plea; convictions are recorded with a spent date', () => {
    let state = aged(newState({ seed: 'court', countryCode: 'CA' }), 30);
    state = giveMoney(state, 2_000_000n);
    const k = openCase(state.world, me(state.world), 'minorOffence', 600);
    state = checked(state, { type: 'setPlea', caseId: k.id, plea: 'guilty' }).state;
    for (let i = 0; i < 3; i++) state = monthChecked(state);
    const closed = state.world.civics.cases[k.id];
    expect(closed?.status).toBe('closed');
    expect(closed?.convicted).toBe(true);
    expect(closed?.spentTick).toBe(
      (closed?.closedTick ?? 0) + (closed?.sentenceMonths ?? 0) + 5 * 12,
    );
  }, 60_000);

  it('leaving Islam is legally restricted in Malaysia; participation can still change', () => {
    let state = aged(newState({ seed: 'my-faith', countryCode: 'MY' }), 25);
    me(state.world).civic.religion = 'islam';
    expect(run(state, { type: 'setReligion', religion: 'none' }).outcome).toMatchObject({
      status: 'rejected',
    });
    const ok = run(state, { type: 'setParticipation', level: 'regular' });
    expect(ok.outcome).toMatchObject({ status: 'applied' });
    state = aged(newState({ seed: 'gb-faith', countryCode: 'GB' }), 25);
    me(state.world).civic.religion = 'christianity';
    expect(run(state, { type: 'setReligion', religion: 'buddhism' }).outcome).toMatchObject({
      status: 'applied',
    });
  });
});

describe('royal and noble duties appear only where the country supports them', () => {
  it('a royal adult in Malaysia has duties; engagements raise approval', () => {
    let state = aged(newState({ seed: 'royal', countryCode: 'MY', scenario: 'royal' }), 20);
    const first = run(state, { type: 'royalEngagement', kind: 'charity' });
    expect(first.outcome).toMatchObject({ status: 'applied' });
    state = first.state;
    expect(state.world.civics.royal[me(state.world).id]?.approval).toBeGreaterThan(600);
    const commoner = aged(newState({ seed: 'commoner', countryCode: 'MY' }), 20);
    expect(run(commoner, { type: 'royalEngagement', kind: 'charity' }).outcome).toMatchObject({
      status: 'rejected',
    });
  });
});

describe('save upgrade', () => {
  it('a version-3 world upgrades to version 4 with citizenship for everyone', () => {
    const world = structuredClone(
      newState({ seed: 'v3', countryCode: 'GB', scenario: 'immigrant', originCountryCode: 'IN' })
        .world,
    ) as unknown as Record<string, unknown>;
    Reflect.deleteProperty(world, 'civics');
    for (const c of Object.values(world.characters as Record<string, Record<string, unknown>>))
      Reflect.deleteProperty(c, 'civic');
    world.schemaVersion = 3;
    const upgraded = upgradeWorldV4(upgradeWorldV3(world)) as World;
    expect(WorldSchema.safeParse(upgraded).success).toBe(true);
    expect(checkInvariants(upgraded)).toEqual([]);
    const parents = Object.values(upgraded.characters).filter(
      (c) => c.id !== upgraded.activeCharacterId && c.civic.citizenships.includes('IN'),
    );
    expect(parents.length).toBeGreaterThan(0);
  });
});
