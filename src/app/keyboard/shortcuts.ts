export interface ShortcutDefinition {
  /** Key sequence as displayed, e.g. ["g", "s"]. */
  keys: readonly string[];
  description: string;
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['g', 'h'], description: 'Go to Home' },
  { keys: ['g', 's'], description: 'Go to Settings' },
];

export type ShortcutAction = 'help' | 'home' | 'settings';

/** Time window for the second key of a two-key sequence ("g" then "s"). */
export const SEQUENCE_TIMEOUT_MS = 1200;

/**
 * Pure key-sequence matcher. Feed it keys; it returns an action when a sequence
 * completes. `pending` is the first key of an unfinished sequence.
 */
export function matchShortcut(
  pending: string | null,
  key: string,
): { action: ShortcutAction | null; pending: string | null } {
  if (pending === 'g') {
    if (key === 'h') return { action: 'home', pending: null };
    if (key === 's') return { action: 'settings', pending: null };
    return { action: null, pending: null };
  }
  if (key === '?') return { action: 'help', pending: null };
  if (key === 'g') return { action: null, pending: 'g' };
  return { action: null, pending: null };
}

/** True when keystrokes should go to a text field instead of shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range'].includes(type);
  }
  return false;
}
