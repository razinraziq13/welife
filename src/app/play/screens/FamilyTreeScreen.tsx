import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { FamilyTreeView } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { Avatar } from '@app/components/avatar/Avatar';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { useGameStore } from '@app/stores/gameStore';

const GENERATION: Record<number, string> = {
  [-2]: 'Grandparents',
  [-1]: 'Parents, aunts and uncles',
  0: 'Your generation',
  1: 'Children, nieces and nephews',
  2: 'Grandchildren',
};

/** Family tree (spec §3.12): ancestry and descendants, with partners beside them. */
export function FamilyTreeScreen() {
  const session = useGameStore((s) => s.session);
  const fetchFamily = useGameStore((s) => s.family);
  const [tree, setTree] = useState<FamilyTreeView | null>(null);
  const view = session?.view;
  useEffect(() => {
    let cancelled = false;
    void fetchFamily().then((result) => {
      if (!cancelled) setTree(result);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchFamily, view]);
  if (!session) return null;
  const base = `/play/${session.saveId}`;
  return (
    <div className="flex flex-col gap-4">
      <Link
        to={`${base}/social`}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Social
      </Link>
      <PageHeader
        title="Family tree"
        description="Up to two generations either side of you. Select anyone to see their profile."
      />
      {!tree ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : (
        tree.generations.map((g) => (
          <Card key={g.offset} title={GENERATION[g.offset] ?? 'Family'} headingLevel={2}>
            <ul className="flex flex-wrap gap-3">
              {g.nodes.map((n) => {
                const label =
                  n.relation === 'you' ? 'You' : n.relation ? t(`relation.${n.relation}`) : '';
                const content = (
                  <>
                    <Avatar
                      appearance={n.appearance}
                      stage={n.stage}
                      ageYears={n.ageYears}
                      className="size-14"
                      framed={n.relation === 'you'}
                    />
                    <span className="mt-1 block font-medium text-fg">{n.firstName}</span>
                    <span className="block text-xs text-muted">{label}</span>
                    <span className="block text-xs text-muted">
                      {n.birthYear}
                      {n.deathYear !== null ? `–${String(n.deathYear)}` : ''}
                    </span>
                  </>
                );
                return (
                  <li key={n.id} className="w-28 text-center text-sm">
                    {n.relation === 'you' ? (
                      <div className="rounded-xl p-2">{content}</div>
                    ) : (
                      <Link
                        to={`${base}/people/${n.id}`}
                        className="block rounded-xl p-2 hover:bg-surface-2"
                      >
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
