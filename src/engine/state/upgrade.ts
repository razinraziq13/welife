import { Rng } from '../core/rng';
import { ageOf } from '../core/clock';
import { initializeSystems } from '../core/setup';
import { emptyEducation } from '../characters/factory';
import { randomInterests } from '../social/relationships';
import { RNG_STREAMS, SKILL_KEYS, type World } from './schema';

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
  world.schemaVersion = 2;
  initializeSystems(world);
  return world;
}
