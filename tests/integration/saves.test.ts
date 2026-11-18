import { afterEach, describe, expect, it } from 'vitest';
import { getEvent } from '@engine/content';
import type { Command } from '@engine/core/commands';
import type { GameSessionView } from '@contracts/saves';
import { WeLifeDatabase } from '@persistence/db';
import { decodeValue, encodeValue, hashValue } from '@persistence/codec';
import { KEYFRAME_INTERVAL } from '@persistence/saves';
import { createTestDatabase } from '../helpers/db';
import { HostError, hostFor } from '../helpers/host';
import { newLifeInput } from '../helpers/sim';

const open: WeLifeDatabase[] = [];
function db(): WeLifeDatabase {
  const instance = createTestDatabase();
  open.push(instance);
  return instance;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((d) => d.delete()));
});

type Call = ReturnType<typeof hostFor>['call'];

async function newSave(call: Call, seed = 'integration'): Promise<string> {
  const { saveId } = await call('saves.create', {
    input: newLifeInput({ seed }),
    displayName: null,
  });
  return saveId;
}

/** Plays `months` months through the host the way the UI does; returns every command sent. */
async function play(
  call: Call,
  saveId: string,
  months: number,
  prefix: string,
): Promise<{ session: GameSessionView; commands: Command[] }> {
  let session = await call('game.open', { saveId });
  const commands: Command[] = [];
  const send = async (command: Command) => {
    commands.push(command);
    const result = await call('game.command', { saveId, command });
    session = result.session;
    return result;
  };
  for (let i = 0; i < months; i++) {
    if (session.view.lifeStatus !== 'alive') break;
    const tick = session.view.tick;
    await send({ type: 'act', id: `${prefix}-act-${String(tick)}`, activityId: 'family-time' });
    await send({ type: 'advance', id: `${prefix}-adv-${String(tick)}`, expectedTick: tick });
    const pending = session.view.pendingEvent;
    if (pending) {
      const def = getEvent(pending.definitionId);
      const choiceId = def.choices[tick % def.choices.length]?.id ?? '';
      await send({
        type: 'choose',
        id: `${prefix}-ch-${String(tick)}`,
        instanceId: pending.instanceId,
        choiceId,
      });
    }
  }
  return { session, commands };
}

async function stateHash(database: WeLifeDatabase, saveId: string): Promise<string> {
  const save = await database.saves.get(saveId);
  const head = await database.heads.get(save?.currentBranchId ?? '');
  return hashValue(await decodeValue(head?.state ?? new Uint8Array()));
}

describe('save slots', () => {
  it('creates, lists, renames, duplicates and deletes saves', async () => {
    const { call } = hostFor(db());
    const saveId = await newSave(call);
    let list = await call('saves.list');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: saveId, branchCount: 1, currentBranchName: 'Timeline 1' });
    expect(list[0]?.summary.ageYears).toBe(0);

    await call('saves.rename', { saveId, displayName: 'My first life' });
    const { saveId: copyId } = await call('saves.duplicate', { saveId });
    list = await call('saves.list');
    expect(list.map((s) => s.displayName).sort()).toEqual([
      'My first life',
      'My first life (copy)',
    ]);

    await call('saves.delete', { saveId });
    list = await call('saves.list');
    expect(list.map((s) => s.id)).toEqual([copyId]);
    await expect(call('game.open', { saveId })).rejects.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('rejects invalid creation input with a clear error', async () => {
    const { call } = hostFor(db());
    await expect(
      call('saves.create', {
        input: newLifeInput({ scenario: 'royal', countryCode: 'US' }),
        displayName: null,
      }),
    ).rejects.toMatchObject({ error: { code: 'CREATION_FAILED' } });
    expect(await call('saves.list')).toEqual([]);
  });
});

describe('monthly turns through storage', () => {
  it('persists every month and reopens to the identical state (autosave + reload)', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call);
    const { session } = await play(call, saveId, 30, 'p');
    expect(session.view.tick).toBe(30);
    const before = await stateHash(database, saveId);

    // A fresh worker (page refresh) on the same database.
    const reopened = hostFor(new WeLifeDatabase(database.name));
    const view = await reopened.call('game.open', { saveId });
    expect(view.view.tick).toBe(30);
    expect(view.view.clock).toEqual(session.view.clock);
    expect(await stateHash(database, saveId)).toBe(before);
    expect(await database.snapshots.where('saveId').equals(saveId).count()).toBe(31);
    const kinds = (await database.snapshots.where('saveId').equals(saveId).sortBy('tick')).map(
      (s) => s.kind,
    );
    expect(kinds[0]).toBe('full');
    expect(kinds[KEYFRAME_INTERVAL]).toBe('full');
    expect(kinds.filter((k) => k === 'delta').length).toBeGreaterThan(20);
  });

  it('applies a retried command only once and ignores a double-clicked Advance', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call);
    await call('game.open', { saveId });
    const advance: Command = { type: 'advance', id: 'adv-retry-0001', expectedTick: 0 };
    const first = await call('game.command', { saveId, command: advance });
    const retry = await call('game.command', { saveId, command: advance });
    expect(retry.outcome).toEqual(first.outcome);
    const doubleClick = await call('game.command', {
      saveId,
      command: { ...advance, id: 'adv-retry-0002' },
    });
    if (first.session.view.pendingEvent === null) {
      expect(doubleClick.outcome).toMatchObject({ status: 'rejected', reason: 'stale' });
      expect(doubleClick.session.view.tick).toBe(1);
    } else {
      expect(doubleClick.outcome).toMatchObject({ status: 'rejected', reason: 'pendingChoice' });
      expect(doubleClick.session.view.tick).toBe(0);
    }
    expect(await database.commands.where('saveId').equals(saveId).count()).toBe(1);
  });

  it('keeps a pending decision across a reload and commits it exactly once', async () => {
    const database = db();
    for (let attempt = 0; attempt < 50; attempt++) {
      const { call } = hostFor(database);
      const saveId = await newSave(call, `pending-${String(attempt)}`);
      let session = await call('game.open', { saveId });
      for (let m = 0; m < 48 && !session.view.pendingEvent; m++) {
        session = (
          await call('game.command', {
            saveId,
            command: {
              type: 'advance',
              id: `adv-${String(attempt)}-${String(m)}`,
              expectedTick: session.view.tick,
            },
          })
        ).session;
      }
      const pending = session.view.pendingEvent;
      if (!pending) continue;
      const tickBefore = session.view.tick;

      const reloaded = hostFor(new WeLifeDatabase(database.name));
      const reopened = await reloaded.call('game.open', { saveId });
      expect(reopened.view.pendingEvent?.instanceId).toBe(pending.instanceId);
      expect(reopened.view.tick).toBe(tickBefore); // month not committed yet
      const choiceId = getEvent(pending.definitionId).choices[0]?.id ?? '';
      const choose: Command = {
        type: 'choose',
        id: `choose-${String(attempt)}`,
        instanceId: pending.instanceId,
        choiceId,
      };
      const done = await reloaded.call('game.command', { saveId, command: choose });
      expect(done.session.view.tick).toBe(tickBefore + 1);
      expect(done.session.view.pendingEvent).toBeNull();
      const again = await reloaded.call('game.command', { saveId, command: choose });
      expect(again.session.view.tick).toBe(tickBefore + 1);
      return;
    }
    throw new Error('No pending decision found');
  }, 60_000);
});

describe('rewind and branches (M1 exit)', () => {
  it('rewinds to a month on a new branch, restores the full world, and reproduces results', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call, 'rewind');
    const { commands } = await play(call, saveId, 40, 'r');
    const originalHash = await stateHash(database, saveId);
    const timeline = await call('timeline.get', { saveId });
    expect(timeline.lineage).toHaveLength(41);
    const month20 = timeline.lineage[20];
    if (!month20) throw new Error('missing month');

    const rewound = await call('timeline.rewind', { saveId, snapshotId: month20.id });
    expect(rewound.view.tick).toBe(20);
    expect(rewound.branch.name).toBe('Timeline 2');
    expect(rewound.view.pendingEvent).toBeNull();

    // Replay the original commands issued from month 20 onwards on the new branch.
    const fromMonth20 = commands.slice(
      commands.findIndex((c) => c.type === 'act' && c.id === 'r-act-20'),
    );
    for (const command of fromMonth20) await call('game.command', { saveId, command });
    expect(await stateHash(database, saveId)).toBe(originalHash);

    const after = await call('timeline.get', { saveId });
    expect(after.branches).toHaveLength(2);
    const original = after.branches.find((b) => b.name === 'Timeline 1');
    expect(original).toMatchObject({ headTick: 40, isCurrent: false, isLeaf: false });

    // The old timeline is intact and can be switched back to.
    const back = await call('timeline.checkout', { saveId, branchId: original?.id ?? '' });
    expect(back.view.tick).toBe(40);
  });

  it('deletes only leaf branches that are not being played', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call, 'branches');
    await play(call, saveId, 6, 'b');
    const t1 = await call('timeline.get', { saveId });
    const root = t1.branches[0];
    await call('timeline.rewind', { saveId, snapshotId: t1.lineage[2]?.id ?? '' });
    await play(call, saveId, 2, 'b2');
    await expect(
      call('timeline.deleteBranch', { saveId, branchId: root?.id ?? '' }),
    ).rejects.toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    });
    const t2 = await call('timeline.get', { saveId });
    const current = t2.branches.find((b) => b.isCurrent);
    await expect(
      call('timeline.deleteBranch', { saveId, branchId: current?.id ?? '' }),
    ).rejects.toBeInstanceOf(HostError);
    // Switch back to the root and delete the leaf.
    await call('timeline.checkout', { saveId, branchId: root?.id ?? '' });
    const t3 = await call('timeline.deleteBranch', { saveId, branchId: current?.id ?? '' });
    expect(t3.branches).toHaveLength(1);
    expect(
      await database.snapshots
        .where('branchId')
        .equals(current?.id ?? '')
        .count(),
    ).toBe(0);
  });

  it('warns when a timeline was recorded by a different engine version', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call, 'versions');
    expect((await call('game.open', { saveId })).replayGuaranteed).toBe(true);
    await database.snapshots.where('saveId').equals(saveId).modify({ engineVersion: '0.0.1-old' });
    expect((await hostFor(database).call('game.open', { saveId })).replayGuaranteed).toBe(false);
  });
});

describe('export and import', () => {
  it('round-trips a save with all timelines and verifies integrity', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call, 'export');
    await play(call, saveId, 15, 'e');
    const t = await call('timeline.get', { saveId });
    await call('timeline.rewind', { saveId, snapshotId: t.lineage[5]?.id ?? '' });
    await play(call, saveId, 3, 'e2');
    const before = await stateHash(database, saveId);

    const { json, fileName } = await call('saves.export', { saveId });
    expect(fileName).toMatch(/\.welife\.json$/);
    const imported = await call('saves.import', { json });
    const again = await call('saves.import', { json }); // ids are remapped: importing twice works
    expect(imported.saveId).not.toBe(again.saveId);
    expect(await stateHash(database, imported.saveId)).toBe(before);
    const timeline = await call('timeline.get', { saveId: imported.saveId });
    expect(timeline.branches).toHaveLength(2);
    const opened = await call('game.open', { saveId: imported.saveId });
    expect(opened.view.tick).toBe(8);
  });

  it('rejects damaged, edited or foreign files without changing anything', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call, 'damaged');
    await play(call, saveId, 3, 'd');
    const { json } = await call('saves.export', { saveId });
    const bundle = JSON.parse(json) as {
      save: { displayName: string };
      snapshots: { payload: string }[];
      checksum: string;
    };

    const edited = structuredClone(bundle);
    edited.save.displayName = 'Hacked';
    const corrupted = structuredClone(bundle);
    const payload = corrupted.snapshots[1]?.payload ?? '';
    corrupted.snapshots[1] = {
      ...(corrupted.snapshots[1] as { payload: string }),
      payload: payload.slice(0, -8) + 'AAAAAAA=',
    };

    const attempts = [
      'not json at all',
      JSON.stringify({ format: 'something-else' }),
      JSON.stringify(edited),
      JSON.stringify({ ...bundle, bundleVersion: 99 }),
      JSON.stringify(corrupted),
    ];
    for (const attempt of attempts) {
      await expect(call('saves.import', { json: attempt })).rejects.toMatchObject({
        error: { code: 'IMPORT_FAILED' },
      });
    }
    expect((await call('saves.list')).map((s) => s.id)).toEqual([saveId]);
  });
});

describe('corruption, interrupted writes and concurrent windows', () => {
  it('reports a damaged save safely and can repair it from the last good month', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call, 'repair');
    await play(call, saveId, 5, 'x');
    const save = await database.saves.get(saveId);
    await database.heads.update(save?.currentBranchId ?? '', { state: new Uint8Array([1, 2, 3]) });
    const fresh = hostFor(database);
    await expect(fresh.call('game.open', { saveId })).rejects.toMatchObject({
      error: { code: 'CORRUPTED' },
    });
    await fresh.call('saves.repair', { saveId });
    const repaired = await fresh.call('game.open', { saveId });
    expect(repaired.view.tick).toBe(5);
  });

  it('rolls back the whole turn if a write fails part-way (atomic commit)', async () => {
    const database = db();
    const { call } = hostFor(database);
    const saveId = await newSave(call, 'atomic');
    const session = await call('game.open', { saveId });
    const snapshotsBefore = await database.snapshots.count();
    const hashBefore = await stateHash(database, saveId);
    const originalAdd = database.commands.add.bind(database.commands);
    database.commands.add = (() =>
      Promise.reject(new Error('simulated crash'))) as unknown as typeof database.commands.add;
    await expect(
      call('game.command', {
        saveId,
        command: { type: 'advance', id: 'adv-crash-0001', expectedTick: session.view.tick },
      }),
    ).rejects.toBeInstanceOf(HostError);
    database.commands.add = originalAdd;
    expect(await database.snapshots.count()).toBe(snapshotsBefore);
    expect(await stateHash(database, saveId)).toBe(hashBefore);
    // After the failure the game reloads cleanly and the month can be advanced once.
    const ok = await call('game.command', {
      saveId,
      command: { type: 'advance', id: 'adv-crash-0002', expectedTick: 0 },
    });
    expect(ok.outcome.status).toBe('applied');
  });

  it('refuses to overwrite changes made in another window', async () => {
    const database = db();
    const a = hostFor(database);
    const b = hostFor(new WeLifeDatabase(database.name));
    const saveId = await newSave(a.call, 'tabs');
    await a.call('game.open', { saveId });
    await b.call('game.open', { saveId });
    await a.call('game.command', {
      saveId,
      command: { type: 'act', id: 'act-tab-a-0001', activityId: 'family-time' },
    });
    await expect(
      b.call('game.command', {
        saveId,
        command: { type: 'act', id: 'act-tab-b-0001', activityId: 'family-time' },
      }),
    ).rejects.toMatchObject({ error: { code: 'CONFLICT' } });
    // Window B recovers by reloading.
    const reloaded = await b.call('game.command', {
      saveId,
      command: { type: 'act', id: 'act-tab-b-0002', activityId: 'family-time' },
    });
    expect(reloaded.outcome.status).toBe('applied');
  });

  it('encodes and decodes values losslessly', async () => {
    const value = { a: [1, 2, { b: 'x' }], big: 10n ** 20n };
    const { bytes, hash } = await encodeValue(value);
    expect(await decodeValue(bytes)).toEqual(value);
    expect(hash).toHaveLength(64);
  });
});
