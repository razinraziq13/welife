import { useState } from 'react';
import { findEvent } from '@engine/content';
import { Button } from '@app/components/ui/button';
import { Dialog } from '@app/components/ui/dialog';
import { fillText, formatMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';

/**
 * Life Event Dialog (spec §3.5): story text and 2-5 choices with eligibility cues. The month
 * stays uncommitted until a choice is made; closing the dialog keeps the decision waiting.
 */
export function EventDialog() {
  const pending = useGameStore((s) => s.session?.view.pendingEvent ?? null);
  const busy = useGameStore((s) => s.busy);
  const choose = useGameStore((s) => s.choose);
  // Opens automatically for each new decision; closing it only hides that one decision.
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  if (!pending) return null;
  const open = dismissedId !== pending.instanceId;
  const setOpen = (value: boolean) => {
    setDismissedId(value ? null : pending.instanceId);
  };
  const def = findEvent(pending.definitionId);
  if (!def) return null;
  const text = def.text.en;

  return (
    <>
      {!open && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent/50 bg-accent-soft p-3 text-sm"
        >
          <span>
            <strong>A decision is waiting:</strong> {fillText(text.title, pending.params)}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setOpen(true);
            }}
          >
            Decide now
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen} title={fillText(text.title, pending.params)}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {formatMonth(pending.clock)}
        </p>
        <p className="mt-2 text-fg">{fillText(text.body, pending.params)}</p>
        <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Choices">
          {pending.choices.map((choice) => (
            <Button
              key={choice.id}
              variant="secondary"
              className="h-auto justify-start py-3 text-left"
              disabled={busy || !choice.available}
              onClick={() => {
                void choose(pending.instanceId, choice.id);
              }}
            >
              {fillText(text.choices[choice.id] ?? choice.id, pending.params)}
              {!choice.available && (
                <span className="ml-auto text-xs text-muted">Not available to you</span>
              )}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          You can close this and decide later; the month finishes once you choose.
        </p>
      </Dialog>
    </>
  );
}
