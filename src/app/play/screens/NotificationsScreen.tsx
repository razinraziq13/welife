import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCheck } from 'lucide-react';
import {
  NOTIFICATION_CATEGORIES,
  type Notification,
  type NotificationCategory,
} from '@engine/state/schema';
import { PageHeader } from '@app/components/PageHeader';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { formatShortMonth, notificationText } from '@app/i18n/format';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

const TARGET_ROUTE: Record<Notification['target'], string> = {
  life: 'life',
  character: 'character',
  social: 'social',
  timeline: 'timeline',
  event: 'life',
  career: 'career',
  finance: 'finance',
  calendar: 'calendar',
  person: 'social',
  family: 'family',
  business: 'business',
  property: 'property',
};

function routeFor(n: Notification): string {
  if (n.target === 'person' && n.targetId) return `people/${n.targetId}`;
  if (n.target === 'business' && n.targetId) return `business/${n.targetId}`;
  return TARGET_ROUTE[n.target];
}

/** Notification centre (spec §3.17): categories, read/unread, and links to what changed. */
export function NotificationsScreen() {
  const session = useGameStore((s) => s.session);
  const markRead = useGameStore((s) => s.markRead);
  const busy = useGameStore((s) => s.busy);
  const navigate = useNavigate();
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');
  if (!session) return null;
  const view = session.view;
  const items = [...view.notifications]
    .reverse()
    .filter((n) => category === 'all' || n.category === category);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeader title="Notifications" description={`${String(view.unreadCount)} unread`} />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || view.unreadCount === 0}
          onClick={() => void markRead('all')}
        >
          <CheckCheck aria-hidden="true" className="size-4" /> Mark all as read
        </Button>
      </div>
      <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
        {(['all', ...NOTIFICATION_CATEGORIES] as const).map((c) => (
          <Button
            key={c}
            size="sm"
            variant={category === c ? 'primary' : 'secondary'}
            aria-pressed={category === c}
            onClick={() => {
              setCategory(c);
            }}
          >
            {c === 'all' ? 'All' : t(`notificationCategory.${c}`)}
          </Button>
        ))}
      </div>
      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-muted">No notifications here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left hover:bg-surface-2',
                    !n.read && 'font-semibold',
                  )}
                  onClick={() => {
                    void (n.read ? Promise.resolve() : markRead([n.id])).then(() =>
                      navigate(`/play/${session.saveId}/${routeFor(n)}`),
                    );
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      n.read ? 'bg-transparent' : 'bg-primary',
                    )}
                  />
                  <span className="flex-1 text-sm text-fg">
                    {notificationText(n)}
                    <span className="block text-xs font-normal text-muted">
                      {t(`notificationCategory.${n.category}`)} ·{' '}
                      {formatShortMonth(tickToMonth(view, n.tick))}
                      {!n.read && ' · unread'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
