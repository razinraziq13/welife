import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Trophy, X } from 'lucide-react';
import type { GameView } from '@engine/view';
import { Button } from '@app/components/ui/button';

interface Toast {
  id: string;
  title: string;
  description: string;
}

const VISIBLE = 3;
const DISMISS_AFTER_MS = 8000;

/**
 * Small, non-modal notes when achievements unlock (roadmap 05). The achievements already
 * unlocked when a life is opened are not announced; each later unlock is shown once. A rewind
 * removes later unlocks, so unlocking one again on the new timeline is announced again.
 * Announced politely to screen readers without moving focus.
 */
export function AchievementToasts({
  saveId,
  view,
  base,
}: {
  saveId: string;
  view: GameView;
  base: string;
}) {
  const seen = useRef<{ saveId: string; ids: Set<string> } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const unlocked = view.achievements.unlocked;

  useEffect(() => {
    const ids = new Set(unlocked.map((u) => u.id));
    const previous = seen.current;
    seen.current = { saveId, ids };
    if (previous?.saveId !== saveId) {
      setToasts([]);
      return;
    }
    const fresh = unlocked
      .filter((u) => !previous.ids.has(u.id))
      .map((u) => ({ id: u.id, title: u.title, description: u.description }));
    if (fresh.length > 0) setToasts((list) => [...list, ...fresh.reverse()]);
  }, [saveId, unlocked]);

  const shown = toasts.slice(0, VISIBLE);
  const firstId = shown[0]?.id;
  useEffect(() => {
    if (!firstId) return;
    const timer = window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== firstId));
    }, DISMISS_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [firstId]);

  const dismiss = (id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-20 z-50 flex flex-col items-end gap-2 sm:right-4 sm:left-auto sm:w-80"
    >
      {shown.map((toast) => (
        <div
          key={toast.id}
          data-testid="achievement-toast"
          className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg motion-safe:animate-[toast-in_200ms_ease-out]"
        >
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"
          >
            <Trophy className="size-5" />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-xs font-semibold text-muted">Achievement unlocked</p>
            <p className="font-semibold text-fg">{toast.title}</p>
            {toast.description && <p className="text-muted">{toast.description}</p>}
            <Link
              to={`${base}/achievements`}
              className="mt-1 inline-block font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => {
                dismiss(toast.id);
              }}
            >
              View collection
            </Link>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Dismiss ${toast.title}`}
            onClick={() => {
              dismiss(toast.id);
            }}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
