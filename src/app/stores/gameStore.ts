import { create } from 'zustand';
import { en, t } from '@app/i18n/en';
import type { ActivityResult } from '@engine/activities/activities';
import type { Command, CommandOutcome } from '@engine/core/commands';
import type { Difficulty } from '@engine/state/schema';
import type { DashboardLayout, GameSessionView } from '@contracts/saves';
import { getEngine } from '@app/bridge/engine';
import { describeError, errorCode } from '@app/bridge/errors';
import { outcomeText } from '@app/i18n/format';
import type { FamilyTreeView, GameView, PersonDetailView } from '@engine/view';

/** What one Advance played: shown by the month recap once any decision is answered. */
export interface MonthRecap {
  months: number;
  fromTick: number;
  stats: GameView['character']['stats'];
  moneyIn: bigint;
  moneyOut: bigint;
}
import type { BiographyView } from '@engine/viewLegacy';

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
  /** True for the whole of a multi-month advance (keeps Advance locked between months). */
  advancing: boolean;
  lastActivity: ActivityResult | null;
  recap: MonthRecap | null;
  closeRecap: () => void;
  /** Short status message announced to screen readers (shown as a pop-up). */
  message: string | null;
  /** Whether the message reports something done or something that could not be done. */
  messageKind: 'success' | 'error';
  /** Shows why something cannot be done (locked buttons call this when tapped). */
  explain: (reason: string) => void;
  open: (saveId: string) => Promise<void>;
  close: () => void;
  send: (body: CommandBody) => Promise<CommandOutcome | null>;
  advance: (months?: number) => Promise<void>;
  /** Starts a new timeline from the month `months` before the current one. */
  rewindMonths: (months: number) => Promise<void>;
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
  biography: (personId: string) => Promise<BiographyView | null>;
}

/** Human-readable message for an applied action (shown in the status area). */
function appliedMessage(outcome: CommandOutcome, view: GameSessionView['view']): string | null {
  if (outcome.status !== 'applied') return null;
  if (outcome.kind === 'done') return outcomeText(outcome.key, outcome.params);
  if (outcome.kind === 'interacted') {
    const name =
      view.social.people.find((p) => p.id === outcome.interaction.personId)?.identity.firstName ??
      '';
    return outcomeText(outcome.interaction.key, { ...outcome.interaction.params, name });
  }
  return null;
}

function newCommandId(): string {
  return crypto.randomUUID();
}

/** A refusal in the player's language: the translated key when there is one. */
function rejectionText(key: string | undefined, fallback: string): string {
  return key && en[key] ? t(key) : fallback;
}

/** Months played by one click of Advance. */
export const ADVANCE_MONTHS = 4;

export const useGameStore = create<GameState>()((set, get) => ({
  saveId: null,
  session: null,
  phase: 'idle',
  error: null,
  errorCode: null,
  busy: false,
  advancing: false,
  lastActivity: null,
  recap: null,
  message: null,
  messageKind: 'success',

  closeRecap() {
    set({ recap: null });
  },

  async open(saveId) {
    set({
      saveId,
      phase: 'loading',
      error: null,
      errorCode: null,
      lastActivity: null,
      recap: null,
    });
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
      recap: null,
      message: null,
      messageKind: 'success',
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
      if (result.outcome.status === 'rejected')
        set({
          message: rejectionText(result.outcome.key, result.outcome.message),
          messageKind: 'error',
        });
      else {
        const message = appliedMessage(result.outcome, result.session.view);
        if (message) set({ message, messageKind: 'success' });
      }
      return result.outcome;
    } catch (error) {
      set({ busy: false, message: describeError(error), messageKind: 'error' });
      if (errorCode(error) === 'CONFLICT') await get().open(saveId);
      return null;
    }
  },

  /**
   * One click plays up to ADVANCE_MONTHS months (user decision, 2026-11-19). Each month is
   * still its own validated command with its own snapshot, so rewind, replay and the
   * once-per-month guarantees are unchanged. It stops early when a decision is waiting, a new
   * job offer arrives (offers expire in two months), the life ends or a month is refused.
   */
  async advance(months = ADVANCE_MONTHS) {
    if (get().advancing) return;
    set({ advancing: true });
    const offers = (): string[] =>
      (get().session?.view.work.applications ?? [])
        .filter((a) => a.status === 'offered')
        .map((a) => a.id);
    const known = new Set(offers());
    const studyOffers = (): string[] =>
      (get().session?.view.education.applications ?? [])
        .filter((a) => a.status === 'accepted')
        .map((a) => a.id);
    const knownStudy = new Set(studyOffers());
    const start = get().session?.view;
    let played = 0;
    let moneyIn = 0n;
    let moneyOut = 0n;
    try {
      for (let i = 0; i < months; i++) {
        const view = get().session?.view;
        if (view?.lifeStatus !== 'alive' || view.pendingEvent) break;
        // Higher-education offers expire; don't skip a decision while advancing four months.
        if (studyOffers().length > 0 && i === 0) {
          set({ message: 'A study offer needs an answer. See Career, Study.', messageKind: 'success' });
          break;
        }
        const outcome = await get().send({ type: 'advance', expectedTick: view.tick });
        if (outcome?.status !== 'applied' || outcome.kind !== 'advanced') break;
        set({ lastActivity: null });
        // shortcut: a month that stops for a decision is left out of the money totals; it
        // only lands once the choice is made. Fine while the recap is a summary.
        played += 1;
        const month = get().session?.view.finance.month;
        if (month) {
          moneyIn += month.totalIncome;
          moneyOut += month.totalExpenses + month.repaid.reduce((s, r) => s + r.amount, 0n);
        }
        if (offers().some((id) => !known.has(id))) {
          set({ message: 'A job offer arrived. See Career to answer it.', messageKind: 'success' });
          break;
        }
        if (studyOffers().some((id) => !knownStudy.has(id))) {
          set({ message: 'A study offer arrived. See Career, Study to answer it.', messageKind: 'success' });
          break;
        }
      }
    } finally {
      set({
        advancing: false,
        ...(start && played > 0
          ? {
              recap: {
                months: played,
                fromTick: start.tick,
                stats: start.character.stats,
                moneyIn,
                moneyOut,
              },
            }
          : {}),
      });
    }
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
      set({ session, message: describeError(error), messageKind: 'error' });
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
        recap: null,
        messageKind: 'success',
        message: `Rewound to a new timeline: ${session.branch.name}.`,
      });
    } catch (error) {
      set({ busy: false, message: describeError(error), messageKind: 'error' });
    }
  },

  async rewindMonths(months) {
    const { saveId, session } = get();
    if (!saveId || !session) return;
    try {
      const { lineage } = await getEngine().call('timeline.get', { saveId });
      const target = lineage.findLast((s) => s.tick <= session.view.tick - months);
      if (target) await get().rewind(target.id);
      else set({ message: 'There is no earlier month to go back to.', messageKind: 'error' });
    } catch (error) {
      set({ message: describeError(error), messageKind: 'error' });
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
        recap: null,
        messageKind: 'success',
        message: `Switched to ${session.branch.name}.`,
      });
    } catch (error) {
      set({ busy: false, message: describeError(error), messageKind: 'error' });
    }
  },

  clearMessage() {
    set({ message: null });
  },

  explain(reason) {
    set({ message: reason, messageKind: 'error' });
  },

  async person(personId) {
    const { saveId } = get();
    if (!saveId) return null;
    try {
      return await getEngine().call('game.person', { saveId, personId });
    } catch (error) {
      set({ message: describeError(error), messageKind: 'error' });
      return null;
    }
  },

  async biography(personId) {
    const { saveId } = get();
    if (!saveId) return null;
    try {
      return await getEngine().call('game.biography', { saveId, personId });
    } catch (error) {
      set({ message: describeError(error), messageKind: 'error' });
      return null;
    }
  },

  async family() {
    const { saveId } = get();
    if (!saveId) return null;
    try {
      return await getEngine().call('game.family', { saveId });
    } catch (error) {
      set({ message: describeError(error), messageKind: 'error' });
      return null;
    }
  },
}));
