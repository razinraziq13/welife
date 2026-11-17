import { z } from 'zod';
import { deepClone } from './data';
import { assertInvariants } from './invariants';
import { advanceMonth, completePendingMonth, TickError, type TickReport } from './tick';
import { addBiography, rememberCommand } from './world';
import { performActivity, type ActivityResult } from '../activities/activities';
import { ChoiceError } from '../events/runtime';
import { DIFFICULTIES, type World } from '../state/schema';

/**
 * Player commands (spec §2 "All gameplay writes go through validated commands").
 * Each command carries a unique id and is applied at most once (spec §4 Clock).
 */

const CommandId = z.string().min(4).max(80);

export const CommandSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('advance'), id: CommandId, expectedTick: z.number().int().min(0) })
    .strict(),
  z
    .object({
      type: z.literal('choose'),
      id: CommandId,
      instanceId: z.string().min(1).max(80),
      choiceId: z.string().min(1).max(40),
    })
    .strict(),
  z
    .object({ type: z.literal('act'), id: CommandId, activityId: z.string().min(1).max(40) })
    .strict(),
  z
    .object({
      type: z.literal('markRead'),
      id: CommandId,
      notificationIds: z.union([z.literal('all'), z.array(z.string().min(1).max(80)).max(500)]),
    })
    .strict(),
  z
    .object({ type: z.literal('setDifficulty'), id: CommandId, value: z.enum(DIFFICULTIES) })
    .strict(),
  z.object({ type: z.literal('setEasyMigration'), id: CommandId, value: z.boolean() }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;

/** Committed world plus, while a decision is waiting, the uncommitted next month. */
export interface SimState {
  world: World;
  pending: World | null;
}

export type RejectReason =
  | 'duplicate'
  | 'stale'
  | 'pendingChoice'
  | 'noPendingChoice'
  | 'lifeEnded'
  | 'invalidChoice'
  | 'noChange';

export type CommandOutcome =
  | { status: 'rejected'; reason: RejectReason; message: string }
  | { status: 'applied'; kind: 'advanced'; report: TickReport }
  | { status: 'applied'; kind: 'pending'; report: TickReport; instanceId: string }
  | { status: 'applied'; kind: 'chosen' }
  | { status: 'applied'; kind: 'acted'; activity: ActivityResult }
  | { status: 'applied'; kind: 'rule' }
  | { status: 'applied'; kind: 'read'; count: number };

/** True when the outcome moved the committed world into a new month (needs a snapshot). */
export function committedNewMonth(outcome: CommandOutcome): boolean {
  return outcome.status === 'applied' && (outcome.kind === 'advanced' || outcome.kind === 'chosen');
}

function reject(state: SimState, reason: RejectReason, message: string) {
  return { state, outcome: { status: 'rejected', reason, message } as CommandOutcome };
}

function seen(state: SimState, id: string): boolean {
  return (
    state.world.recentCommandIds.includes(id) ||
    (state.pending?.recentCommandIds.includes(id) ?? false)
  );
}

/**
 * Applies one command. Pure: returns a new state and never modifies the input.
 * Replaying the same commands from the same state always yields the same result.
 */
export function execute(
  state: SimState,
  command: Command,
): { state: SimState; outcome: CommandOutcome } {
  if (seen(state, command.id))
    return reject(state, 'duplicate', 'This command was already applied.');

  if (command.type === 'choose') {
    if (!state.pending) return reject(state, 'noPendingChoice', 'No decision is waiting.');
    try {
      const world = completePendingMonth(state.pending, command.instanceId, command.choiceId);
      rememberCommand(world, command.id);
      return { state: { world, pending: null }, outcome: { status: 'applied', kind: 'chosen' } };
    } catch (error) {
      if (error instanceof ChoiceError) return reject(state, 'invalidChoice', error.message);
      throw error;
    }
  }

  if (state.pending) return reject(state, 'pendingChoice', 'Make the waiting decision first.');

  if (command.type === 'advance') {
    if (state.world.lifeStatus !== 'alive')
      return reject(state, 'lifeEnded', 'This life has ended.');
    // Double clicks and retries carry the tick they were issued for; only the first applies.
    if (command.expectedTick !== state.world.tick) {
      return reject(state, 'stale', 'The month has already advanced.');
    }
    try {
      const result = advanceMonth(state.world);
      rememberCommand(result.world, command.id);
      if (result.kind === 'pending') {
        return {
          state: { world: state.world, pending: result.world },
          outcome: {
            status: 'applied',
            kind: 'pending',
            report: result.report,
            instanceId: result.report.pendingInstanceId ?? '',
          },
        };
      }
      return {
        state: { world: result.world, pending: null },
        outcome: { status: 'applied', kind: 'advanced', report: result.report },
      };
    } catch (error) {
      if (error instanceof TickError) {
        return reject(
          state,
          error.code === 'LIFE_ENDED' ? 'lifeEnded' : 'pendingChoice',
          error.message,
        );
      }
      throw error;
    }
  }

  const world = deepClone(state.world);
  let outcome: CommandOutcome;
  switch (command.type) {
    case 'act': {
      if (world.lifeStatus !== 'alive') return reject(state, 'lifeEnded', 'This life has ended.');
      outcome = {
        status: 'applied',
        kind: 'acted',
        activity: performActivity(world, command.activityId),
      };
      break;
    }
    case 'markRead': {
      let count = 0;
      const ids = command.notificationIds === 'all' ? null : new Set(command.notificationIds);
      for (const n of world.notifications) {
        if (!n.read && (ids === null || ids.has(n.id))) {
          n.read = true;
          count += 1;
        }
      }
      outcome = { status: 'applied', kind: 'read', count };
      break;
    }
    case 'setDifficulty':
    case 'setEasyMigration': {
      const rule = command.type === 'setDifficulty' ? 'difficulty' : 'easyMigration';
      const from = world.rules[rule];
      if (from === command.value)
        return reject(state, 'noChange', 'That setting is already selected.');
      if (rule === 'difficulty')
        world.rules.difficulty = command.value as World['rules']['difficulty'];
      else world.rules.easyMigration = command.value as boolean;
      // Rule changes are part of the timeline (spec §5); they never alter existing status.
      world.ruleChanges.push({ tick: world.tick, rule, from, to: command.value });
      addBiography(world, world.activeCharacterId, 'rules', 'bio.ruleChange', {
        rule,
        value: String(command.value),
      });
      outcome = { status: 'applied', kind: 'rule' };
      break;
    }
  }
  rememberCommand(world, command.id);
  assertInvariants(world);
  return { state: { world, pending: null }, outcome };
}

/** Replays commands from a state (spec §5: identical commands reproduce identical outcomes). */
export function replay(
  initial: SimState,
  commands: readonly Command[],
): { state: SimState; outcomes: CommandOutcome[] } {
  let state = initial;
  const outcomes: CommandOutcome[] = [];
  for (const command of commands) {
    const result = execute(state, command);
    state = result.state;
    outcomes.push(result.outcome);
  }
  return { state, outcomes };
}
