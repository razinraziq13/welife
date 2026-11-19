import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutDashboard } from 'lucide-react';
import { DASHBOARD_WIDGETS, type DashboardLayout, type DashboardWidget } from '@contracts/saves';
import { PageHeader } from '@app/components/PageHeader';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { useGameStore } from '@app/stores/gameStore';
import { renderWidget } from '../widgets';
import { ActionGrid, LifeHero } from '../LifeHero';

/** Shown at the top of the Life tab already, so hidden from the dashboard unless chosen. */
const DEFAULT_HIDDEN: readonly DashboardWidget[] = ['profile', 'vitals'];

/** Normalises a stored layout: keeps known widgets, appends any new ones. */
export function resolveLayout(layout: DashboardLayout | null): DashboardLayout {
  const order = (layout?.order ?? []).filter((id) => DASHBOARD_WIDGETS.includes(id));
  for (const id of DASHBOARD_WIDGETS) if (!order.includes(id)) order.push(id);
  const hidden = layout ? layout.hidden : [...DEFAULT_HIDDEN];
  return { order, hidden: hidden.filter((id) => order.includes(id)) };
}

export function LifeTab() {
  const session = useGameStore((s) => s.session);
  const setLayout = useGameStore((s) => s.setLayout);
  const [customizing, setCustomizing] = useState(false);
  if (!session) return null;
  const view = session.view;
  const base = `/play/${session.saveId}`;
  const layout = resolveLayout(session.layout);
  const visible = layout.order.filter((id) => !layout.hidden.includes(id));

  const move = (id: DashboardWidget, delta: -1 | 1) => {
    const order = [...layout.order];
    const index = order.indexOf(id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target] as DashboardWidget, id];
    void setLayout({ ...layout, order });
  };
  const showActivities = () => {
    const scroll = () => {
      document.getElementById('widget-activities')?.scrollIntoView({ block: 'start' });
    };
    if (layout.hidden.includes('activities')) {
      void setLayout({ ...layout, hidden: layout.hidden.filter((h) => h !== 'activities') }).then(
        () => {
          requestAnimationFrame(scroll);
        },
      );
    } else scroll();
  };
  const toggle = (id: DashboardWidget) => {
    const hidden = layout.hidden.includes(id)
      ? layout.hidden.filter((h) => h !== id)
      : [...layout.hidden, id];
    void setLayout({ ...layout, hidden });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeader title="Life" />
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={customizing}
          onClick={() => {
            setCustomizing(!customizing);
          }}
        >
          <LayoutDashboard aria-hidden="true" className="size-4" />
          {customizing ? 'Done' : 'Customise'}
        </Button>
      </div>

      <LifeHero view={view} base={base} />
      <ActionGrid view={view} base={base} onActivities={showActivities} />

      {customizing && (
        <Card
          title="Customise your dashboard"
          description="Reorder or hide sections. The layout is saved with this life."
          headingLevel={2}
        >
          <ol className="flex flex-col gap-1" data-testid="layout-editor">
            {layout.order.map((id, index) => {
              const hidden = layout.hidden.includes(id);
              const name = t(`widget.${id}`);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2"
                >
                  <span className={hidden ? 'flex-1 text-muted line-through' : 'flex-1 text-fg'}>
                    {name}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${name} up`}
                    disabled={index === 0}
                    onClick={() => {
                      move(id, -1);
                    }}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${name} down`}
                    disabled={index === layout.order.length - 1}
                    onClick={() => {
                      move(id, 1);
                    }}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={hidden ? `Show ${name}` : `Hide ${name}`}
                    onClick={() => {
                      toggle(id);
                    }}
                  >
                    {hidden ? (
                      <Eye aria-hidden="true" className="size-4" />
                    ) : (
                      <EyeOff aria-hidden="true" className="size-4" />
                    )}
                  </Button>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2" data-testid="dashboard">
        {visible.map((id) => (
          <Card
            key={id}
            id={`widget-${id}`}
            title={t(`widget.${id}`)}
            headingLevel={2}
            data-widget={id}
            className={id === 'activities' || id === 'feed' ? 'lg:col-span-2' : undefined}
          >
            {renderWidget(id, view, base)}
          </Card>
        ))}
      </div>
    </div>
  );
}
