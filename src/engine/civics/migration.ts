import { sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { moveToHousehold } from '../characters/factory';
import { endEmployment, refreshJobMarket } from '../career/jobs';
import { leaveEducation } from '../education/school';
import { ensureEconomy, medianWage, convert, savingsRateBp } from '../economy/economy';
import {
  currencyFor,
  moveOut,
  payExpense,
  payerFor,
  rentFor,
  FinanceError,
} from '../economy/finance';
import { convertCurrency, convertLiability, exchange } from '../economy/fx';
import { balanceOf, openAccount } from '../economy/ledger';
import { getCountry, getLocation } from '../world/countries';
import { getInstitutions, VISA_ROUTES, type VisaRoute } from '../world/institutions';
import type {
  ApplicationRoute,
  Character,
  Household,
  VisaApplication,
  World,
} from '../state/schema';
import {
  hasUnspentConviction,
  highestQualification,
  inCustody,
  isCitizen,
  isSettled,
  majorityCitizenship,
  meetsQualification,
  parentsOf,
  statusIn,
} from './status';

/**
 * Migration and citizenship (spec §3.13, §4 World, §5 Easy Migration).
 *
 * Visa routes, permanent residence and naturalisation follow each country's researched
 * rules (`world/institutions.ts`). Easy Migration is a per-save setting: while it is on,
 * NEW applications skip qualification, experience and age limits, need half the funds and
 * residence time, are approved far more often and decide faster, and visas always renew.
 * Turning it off never removes a status already held (decision D10 / spec §5). Moving
 * converts the household's money into the new currency at the simulated exchange rate.
 */

export type MigrationRejection =
  | 'tooYoung'
  | 'notAdult'
  | 'routeClosed'
  | 'tooOld'
  | 'qualification'
  | 'experience'
  | 'capital'
  | 'noPartner'
  | 'record'
  | 'alreadySettled'
  | 'alreadyCitizen'
  | 'pending'
  | 'cannotAffordFee'
  | 'inCustody'
  | 'serving'
  | 'notResident'
  | 'notPermanent'
  | 'notLongEnough'
  | 'noPermanentRoute'
  | 'noNaturalisation'
  | 'mustRenounce'
  | 'sameCountry'
  | 'noStatus'
  | 'sameLocation'
  | 'cannotAffordMove'
  | 'noApplication';

export const MIGRATION_MESSAGES: Record<MigrationRejection, string> = {
  tooYoung: 'You are too young for this route.',
  notAdult: 'You can move abroad on your own from 18.',
  routeClosed: 'This route is closed to new applicants.',
  tooOld: 'You are over the age limit for this route.',
  qualification: 'You do not have the qualification this route needs.',
  experience: 'You do not have enough work experience for this route.',
  capital: 'You do not have the funds this route needs.',
  noPartner: 'You need a spouse who is a citizen or permanent resident there.',
  record: 'Your criminal record makes you ineligible.',
  alreadySettled: 'You can already live there.',
  alreadyCitizen: 'You are already a citizen.',
  pending: 'You already have an application for this country waiting.',
  cannotAffordFee: 'You cannot afford the application fee.',
  inCustody: 'You cannot do this while in custody.',
  serving: 'You cannot move while doing military service.',
  notResident: 'You need to live there first.',
  notPermanent: 'You need permanent residence first.',
  notLongEnough: 'You have not lived there long enough yet.',
  noPermanentRoute: 'Your visa does not lead to permanent residence.',
  noNaturalisation: 'Naturalisation is practically unavailable in this country.',
  mustRenounce: 'This country requires you to give up your other citizenships.',
  sameCountry: 'You already live in this country.',
  noStatus: 'You need a visa, residence or citizenship there before you can move.',
  sameLocation: 'You already live there.',
  cannotAffordMove: 'You cannot afford the move.',
  noApplication: 'There is no such application.',
};

export class MigrationError extends Error {
  readonly code: MigrationRejection;
  constructor(code: MigrationRejection) {
    super(MIGRATION_MESSAGES[code]);
    this.name = 'MigrationError';
    this.code = code;
  }
}

/** An approved visa must be used within this many months (PROPOSED TUNING). */
export const USE_WITHIN_MONTHS = 12;
const PERMANENT_FEE_PERCENT = 60;
const CITIZENSHIP_FEE_PERCENT = 40;
/** Moving costs, percent of the destination's median monthly wage. */
const MOVE_COST_ABROAD_PERCENT = 150;
const MOVE_COST_DOMESTIC_PERCENT = 50;

export interface RouteCheck {
  route: ApplicationRoute;
  countryCode: string;
  eligible: boolean;
  reasons: MigrationRejection[];
  /** Fee in the applicant's own currency. */
  feeMinor: bigint;
  approvalBp: number;
  processingMonths: number;
  /** Citizenships that would be lost (renounced or ended by the other country's law). */
  wouldLose: string[];
  /** Renunciation is required by the new country. */
  renounceRequired: boolean;
  easy: boolean;
}

function easyOn(world: World): boolean {
  return world.rules.easyMigration;
}

function halfUp(n: number): number {
  return Math.ceil(n / 2);
}

function playerCash(world: World, c: Character): bigint {
  return (
    balanceOf(world, c.finance?.checkingId ?? null) + balanceOf(world, c.finance?.savingsId ?? null)
  );
}

function partnerQualifies(world: World, c: Character, code: string): boolean {
  const p = c.partnership;
  if (p?.status !== 'married') return false;
  const partner = world.characters[p.partnerId];
  return partner?.death === null && isSettled(partner, code);
}

function experience(world: World, c: Character): number {
  let months = 0;
  for (const e of sortedValues(world.employment)) {
    if (e.characterId === c.id) months += (e.endTick ?? world.tick) - e.startTick;
  }
  return months;
}

function pendingFor(world: World, c: Character, code: string): VisaApplication | undefined {
  return sortedValues(world.civics.applications).find(
    (a) => a.characterId === c.id && a.countryCode === code && a.status === 'pending',
  );
}

export function approvedVisa(
  world: World,
  c: Character,
  code: string,
): VisaApplication | undefined {
  return sortedValues(world.civics.applications).find(
    (a) =>
      a.characterId === c.id &&
      a.countryCode === code &&
      a.status === 'approved' &&
      (VISA_ROUTES as readonly string[]).includes(a.route) &&
      (a.useByTick ?? 0) >= world.tick,
  );
}

function serving(world: World, c: Character): boolean {
  return sortedValues(world.civics.service).some(
    (s) => s.characterId === c.id && s.status === 'serving',
  );
}

/** Citizenships lost by acquiring `code` (its own rule, and other countries' rules). */
function lossesOnAcquiring(c: Character, code: string): { lose: string[]; renounce: boolean } {
  const target = getInstitutions(code).citizenship.dual;
  const others = c.civic.citizenships.filter((x) => x !== code);
  if (target !== 'allowed') return { lose: others, renounce: others.length > 0 };
  const lose = others.filter((x) => getInstitutions(x).citizenship.dual !== 'allowed');
  return { lose, renounce: false };
}

/** Whether someone may apply for a route in a country, with every reason they may not. */
export function checkRoute(
  world: World,
  c: Character,
  code: string,
  route: ApplicationRoute,
): RouteCheck {
  const inst = getInstitutions(code);
  const easy = easyOn(world);
  const reasons: MigrationRejection[] = [];
  const age = ageYears(world, c);
  const median = medianWage(world, code);
  const toApplicant = (amount: bigint) => convert(world, amount, code, c.countryCode);
  let feeMinor = 0n;
  let approvalBp = 9000;
  let processingMonths = 3;
  let wouldLose: string[] = [];
  let renounceRequired = false;

  if (inCustody(world, c)) reasons.push('inCustody');
  if (pendingFor(world, c, code)) reasons.push('pending');

  if ((VISA_ROUTES as readonly string[]).includes(route)) {
    const rule = inst.visas[route as VisaRoute];
    feeMinor = toApplicant(applyPercent(median, easy ? halfUp(rule.feePercent) : rule.feePercent));
    approvalBp = easy ? Math.max(rule.approvalBp, 9500) : rule.approvalBp;
    processingMonths = easy ? halfUp(rule.processingMonths) : rule.processingMonths;
    if (!rule.available) reasons.push('routeClosed');
    if (isCitizen(c, code)) reasons.push('alreadyCitizen');
    else if (isSettled(c, code)) reasons.push('alreadySettled');
    if (age < 18) reasons.push('notAdult');
    else if (age < rule.minAge) reasons.push('tooYoung');
    if (!easy && rule.maxAge !== null && age > rule.maxAge) reasons.push('tooOld');
    if (!easy && !meetsQualification(c, rule.qualification)) {
      // Long experience can stand in for a degree on work routes.
      const exempt =
        route === 'work' && experience(world, c) >= 60 && highestQualification(c) !== 'none';
      if (!exempt) reasons.push('qualification');
    }
    if (!easy && experience(world, c) < rule.experienceMonths) reasons.push('experience');
    if (rule.capitalMonths > 0) {
      const needed = toApplicant(
        median * BigInt(easy ? halfUp(rule.capitalMonths) : rule.capitalMonths),
      );
      if (playerCash(world, c) < needed) reasons.push('capital');
    }
    if (route === 'family' && !partnerQualifies(world, c, code)) reasons.push('noPartner');
    if (hasUnspentConviction(world, c.id, easy ? 'serious' : 'any')) reasons.push('record');
  } else if (route === 'permanent') {
    feeMinor = toApplicant(
      applyPercent(median, easy ? PERMANENT_FEE_PERCENT / 2 : PERMANENT_FEE_PERCENT),
    );
    approvalBp = easy ? 9800 : 9000;
    processingMonths = easy ? 2 : 4;
    const years = inst.citizenship.permanentYears;
    const r = c.civic.residence;
    if (isCitizen(c, code)) reasons.push('alreadyCitizen');
    else if (r.countryCode !== code) reasons.push('notResident');
    else if (r.status === 'permanent') reasons.push('alreadySettled');
    else {
      const rule = r.route ? inst.visas[r.route] : undefined;
      if (years === null) reasons.push('noPermanentRoute');
      else if (!rule?.leadsToPermanent) reasons.push('noPermanentRoute');
      else if ((c.civic.residedMonths[code] ?? 0) < (easy ? halfUp(years * 12) : years * 12))
        reasons.push('notLongEnough');
    }
    if (hasUnspentConviction(world, c.id, easy ? 'serious' : 'any')) reasons.push('record');
  } else {
    // Citizenship: by descent (a parent is a citizen) or by naturalisation.
    feeMinor = toApplicant(
      applyPercent(median, easy ? CITIZENSHIP_FEE_PERCENT / 2 : CITIZENSHIP_FEE_PERCENT),
    );
    processingMonths = easy ? 3 : 8;
    const rules = inst.citizenship;
    const byDescent = rules.descent && parentsOf(world, c.id).some((p) => isCitizen(p, code));
    if (isCitizen(c, code)) reasons.push('alreadyCitizen');
    else if (byDescent) {
      approvalBp = 9800;
    } else {
      const test = rules.test === 'none' ? 0 : rules.test === 'both' ? 1200 : 700;
      const intellect = Math.floor((c.stats.intelligence - 500) * 2);
      approvalBp = easy ? 9800 : Math.max(5000, Math.min(9700, 9200 - test + intellect));
      if (age < 18) reasons.push('notAdult');
      if (rules.naturalisationYears === null) reasons.push('noNaturalisation');
      else {
        const status = statusIn(c, code);
        if (status === null || c.civic.residence.countryCode !== code) reasons.push('notResident');
        else if (rules.requiresPermanent && status !== 'permanent') reasons.push('notPermanent');
        else {
          const months =
            rules.countsFrom === 'permanent'
              ? (c.civic.permanentMonths[code] ?? 0)
              : (c.civic.residedMonths[code] ?? 0);
          const needed = rules.naturalisationYears * 12;
          if (months < (easy ? halfUp(needed) : needed)) reasons.push('notLongEnough');
        }
      }
      if (hasUnspentConviction(world, c.id, 'any')) reasons.push('record');
    }
    const loss = lossesOnAcquiring(c, code);
    wouldLose = loss.lose;
    renounceRequired = loss.renounce;
  }
  if (feeMinor > playerCash(world, c)) reasons.push('cannotAffordFee');
  return {
    route,
    countryCode: code,
    eligible: reasons.length === 0,
    reasons,
    feeMinor,
    approvalBp,
    processingMonths,
    wouldLose,
    renounceRequired,
    easy,
  };
}

/** Submits an application and pays the fee. */
export function applyForStatus(
  world: World,
  c: Character,
  code: string,
  route: ApplicationRoute,
  renounce: boolean,
): VisaApplication {
  getCountry(code);
  const check = checkRoute(world, c, code, route);
  const first = check.reasons[0];
  if (first) throw new MigrationError(first);
  if (check.renounceRequired && !renounce) throw new MigrationError('mustRenounce');
  const payer = payerFor(world, c);
  if (!payer) throw new FinanceError('noAccount');
  payExpense(world, payer, 'immigrationFees', check.feeMinor, 'tx.immigrationFee', {
    country: code,
    route,
  });
  const app: VisaApplication = {
    id: nextId(world, 'visa'),
    characterId: c.id,
    countryCode: code,
    route,
    status: 'pending',
    appliedTick: world.tick,
    decisionTick: world.tick + check.processingMonths,
    useByTick: null,
    reason: null,
    feeMinor: check.feeMinor,
    renounce,
    easy: check.easy,
  };
  world.civics.applications[app.id] = app;
  addNotification(world, 'world', 'ntf.visaApplied', { country: code, route }, 'world', app.id);
  return app;
}

export function withdrawApplication(world: World, c: Character, applicationId: string): void {
  const app = world.civics.applications[applicationId];
  if (app?.characterId !== c.id || (app.status !== 'pending' && app.status !== 'approved'))
    throw new MigrationError('noApplication');
  app.status = 'withdrawn';
}

function grantCitizenship(world: World, c: Character, code: string): string[] {
  const { lose } = lossesOnAcquiring(c, code);
  c.civic.citizenships = [...c.civic.citizenships.filter((x) => !lose.includes(x)), code].sort();
  if (c.civic.residence.countryCode === code) {
    c.civic.residence = { ...c.civic.residence, status: 'citizen', route: null, expiresTick: null };
  }
  addBiography(world, c.id, 'world', 'bio.citizenship', { country: code });
  return lose;
}

/** Decides applications that are due, and expires approved visas that were never used. */
export function processApplications(world: World): void {
  for (const app of sortedValues(world.civics.applications)) {
    const c = world.characters[app.characterId];
    if (c?.death !== null) continue;
    if (app.status === 'approved' && app.useByTick !== null && world.tick > app.useByTick) {
      app.status = 'expired';
      addNotification(world, 'world', 'ntf.visaUnused', { country: app.countryCode }, 'world');
      continue;
    }
    if (app.status !== 'pending' || world.tick < app.decisionTick) continue;
    // Re-check: circumstances may have changed while waiting (the fee is not re-charged).
    const check = checkRoute(world, c, app.countryCode, app.route);
    const blocking = check.reasons.filter(
      (r) => r !== 'pending' && r !== 'cannotAffordFee' && r !== 'capital',
    );
    const approvalBp = app.easy ? Math.max(check.approvalBp, 9500) : check.approvalBp;
    const approved =
      blocking.length === 0 && withRng(world, 'civics', (rng) => rng.int(10_000) < approvalBp);
    if (!approved) {
      app.status = 'refused';
      app.reason = blocking[0] ?? 'refused';
      addNotification(
        world,
        'world',
        'ntf.visaRefused',
        { country: app.countryCode, route: app.route },
        'world',
        app.id,
      );
      continue;
    }
    if (app.route === 'permanent') {
      c.civic.residence = {
        ...c.civic.residence,
        status: 'permanent',
        route: null,
        expiresTick: null,
      };
      app.status = 'used';
      addBiography(world, c.id, 'world', 'bio.permanent', { country: app.countryCode });
      addNotification(
        world,
        'world',
        'ntf.permanentGranted',
        { country: app.countryCode },
        'world',
      );
    } else if (app.route === 'citizenship') {
      const lost = grantCitizenship(world, c, app.countryCode);
      app.status = 'used';
      addNotification(
        world,
        'world',
        lost.length > 0 ? 'ntf.citizenshipGrantedLost' : 'ntf.citizenshipGranted',
        { country: app.countryCode, lost: lost.join(', ') },
        'world',
      );
    } else {
      app.status = 'approved';
      app.useByTick = world.tick + USE_WITHIN_MONTHS;
      addNotification(
        world,
        'world',
        'ntf.visaApproved',
        { country: app.countryCode, route: app.route },
        'world',
        app.id,
      );
    }
  }
}

// ------------------------------------------------------------------------------------------
// Moving
// ------------------------------------------------------------------------------------------

export function moveCost(world: World, c: Character, locationId: string): bigint {
  const { country } = getLocation(locationId);
  const abroad = country.code !== c.countryCode;
  const percent = abroad
    ? easyOn(world)
      ? MOVE_COST_ABROAD_PERCENT / 2
      : MOVE_COST_ABROAD_PERCENT
    : MOVE_COST_DOMESTIC_PERCENT;
  return convert(
    world,
    applyPercent(medianWage(world, country.code), percent),
    country.code,
    c.countryCode,
  );
}

export function relocationCheck(
  world: World,
  c: Character,
  locationId: string,
): MigrationRejection[] {
  const reasons: MigrationRejection[] = [];
  const { country } = getLocation(locationId);
  if (ageYears(world, c) < 18) reasons.push('notAdult');
  if (inCustody(world, c)) reasons.push('inCustody');
  if (serving(world, c)) reasons.push('serving');
  if (c.locationId === locationId) reasons.push('sameLocation');
  if (
    country.code !== c.countryCode &&
    !isSettled(c, country.code) &&
    !approvedVisa(world, c, country.code)
  )
    reasons.push('noStatus');
  if (playerCash(world, c) < moveCost(world, c, locationId)) reasons.push('cannotAffordMove');
  return reasons;
}

/** Converts the mover's (and their household's) money into the new currency. */
function convertMoney(
  world: World,
  c: Character,
  household: Household,
  fromCurrency: string,
  toCode: string,
): void {
  const toCurrency = currencyFor(toCode);
  const owners = new Set([c.id, household.id]);
  for (const account of sortedValues(world.ledger.accounts)) {
    if (!owners.has(account.ownerId) || account.closedTick !== null) continue;
    if (account.currency === toCurrency) continue;
    if (account.type === 'checking' && account.category === 'abroad') continue;
    if (account.type === 'property') continue;
    if (account.type === 'loan' && account.loan?.product === 'mortgage') continue;
    if (account.type === 'loan' || account.type === 'arrears') {
      const next = convertLiability(world, account, toCurrency);
      for (const b of sortedValues(world.businesses))
        for (const o of b.owners) if (o.stakeAccountId === account.id) o.stakeAccountId = next;
      continue;
    }
    if (
      account.type !== 'checking' &&
      account.type !== 'savings' &&
      account.type !== 'retirement' &&
      account.type !== 'investment' &&
      account.type !== 'stake'
    )
      continue;
    const next = openAccount(world, account.ownerId, account.type, toCurrency, {
      category: account.category,
      rateBp: account.type === 'savings' ? savingsRateBp(world, toCode) : account.rateBp,
    });
    // Bonds keep their terms and funds their (converted) cost after the move.
    const moved = world.ledger.accounts[next];
    if (moved && account.bond) moved.bond = { ...account.bond };
    if (moved && account.costMinor !== undefined)
      moved.costMinor = convertCurrency(world, account.costMinor, account.currency, toCurrency);
    if (account.balance > 0n)
      exchange(world, account.ownerId, account.id, next, account.balance, 'tx.moveMoney');
    world.ledger.accounts[account.id] = { ...account, closedTick: world.tick };
    const fin = c.finance;
    if (fin) {
      if (fin.checkingId === account.id) fin.checkingId = next;
      if (fin.savingsId === account.id) fin.savingsId = next;
      if (fin.retirementId === account.id) fin.retirementId = next;
    }
    if (household.finance) {
      if (household.finance.checkingId === account.id) household.finance.checkingId = next;
      if (household.finance.savingsId === account.id) household.finance.savingsId = next;
    }
    for (const b of sortedValues(world.businesses))
      for (const o of b.owners) if (o.stakeAccountId === account.id) o.stakeAccountId = next;
  }
  if (c.finance) {
    const from = fromCurrency;
    const t = c.finance.taxYear;
    c.finance.taxYear = {
      ...t,
      gross: convertCurrency(world, t.gross, from, toCurrency),
      withheld: convertCurrency(world, t.withheld, from, toCurrency),
      social: convertCurrency(world, t.social, from, toCurrency),
    };
    c.finance.pensionableEarnings = convertCurrency(
      world,
      c.finance.pensionableEarnings,
      from,
      toCurrency,
    );
    c.finance.benefitMonths = 0;
    c.finance.benefitMinor = 0n;
  }
}

/**
 * Moves the player (and the household they run: partner and children) to another city,
 * at home or abroad. Abroad needs citizenship, permanent residence or an approved visa.
 */
export function relocate(world: World, c: Character, locationId: string): void {
  const { country, location } = getLocation(locationId);
  const first = relocationCheck(world, c, locationId)[0];
  if (first) throw new MigrationError(first);
  const fromCode = c.countryCode;
  const abroad = country.code !== fromCode;
  const cost = moveCost(world, c, locationId);

  // Someone living with family gets their own place first.
  let household = world.households[c.householdId];
  if (household?.finance?.headId !== c.id) household = moveOut(world, c, 'room');
  if (!household.finance) throw new FinanceError('noAccount');
  const payer = payerFor(world, c);
  if (!payer) throw new FinanceError('noAccount');
  payExpense(world, payer, 'moving', cost, 'tx.moving', { location: location.name });

  // Work, study and local commitments end.
  if (c.employmentId) endEmployment(world, c, 'moved');
  if (c.education.current?.stage === 'tertiary') leaveEducation(world, c);
  c.education.clubs = [];
  for (const app of sortedValues(world.jobs.applications)) {
    if (app.characterId === c.id && ['applied', 'interview', 'offered'].includes(app.status))
      app.status = 'withdrawn';
  }

  // Status in the new country.
  const visa = abroad ? approvedVisa(world, c, country.code) : undefined;
  if (abroad) {
    ensureEconomy(world, country.code);
    for (const policy of sortedValues(world.insurance)) {
      if (policy.holderId === c.id && policy.status === 'active') policy.status = 'cancelled';
    }
  }

  // The household moves together.
  const movers = household.memberIds
    .map((id) => world.characters[id])
    .filter((m): m is Character => m?.death === null);
  for (const m of movers) {
    m.locationId = location.id;
    m.countryCode = country.code;
  }
  household.locationId = location.id;
  if (household.finance.propertyId !== null || household.finance.housing === 'owned') {
    household.finance.propertyId = null;
    household.finance.housing = 'rented';
  }
  household.finance.rentMinor = rentFor(world, location.id, household.finance.homeSize);
  refreshJobMarket(world);

  if (abroad) {
    convertMoney(world, c, household, currencyFor(fromCode), country.code);

    const route = visa?.route as VisaRoute | undefined;
    const rule = route ? getInstitutions(country.code).visas[route] : undefined;
    for (const m of movers) {
      const own = m.id === c.id;
      if (isCitizen(m, country.code)) {
        m.civic.residence = {
          countryCode: country.code,
          status: 'citizen',
          route: null,
          sinceTick: world.tick,
          expiresTick: null,
        };
      } else if (isSettled(m, country.code) && m.civic.residence.countryCode === country.code) {
        m.civic.residence = { ...m.civic.residence, sinceTick: world.tick };
      } else if (own && rule && route) {
        m.civic.residence = {
          countryCode: country.code,
          status: rule.grantsPermanent ? 'permanent' : 'visa',
          route: rule.grantsPermanent ? null : route,
          sinceTick: world.tick,
          expiresTick: rule.grantsPermanent ? null : world.tick + rule.durationMonths,
        };
      } else if (own) {
        // Settled through permanent residence held from an earlier stay.
        m.civic.residence = {
          countryCode: country.code,
          status: 'permanent',
          route: null,
          sinceTick: world.tick,
          expiresTick: null,
        };
      } else {
        // Dependants: settled if the mover is settled, otherwise a family visa alongside.
        const settled = isSettled(c, country.code) || Boolean(rule?.grantsPermanent);
        m.civic.residence = {
          countryCode: country.code,
          status: settled ? 'permanent' : 'visa',
          route: settled ? null : 'family',
          sinceTick: world.tick,
          expiresTick: settled ? null : (c.civic.residence.expiresTick ?? world.tick + 36),
        };
      }
    }
    if (visa) visa.status = 'used';
    addBiography(world, c.id, 'world', 'bio.emigrated', {
      location: location.name,
      country: country.code,
    });
    addNotification(
      world,
      'world',
      'ntf.emigrated',
      { location: location.name, country: country.code },
      'world',
    );
  } else {
    addBiography(world, c.id, 'world', 'bio.movedCity', { location: location.name });
    addNotification(world, 'world', 'ntf.movedCity', { location: location.name }, 'world');
  }
  // Keep everyone in the household list consistent.
  for (const m of movers)
    if (m.householdId !== household.id) moveToHousehold(world, m, household.id);
  world.jobs.refreshedTick = Math.min(world.jobs.refreshedTick, Math.max(0, world.tick - 1));
}

// ------------------------------------------------------------------------------------------
// Monthly
// ------------------------------------------------------------------------------------------

function canRenew(world: World, c: Character): boolean {
  if (easyOn(world)) return true;
  const r = c.civic.residence;
  switch (r.route) {
    case 'work': {
      const job = c.employmentId ? world.employment[c.employmentId] : undefined;
      return job?.status === 'active';
    }
    case 'study':
      return c.education.current?.stage === 'tertiary';
    case 'family':
      return partnerQualifies(world, c, r.countryCode) || isSettled(c, r.countryCode);
    case 'investor': {
      const rule = getInstitutions(r.countryCode).visas.investor;
      const needed = medianWage(world, r.countryCode) * BigInt(halfUp(rule.capitalMonths));
      return playerCash(world, c) >= convert(world, needed, r.countryCode, c.countryCode);
    }
    default:
      return true;
  }
}

/** Sends the player home (to their first citizenship) when a visa cannot be renewed. */
function returnHome(world: World, c: Character): void {
  const home = c.civic.citizenships[0] ?? c.countryCode;
  const country = getCountry(home);
  const location = country.locations.find((l) => l.kind === 'city') ?? country.locations[0];
  if (!location) return;
  const previous = c.civic.residence.countryCode;
  const household = world.households[c.householdId];
  if (!household?.finance) {
    c.locationId = location.id;
    c.countryCode = home;
  } else {
    const movers = household.memberIds
      .map((id) => world.characters[id])
      .filter((m): m is Character => m?.death === null);
    if (c.employmentId) endEmployment(world, c, 'moved');
    for (const policy of sortedValues(world.insurance)) {
      if (policy.holderId === c.id && policy.status === 'active') policy.status = 'cancelled';
    }
    for (const m of movers) m.locationId = location.id;
    household.locationId = location.id;
    household.finance.propertyId = null;
    household.finance.housing = 'rented';
    household.finance.rentMinor = rentFor(world, location.id, household.finance.homeSize);
    convertMoney(world, c, household, currencyFor(previous), home);
    for (const m of movers) {
      m.countryCode = home;
      m.civic.residence = isCitizen(m, home)
        ? {
            countryCode: home,
            status: 'citizen',
            route: null,
            sinceTick: world.tick,
            expiresTick: null,
          }
        : {
            countryCode: home,
            status: 'visa',
            route: 'family',
            sinceTick: world.tick,
            expiresTick: world.tick + 36,
          };
    }
  }
  c.civic.residence = {
    countryCode: home,
    status: 'citizen',
    route: null,
    sinceTick: world.tick,
    expiresTick: null,
  };
  ensureEconomy(world, home);
  addBiography(world, c.id, 'world', 'bio.visaEnded', { from: previous, to: home });
  addNotification(world, 'world', 'ntf.visaEnded', { from: previous, to: home }, 'world');
}

/** Monthly residence bookkeeping for the player: time counted, renewals, eligibility. */
export function processResidence(world: World): void {
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null) return;
  const r = c.civic.residence;
  const code = r.countryCode;
  c.civic.residedMonths[code] = (c.civic.residedMonths[code] ?? 0) + 1;
  if (r.status === 'permanent')
    c.civic.permanentMonths[code] = (c.civic.permanentMonths[code] ?? 0) + 1;

  if (majorityCitizenship(world, c)) {
    addBiography(world, c.id, 'world', 'bio.citizenship', { country: code });
    addNotification(world, 'world', 'ntf.citizenshipAtMajority', { country: code }, 'world');
  }

  if (r.status === 'visa' && r.expiresTick !== null && !isCitizen(c, code)) {
    if (r.expiresTick - world.tick === 3)
      addNotification(world, 'world', 'ntf.visaExpiring', { country: code }, 'world');
    if (world.tick >= r.expiresTick) {
      const rule = r.route ? getInstitutions(code).visas[r.route] : undefined;
      if (canRenew(world, c)) {
        c.civic.residence = { ...r, expiresTick: world.tick + (rule?.durationMonths ?? 24) };
        addNotification(world, 'world', 'ntf.visaRenewed', { country: code }, 'world');
      } else if (!inCustody(world, c)) {
        returnHome(world, c);
      }
    }
  }

  // Tell the player once when a new status becomes possible.
  for (const route of ['permanent', 'citizenship'] as const) {
    const flag = `eligible.${route}.${code}`;
    if (c.flags[flag] || isCitizen(c, code)) continue;
    const check = checkRoute(world, c, code, route);
    const blocking = check.reasons.filter((x) => x !== 'cannotAffordFee');
    if (blocking.length === 0) {
      c.flags[flag] = true;
      addNotification(world, 'world', `ntf.eligible.${route}`, { country: code }, 'world');
    }
  }
}

/** Upper bound used by the view: months until permanent residence or citizenship. */
export function monthsUntil(
  world: World,
  c: Character,
  code: string,
): { permanent: number | null; citizenship: number | null } {
  const inst = getInstitutions(code).citizenship;
  const easy = easyOn(world);
  const resided = c.civic.residedMonths[code] ?? 0;
  const perm = c.civic.permanentMonths[code] ?? 0;
  const permanent =
    inst.permanentYears === null
      ? null
      : Math.max(0, (easy ? halfUp(inst.permanentYears * 12) : inst.permanentYears * 12) - resided);
  const citizenship =
    inst.naturalisationYears === null
      ? null
      : Math.max(
          0,
          (easy ? halfUp(inst.naturalisationYears * 12) : inst.naturalisationYears * 12) -
            (inst.countsFrom === 'permanent' ? perm : resided),
        );
  return { permanent, citizenship };
}
