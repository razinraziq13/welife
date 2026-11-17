import { useEffect, useState } from 'react';
import { GitBranch, History, Trash2 } from 'lucide-react';
import type { SnapshotInfo, TimelineData } from '@contracts/saves';
import { PageHeader } from '@app/components/PageHeader';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { getEngine } from '@app/bridge/engine';
import { describeError } from '@app/bridge/errors';
import { formatMonth } from '@app/i18n/format';
import { formatBytes } from '@app/lib/format';
import { useGameStore } from '@app/stores/gameStore';

const PAGE = 24;

/**
 * Timeline / Rewind (spec §3.19, §5). Rewinding never deletes history: it starts a new
 * timeline from the chosen month, and earlier timelines stay available.
 */
export function TimelineScreen() {
  const session = useGameStore((s) => s.session);
  const { rewind, checkout, busy } = useGameStore();
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [target, setTarget] = useState<SnapshotInfo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const saveId = session?.saveId ?? '';
  const branchId = session?.branch.id ?? '';
  const tick = session?.view.tick ?? 0;

  // Reload whenever the save, timeline or month changes.
  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    getEngine()
      .call('timeline.get', { saveId })
      .then(
        (data) => {
          if (cancelled) return;
          setTimeline(data);
          setError(null);
        },
        (err: unknown) => {
          if (!cancelled) setError(describeError(err));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [saveId, branchId, tick]);

  if (!session) return null;
  const months = timeline ? [...timeline.lineage].reverse() : [];
  const branchName = (id: string) => timeline?.branches.find((b) => b.id === id)?.name ?? '';
  const deletingName = deleting ? branchName(deleting) : '';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Timeline"
        description="Every month is saved. Rewind to any month to try a different path; your current timeline is kept."
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {timeline && (
        <>
          <Card
            title="Timelines"
            description={`${String(timeline.snapshotCount)} saved months · ${formatBytes(timeline.totalBytes)} on this device`}
          >
            <ul className="flex flex-col gap-2">
              {timeline.branches.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
                  data-testid="branch"
                >
                  <GitBranch aria-hidden="true" className="size-5 text-muted" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-fg">
                      {b.name}{' '}
                      {b.isCurrent && (
                        <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs">
                          Playing
                        </span>
                      )}
                    </p>
                    <p className="text-muted">
                      {b.forkClock
                        ? `Rewound from ${formatMonth(b.forkClock)} of ${branchName(b.parentBranchId ?? '')}`
                        : 'Original timeline'}{' '}
                      · latest month {formatMonth(b.headClock)} · {b.snapshotCount} months recorded
                    </p>
                  </div>
                  {!b.isCurrent && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void checkout(b.id)}
                    >
                      Switch to this timeline
                    </Button>
                  )}
                  {!b.isCurrent && b.isLeaf && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${b.name}`}
                      onClick={() => {
                        setDeleting(b.id);
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" /> Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Timelines are never deleted automatically. You can delete a timeline you are not
              playing if no other timeline was rewound from it.
            </p>
          </Card>

          <Card title={`Months in ${session.branch.name}`}>
            <ol className="divide-y divide-border">
              {months.slice(0, shown).map((m) => {
                const isHead = m.tick === session.view.tick && m.branchId === session.branch.id;
                return (
                  <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                    <History aria-hidden="true" className="size-4 text-muted" />
                    <span className="flex-1 text-fg">
                      {formatMonth(m.clock)}
                      {m.branchId !== session.branch.id && (
                        <span className="ml-2 text-xs text-muted">
                          from {branchName(m.branchId)}
                        </span>
                      )}
                    </span>
                    <span className="hidden text-xs text-muted sm:inline">
                      {m.kind === 'full' ? 'full save' : 'change set'}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setTarget(m);
                      }}
                      aria-label={`${isHead ? 'Restart this month' : 'Rewind here'}: ${formatMonth(m.clock)}`}
                    >
                      {isHead ? 'Restart this month' : 'Rewind here'}
                    </Button>
                  </li>
                );
              })}
            </ol>
            {months.length > shown && (
              <Button
                className="mt-3"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShown(shown + PAGE);
                }}
              >
                Show earlier months ({months.length - shown} more)
              </Button>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={`Rewind to ${target ? formatMonth(target.clock) : ''}?`}
        confirmLabel="Rewind and start a new timeline"
        onConfirm={async () => {
          if (target) await rewind(target.id);
        }}
      >
        <p>
          The whole world returns to how it was at the start of that month: you, your family and
          everything else. This starts a new timeline; {session.branch.name} stays saved and you can
          switch back to it at any time.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deletingName}?`}
        confirmLabel="Delete timeline"
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            setTimeline(
              await getEngine().call('timeline.deleteBranch', { saveId, branchId: deleting }),
            );
          } catch (err) {
            setError(describeError(err));
          }
        }}
      >
        <p>
          All months recorded only on {deletingName} will be permanently deleted from this device.
          This cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}
