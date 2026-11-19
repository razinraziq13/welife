import { useId, useState } from 'react';
import { Link } from 'react-router';
import type { GameView } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { t } from '@app/i18n/en';
import { formatMonth, formatShortMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

/**
 * Legacy (spec §3.12): the family line across generations, choosing an heir, handing over to
 * an adult child, the will and past estates.
 */

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  const alive = useGameStore((s) => s.session?.view.lifeStatus === 'alive');
  return { send, busy, disabled: busy || pending || !alive };
}

function relationLabel(relation: string | null): string {
  if (!relation) return '';
  const label = t(`relation.${relation}`);
  return label.startsWith('relation.') ? relation : label.toLowerCase();
}

/** Shown when the player has died and an heir must be chosen (decision D7). */
export function SuccessionPanel() {
  const view = useGameStore((s) => s.session?.view);
  const { send, busy } = useAct();
  const s = view?.legacy.succession;
  if (!view || !s) return null;
  return (
    <section
      aria-labelledby="succession-heading"
      className="rounded-2xl border border-accent/50 bg-accent-soft p-4 text-fg"
    >
      <h2 id="succession-heading" className="font-semibold">
        {s.deceasedName} has died. Who carries on the family story?
      </h2>
      <p className="mt-1 text-sm text-muted">
        You take control of the person you choose. What {s.deceasedName} owned passes by their will
        or by law, not by this choice.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {s.candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-medium">{c.name}</span>{' '}
              <span className="text-sm text-muted">
                · {c.age} · {relationLabel(c.relation)}
              </span>
            </span>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void send({ type: 'continueAs', characterId: c.id })}
            >
              Continue as {c.name}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LineageCard({ view }: { view: GameView }) {
  const { saveId } = useGameStore.getState();
  const base = `/play/${saveId ?? ''}`;
  return (
    <Card
      title="The family line"
      description={`Generation ${String(view.legacy.generation)} of this family story.`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">The family line</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Generation
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Name
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Lived
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Played
              </th>
              <th scope="col" className="py-1 font-medium">
                Peak wealth
              </th>
            </tr>
          </thead>
          <tbody>
            {view.legacy.lineage.map((l) => (
              <tr key={`${l.characterId}-${String(l.fromTick)}`} className="border-t border-border">
                <td className="py-1 pr-3">{l.generation}</td>
                <td className="py-1 pr-3">
                  <Link className="underline" to={`${base}/biography/${l.characterId}`}>
                    {l.name}
                  </Link>{' '}
                  <span className="text-muted">({t(`reason.${l.reason}`)})</span>
                </td>
                <td className="py-1 pr-3">
                  {l.born.year}–{l.died ? String(l.died.year) : ''}
                  {l.alive ? ' (living)' : ''}
                </td>
                <td className="py-1 pr-3">
                  {formatShortMonth(tickToMonth(view, l.fromTick))}–
                  {l.toTick === null ? 'now' : formatShortMonth(tickToMonth(view, l.toTick))}
                </td>
                <td className="py-1">
                  <Money minor={l.peakNetWorthMinor} currency={l.currency} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const RULE_TEXT: Record<string, string> = {
  agnatic: 'Only sons and their male lines succeed.',
  malePreference: 'Sons before daughters, then each line in order of birth.',
  absolute: 'The eldest child succeeds, whatever their gender.',
};

function HouseCard({ view }: { view: GameView }) {
  const house = view.legacy.house;
  if (!house) return null;
  return (
    <Card
      title={house.kind === 'royal' ? 'The royal house' : 'The noble house'}
      description="The headship passes down the line of succession, separately from who inherits money and whom you play."
    >
      <p className="text-sm text-fg">
        Head of the house: {house.headName ?? 'none (the line has ended)'}
        {house.youAreHead ? ' (you)' : ''}
        {house.title ? ` · title: ${house.title}` : ''}
      </p>
      <p className="mt-1 text-xs text-muted">{RULE_TEXT[house.rule]}</p>
      {house.line.length > 0 && (
        <>
          <h3 className="mt-3 text-sm font-semibold text-fg">Next in line</h3>
          <ol className="list-decimal pl-5 text-sm text-fg">
            {house.line.map((p) => (
              <li key={p.name + String(p.age)}>
                {p.name} ({p.age})
              </li>
            ))}
          </ol>
        </>
      )}
      {house.heads.length > 1 && (
        <p className="mt-2 text-xs text-muted">Heads so far: {house.heads.join(' → ')}</p>
      )}
    </Card>
  );
}

function HandOverCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const [chosen, setChosen] = useState<string | null>(null);
  const candidates = view.legacy.switchCandidates;
  const person = candidates.find((c) => c.id === chosen);
  return (
    <Card
      title="Hand over"
      description="Continue the story as an adult child or grandchild. You keep playing in the same world; your current character lives on as their own person and keeps everything they own."
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">You have no adult children or grandchildren yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium text-fg">{c.name}</span>{' '}
                <span className="text-muted">
                  · {c.age} · {relationLabel(c.relation)}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => {
                  setChosen(c.id);
                }}
              >
                Play as {c.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={person !== undefined}
        onOpenChange={(open) => {
          if (!open) setChosen(null);
        }}
        title={`Continue as ${person?.name ?? ''}?`}
        confirmLabel="Hand over"
        onConfirm={async () => {
          if (person) await send({ type: 'continueAs', characterId: person.id });
          setChosen(null);
        }}
      >
        You will play as {person?.name}. This cannot be undone except by rewinding time.
      </ConfirmDialog>
    </Card>
  );
}

function WillCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const l = view.legacy;
  const [shares, setShares] = useState<Record<string, number>>(() =>
    Object.fromEntries((l.will ?? []).map((b) => [b.characterId, b.sharesBp / 100])),
  );
  const formId = useId();
  const total = Object.values(shares).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const beneficiaries = Object.entries(shares)
    .filter(([, v]) => v > 0)
    .map(([characterId, v]) => ({ characterId, sharesBp: Math.round(v * 100) }));
  const adult = view.character.age.years >= 18;
  return (
    <Card
      title="Your will"
      description="Without a will, the law decides: a married partner and children first, then parents, then brothers and sisters."
    >
      <p className="text-sm text-fg">
        {l.will
          ? `Your will names ${String(l.will.length)} ${l.will.length === 1 ? 'person' : 'people'}: ${l.will.map((b) => `${b.name} ${String(b.sharesBp / 100)}%`).join(', ')}.`
          : `You have no will. By law your estate would go to: ${l.intestate.length === 0 ? 'nobody in the family (the state)' : l.intestate.map((b) => `${b.name} ${String(b.sharesBp / 100)}%`).join(', ')}.`}
      </p>
      {l.forcedHeirship && (
        <p className="mt-1 text-xs text-muted">
          Where you live, children are entitled to at least half of an estate between them.
        </p>
      )}
      {!adult ? (
        <p className="mt-2 text-sm text-muted">You can make a will from 18.</p>
      ) : (
        <form
          className="mt-3 flex flex-col gap-2"
          aria-describedby={`${formId}-total`}
          onSubmit={(e) => {
            e.preventDefault();
            void send({ type: 'setWill', beneficiaries });
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-fg">Shares (percent)</legend>
            {l.willOptions.length === 0 && (
              <p className="text-sm text-muted">You do not know anyone to name yet.</p>
            )}
            {l.willOptions.slice(0, 20).map((p) => (
              <label key={p.id} className="flex items-center justify-between gap-3 text-sm text-fg">
                <span>
                  {p.name}{' '}
                  <span className="text-muted">
                    ({relationLabel(p.relation)}, {p.age})
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  className="h-9 w-20 shrink-0 rounded-lg border border-border bg-surface px-2 text-right text-fg"
                  value={shares[p.id] ?? 0}
                  onChange={(e) => {
                    setShares({ ...shares, [p.id]: Number(e.target.value) });
                  }}
                />
              </label>
            ))}
          </fieldset>
          <p id={`${formId}-total`} className="text-sm text-muted">
            Total: {total}% {total === 100 ? '' : '(must be 100%)'}
          </p>
          <div>
            <Button
              type="submit"
              size="sm"
              disabled={disabled || total !== 100 || beneficiaries.length === 0}
            >
              Save will
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function EstatesCard({ view }: { view: GameView }) {
  const estates = view.legacy.estates;
  return (
    <Card title="Estates" description="How the estates of people in your world were settled.">
      {estates.length === 0 ? (
        <p className="text-sm text-muted">No estates have been settled yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {estates.map((e) => (
            <li key={e.id} className="py-2 text-fg">
              <p>
                <span className="font-medium">{e.deceasedName}</span>,{' '}
                {formatMonth(tickToMonth(view, e.tick))}:{' '}
                <Money minor={e.grossMinor} currency={e.currency} />{' '}
                {e.byWill ? 'by will' : 'by law'}
                {e.taxMinor > 0n && (
                  <>
                    {' '}
                    · inheritance tax <Money minor={e.taxMinor} currency={e.currency} />
                  </>
                )}
                {e.writtenOffMinor > 0n && (
                  <>
                    {' '}
                    · debts written off <Money minor={e.writtenOffMinor} currency={e.currency} />
                  </>
                )}
              </p>
              <p className="text-muted">
                {e.heirs.length === 0
                  ? 'No heirs; the estate passed to the state.'
                  : e.heirs.map((h) => `${h.name} ${String(h.sharesBp / 100)}%`).join(', ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LegacyScreen() {
  const view = useGameStore((s) => s.session?.view ?? null);
  if (!view) return null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Legacy" description="Your family across the generations." />
      {view.lifeStatus === 'succession' && <SuccessionPanel />}
      <LineageCard view={view} />
      <HouseCard view={view} />
      {view.lifeStatus === 'alive' && <HandOverCard view={view} />}
      {view.lifeStatus === 'alive' && <WillCard view={view} />}
      <EstatesCard view={view} />
    </div>
  );
}
