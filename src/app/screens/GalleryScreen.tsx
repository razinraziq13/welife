import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { GalleryEntry } from '@contracts/packs';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '@engine/achievements/achievements';
import { PageHeader } from '@app/components/PageHeader';
import { Card } from '@app/components/ui/card';
import { getEngine } from '@app/bridge/engine';
import { describeError } from '@app/bridge/errors';
import { t } from '@app/i18n/en';
import { formatMonth } from '@app/i18n/format';

/**
 * Cross-save achievement gallery (decision D10): every achievement unlocked on this device,
 * with where it happened (life, timeline, person, generation, month).
 */
export function GalleryScreen() {
  const [entries, setEntries] = useState<GalleryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getEngine()
      .call('achievements.gallery')
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const byId = new Map<string, GalleryEntry[]>();
  for (const e of entries ?? [])
    byId.set(e.achievementId, [...(byId.get(e.achievementId) ?? []), e]);
  const earned = ACHIEVEMENTS.filter((a) => byId.has(a.id)).length;
  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
        ← Your lives
      </Link>
      <PageHeader
        title="Achievement gallery"
        description={
          entries === null
            ? 'Loading…'
            : `${String(earned)} of ${String(ACHIEVEMENTS.length)} achievements earned across all lives on this device.`
        }
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {ACHIEVEMENT_CATEGORIES.map((category) => (
        <Card key={category} title={t(`achievementCategory.${category}`)}>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {ACHIEVEMENTS.filter((a) => a.category === category).map((a) => {
              const where = byId.get(a.id) ?? [];
              return (
                <li
                  key={a.id}
                  className={
                    where.length > 0
                      ? 'rounded-xl border border-border bg-surface-2 p-2'
                      : 'rounded-xl border border-dashed border-border p-2'
                  }
                >
                  <p
                    className={where.length > 0 ? 'font-medium text-fg' : 'font-medium text-muted'}
                  >
                    {where.length > 0 ? '✓ ' : ''}
                    {a.title}
                  </p>
                  <p className="text-muted">{a.description}</p>
                  {where.slice(0, 3).map((w) => (
                    <p key={`${w.saveId}-${w.branchId}`} className="text-xs text-muted">
                      {w.characterName} · {w.saveName} ({w.branchName}) ·{' '}
                      {formatMonth({ year: w.year, month: w.month })} · generation {w.generation}
                    </p>
                  ))}
                  {where.length > 3 && (
                    <p className="text-xs text-muted">and {where.length - 3} more</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
