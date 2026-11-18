import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PackSummary } from '@contracts/packs';
import type { GameView } from '@engine/view';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { getEngine } from '@app/bridge/engine';
import { describeError } from '@app/bridge/errors';
import { useGameStore } from '@app/stores/gameStore';

/**
 * Content packs for this life (spec §7): enabling copies the validated pack into the world,
 * so the save, its rewinds and exports carry it and replays stay deterministic.
 */
export function PacksCard({ view }: { view: GameView }) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const [library, setLibrary] = useState<PackSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getEngine()
      .call('packs.list')
      .then((rows) => {
        if (!cancelled) setLibrary(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const locked = busy || view.pendingEvent !== null || view.lifeStatus !== 'alive';
  const enabled = view.packs.filter((p) => p.enabled);
  const enable = async (id: string) => {
    const got = await getEngine().call('packs.get', { id });
    if (got) await send({ type: 'enablePack', pack: JSON.parse(got.json) as unknown });
  };
  return (
    <Card title="Content packs" description="Extra events made in the event creator.">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {enabled.length === 0 ? (
        <p className="text-sm text-muted">No content packs are enabled for this life.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {enabled.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-fg">
                {p.name} {p.packVersion} · {p.events} events
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={locked}
                aria-label={`Disable ${p.name}`}
                onClick={() => void send({ type: 'disablePack', packId: p.id })}
              >
                Disable
              </Button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-4 text-sm font-semibold text-fg">In your library</h3>
      {library.length === 0 ? (
        <p className="text-sm text-muted">
          Your library is empty. Make or import packs in the{' '}
          <Link className="underline" to="/editor">
            event creator
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {library.map((p) => {
            const current = enabled.find((e) => e.id === p.id);
            const same = current?.packVersion === p.packVersion;
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-fg">
                  {p.name} {p.packVersion} · {p.events} events
                </span>
                <Button
                  size="sm"
                  disabled={locked || same}
                  aria-label={`${same ? 'Enabled' : current ? 'Update to' : 'Enable'} ${p.name} ${p.packVersion}`}
                  onClick={() => void enable(p.id)}
                >
                  {same ? 'Enabled' : current ? 'Update' : 'Enable'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
