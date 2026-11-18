import { create } from 'zustand';
import type { ActivityResult } from '@engine/activities/activities';
import type { Command, CommandOutcome } from '@engine/core/commands';
import type { Difficulty } from '@engine/state/schema';
import type { DashboardLayout, GameSessionView } from '@contracts/saves';
import { getEngine } from '@app/bridge/engine';
import { describeError, errorCode } from '@app/bridge/errors';
import { outcomeText } from '@app/i18n/format';
import type { FamilyTreeView, PersonDetailView } from '@engine/view';

export type CommandBody = Command extends infer C
  ? C extends { id: string }
    ? Omit<C, 'id'>
    : never
  : never;

interface GameState {
  saveId: string | null;
  session: GameSessionView | null;
  phase: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  errorCode: string | null;
  /** True while a command is in flight; Advance is disabled meanwhile (double-click guard). */
  busy: boolean;
  lastActivity: ActivityResult | null;
  /** Short status message announced to screen readers. */
  message: string | null;
  open: (saveId: string) => Promise<void>;
  close: () => void;
  send: (body: CommandBody) => Promise<CommandOutcome | null>;
  advance: () => Promise<void>;
  choose: (instanceId: string, choiceId: string) => Promise<void>;
  act: (activityId: string) => Promise<void>;
  markRead: (ids: string[] | 'all') => Promise<void>;
  setDifficulty: (value: Difficulty) => Promise<void>;
  setEasyMigration: (value: boolean) => Promise<void>;
  setLayout: (layout: DashboardLayout) => Promise<void>;
  rewind: (snapshotId: string) => Promise<void>;
  checkout: (branchId: string) => Promise<void>;
  clearMessage: () => void;
  /** Read-only detail for one person (Social). */
  person: (personId: string) => Promise<PersonDetailView | null>;
  /** The family tree (Social). */
  family: () => Promise<FamilyTreeView | null>;
}

/** Human-readable message for an applied action (shown in the status area). */
function appliedMessage(outcome: CommandOutcome, view: GameSessionView['view']): string | null {
  if (outcome.status !== 'applied') return null;
  if (outcome.kind === 'done') return outcomeText(outcome.key, outcome.params);
  if (outcome.kind === 'interacted') {
    const name =
      view.social.people.find((p) => p.id === outcome.interaction.personId)?.identity.firstName ??
      '';
    return outcomeText(outcome.interaction.key, { name });
  }
  return null;
}

function newCommandId(): string {
  return crypto.randomUUID();
}

export const useGameStore = create<GameState>()((set, get) => ({
  saveId: null,
  session: null,
  phase: 'idle',
  error: null,
  errorCode: null,
  busy: false,
  lastActivity: null,
  message: null,

  async open(saveId) {
    set({ saveId, phase: 'loading', error: null, errorCode: null, lastActivity: null });
    try {
      const session = await getEngine().call('game.open', { saveId });
      if (get().saveId === saveId) set({ session, phase: 'ready' });
    } catch (error) {
      set({ phase: 'error', error: describeError(error), errorCode: errorCode(error) });
    }
  },

  close() {
    set({
      saveId: null,
      session: null,
      phase: 'idle',
      error: null,
      errorCode: null,
      lastActivity: null,
      message: null,
    });
  },

  async send(body) {
    const { saveId, busy } = get();
    if (!saveId || busy) return null;
    set({ busy: true, message: null });
    try {
      const command = { ...body, id: newCommandId() };
      const result = await getEngine().call('game.command', { saveId, command });
      set({ session: result.session, busy: false });
      if (result.outcome.status === 'rejected') set({ message: result.outcome.message });
      else {
        const message = appliedMessage(result.outcome, result.session.view);
        if (message) set({ message });
      }
      return result.outcome;
    } catch (error) {
      set({ busy: false, message: describeError(error) });
      if (errorCode(error) === 'CONFLICT') await get().open(saveId);
      return null;
    }
  },

  async advance() {
    const tick = get().session?.view.tick;
    if (tick === undefined) return;
    const outcome = await get().send({ type: 'advance', expectedTick: tick });
    if (outcome?.status === 'applied' && outcome.kind === 'advanced') set({ lastActivity: null });
  },

  async choose(instanceId, choiceId) {
    await get().send({ type: 'choose', instanceId, choiceId });
  },

  async act(activityId) {
    const outcome = await get().send({ type: 'act', activityId });
    if (outcome?.status === 'applied' && outcome.kind === 'acted')
      set({ lastActivity: outcome.activity });
  },

  async markRead(ids) {
    await get().send({ type: 'markRead', notificationIds: ids });
  },

  async setDifficulty(value) {
    await get().send({ type: 'setDifficulty', value });
  },

  async setEasyMigration(value) {
    await get().send({ type: 'setEasyMigration', value });
  },

  async setLayout(layout) {
    const { saveId, session } = get();
    if (!saveId || !session) return;
    set({ session: { ...session, layout } });
    try {
      await getEngine().call('game.setLayout', { saveId, layout });
    } catch (error) {
      set({ session, message: describeError(error) });
    }
  },

  async rewind(snapshotId) {
    const { saveId } = get();
    if (!saveId) return;
    set({ busy: true });
    try {
      const session = await getEngine().call('timeline.rewind', { saveId, snapshotId });
      set({
        session,
        busy: false,
        lastActivity: null,
        message: `Rewound to a new timeline: ${session.branch.name}.`,
      });
    } catch (error) {
      set({ busy: false, message: describeError(error) });
    }
  },

  async checkout(branchId) {
    const { saveId } = get();
    if (!saveId) return;
    set({ busy: true });
    try {
      const session = await getEngine().call('timeline.checkout', { saveId, branchId });
      set({
        session,
        busy: false,
        lastActivity: null,
        message: `Switched to ${session.branch.name}.`,
      });
    } catch (error) {
      set({ busy: false, message: describeError(error) });
    }
  },

  clearMessage() {
    set({ message: null });
  },

  async person(personId) {
    const { saveId } = get();
    if (!saveId) return null;
    try {
      return await getEngine().call('game.person', { saveId, personId });
    } catch (error) {
      set({ message: describeError(error) });
      return null;
    }
  },

  async family() {
    const { saveId } = get();
    if (!saveId) return null;
    try {
      return await getEngine().call('game.family', { saveId });
    } catch (error) {
      set({ message: describeError(error) });
      return null;
    }
  },
}));
