import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { createWorld } from '../../src/engine/characters/create';
import { execute, type Command, type SimState } from '../../src/engine/core/commands';
import { getEvent } from '../../src/engine/content';
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
export async function adultSaveJson(seed = 'e2e-adult'): Promise<string> {
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
  const db = new WeLifeDatabase(`fixture-${randomUUID()}`);
  try {
    const saveId = await createSave(db, state.world, 'Robin, grown up');
    return (await exportSave(db, saveId)).json;
  } finally {
    await db.delete();
  }
}
