import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { execute, type Command, type SimState } from '../../src/engine/core/commands';
import { WeLifeDatabase } from '../../src/persistence/db';
import { importSave } from '../../src/persistence/bundle';
import { loadSession } from '../../src/persistence/saves';
import { adultSaveJson } from './adultSave';
import { advanceOnce } from './helpers';

/**
 * Spec C-05: the simulation is deterministic across browsers. A save built in Node is played
 * in each browser engine (Chromium, Firefox, WebKit); the result is exported and compared with
 * the same months replayed in Node, answering each decision the way the browser did.
 */

async function stateOf(json: string): Promise<SimState> {
  const db = new WeLifeDatabase(`determinism-${randomUUID()}`);
  try {
    const saveId = await importSave(db, json);
    return (await loadSession(db, saveId)).state;
  } finally {
    await db.delete();
  }
}

function fingerprint(state: SimState) {
  const w = state.world;
  const player = w.characters[w.activeCharacterId];
  return {
    tick: w.tick,
    clock: w.clock,
    rng: w.rng,
    lifeStatus: w.lifeStatus,
    stats: player?.stats,
    people: Object.keys(w.characters).sort(),
    balances: Object.values(w.ledger.accounts)
      .map((a) => `${a.id}=${a.balance.toString()}`)
      .sort(),
    events: Object.values(w.events.instances)
      .map((i) => `${i.id}:${i.definitionId}:${i.choiceId ?? '-'}`)
      .sort(),
  };
}

let start = '';

test.beforeAll(async () => {
  start = await adultSaveJson('e2e-determinism');
});

test('a game played in the browser matches the same months replayed in Node (C-05)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'determinism.welife.json',
    mimeType: 'application/json',
    buffer: Buffer.from(start),
  });
  await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
  for (let i = 0; i < 8; i++) await advanceOnce(page);
  // Settle a decision that may still be open so both sides stop at a committed month.
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('group', { name: 'Choices' }) });
  if (await dialog.isVisible()) await advanceOnce(page);

  await page.goto('/');
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByTestId('save-card')
    .first()
    .getByRole('button', { name: /^Export/ })
    .click();
  const path = await (await downloadPromise).path();
  const played = await stateOf(await readFile(path, 'utf8'));
  expect(played.world.tick).toBeGreaterThan(0);

  // Replay in Node: advance month by month, answering each decision as the browser did.
  let state = await stateOf(start);
  let n = 0;
  const send = (body: Record<string, unknown>) => {
    n += 1;
    const result = execute(state, { ...body, id: `node-${String(n)}` } as Command);
    expect(result.outcome.status, JSON.stringify(result.outcome)).toBe('applied');
    state = result.state;
  };
  while (state.world.tick < played.world.tick || state.pending) {
    if (state.pending) {
      const instanceId = state.pending.events.pendingInstanceId ?? '';
      const choiceId = played.world.events.instances[instanceId]?.choiceId ?? '';
      send({ type: 'choose', instanceId, choiceId });
    } else send({ type: 'advance', expectedTick: state.world.tick });
  }
  expect(fingerprint(state)).toEqual(fingerprint(played));
});
