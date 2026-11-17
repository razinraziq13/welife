import { useEffect, useRef } from 'react';
import {
  SEQUENCE_TIMEOUT_MS,
  isTypingTarget,
  matchShortcut,
  type ShortcutAction,
} from './shortcuts';

/** Global keyboard shortcuts; inactive while typing or when disabled in Settings. */
export function useShortcuts(enabled: boolean, onAction: (action: ShortcutAction) => void): void {
  const handlerRef = useRef(onAction);
  useEffect(() => {
    handlerRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let timer: number | undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const result = matchShortcut(pending, event.key);
      pending = result.pending;
      window.clearTimeout(timer);
      if (pending !== null) {
        timer = window.setTimeout(() => {
          pending = null;
        }, SEQUENCE_TIMEOUT_MS);
      }
      if (result.action !== null) {
        event.preventDefault();
        handlerRef.current(result.action);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [enabled]);
}
