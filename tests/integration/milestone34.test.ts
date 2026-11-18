import { afterEach, describe, expect, it } from 'vitest';
import { getEvent } from '@engine/content';
import type { WeLifeDatabase } from '@persistence/db';
import { encodeValue } from '@persistence/codec';
import fixture from '../fixtures/world-v1.json';
import { createTestDatabase } from '../helpers/db';
import { hostFor } from '../helpers/host';
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

describe('people, family tree and actions through the worker (Milestones 3-4)', () => {
  it('serves person details and the family tree, and applies new commands', async () => {
    const { call } = hostFor(db());
    const { saveId } = await call('saves.create', {
      input: newLifeInput({ seed: 'host-m34' }),
      displayName: null,
    });
    let session = await call('game.open', { saveId });
    const parent = session.view.social.people.find((p) => p.relation === 'parent');
    expect(parent).toBeDefined();
    const detail = await call('game.person', { saveId, personId: parent?.id ?? '' });
    expect(detail?.relation).toBe('parent');
    expect(detail?.interactions.map((i) => i.id)).toContain('chat');
    expect(await call('game.person', { saveId, personId: 'nobody' })).toBeNull();
    const tree = await call('game.family', { saveId });
    expect(
      tree.generations.find((g) => g.offset === 0)?.nodes.some((n) => n.relation === 'you'),
    ).toBe(true);
    expect(tree.generations.some((g) => g.offset === -1)).toBe(true);

    // Book a check-up and see it in the calendar.
    const booked = await call('game.command', {
      saveId,
      command: {
        type: 'scheduleItem',
        id: 'book-1',
        itemKind: 'checkup',
        option: 'general',
        tick: session.view.tick + 2,
      },
    });
    expect(booked.outcome).toMatchObject({ status: 'applied', kind: 'done' });
    expect(booked.session.view.calendar.upcoming.some((u) => u.kind === 'checkup')).toBe(true);
    // A refused action explains why and changes nothing.
    const refused = await call('game.command', {
      saveId,
      command: { type: 'takeLoan', id: 'loan-1', amountMinor: '1000', termMonths: 12 },
    });
    expect(refused.outcome).toMatchObject({ status: 'rejected', reason: 'ineligible' });

    // Money moves through the ledger as months pass.
    for (let i = 0; i < 3; i++) {
      const tick = session.view.tick;
      const result = await call('game.command', {
        saveId,
        command: { type: 'advance', id: `adv-${String(i)}`, expectedTick: tick },
      });
      session = result.session;
      const pending = session.view.pendingEvent;
      if (pending) {
        const choiceId = getEvent(pending.definitionId).choices[0]?.id ?? '';
        session = (
          await call('game.command', {
            saveId,
            command: {
              type: 'choose',
              id: `ch-${String(i)}`,
              instanceId: pending.instanceId,
              choiceId,
            },
          })
        ).session;
      }
    }
    expect(session.view.finance.household?.monthIncome).toBeGreaterThan(0n);
  });
});

describe('a Milestone 2 save opens, upgrades and plays on', () => {
  async function writeV1Save(database: WeLifeDatabase): Promise<string> {
    const world = (
      fixture as {
        world: Record<string, unknown> & {
          tick: number;
          clock: { year: number; month: number };
          id: string;
        };
      }
    ).world;
    const snapshot = await encodeValue(world);
    const head = await encodeValue({ world, pending: null });
    const now = new Date().toISOString();
    await database.saves.add({
      id: 'save-v1',
      displayName: 'Old life',
      worldId: world.id,
      createdAt: now,
      updatedAt: now,
      worldSchemaVersion: 1,
      engineVersion: '0.2.0',
      contentVersion: 'core-2026.11.1',
      currentBranchId: 'branch-v1',
      difficulty: 'realistic',
      easyMigration: false,
      summary: {
        characterName: 'Ada',
        ageYears: 2,
        countryCode: 'GB',
        clock: world.clock,
        lifeStatus: 'alive',
        appearance: {
          skinTone: 0,
          hairColor: 0,
          hairStyle: 0,
          eyeColor: 0,
          faceShape: 0,
          freckles: false,
        },
        stage: 'toddler',
      },
      layout: null,
      checksum: head.hash,
    });
    await database.branches.add({
      id: 'branch-v1',
      saveId: 'save-v1',
      name: 'Timeline 1',
      parentBranchId: null,
      forkSnapshotId: null,
      headSnapshotId: 'snap-v1',
      createdAt: now,
    });
    await database.snapshots.add({
      id: 'snap-v1',
      saveId: 'save-v1',
      branchId: 'branch-v1',
      parentId: null,
      tick: world.tick,
      clock: world.clock,
      kind: 'full',
      depth: 0,
      payload: snapshot.bytes,
      hash: snapshot.hash,
      engineVersion: '0.2.0',
      contentVersion: 'core-2026.11.1',
      createdAt: now,
    });
    await database.heads.add({
      branchId: 'branch-v1',
      saveId: 'save-v1',
      state: head.bytes,
      hash: head.hash,
      updatedAt: now,
    });
    return 'save-v1';
  }

  it('upgrades on open, warns about replay, starts a fresh keyframe and can rewind to old months', async () => {
    const database = db();
    const saveId = await writeV1Save(database);
    const { call } = hostFor(database);
    const session = await call('game.open', { saveId });
    expect(session.view.character.identity.firstName).toBe('Ada');
    expect(session.replayGuaranteed).toBe(false);
    expect(session.view.social.people.length).toBeGreaterThan(10);
    const result = await call('game.command', {
      saveId,
      command: { type: 'advance', id: 'v1-adv', expectedTick: session.view.tick },
    });
    expect(result.outcome.status).toBe('applied');
    const newest = (await database.snapshots.where('saveId').equals(saveId).toArray()).sort(
      (a, b) => b.tick - a.tick,
    )[0];
    expect(newest?.kind).toBe('full');
    expect(newest?.engineVersion).not.toBe('0.2.0');
    // Rewinding to the old (version 1) month rebuilds and upgrades it.
    const rewound = await call('timeline.rewind', { saveId, snapshotId: 'snap-v1' });
    expect(rewound.view.tick).toBe(session.view.tick);
    expect(rewound.branch.name).not.toBe('Timeline 1');
  });
});
