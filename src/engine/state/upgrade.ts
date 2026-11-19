import { Rng } from '../core/rng';
import { ageOf } from '../core/clock';
import { initializeSystems } from '../core/setup';
import { emptyEducation } from '../characters/factory';
import { randomInterests } from '../social/relationships';
import { birthCivic, defaultCivic, parentsOf, religionFor } from '../civics/status';
import { currencyFor } from '../economy/finance';
import { DEFAULT_CAREER, RNG_STREAMS, SKILL_KEYS, type World } from './schema';

/**
 * Upgrades a version-1 world (Milestones 1-2) to version 2. Pure and deterministic: new
 * random streams are seeded from the world seed, so upgrading the same save always gives the
 * same result. Existing people, history and status are kept; new systems are set up as for
 * a new world (spec §5: migrate older versions; never remove existing status).
 */
export function upgradeWorldV1(raw: Record<string, unknown>): Record<string, unknown> {
  const world = raw as unknown as World & Record<string, unknown>;
  const rng = world.rng as Record<string, unknown>;
  for (const stream of RNG_STREAMS) {
    rng[stream] ??= Rng.fromSeed(`${world.seed}::${stream}::v2`).state();
  }
  for (const id of Object.keys(world.characters).sort()) {
    const c = world.characters[id] as unknown as Record<string, unknown> &
      World['characters'][string];
    const skills = c.skills as Record<string, number>;
    const adult = ageOf(c.birth, world.clock).years >= 18;
    const seeded = new Rng(Rng.fromSeed(`${world.seed}::skills::${id}`).state());
    for (const key of SKILL_KEYS) skills[key] ??= adult ? seeded.range(100, 450) : 0;
    c.partnership = null;
    c.education = emptyEducation();
    c.employmentId = null;
    c.finance = null;
  }
  // Interests use the new social stream, in id order.
  world.memories = {};
  for (const id of Object.keys(world.characters).sort()) {
    const c = world.characters[id] as World['characters'][string];
    c.interests = randomInterests(world);
  }
  for (const h of Object.values(world.households))
    (h as unknown as Record<string, unknown>).finance = null;
  for (const r of Object.values(world.relationships)) {
    const rel = r as unknown as Record<string, unknown>;
    rel.chemistry = 50;
    rel.history = 0;
    rel.since = 0;
  }
  for (const i of Object.values(world.events.instances)) {
    const instance = i as unknown as Record<string, unknown>;
    instance.subjectId = null;
    instance.context = {};
  }
  for (const s of world.events.scheduled) {
    const consequence = s as unknown as Record<string, unknown>;
    consequence.subjectId = null;
    consequence.context = {};
  }
  for (const n of world.notifications) (n as unknown as Record<string, unknown>).targetId = null;
  world.employment = {};
  world.jobs = { postings: {}, applications: {}, refreshedTick: world.tick };
  world.ledger = { accounts: {}, journal: {}, history: {} };
  world.insurance = {};
  world.economy = {};
  world.calendar = { plans: [], items: [] };
  world.expecting = [];
  // Systems from later versions start empty so setup can run; their own steps fill the rest.
  world.businesses = {};
  world.competitors = {};
  world.properties = {};
  world.propertyListings = {};
  addCivics(world);
  (world as { schemaVersion: number }).schemaVersion = 2;
  initializeSystems(world);
  return world;
}

/**
 * Upgrades a version-2 world (Milestones 3-4) to version 3 (Milestone 5): empty company,
 * competitor and property records, new economy indices at their start level, and new
 * random streams seeded from the world seed. Nothing that already exists changes.
 */
export function upgradeWorldV2(raw: Record<string, unknown>): Record<string, unknown> {
  const world = raw as unknown as World & Record<string, unknown>;
  const rng = world.rng as Record<string, unknown>;
  for (const stream of RNG_STREAMS)
    rng[stream] ??= Rng.fromSeed(`${world.seed}::${stream}::v3`).state();
  const stored = world as Record<string, unknown>;
  stored.businesses ??= {};
  stored.competitors ??= {};
  stored.properties ??= {};
  stored.propertyListings ??= {};
  for (const e of Object.values(world.economy)) {
    const economy = e as unknown as Record<string, unknown>;
    economy.fxIndexBp ??= 10_000;
    economy.housePriceBp ??= 10_000;
    economy.bondIndexBp ??= 10_000;
  }
  for (const h of Object.values(world.households)) {
    const finance = h.finance as unknown as Record<string, unknown> | null;
    if (finance) finance.propertyId ??= null;
  }
  (world as { schemaVersion: number }).schemaVersion = 3;
  return world;
}

/** Civic records and every person's citizenship, residence and belief (idempotent). */
function addCivics(world: World): void {
  const stored = world as unknown as Record<string, unknown>;
  stored.civics ??= {
    applications: {},
    conditions: {},
    cases: {},
    service: {},
    politics: {},
    royal: {},
  };
  const ids = Object.keys(world.characters).sort();
  const missing = new Set(
    ids.filter((id) => !(world.characters[id] as unknown as Record<string, unknown>).civic),
  );
  for (const id of missing) {
    const c = world.characters[id];
    if (!c) continue;
    const household = world.households[c.householdId];
    const origin = household?.flags.immigrant ? household.originCountryCode : null;
    const bornBeforeStart = c.birth.year * 12 + c.birth.month - 1 < world.startIndex;
    if (origin && bornBeforeStart && c.id !== world.activeCharacterId) {
      c.civic = defaultCivic(origin, religionFor(c.householdId, origin));
      c.civic.residence = {
        countryCode: c.countryCode,
        status: 'permanent',
        route: null,
        sinceTick: 0,
        expiresTick: null,
      };
    } else {
      c.civic = defaultCivic(c.countryCode, religionFor(c.householdId, origin ?? c.countryCode));
    }
  }
  // Children follow the birth-country rules now that their parents have a status.
  for (const id of missing) {
    const c = world.characters[id];
    if (!c) continue;
    const parents = parentsOf(world, id).filter((p) => !missing.has(p.id) || p.civic);
    const bornInWorld = c.birth.year * 12 + c.birth.month - 1 >= world.startIndex;
    if (bornInWorld && parents.length > 0) birthCivic(world, c, parents, c.countryCode);
    else {
      c.flags[`bornIn.${c.countryCode}`] = true;
      for (const code of c.civic.citizenships) c.flags[`birthCitizen.${code}`] = true;
    }
    if (id === world.activeCharacterId) c.civic.residedMonths[c.countryCode] = world.tick;
  }
}

/**
 * Upgrades a version-3 world (Milestone 5) to version 4 (Milestone 6): citizenship,
 * residence and religion for every person (immigrant parents keep their origin citizenship
 * as permanent residents), empty civic records and a new random stream.
 */
export function upgradeWorldV3(raw: Record<string, unknown>): Record<string, unknown> {
  const world = raw as unknown as World & Record<string, unknown>;
  const rng = world.rng as Record<string, unknown>;
  for (const stream of RNG_STREAMS)
    rng[stream] ??= Rng.fromSeed(`${world.seed}::${stream}::v4`).state();
  addCivics(world);
  (world as { schemaVersion: number }).schemaVersion = 4;
  return world;
}

/**
 * Upgrades a version-4 world (Milestone 6) to version 5 (Milestones 7-8): the lineage
 * starts with the current player as generation 1, and wills, estates, social media,
 * achievements and content packs start empty. A new random stream is seeded.
 */
export function upgradeWorldV4(raw: Record<string, unknown>): Record<string, unknown> {
  const world = raw as unknown as World & Record<string, unknown>;
  const rng = world.rng as Record<string, unknown>;
  for (const stream of RNG_STREAMS)
    rng[stream] ??= Rng.fromSeed(`${world.seed}::${stream}::v5`).state();
  const stored = world as unknown as Record<string, unknown>;
  stored.media ??= { profiles: {}, trends: {} };
  stored.achievements ??= {};
  stored.contentPacks ??= [];
  const status = stored.lifeStatus;
  if (stored.legacy === undefined) {
    const player = world.characters[world.activeCharacterId];
    stored.legacy = {
      generation: 1,
      lineage: player
        ? [
            {
              characterId: player.id,
              generation: 1,
              fromTick: 0,
              toTick: status === 'ended' ? world.tick : null,
              reason: 'start',
              peakNetWorthMinor: 0n,
              currency: currencyFor(player.countryCode),
            },
          ]
        : [],
      wills: {},
      estates: [],
      succession: null,
      house: null,
    };
  }
  // Gameplay expansion: professional reputation, specialism and personal projects.
  for (const c of Object.values(world.characters) as Partial<World['characters'][string]>[]) {
    c.career ??= { ...DEFAULT_CAREER };
    c.projects ??= {};
  }
  world.schemaVersion = 5;
  return world;
}
