import { afterEach, describe, expect, it } from 'vitest';
import { blankPack, blankEvent } from '@engine/content/editorSupport';
import type { WeLifeDatabase } from '@persistence/db';
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

function packJson(version = '1.0.0'): string {
  const event = {
    ...blankEvent('library-event'),
    chancePpm: 100_000,
    when: { kind: 'cmp' as const, fact: 'age.years', op: 'gte' as const, value: 0 },
  };
  return JSON.stringify({
    ...blankPack(),
    id: 'library-pack',
    name: 'Library pack',
    packVersion: version,
    events: [event],
  });
}

describe('content-pack library through the worker (Milestone 8)', () => {
  it('stores valid packs with version history and never stores invalid ones', async () => {
    const { call } = hostFor(db());
    const refused = await call('packs.save', { json: '{"format":"welife-pack","events":[]}' });
    expect(refused.ok).toBe(false);
    expect(refused.issues.length).toBeGreaterThan(0);
    const notJson = await call('packs.save', { json: 'not json' });
    expect(notJson.issues[0]?.message).toMatch(/JSON/);
    expect(await call('packs.list')).toEqual([]);

    expect((await call('packs.save', { json: packJson('1.0.0') })).ok).toBe(true);
    expect((await call('packs.save', { json: packJson('1.0.1') })).ok).toBe(true);
    const list = await call('packs.list');
    expect(list).toHaveLength(1);
    expect(list[0]?.versions).toEqual(['1.0.1', '1.0.0']);
    expect((await call('packs.validate', { json: packJson() })).ok).toBe(true);
    const preview = await call('packs.preview', {
      json: packJson(),
      eventId: 'library-event',
      countryCode: 'JP',
      ageYears: 20,
      seed: 's',
    });
    expect(preview.ok).toBe(true);
    await call('packs.delete', { id: 'library-pack' });
    expect(await call('packs.list')).toEqual([]);
  });

  it('a pack enabled for a life travels with the save; invalid packs leave the save unchanged', async () => {
    const { call } = hostFor(db());
    const { saveId } = await call('saves.create', {
      input: newLifeInput({ seed: 'host-pack' }),
      displayName: null,
    });
    const before = await call('game.open', { saveId });
    const bad = await call('game.command', {
      saveId,
      command: { type: 'enablePack', id: 'bad-pack', pack: { format: 'welife-pack' } },
    });
    expect(bad.outcome).toMatchObject({ status: 'rejected' });
    expect(bad.session.view.packs).toEqual([]);
    expect(bad.session.view.tick).toBe(before.view.tick);

    const ok = await call('game.command', {
      saveId,
      command: { type: 'enablePack', id: 'good-pack', pack: JSON.parse(packJson()) as unknown },
    });
    expect(ok.outcome).toMatchObject({ status: 'applied' });
    expect(ok.session.view.packs).toMatchObject([{ id: 'library-pack', enabled: true, events: 1 }]);
    expect(ok.session.view.customEventTexts['library-event']?.title).toBe('A new event');

    const { json } = await call('saves.export', { saveId });
    const imported = await call('saves.import', { json });
    const copy = await call('game.open', { saveId: imported.saveId });
    expect(copy.view.packs.map((p) => p.id)).toEqual(['library-pack']);
  });

  it('records achievements in the cross-save gallery with provenance, and serves biographies', async () => {
    const { call } = hostFor(db());
    const { saveId } = await call('saves.create', {
      input: newLifeInput({ seed: 'host-gallery' }),
      displayName: 'Gallery life',
    });
    let session = await call('game.open', { saveId });
    for (let i = 0; i < 13; i++) {
      let result = await call('game.command', {
        saveId,
        command: { type: 'advance', id: `adv-${String(i)}`, expectedTick: session.view.tick },
      });
      session = result.session;
      let n = 0;
      while (session.view.pendingEvent && n < 10) {
        const pending = session.view.pendingEvent;
        const choice = pending.choices.find((c) => c.available)?.id ?? '';
        result = await call('game.command', {
          saveId,
          command: {
            type: 'choose',
            id: `ch-${String(i)}-${String(n)}`,
            instanceId: pending.instanceId,
            choiceId: choice,
          },
        });
        session = result.session;
        n += 1;
      }
    }
    const gallery = await call('achievements.gallery');
    const birthday = gallery.find((g) => g.achievementId === 'first-birthday');
    expect(birthday).toMatchObject({ saveId, saveName: 'Gallery life', generation: 1 });
    const bio = await call('game.biography', { saveId, personId: session.view.character.id });
    expect(bio?.chapters.length).toBeGreaterThan(0);
    await call('saves.delete', { saveId });
    expect((await call('achievements.gallery')).some((g) => g.saveId === saveId)).toBe(false);
  }, 120_000);

  it('rejects malformed requests to the pack methods', async () => {
    const { call } = hostFor(db());
    await expect(call('packs.get', { id: 'Not An Id!' })).rejects.toBeInstanceOf(HostError);
  });
});

describe('tampered saves', () => {
  it('refuses to import a save whose stored pack events break the rules', async () => {
    const { call } = hostFor(db());
    const { saveId } = await call('saves.create', {
      input: newLifeInput({ seed: 'host-tamper' }),
      displayName: null,
    });
    await call('game.command', {
      saveId,
      command: { type: 'enablePack', id: 'good-pack', pack: JSON.parse(packJson()) as unknown },
    });
    const { json } = await call('saves.export', { saveId });
    // Swap the pack event's title for markup inside the exported file.
    const tampered = json.replace('A new event', '<img src=x onerror=alert(1)>');
    expect(tampered).not.toBe(json);
    // The bundle checksum catches the edit first; the stored-pack check is the second line
    // of defence (tested directly in packs.test.ts).
    await expect(call('saves.import', { json: tampered })).rejects.toThrow(
      /checksum|content pack/i,
    );
  });
});
