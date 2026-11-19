import { useState } from 'react';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import { Button } from '@app/components/ui/button';
import { Dialog } from '@app/components/ui/dialog';
import { fillText, formatMonth } from '@app/i18n/format';
import { requirementText } from '@app/i18n/requirements';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';
import { EVENT_CATEGORY, FALLBACK_CATEGORY } from './eventCategory';

/**
 * Life Event Dialog (spec §3.5): story text and 2-5 choices with eligibility cues. The month
 * stays uncommitted until a choice is made; closing the dialog keeps the decision waiting.
 * A closed choice always says why it is closed.
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
  const text = pending.text;
  const category = EVENT_CATEGORY[pending.category] ?? FALLBACK_CATEGORY;
  const Icon = category.icon;

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
        <div className="flex items-center gap-3 rounded-2xl bg-linear-to-br from-primary-soft to-accent-soft p-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-primary shadow-sm">
            <Icon aria-hidden="true" className="size-6" />
          </span>
          <p className="text-sm">
            <span className="block font-semibold text-fg">{category.label}</span>
            <span className="block text-muted">{formatMonth(pending.clock)}</span>
          </p>
        </div>
        <p className="mt-4 leading-relaxed text-fg">{fillText(text.body, pending.params)}</p>
        <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Choices">
          {pending.choices.map((choice) => {
            const label = fillText(text.choices[choice.id] ?? choice.id, pending.params);
            return (
              <Button
                key={choice.id}
                variant="secondary"
                className={cn(
                  'group h-auto min-h-14 w-full justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left whitespace-normal',
                  choice.available && 'hover:border-primary hover:bg-primary-soft',
                )}
                disabled={busy || !choice.available}
                onClick={() => {
                  void choose(pending.instanceId, choice.id);
                }}
              >
                <span className="flex-1">
                  <span className="block font-medium">{label}</span>
                  {!choice.available && (
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      {requirementText(choice.unmet)}
                    </span>
                  )}
                </span>
                {choice.available ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                ) : (
                  <LockKeyhole aria-hidden="true" className="size-4 shrink-0 text-muted" />
                )}
              </Button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          You can close this and decide later; the month finishes once you choose.
        </p>
      </Dialog>
    </>
  );
}
