import { createWorld, type NewLifeInput } from '@engine/characters/create';
import { execute, type Command, type CommandOutcome, type SimState } from '@engine/core/commands';
import { canonicalJson } from '@engine/core/data';

export function newLifeInput(overrides: Partial<NewLifeInput> = {}): NewLifeInput {
  return {
    seed: 'test-seed',
    start: { year: 2026, month: 11 },
    countryCode: 'MY',
    locationId: null,
    scenario: 'middle',
    originCountryCode: null,
    difficulty: 'realistic',
    easyMigration: false,
    identity: { firstName: null, lastName: null, gender: null },
    appearance: null,
    ...overrides,
  };
}

export function newState(overrides: Partial<NewLifeInput> = {}, worldId = 'world-test'): SimState {
  return { world: createWorld(worldId, newLifeInput(overrides)), pending: null };
}

/**
 * Deterministic scripted play: each month do a couple of activities, advance, and answer any
 * decision with a choice picked from the month number. Returns the commands it issued so the
 * same script can be replayed.
 */
export function scriptedCommands(
  state: SimState,
  months: number,
  prefix = 'cmd',
): { state: SimState; commands: Command[]; outcomes: CommandOutcome[] } {
  const commands: Command[] = [];
  const outcomes: CommandOutcome[] = [];
  let current = state;
  const run = (command: Command) => {
    const result = execute(current, command);
    current = result.state;
    commands.push(command);
    outcomes.push(result.outcome);
    return result.outcome;
  };
  for (let m = 0; m < months; m++) {
    if (current.world.lifeStatus !== 'alive') break;
    const tick = current.world.tick;
    const activities = ['play-toys', 'read', 'exercise', 'family-time', 'practice-music'];
    run({
      type: 'act',
      id: `${prefix}-act-${String(tick)}-a`,
      activityId: activities[tick % activities.length] ?? 'read',
    });
    run({ type: 'act', id: `${prefix}-act-${String(tick)}-b`, activityId: 'rest-well' });
    const outcome = run({
      type: 'advance',
      id: `${prefix}-adv-${String(tick)}`,
      expectedTick: tick,
    });
    if (outcome.status === 'applied' && outcome.kind === 'pending' && current.pending) {
      const instanceId = current.pending.events.pendingInstanceId ?? '';
      const instance = current.pending.events.instances[instanceId];
      const choices = instance ? choicesFor(instance.definitionId) : [];
      const choiceId = choices[tick % Math.max(1, choices.length)] ?? '';
      run({ type: 'choose', id: `${prefix}-choose-${String(tick)}`, instanceId, choiceId });
    }
  }
  return { state: current, commands, outcomes };
}

import { getEvent } from '@engine/content';
function choicesFor(definitionId: string): string[] {
  return getEvent(definitionId).choices.map((c) => c.id);
}

export function hashState(state: SimState): string {
  return canonicalJson(state);
}

let counter = 0;
/** A unique command id for tests. */
export function cid(prefix = 'c'): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

type Body = Command extends infer C ? (C extends { id: string } ? Omit<C, 'id'> : never) : never;

/** Runs one command and returns the outcome and new state. */
export function run(state: SimState, body: Body): { state: SimState; outcome: CommandOutcome } {
  return execute(state, { ...body, id: cid(body.type) });
}

/** Answers a pending decision with the first available choice (or a preferred one). */
export function settle(
  state: SimState,
  prefer?: (definitionId: string) => string | null,
): SimState {
  let current = state;
  while (current.pending) {
    const instanceId = current.pending.events.pendingInstanceId ?? '';
    const instance = current.pending.events.instances[instanceId];
    const def = instance ? getEvent(instance.definitionId) : undefined;
    const choiceId = (def && prefer?.(def.id)) ?? def?.choices[0]?.id ?? '';
    current = execute(current, { type: 'choose', id: cid('choose'), instanceId, choiceId }).state;
  }
  return current;
}

/** Advances `months` months, settling any decisions. */
export function advanceMonths(
  state: SimState,
  months: number,
  prefer?: (definitionId: string) => string | null,
): SimState {
  let current = state;
  for (let i = 0; i < months; i++) {
    if (current.world.lifeStatus !== 'alive') break;
    current = execute(current, {
      type: 'advance',
      id: cid('adv'),
      expectedTick: current.world.tick,
    }).state;
    current = settle(current, prefer);
  }
  return current;
}

export function playerOf(state: SimState) {
  const player = state.world.characters[state.world.activeCharacterId];
  if (!player) throw new Error('no player');
  return player;
}
