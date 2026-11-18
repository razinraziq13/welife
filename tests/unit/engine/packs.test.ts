import { describe, expect, it } from 'vitest';
import { execute, replay, type Command, type SimState } from '@engine/core/commands';
import { checkInvariants } from '@engine/core/invariants';
import { storedPackIssues, validatePack } from '@engine/content/packs';
import { validateHeadState } from '@persistence/saves';
import { blankPack } from '@engine/content/editorSupport';
import { canonicalJson } from '@engine/core/data';
import { previewEvent } from '@engine/content/preview';
import { newState, playerOf } from '../../helpers/sim';

/**
 * Milestone 8 exit criterion (spec §9): custom packs load safely and trigger
 * deterministically. Validation covers shape, bounds, facts, references, cycles, conflicts,
 * unsafe text and player-pack limits, always with field paths.
 */

function pack(events: unknown[], overrides: Record<string, unknown> = {}) {
  return { ...blankPack(), id: 'test-pack', name: 'Test pack', events, ...overrides };
}

function event(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    version: 1,
    category: 'childhood',
    scheduledOnly: false,
    when: { kind: 'cmp', fact: 'age.years', op: 'gte', value: 0 },
    subject: null,
    asset: null,
    chancePpm: 1_000_000,
    multipliers: [],
    cooldownMonths: 1200,
    maxOccurrences: 1,
    exclusiveGroup: null,
    effects: [{ kind: 'flag', flag: 'packFired', value: true }],
    choices: [],
    text: {
      en: {
        title: 'A pack event',
        body: 'Something from a pack happens.',
        choices: {},
        outcomes: { default: 'It happened.' },
      },
    },
    ...overrides,
  };
}

/** A pack whose first event fires at once and schedules a follow-up three months later. */
const FIRING_PACK = pack(
  [
    event('pack-start', {
      effects: [
        { kind: 'flag', flag: 'packFired', value: true },
        {
          kind: 'schedule',
          eventId: 'pack-follow-up',
          inMonths: 3,
          chancePercent: 100,
          keepSubject: false,
        },
      ],
    }),
    event('pack-follow-up', {
      scheduledOnly: true,
      maxOccurrences: null,
      effects: [{ kind: 'flag', flag: 'packFollowUp', value: true }],
    }),
  ],
  { mode: 'developer' },
);

describe('validation (malformed and dangerous packs are refused)', () => {
  it('accepts a well-formed pack', () => {
    const result = validatePack(FIRING_PACK);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('reports shape and bound problems with field paths', () => {
    expect(validatePack({ format: 'something-else' }).issues.some((i) => i.path === 'format')).toBe(
      true,
    );
    const bad = validatePack(pack([event('bad-one', { chancePpm: 5_000_000 })]));
    expect(bad.ok).toBe(false);
    expect(
      bad.issues.some((i) => i.path.startsWith('events.0') && i.path.includes('chancePpm')),
    ).toBe(true);
  });

  it('rejects unknown facts, markup, links and unknown placeholders', () => {
    const r = validatePack(
      pack([
        event('sneaky', {
          when: { kind: 'cmp', fact: 'window.location', op: 'eq', value: 1 },
          text: {
            en: {
              title: '<script>alert(1)</script>',
              body: 'Visit https://example.com {secret}',
              choices: {},
              outcomes: { default: 'ok' },
            },
          },
        }),
      ]),
    );
    const messages = r.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
    expect(messages).toMatch(/fact/i);
    expect(messages).toMatch(/markup/);
    expect(messages).toMatch(/links/);
    expect(messages).toMatch(/\{secret\}/);
  });

  it('rejects clashes with built-in events and other enabled packs', () => {
    expect(
      validatePack(pack([event('first-steps')])).issues.some((i) => i.message.includes('built-in')),
    ).toBe(true);
    expect(
      validatePack(pack([event('mine')]), new Set(['mine'])).issues.some((i) =>
        i.message.includes('another enabled pack'),
      ),
    ).toBe(true);
  });

  it('rejects scheduling cycles and missing follow-ups', () => {
    const cycle = validatePack(
      pack([
        event('ping', {
          scheduledOnly: true,
          effects: [
            {
              kind: 'schedule',
              eventId: 'pong',
              inMonths: 1,
              chancePercent: 100,
              keepSubject: false,
            },
          ],
        }),
        event('pong', {
          scheduledOnly: true,
          effects: [
            {
              kind: 'schedule',
              eventId: 'ping',
              inMonths: 1,
              chancePercent: 100,
              keepSubject: false,
            },
          ],
        }),
      ]),
    );
    expect(cycle.issues.some((i) => i.message.includes('cycle'))).toBe(true);
    const missing = validatePack(
      pack([
        event('lonely', {
          effects: [
            {
              kind: 'schedule',
              eventId: 'nowhere',
              inMonths: 1,
              chancePercent: 50,
              keepSubject: false,
            },
          ],
        }),
      ]),
    );
    expect(missing.issues.some((i) => i.message.includes('unknown event'))).toBe(true);
  });

  it('applies the stricter limits to player-made packs', () => {
    const r = validatePack(
      pack(
        [
          event('greedy', {
            chancePpm: 500_000,
            effects: [{ kind: 'money', percent: 2000, category: 'gift' }],
          }),
        ],
        { mode: 'player' },
      ),
    );
    const text = r.issues.map((i) => i.message).join('\n');
    expect(text).toMatch(/at most 100000 parts per million/);
    expect(text).toMatch(/at most 500%/);
    const developer = validatePack(
      pack(
        [
          event('greedy', {
            chancePpm: 500_000,
            effects: [{ kind: 'money', percent: 2000, category: 'gift' }],
          }),
        ],
        { mode: 'developer' },
      ),
    );
    expect(developer.ok).toBe(true);
  });
});

describe('packs in a life (load safely, trigger deterministically)', () => {
  function enableAndPlay(state: SimState): { state: SimState; commands: Command[] } {
    const commands: Command[] = [{ type: 'enablePack', id: 'enable-1', pack: FIRING_PACK }];
    for (let i = 0; i < 5; i++)
      commands.push({ type: 'advance', id: `adv-${String(i)}`, expectedTick: i });
    return { state: replay(state, commands).state, commands };
  }

  it('fires the pack event and its follow-up on schedule, identically on replay', () => {
    const start = newState({ seed: 'pack-run' });
    const { state, commands } = enableAndPlay(start);
    const flags = playerOf(state).flags;
    expect(flags.packFired).toBe(true);
    expect(flags.packFollowUp).toBe(true);
    const fired = Object.values(state.world.events.instances).filter((i) =>
      i.definitionId.startsWith('pack-'),
    );
    const first = fired.find((i) => i.definitionId === 'pack-start');
    const follow = fired.find((i) => i.definitionId === 'pack-follow-up');
    expect(first).toBeDefined();
    expect((follow?.tick ?? 0) - (first?.tick ?? 0)).toBe(3);
    expect(checkInvariants(state.world)).toEqual([]);
    // Same commands, same start: the same world, byte for byte.
    const again = replay(start, commands).state;
    expect(canonicalJson(again)).toBe(canonicalJson(state));
  });

  it('refuses an invalid pack without changing the life', () => {
    const start = newState({ seed: 'pack-bad' });
    const result = execute(start, {
      type: 'enablePack',
      id: 'bad-1',
      pack: { format: 'welife-pack', events: 'nope' },
    });
    expect(result.outcome).toMatchObject({ status: 'rejected', reason: 'ineligible' });
    expect(canonicalJson(result.state)).toBe(canonicalJson(start));
  });

  it('a disabled pack stops firing but its past events still resolve', () => {
    let state = newState({ seed: 'pack-off' });
    state = execute(state, { type: 'enablePack', id: 'en', pack: FIRING_PACK }).state;
    state = execute(state, { type: 'advance', id: 'a0', expectedTick: 0 }).state;
    state = execute(state, {
      type: 'disablePack',
      id: 'dis',
      packId: 'test-pack',
    }).state;
    for (let i = 1; i < 6; i++)
      state = execute(state, {
        type: 'advance',
        id: `a${String(i)}`,
        expectedTick: i,
      }).state;
    expect(playerOf(state).flags.packFollowUp).toBeUndefined();
    expect(checkInvariants(state.world)).toEqual([]);
    // A newer version can be enabled again.
    const v2 = { ...FIRING_PACK, packVersion: '1.0.1' };
    expect(execute(state, { type: 'enablePack', id: 'en2', pack: v2 }).outcome).toMatchObject({
      status: 'applied',
    });
  });

  it('previews an event against a seeded sample life without saving anything', () => {
    const result = previewEvent(FIRING_PACK, 'pack-start', {
      countryCode: 'GB',
      ageYears: 30,
      seed: 'p1',
    });
    expect(result.ok).toBe(true);
    expect(result.eligible).toBe(true);
    expect(result.options[0]?.changes.some((c) => c.label === 'flag.packFired')).toBe(true);
    const again = previewEvent(FIRING_PACK, 'pack-start', {
      countryCode: 'GB',
      ageYears: 30,
      seed: 'p1',
    });
    expect(again).toEqual(result);
  });
});

describe('stored packs are re-checked when a save is loaded', () => {
  it('rejects a world whose stored pack events were tampered with', () => {
    let state = newState({ seed: 'pack-tamper' });
    state = execute(state, { type: 'enablePack', id: 'en-1', pack: FIRING_PACK }).state;
    expect(storedPackIssues(state.world)).toEqual([]);
    expect(() => validateHeadState(structuredClone(state))).not.toThrow();
    const tampered = structuredClone(state);
    const first = tampered.world.contentPacks[0]?.events[0] as { text: { en: { title: string } } };
    first.text.en.title = '<img src=x onerror=alert(1)>';
    expect(storedPackIssues(tampered.world).join('\n')).toMatch(/markup/);
    expect(() => validateHeadState(tampered)).toThrow(/content pack/);
  });
});
