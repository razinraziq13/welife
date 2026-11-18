import { DIFFICULTIES } from '@engine/state/schema';
import { PageHeader } from '@app/components/PageHeader';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { Switch } from '@app/components/ui/switch';
import { t } from '@app/i18n/en';
import { formatMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { PacksCard } from './PacksCard';
import { tickToMonth } from '../widgets';

/** Per-save rules (spec §5): changes apply from now on and are recorded in the timeline. */
export function RulesScreen() {
  const session = useGameStore((s) => s.session);
  const { setDifficulty, setEasyMigration, busy } = useGameStore();
  if (!session) return null;
  const view = session.view;
  const locked = busy || view.pendingEvent !== null || view.lifeStatus !== 'alive';
  const lockReason = view.pendingEvent
    ? 'Make the waiting decision first.'
    : view.lifeStatus !== 'alive'
      ? 'This life has ended.'
      : null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Game rules"
        description="These settings belong to this life only. Changes apply from now on and are recorded in your timeline."
      />
      {lockReason && (
        <p role="status" className="text-sm text-muted">
          {lockReason}
        </p>
      )}
      <Card title="Difficulty">
        <ChoiceGroup
          legend="Difficulty"
          name="rule-difficulty"
          value={view.rules.difficulty}
          disabled={locked}
          onChange={(value) => void setDifficulty(value)}
          options={DIFFICULTIES.map((d) => ({
            value: d,
            label: t(`difficulty.${d}`),
            description: t(`difficulty.${d}.desc`),
          }))}
        />
      </Card>
      <Card title="Migration">
        <Switch
          label="Easy Migration"
          description="On: future visa and relocation decisions are simpler. Off: each country's standard rules apply. Changing this never removes a residency or citizenship you already have. (Moving abroad arrives with the migration system.)"
          checked={view.rules.easyMigration}
          disabled={locked}
          onChange={(value) => void setEasyMigration(value)}
        />
      </Card>
      <PacksCard view={view} />
      <Card title="Rule history">
        {view.ruleChanges.length === 0 ? (
          <p className="text-sm text-muted">No rule changes in this timeline.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {view.ruleChanges.map((change, index) => (
              <li key={`${String(change.tick)}-${String(index)}`}>
                {formatMonth(tickToMonth(view, change.tick))}: {t(`rule.${change.rule}`)} changed
                from{' '}
                {typeof change.from === 'boolean'
                  ? change.from
                    ? 'on'
                    : 'off'
                  : t(`difficulty.${change.from}`)}{' '}
                to{' '}
                {typeof change.to === 'boolean'
                  ? change.to
                    ? 'on'
                    : 'off'
                  : t(`difficulty.${change.to}`)}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
