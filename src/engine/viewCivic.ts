import { sortedValues } from './core/data';
import { ageOf } from './core/clock';
import { COUNTRIES, getCountry } from './world/countries';
import {
  INSTITUTIONS_SOURCE,
  OFFICE_LEVELS,
  RELIGIONS,
  VISA_ROUTES,
  getInstitutions,
  type Institutions,
  type OfficeLevel,
  type Religion,
} from './world/institutions';
import { getRules } from './world/rules';
import { CONDITIONS, careQuote, cureQuote, publicWaitMonths } from './civics/health';
import { CASE_RULES, legalAidEligible, privateLawyerFee } from './civics/law';
import {
  MIGRATION_MESSAGES,
  checkRoute,
  monthsUntil,
  moveCost,
  relocationCheck,
} from './civics/migration';
import {
  MILITARY_MESSAGES,
  currentService,
  enlistmentCheck,
  liable,
  monthlyPay,
  promotionChance,
  type Specialty,
  rankTitle,
  MIN_SERVICE_BEFORE_LEAVING,
} from './civics/military';
import {
  OFFICE_HOURS,
  OFFICE_SALARY_PERCENT,
  POLITICS_MESSAGES,
  careerOf,
  officeCheck,
} from './civics/politics';
import { PARTICIPATION_HOURS, leavingRestricted } from './civics/religion';
import { ENGAGEMENTS, EXPECTED_ENGAGEMENTS, PATRONAGE_CAUSES, dutyKind } from './civics/royal';
import { coverageShare, inCustody, workRights } from './civics/status';
import { medianWage } from './economy/economy';
import { applyPercent } from './core/money';
import type {
  ApplicationRoute,
  CaseKind,
  Character,
  ConditionKind,
  HealthCondition,
  LegalCase,
  Participation,
  PoliticalCareer,
  ResidenceStatus,
  World,
} from './state/schema';

/** Read-only projection of citizenship, institutions and civic life (Milestone 6). */

export interface RouteView {
  route: ApplicationRoute;
  name: string;
  eligible: boolean;
  reasons: string[];
  feeMinor: bigint;
  approvalPercent: number;
  processingMonths: number;
  wouldLose: string[];
  renounceRequired: boolean;
  note: string;
  grantsPermanent: boolean;
  workRights: string;
  durationMonths: number;
}

export interface CountryCivicView {
  code: string;
  name: string;
  yourStatus: ResidenceStatus | null;
  institutions: Institutions;
  routes: RouteView[];
}

export interface ConditionView {
  id: string;
  kind: ConditionKind;
  chronic: boolean;
  status: HealthCondition['status'];
  severity: number;
  care: HealthCondition['care'];
  waitUntilTick: number | null;
  treatmentEndTick: number | null;
  publicMinor: bigint;
  privateMinor: bigint;
  waitMonths: number;
  procedure: boolean;
  cure: ReturnType<typeof cureQuote>;
}

export interface CaseView {
  id: string;
  kind: CaseKind;
  criminal: boolean;
  role: LegalCase['role'];
  status: LegalCase['status'];
  hearingTick: number;
  lawyer: LegalCase['lawyer'];
  plea: LegalCase['plea'];
  outcome: LegalCase['outcome'];
  sentenceMonths: number;
  amountMinor: bigint;
  convicted: boolean;
  spentTick: number | null;
  closedTick: number | null;
}

export interface CivicView {
  source: typeof INSTITUTIONS_SOURCE;
  easyMigration: boolean;
  status: {
    citizenships: { code: string; name: string }[];
    countryCode: string;
    countryName: string;
    residence: ResidenceStatus;
    route: string | null;
    routeName: string | null;
    sinceTick: number;
    expiresTick: number | null;
    residedMonths: number;
    monthsToPermanent: number | null;
    monthsToCitizenship: number | null;
    workRights: 'full' | 'limited' | 'none';
    custodyUntilTick: number | null;
  };
  countries: CountryCivicView[];
  applications: {
    id: string;
    countryCode: string;
    countryName: string;
    route: ApplicationRoute;
    status: string;
    appliedTick: number;
    decisionTick: number;
    useByTick: number | null;
    reason: string | null;
    feeMinor: bigint;
  }[];
  relocation: {
    id: string;
    name: string;
    countryCode: string;
    countryName: string;
    allowed: boolean;
    reasons: string[];
    costMinor: bigint;
  }[];
  health: {
    system: string;
    publicCoverage: number;
    yourCoveragePercent: number;
    waitMonths: number;
    note: string;
    insured: boolean;
    conditions: ConditionView[];
    history: ConditionView[];
  };
  legal: {
    institutions: Institutions['law'];
    cases: CaseView[];
    unspentConvictions: number;
    privateFeeMinor: bigint;
    legalAid: boolean;
  };
  religion: {
    current: Religion;
    participation: Participation;
    hours: number;
    canChoose: boolean;
    restricted: boolean;
    choices: Religion[];
    landscape: Institutions['religion'];
  };
  military: {
    rules: Institutions['military'];
    liable: boolean;
    current: {
      id: string;
      kind: string;
      status: string;
      branch: string;
      rank: string;
      monthsServed: number;
      endTick: number | null;
      reportTick: number;
      payMinor: bigint;
      canDefer: boolean;
      canLeave: boolean;
      canReenlist: boolean;
      specialty: Specialty | null;
      posting: 'home' | 'overseas';
      /** Monthly promotion chance (percent) once the time in rank is served. */
      promotionChance: number;
    } | null;
    history: { id: string; kind: string; status: string; rank: string; monthsServed: number }[];
    enlist: { enlisted: string[]; officer: string[] };
    veteran: boolean;
  };
  politics: {
    rules: Institutions['politics'];
    voter: boolean;
    /** Community standing from volunteering, 0-1000 (adds early campaign support). */
    communityStanding: number;
    offices: {
      level: OfficeLevel;
      title: string;
      minAge: number;
      termYears: number;
      selection: string;
      termLimit: number | null;
      salaryMinor: bigint;
      hours: number;
      reasons: string[];
    }[];
    career:
      | (Omit<PoliticalCareer, 'campaign'> & {
          campaign: (NonNullable<PoliticalCareer['campaign']> & { title: string }) | null;
          partyName: string | null;
          officeTitle: string | null;
        })
      | null;
  };
  royal: {
    kind: 'royal' | 'noble';
    approval: number;
    engagements: number;
    expected: number;
    patronages: string[];
    causes: readonly string[];
    engagementKinds: { id: string; hours: number }[];
  } | null;
  royalReason: string | null;
}

function conditionView(world: World, c: Character, h: HealthCondition): ConditionView {
  const quote = careQuote(world, c, h);
  return {
    id: h.id,
    kind: h.kind,
    chronic: CONDITIONS[h.kind].chronic,
    status: h.status,
    severity: h.severity,
    care: h.care,
    waitUntilTick: h.waitUntilTick,
    treatmentEndTick: h.treatmentEndTick,
    publicMinor: quote.public,
    privateMinor: quote.private,
    waitMonths: quote.waitMonths,
    procedure: h.procedure === true,
    cure: cureQuote(world, c, h),
  };
}

function routeName(code: string, route: ApplicationRoute): string {
  if (route === 'permanent') return 'Permanent residence';
  if (route === 'citizenship') return 'Citizenship';
  return getInstitutions(code).visas[route].name;
}

export function projectCivic(world: World, c: Character): CivicView {
  const code = c.civic.residence.countryCode;
  const country = getCountry(code);
  const until = monthsUntil(world, c, code);
  const age = ageOf(c.birth, world.clock).years;
  const r = c.civic.residence;

  const countries = COUNTRIES.map((profile) => {
    const inst = getInstitutions(profile.code);
    const routes: RouteView[] = [...VISA_ROUTES, 'permanent' as const, 'citizenship' as const].map(
      (route) => {
        const check = checkRoute(world, c, profile.code, route);
        const rule = (VISA_ROUTES as readonly string[]).includes(route)
          ? inst.visas[route as (typeof VISA_ROUTES)[number]]
          : undefined;
        return {
          route,
          name: routeName(profile.code, route),
          eligible: check.eligible,
          reasons: check.reasons.map((x) => MIGRATION_MESSAGES[x]),
          feeMinor: check.feeMinor,
          approvalPercent: Math.round(check.approvalBp / 100),
          processingMonths: check.processingMonths,
          wouldLose: check.wouldLose,
          renounceRequired: check.renounceRequired,
          note: rule?.note ?? '',
          grantsPermanent: rule?.grantsPermanent ?? false,
          workRights: rule?.workRights ?? 'full',
          durationMonths: rule?.durationMonths ?? 0,
        };
      },
    );
    const yourStatus = c.civic.citizenships.includes(profile.code)
      ? 'citizen'
      : r.countryCode === profile.code
        ? r.status
        : null;
    return { code: profile.code, name: profile.name, yourStatus, institutions: inst, routes };
  });

  const applications = sortedValues(world.civics.applications)
    .filter((a) => a.characterId === c.id)
    .reverse()
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      countryCode: a.countryCode,
      countryName: getCountry(a.countryCode).name,
      route: a.route,
      status: a.status,
      appliedTick: a.appliedTick,
      decisionTick: a.decisionTick,
      useByTick: a.useByTick,
      reason:
        a.reason === null
          ? null
          : a.reason in MIGRATION_MESSAGES
            ? MIGRATION_MESSAGES[a.reason as keyof typeof MIGRATION_MESSAGES]
            : 'The application was not approved.',
      feeMinor: a.feeMinor,
    }));

  const relocation = COUNTRIES.flatMap((profile) =>
    profile.locations.map((l) => {
      const reasons = relocationCheck(world, c, l.id);
      return {
        id: l.id,
        name: l.name,
        countryCode: profile.code,
        countryName: profile.name,
        allowed: reasons.length === 0,
        reasons: reasons.map((x) => MIGRATION_MESSAGES[x]),
        costMinor: moveCost(world, c, l.id),
      };
    }),
  );

  const healthRules = getRules(c.countryCode).healthcare;
  const mine = sortedValues(world.civics.conditions).filter((h) => h.characterId === c.id);

  const cases = sortedValues(world.civics.cases)
    .filter((k) => k.characterId === c.id)
    .reverse()
    .map((k) => ({
      id: k.id,
      kind: k.kind,
      criminal: CASE_RULES[k.kind].criminal,
      role: k.role,
      status: k.status,
      hearingTick: k.hearingTick,
      lawyer: k.lawyer,
      plea: k.plea,
      outcome: k.outcome,
      sentenceMonths: k.sentenceMonths,
      amountMinor: k.amountMinor,
      convicted: k.convicted,
      spentTick: k.spentTick,
      closedTick: k.closedTick,
    }));

  const service = currentService(world, c);
  const military = getInstitutions(code).military;
  const studying = c.education.current?.stage === 'tertiary';

  const politicsRules = getInstitutions(code).politics;
  const career = careerOf(world, c);
  const median = medianWage(world, code);
  const offices = OFFICE_LEVELS.flatMap((level) => {
    const office = politicsRules.offices[level];
    if (!office) return [];
    return [
      {
        level,
        title: office.title,
        minAge: office.minAge,
        termYears: office.termYears,
        selection: office.selection,
        termLimit: office.termLimit,
        salaryMinor: applyPercent(median, OFFICE_SALARY_PERCENT[level]),
        hours: OFFICE_HOURS[level],
        reasons: officeCheck(world, c, level).map((x) => POLITICS_MESSAGES[x]),
      },
    ];
  });

  const kind = age >= 18 ? dutyKind(world, c) : null;
  const duty = world.civics.royal[c.id];

  return {
    source: INSTITUTIONS_SOURCE,
    easyMigration: world.rules.easyMigration,
    status: {
      citizenships: c.civic.citizenships.map((x) => ({ code: x, name: getCountry(x).name })),
      countryCode: code,
      countryName: country.name,
      residence: r.status,
      route: r.route,
      routeName: r.route ? routeName(code, r.route) : null,
      sinceTick: r.sinceTick,
      expiresTick: r.expiresTick,
      residedMonths: c.civic.residedMonths[code] ?? 0,
      monthsToPermanent: r.status === 'visa' ? until.permanent : null,
      monthsToCitizenship: r.status === 'citizen' ? null : until.citizenship,
      workRights: workRights(c),
      custodyUntilTick: inCustody(world, c) ? c.civic.custodyUntilTick : null,
    },
    countries,
    applications,
    relocation,
    health: {
      system: healthRules.system,
      publicCoverage: healthRules.publicCoverage,
      yourCoveragePercent: Math.floor((healthRules.publicCoverage * coverageShare(c)) / 100),
      waitMonths: publicWaitMonths(world, c),
      note: getInstitutions(code).healthcare.note,
      insured: sortedValues(world.insurance).some(
        (p) => p.holderId === c.id && p.type === 'health' && p.status === 'active',
      ),
      conditions: mine
        .filter((h) => h.status !== 'resolved')
        .map((h) => conditionView(world, c, h)),
      history: mine.filter((h) => h.status === 'resolved').map((h) => conditionView(world, c, h)),
    },
    legal: {
      institutions: getInstitutions(code).law,
      cases,
      unspentConvictions: cases.filter(
        (k) => k.convicted && (k.spentTick === null || k.spentTick > world.tick),
      ).length,
      privateFeeMinor: privateLawyerFee(world, c),
      legalAid: legalAidEligible(world, c),
    },
    religion: {
      current: c.civic.religion,
      participation: c.civic.participation,
      hours: PARTICIPATION_HOURS[c.civic.participation],
      canChoose: age >= 16,
      restricted: leavingRestricted(c),
      choices: [...RELIGIONS],
      landscape: getInstitutions(code).religion,
    },
    military: {
      rules: military,
      liable: liable(c, code),
      current: service
        ? {
            id: service.id,
            kind: service.kind,
            status: service.status,
            branch: service.branch,
            rank: rankTitle(service),
            monthsServed: service.monthsServed,
            endTick: service.endTick,
            reportTick: service.reportTick,
            payMinor: monthlyPay(world, service),
            canDefer:
              service.status === 'called' &&
              getInstitutions(service.countryCode).military.deferForStudy &&
              studying &&
              age < getInstitutions(service.countryCode).military.callUpUntil,
            canLeave:
              service.status === 'serving' &&
              service.kind === 'volunteer' &&
              service.monthsServed >= MIN_SERVICE_BEFORE_LEAVING,
            canReenlist:
              service.status === 'serving' &&
              service.kind === 'volunteer' &&
              service.endTick !== null &&
              service.endTick - world.tick <= 6,
            specialty: service.specialty ?? null,
            posting: service.posting ?? 'home',
            promotionChance: promotionChance(c, service),
          }
        : null,
      history: sortedValues(world.civics.service)
        .filter((s) => s.characterId === c.id && s.id !== service?.id)
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          status: s.status,
          rank: rankTitle(s),
          monthsServed: s.monthsServed,
        })),
      enlist: {
        enlisted: enlistmentCheck(world, c, 'enlisted').map((x) => MILITARY_MESSAGES[x]),
        officer: enlistmentCheck(world, c, 'officer').map((x) => MILITARY_MESSAGES[x]),
      },
      veteran: c.civic.veteran,
    },
    politics: {
      rules: politicsRules,
      communityStanding: c.career.community ?? 0,
      voter:
        politicsRules.voteAge !== null &&
        age >= politicsRules.voteAge &&
        c.civic.citizenships.includes(code),
      offices,
      career: career
        ? {
            ...career,
            campaign: career.campaign
              ? {
                  ...career.campaign,
                  title: politicsRules.offices[career.campaign.level]?.title ?? '',
                }
              : null,
            partyName: politicsRules.parties.find((p) => p.id === career.partyId)?.name ?? null,
            officeTitle: career.office
              ? (politicsRules.offices[career.office]?.title ?? null)
              : null,
          }
        : null,
    },
    royal: kind
      ? {
          kind,
          approval: duty?.approval ?? 600,
          engagements: duty?.engagements ?? 0,
          expected: EXPECTED_ENGAGEMENTS[kind],
          patronages: duty?.patronages ?? [],
          causes: PATRONAGE_CAUSES,
          engagementKinds: Object.entries(ENGAGEMENTS).map(([id, e]) => ({ id, hours: e.hours })),
        }
      : null,
    royalReason:
      kind === null
        ? world.households[c.householdId]?.flags.royal ||
          world.households[c.householdId]?.flags.noble
          ? 'Public duties start at 18.'
          : null
        : null,
  };
}
