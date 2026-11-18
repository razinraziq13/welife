import { createWorld } from '../characters/create';
import { deepClone } from '../core/data';
import { activeCharacter } from '../core/world';
import { ensurePlayerAccounts, currencyFor } from '../economy/finance';
import { netWorthIn } from '../economy/fx';
import { applyEffects } from '../events/effects';
import { evaluate } from '../events/predicates';
import { isEligible } from '../events/runtime';
import { NEED_KEYS, SKILL_KEYS, STAT_KEYS, type World } from '../state/schema';
import { enablePack, validatePack, type PackIssue } from './packs';

/**
 * Simulation preview for the event editor (spec §7 "preview/test mode", "deterministic test
 * seeds"). Builds a sample life from a seed, enables the pack in that throwaway world and
 * reports whether an event is eligible and what each choice would change. Nothing is saved.
 */

export interface PreviewSetup {
  countryCode: string;
  ageYears: number;
  seed: string;
}

export interface PreviewChange {
  label: string;
  before: number | string;
  after: number | string;
}

export interface PreviewResult {
  ok: boolean;
  issues: PackIssue[];
  eventId: string;
  eligible: boolean;
  conditionsMet: boolean;
  scheduledOnly: boolean;
  chancePpm: number;
  options: { id: string; label: string; available: boolean; changes: PreviewChange[] }[];
}

function sampleWorld(setup: PreviewSetup): World {
  const world = createWorld(`preview-${setup.seed}`, {
    seed: setup.seed,
    start: { year: 2026, month: 11 },
    countryCode: setup.countryCode,
    locationId: null,
    scenario: 'middle',
    originCountryCode: null,
    difficulty: 'realistic',
    easyMigration: false,
    identity: { firstName: null, lastName: null, gender: null },
    appearance: null,
  });
  const player = activeCharacter(world);
  player.birth = { year: world.clock.year - setup.ageYears, month: world.clock.month };
  player.education.current = null;
  ensurePlayerAccounts(world, player);
  return world;
}

function snapshot(world: World): Map<string, number | string> {
  const c = activeCharacter(world);
  const out = new Map<string, number | string>();
  for (const k of STAT_KEYS) out.set(`stat.${k}`, Math.round(c.stats[k] / 10));
  for (const k of NEED_KEYS) out.set(`need.${k}`, Math.round(c.needs[k] / 10));
  for (const k of SKILL_KEYS) out.set(`skill.${k}`, Math.round(c.skills[k] / 10));
  out.set('money', Number(netWorthIn(world, c.id, currencyFor(c.countryCode))));
  for (const [flag, value] of Object.entries(c.flags)) out.set(`flag.${flag}`, String(value));
  out.set('scheduled', world.events.scheduled.length);
  out.set('cases', Object.keys(world.civics.cases).length);
  out.set('conditions', Object.keys(world.civics.conditions).length);
  return out;
}

export function previewEvent(
  rawPack: unknown,
  eventId: string,
  setup: PreviewSetup,
): PreviewResult {
  const validation = validatePack(rawPack);
  const empty: PreviewResult = {
    ok: false,
    issues: validation.issues,
    eventId,
    eligible: false,
    conditionsMet: false,
    scheduledOnly: false,
    chancePpm: 0,
    options: [],
  };
  if (!validation.ok) return empty;
  const event = validation.events.find((e) => e.id === eventId);
  if (!event)
    return {
      ...empty,
      issues: [{ path: 'eventId', message: 'No event with that id in the pack.' }],
    };
  const world = sampleWorld(setup);
  enablePack(world, rawPack);
  const player = activeCharacter(world);
  const before = snapshot(world);
  const run = (effects: Parameters<typeof applyEffects>[2]) => {
    const copy = deepClone(world);
    applyEffects(copy, activeCharacter(copy), effects, `event:${event.id}`, null);
    const after = snapshot(copy);
    const changes: PreviewChange[] = [];
    for (const [key, value] of after) {
      const was = before.get(key) ?? (typeof value === 'number' ? 0 : '—');
      if (was !== value) changes.push({ label: key, before: was, after: value });
    }
    return changes;
  };
  const options =
    event.choices.length > 0
      ? event.choices.map((choice) => ({
          id: choice.id,
          label: event.text.en.choices[choice.id] ?? choice.id,
          available: choice.requires === null || evaluate(choice.requires, world, player),
          changes: run([...event.effects, ...choice.effects]),
        }))
      : [
          {
            id: 'default',
            label: event.text.en.outcomes.default ?? '',
            available: true,
            changes: run(event.effects),
          },
        ];
  return {
    ok: true,
    issues: [],
    eventId,
    eligible: isEligible(event, world),
    conditionsMet: evaluate(event.when, world, player),
    scheduledOnly: event.scheduledOnly,
    chancePpm: event.chancePpm,
    options,
  };
}
