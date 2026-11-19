import { useEffect } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { Button } from '@app/components/ui/button';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';

/**
 * The result of what you just did, as a pop-up near the bottom of the screen (above Advance on
 * phones), so it is seen wherever the page is scrolled. Things that could not be done are shown
 * in red with the reason ("You cannot afford this right now."). Read out by screen readers
 * without moving focus; closes by itself after a few seconds, or with the close button.
 */
export function FeedbackToast() {
  const message = useGameStore((s) => s.message);
  const kind = useGameStore((s) => s.messageKind);
  const clear = useGameStore((s) => s.clearMessage);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(clear, kind === 'error' ? 8000 : 6000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message, kind, clear]);

  const error = kind === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)_+_9.5rem)] z-50 flex justify-center md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
    >
      {message && (
        <div
          data-testid="feedback"
          data-kind={kind}
          className={cn(
            'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border-2 bg-surface p-3 shadow-lg motion-safe:animate-[toast-in_200ms_ease-out]',
            error ? 'border-danger' : 'border-success',
          )}
        >
          {error ? (
            <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
          ) : (
            <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          )}
          <p className="min-w-0 flex-1 text-sm text-fg">
            {error && <span className="font-semibold">Not possible: </span>}
            {message}
          </p>
          <Button size="icon" variant="ghost" aria-label="Close message" onClick={clear}>
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
