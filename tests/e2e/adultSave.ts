import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { createWorld } from '../../src/engine/characters/create';
import { execute, type Command, type SimState } from '../../src/engine/core/commands';
import { getEvent } from '../../src/engine/content';
import { diagnose } from '../../src/engine/civics/health';
import type { ConditionKind } from '../../src/engine/state/schema';
import { WeLifeDatabase } from '../../src/persistence/db';
import { createSave } from '../../src/persistence/saves';
import { exportSave } from '../../src/persistence/bundle';

let n = 0;
function send(state: SimState, body: Record<string, unknown>): SimState {
  n += 1;
  const result = execute(state, { ...body, id: `fx-${String(n)}` } as Command);
  return result.state;
}

function month(state: SimState): SimState {
  let current = send(state, { type: 'advance', expectedTick: state.world.tick });
  while (current.pending) {
    const instanceId = current.pending.events.pendingInstanceId ?? '';
    const def = getEvent(current.pending.events.instances[instanceId]?.definitionId ?? '');
    const choiceId = def.id === 'job-interview' ? 'confident' : (def.choices[0]?.id ?? '');
    current = send(current, { type: 'choose', instanceId, choiceId });
  }
  return current;
}

/**
 * Builds an adult life (about 23, with a job if one is found) with the real engine and
 * exports it as a save file, so end-to-end tests can import it instead of clicking through
 * two decades of months.
 */
export async function adultSaveJson(
  seed = 'e2e-adult',
  options: {
    rivalOffer?: boolean;
    age?: number;
    cashGiftMinor?: bigint;
    condition?: ConditionKind;
    /** Start the actor path (skills raised to qualify) and play a month for castings. */
    actor?: boolean;
    /** Start the musician path (music skill raised to qualify) and play a month. */
    musician?: boolean;
  } = {},
): Promise<string> {
  let state: SimState = {
    world: createWorld(`world-${seed}`, {
      seed,
      start: { year: 2026, month: 11 },
      countryCode: 'GB',
      locationId: null,
      scenario: 'middle',
      originCountryCode: null,
      difficulty: 'realistic',
      easyMigration: false,
      identity: { firstName: 'Robin', lastName: null, gender: 'nonbinary' },
      appearance: null,
    }),
    pending: null,
  };
  for (let m = 0; m < 18 * 12 + 2; m++) state = month(state);
  const player = () => state.world.characters[state.world.activeCharacterId];
  if (player()?.education.current) state = send(state, { type: 'leaveSchool' });
  for (let m = 0; m < 36 && !player()?.employmentId; m++) {
    for (const app of Object.values(state.world.jobs.applications)) {
      if (app.status === 'offered')
        state = send(state, { type: 'respondOffer', applicationId: app.id, response: 'accept' });
    }
    if (player()?.employmentId) break;
    for (const posting of Object.values(state.world.jobs.postings))
      state = send(state, { type: 'applyJob', postingId: posting.id });
    state = month(state);
  }
  for (let m = 0; m < 12; m++) state = month(state);
  if (options.rivalOffer) {
    // Make the worker someone rivals want, then play on until one approaches (real engine).
    const approached = () =>
      Object.values(state.world.jobs.applications).some(
        (a) => a.headhunted === true && a.status === 'offered',
      );
    for (let m = 0; m < 60 && !approached(); m++) {
      const p = player();
      const job = p?.employmentId ? state.world.employment[p.employmentId] : undefined;
      if (!p || !job) throw new Error('fixture: no job for a rival offer');
      job.performance = 850;
      p.career.reputation = 1000;
      state = month(state);
    }
    if (!approached()) throw new Error('fixture: no rival offer');
  }
  if (options.actor) {
    const p = player();
    if (p) {
      p.skills.art = 700;
      p.skills.socializing = 700;
      p.career.reputation = 800;
    }
    state = send(state, { type: 'startCreativePath', occupationId: 'actor' });
    state = month(state);
  }
  if (options.musician) {
    const p = player();
    if (p) p.skills.music = 700;
    state = send(state, { type: 'startCreativePath', occupationId: 'musician' });
    state = month(state);
  }
  if (options.age !== undefined) {
    // Fixture only: make the adult older (e.g. to reach pension ages) without playing decades.
    const p = player();
    if (p) p.birth = { ...p.birth, year: state.world.clock.year - options.age - 1 };
  }
  // Fixture only: an inheritance-sized gift so business and property can be tried in the UI.
  // It is booked against an equity account so the ledger still balances.
  const world = state.world;
  const adult = world.characters[world.activeCharacterId];
  const checkingId = adult?.finance?.checkingId;
  const checking = checkingId ? world.ledger.accounts[checkingId] : undefined;
  if (adult && checking) {
    const gift = options.cashGiftMinor ?? 60_000_000n;
    const equityId = `${adult.id}~equity~fixtureGift`;
    world.ledger.accounts[equityId] = {
      ...checking,
      id: equityId,
      type: 'equity',
      category: 'fixtureGift',
      balance: gift,
      loan: null,
    };
    checking.balance += gift;
  }
  if (adult && options.condition) diagnose(world, adult, options.condition);
  const db = new WeLifeDatabase(`fixture-${randomUUID()}`);
  try {
    const saveId = await createSave(db, state.world, 'Robin, grown up');
    return (await exportSave(db, saveId)).json;
  } finally {
    await db.delete();
  }
}
