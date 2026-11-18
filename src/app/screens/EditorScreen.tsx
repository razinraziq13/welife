import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PackSummary } from '@contracts/packs';
import type { PackIssue } from '@engine/content/packs';
import type { PreviewResult } from '@engine/content/preview';
import {
  EDITOR_EFFECTS,
  EDITOR_FACTS,
  blankEvent,
  blankPack,
  bumpVersion,
  type EditorEffectKind,
} from '@engine/content/editorSupport';
import {
  EVENT_CATEGORIES,
  type Effect,
  type EventDefinition,
  type Predicate,
} from '@engine/events/schema';
import { CONDITION_KINDS, NEED_KEYS, SKILL_KEYS, STAT_KEYS } from '@engine/state/schema';
import { COUNTRIES } from '@engine/world/countries';
import { PageHeader } from '@app/components/PageHeader';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { getEngine } from '@app/bridge/engine';
import { describeError } from '@app/bridge/errors';

/**
 * Event Creator (spec §3.20, §7): a library of content packs and a visual editor for their
 * events, with field-path validation, a JSON view, a seeded simulation preview, versioning,
 * and import/export. Packs are plain data; nothing here runs code from a pack.
 */

type Pack = ReturnType<typeof blankPack> & { events: EventDefinition[]; scenarios: unknown[] };

const inputClass = 'mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-fg';

// ------------------------------------------------------------------------------------------
// Conditions: the visual form edits an age range plus simple comparisons.
// ------------------------------------------------------------------------------------------

interface Condition {
  fact: string;
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string;
}

function readWhen(when: Predicate): {
  minAge: number;
  maxAge: number;
  conditions: Condition[];
  simple: boolean;
} {
  const out = { minAge: 0, maxAge: 120, conditions: [] as Condition[], simple: true };
  const nodes = when.kind === 'all' ? when.of : [when];
  for (const node of nodes) {
    if (node.kind !== 'cmp') {
      out.simple = false;
      continue;
    }
    if (node.fact === 'age.years' && node.op === 'gte' && typeof node.value === 'number')
      out.minAge = node.value;
    else if (node.fact === 'age.years' && node.op === 'lte' && typeof node.value === 'number')
      out.maxAge = node.value;
    else {
      const meta = EDITOR_FACTS.find((f) => f.fact === node.fact);
      const scale = meta?.scale ?? 1;
      out.conditions.push({
        fact: node.fact,
        op: node.op,
        value: typeof node.value === 'number' ? String(node.value / scale) : String(node.value),
      });
    }
  }
  return out;
}

function writeWhen(minAge: number, maxAge: number, conditions: Condition[]): Predicate {
  const of: Predicate[] = [{ kind: 'cmp', fact: 'age.years', op: 'gte', value: minAge }];
  if (maxAge < 120) of.push({ kind: 'cmp', fact: 'age.years', op: 'lte', value: maxAge });
  for (const c of conditions) {
    const meta = EDITOR_FACTS.find((f) => f.fact === c.fact);
    const value =
      meta?.type === 'number'
        ? Math.round(Number(c.value) * meta.scale)
        : meta?.type === 'boolean'
          ? c.value === 'true'
          : c.value;
    of.push({ kind: 'cmp', fact: c.fact, op: c.op, value });
  }
  return { kind: 'all', of };
}

// ------------------------------------------------------------------------------------------
// Effects
// ------------------------------------------------------------------------------------------

function defaultEffect(kind: EditorEffectKind, events: EventDefinition[]): Effect {
  switch (kind) {
    case 'stat':
      return { kind: 'stat', key: 'happiness', delta: 20 };
    case 'need':
      return { kind: 'need', key: 'social', delta: 50 };
    case 'skill':
      return { kind: 'skill', key: 'reading', delta: 20 };
    case 'money':
      return { kind: 'money', percent: -10, category: 'other' };
    case 'medical':
      return { kind: 'medical', percent: 20 };
    case 'flag':
      return { kind: 'flag', flag: 'myFlag', value: true };
    case 'condition':
      return { kind: 'condition', condition: 'flu' };
    case 'schedule':
      return {
        kind: 'schedule',
        eventId: events[0]?.id ?? 'my-first-event',
        inMonths: 6,
        chancePercent: 50,
        keepSubject: false,
      };
  }
}

function EffectRow({
  effect,
  onChange,
  onRemove,
  events,
  label,
}: {
  effect: Effect;
  onChange: (e: Effect) => void;
  onRemove: () => void;
  events: EventDefinition[];
  label: string;
}) {
  const id = useId();
  const editable = (EDITOR_EFFECTS as readonly string[]).includes(effect.kind);
  const keys =
    effect.kind === 'stat'
      ? STAT_KEYS
      : effect.kind === 'need'
        ? NEED_KEYS
        : effect.kind === 'skill'
          ? SKILL_KEYS
          : null;
  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2"
      role="group"
      aria-label={label}
    >
      <div>
        <label htmlFor={`${id}-k`} className="text-xs text-muted">
          Effect
        </label>
        <select
          id={`${id}-k`}
          className={inputClass}
          value={editable ? effect.kind : ''}
          onChange={(e) => {
            onChange(defaultEffect(e.target.value as EditorEffectKind, events));
          }}
        >
          {!editable && <option value="">{effect.kind} (edit as JSON)</option>}
          {EDITOR_EFFECTS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      {keys && 'key' in effect && (
        <div>
          <label htmlFor={`${id}-key`} className="text-xs text-muted">
            Which
          </label>
          <select
            id={`${id}-key`}
            className={inputClass}
            value={effect.key}
            onChange={(e) => {
              onChange({ ...effect, key: e.target.value } as Effect);
            }}
          >
            {keys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      )}
      {'delta' in effect && (
        <div>
          <label htmlFor={`${id}-d`} className="text-xs text-muted">
            Change (points out of 100)
          </label>
          <input
            id={`${id}-d`}
            type="number"
            className={inputClass}
            value={effect.delta / 10}
            onChange={(e) => {
              onChange({ ...effect, delta: Math.round(Number(e.target.value) * 10) });
            }}
          />
        </div>
      )}
      {effect.kind === 'money' && (
        <>
          <div>
            <label htmlFor={`${id}-p`} className="text-xs text-muted">
              % of median monthly wage (negative = cost)
            </label>
            <input
              id={`${id}-p`}
              type="number"
              className={inputClass}
              value={effect.percent}
              onChange={(e) => {
                onChange({ ...effect, percent: Math.round(Number(e.target.value)) });
              }}
            />
          </div>
          <div>
            <label htmlFor={`${id}-c`} className="text-xs text-muted">
              Category
            </label>
            <input
              id={`${id}-c`}
              className={inputClass}
              value={effect.category}
              onChange={(e) => {
                onChange({ ...effect, category: e.target.value });
              }}
            />
          </div>
        </>
      )}
      {effect.kind === 'medical' && (
        <div>
          <label htmlFor={`${id}-m`} className="text-xs text-muted">
            Treatment cost (% of median wage)
          </label>
          <input
            id={`${id}-m`}
            type="number"
            min={1}
            className={inputClass}
            value={effect.percent}
            onChange={(e) => {
              onChange({ ...effect, percent: Math.round(Number(e.target.value)) });
            }}
          />
        </div>
      )}
      {effect.kind === 'flag' && (
        <div>
          <label htmlFor={`${id}-f`} className="text-xs text-muted">
            Flag name (set to true)
          </label>
          <input
            id={`${id}-f`}
            className={inputClass}
            value={effect.flag}
            onChange={(e) => {
              onChange({ ...effect, flag: e.target.value });
            }}
          />
        </div>
      )}
      {effect.kind === 'condition' && (
        <div>
          <label htmlFor={`${id}-h`} className="text-xs text-muted">
            Health condition
          </label>
          <select
            id={`${id}-h`}
            className={inputClass}
            value={effect.condition}
            onChange={(e) => {
              onChange({ ...effect, condition: e.target.value as 'flu' });
            }}
          >
            {CONDITION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      )}
      {effect.kind === 'schedule' && (
        <>
          <div>
            <label htmlFor={`${id}-s`} className="text-xs text-muted">
              Follow-up event
            </label>
            <select
              id={`${id}-s`}
              className={inputClass}
              value={effect.eventId}
              onChange={(e) => {
                onChange({ ...effect, eventId: e.target.value });
              }}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-i`} className="text-xs text-muted">
              After (months)
            </label>
            <input
              id={`${id}-i`}
              type="number"
              min={1}
              className={inputClass}
              value={effect.inMonths}
              onChange={(e) => {
                onChange({ ...effect, inMonths: Math.round(Number(e.target.value)) });
              }}
            />
          </div>
          <div>
            <label htmlFor={`${id}-ch`} className="text-xs text-muted">
              Chance (%)
            </label>
            <input
              id={`${id}-ch`}
              type="number"
              min={1}
              max={100}
              className={inputClass}
              value={effect.chancePercent}
              onChange={(e) => {
                onChange({ ...effect, chancePercent: Math.round(Number(e.target.value)) });
              }}
            />
          </div>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={onRemove}>
        Remove effect
      </Button>
    </div>
  );
}

function Effects({
  effects,
  onChange,
  events,
  label,
}: {
  effects: Effect[];
  onChange: (e: Effect[]) => void;
  events: EventDefinition[];
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {effects.map((effect, i) => (
        <EffectRow
          key={i}
          label={`${label}, effect ${String(i + 1)}`}
          effect={effect}
          events={events}
          onChange={(e) => {
            onChange(effects.map((x, j) => (j === i ? e : x)));
          }}
          onRemove={() => {
            onChange(effects.filter((_, j) => j !== i));
          }}
        />
      ))}
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={effects.length >= 20}
          onClick={() => {
            onChange([...effects, defaultEffect('stat', events)]);
          }}
        >
          Add an effect
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// One event
// ------------------------------------------------------------------------------------------

function EventForm({
  event,
  events,
  onChange,
}: {
  event: EventDefinition;
  events: EventDefinition[];
  onChange: (e: EventDefinition) => void;
}) {
  const id = useId();
  const when = readWhen(event.when);
  const text = event.text.en;
  const setText = (patch: Partial<typeof text>) => {
    onChange({ ...event, text: { en: { ...text, ...patch } } });
  };
  const setWhen = (minAge: number, maxAge: number, conditions: Condition[]) => {
    onChange({ ...event, when: writeWhen(minAge, maxAge, conditions) });
  };
  const automatic = event.choices.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-id`} className="text-sm font-medium text-fg">
            Event id
          </label>
          <input
            id={`${id}-id`}
            className={inputClass}
            value={event.id}
            onChange={(e) => {
              onChange({ ...event, id: e.target.value });
            }}
          />
        </div>
        <div>
          <label htmlFor={`${id}-cat`} className="text-sm font-medium text-fg">
            Category
          </label>
          <select
            id={`${id}-cat`}
            className={inputClass}
            value={event.category}
            onChange={(e) => {
              onChange({ ...event, category: e.target.value as EventDefinition['category'] });
            }}
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-title`} className="text-sm font-medium text-fg">
            Title
          </label>
          <input
            id={`${id}-title`}
            className={inputClass}
            value={text.title}
            maxLength={80}
            onChange={(e) => {
              setText({ title: e.target.value });
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-body`} className="text-sm font-medium text-fg">
            Story
          </label>
          <textarea
            id={`${id}-body`}
            className="mt-1 min-h-20 w-full rounded-lg border border-border bg-surface p-2 text-fg"
            value={text.body}
            maxLength={600}
            onChange={(e) => {
              setText({ body: e.target.value });
            }}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">When it can happen</legend>
        {!when.simple && (
          <p className="text-xs text-muted">
            This event uses advanced conditions; edit them in the JSON view. Changes here replace
            them.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor={`${id}-min`} className="text-xs text-muted">
              From age
            </label>
            <input
              id={`${id}-min`}
              type="number"
              min={0}
              max={120}
              className={inputClass}
              value={when.minAge}
              onChange={(e) => {
                setWhen(Number(e.target.value), when.maxAge, when.conditions);
              }}
            />
          </div>
          <div>
            <label htmlFor={`${id}-max`} className="text-xs text-muted">
              To age
            </label>
            <input
              id={`${id}-max`}
              type="number"
              min={0}
              max={120}
              className={inputClass}
              value={when.maxAge}
              onChange={(e) => {
                setWhen(when.minAge, Number(e.target.value), when.conditions);
              }}
            />
          </div>
          <div>
            <label htmlFor={`${id}-chance`} className="text-xs text-muted">
              Chance each month (%)
            </label>
            <input
              id={`${id}-chance`}
              type="number"
              min={0}
              max={100}
              step={0.1}
              className={inputClass}
              value={event.chancePpm / 10_000}
              onChange={(e) => {
                onChange({ ...event, chancePpm: Math.round(Number(e.target.value) * 10_000) });
              }}
            />
          </div>
          <div>
            <label htmlFor={`${id}-cool`} className="text-xs text-muted">
              Cooldown (months)
            </label>
            <input
              id={`${id}-cool`}
              type="number"
              min={0}
              className={inputClass}
              value={event.cooldownMonths}
              onChange={(e) => {
                onChange({ ...event, cooldownMonths: Math.round(Number(e.target.value)) });
              }}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={event.scheduledOnly}
            onChange={(e) => {
              onChange({ ...event, scheduledOnly: e.target.checked });
            }}
          />
          Only as a follow-up (scheduled by another event)
        </label>
        {when.conditions.map((c, i) => {
          const meta = EDITOR_FACTS.find((f) => f.fact === c.fact);
          return (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2"
              role="group"
              aria-label={`Condition ${String(i + 1)}`}
            >
              <div>
                <label htmlFor={`${id}-f${String(i)}`} className="text-xs text-muted">
                  Fact
                </label>
                <select
                  id={`${id}-f${String(i)}`}
                  className={inputClass}
                  value={c.fact}
                  onChange={(e) => {
                    setWhen(
                      when.minAge,
                      when.maxAge,
                      when.conditions.map((x, j) => (j === i ? { ...x, fact: e.target.value } : x)),
                    );
                  }}
                >
                  {!meta && <option value={c.fact}>{c.fact}</option>}
                  {EDITOR_FACTS.map((f) => (
                    <option key={f.fact} value={f.fact}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-o${String(i)}`} className="text-xs text-muted">
                  Is
                </label>
                <select
                  id={`${id}-o${String(i)}`}
                  className={inputClass}
                  value={c.op}
                  onChange={(e) => {
                    setWhen(
                      when.minAge,
                      when.maxAge,
                      when.conditions.map((x, j) =>
                        j === i ? { ...x, op: e.target.value as Condition['op'] } : x,
                      ),
                    );
                  }}
                >
                  <option value="eq">equal to</option>
                  <option value="ne">not equal to</option>
                  <option value="gte">at least</option>
                  <option value="lte">at most</option>
                  <option value="gt">more than</option>
                  <option value="lt">less than</option>
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-v${String(i)}`} className="text-xs text-muted">
                  Value
                </label>
                {meta?.type === 'boolean' ? (
                  <select
                    id={`${id}-v${String(i)}`}
                    className={inputClass}
                    value={c.value}
                    onChange={(e) => {
                      setWhen(
                        when.minAge,
                        when.maxAge,
                        when.conditions.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x,
                        ),
                      );
                    }}
                  >
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                ) : (
                  <input
                    id={`${id}-v${String(i)}`}
                    className={inputClass}
                    value={c.value}
                    onChange={(e) => {
                      setWhen(
                        when.minAge,
                        when.maxAge,
                        when.conditions.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x,
                        ),
                      );
                    }}
                  />
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setWhen(
                    when.minAge,
                    when.maxAge,
                    when.conditions.filter((_, j) => j !== i),
                  );
                }}
              >
                Remove condition
              </Button>
            </div>
          );
        })}
        <div>
          <Button
            size="sm"
            variant="secondary"
            disabled={when.conditions.length >= 8}
            onClick={() => {
              setWhen(when.minAge, when.maxAge, [
                ...when.conditions,
                { fact: 'stats.happiness', op: 'gte', value: '50' },
              ]);
            }}
          >
            Add a condition
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-fg">Outcome</legend>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={automatic}
            onChange={(e) => {
              if (e.target.checked)
                onChange({
                  ...event,
                  choices: [],
                  text: {
                    en: {
                      ...text,
                      choices: {},
                      outcomes: { default: text.outcomes.default ?? 'It happened.' },
                    },
                  },
                });
              else
                onChange({
                  ...event,
                  choices: blankEvent(event.id).choices,
                  text: {
                    en: {
                      ...text,
                      choices: blankEvent(event.id).text.en.choices,
                      outcomes: blankEvent(event.id).text.en.outcomes,
                    },
                  },
                });
            }}
          />
          Happens automatically (no choice)
        </label>
        {automatic ? (
          <>
            <div>
              <label htmlFor={`${id}-out`} className="text-xs text-muted">
                What happened
              </label>
              <input
                id={`${id}-out`}
                className={inputClass}
                value={text.outcomes.default ?? ''}
                onChange={(e) => {
                  setText({ outcomes: { default: e.target.value } });
                }}
              />
            </div>
            <Effects
              label="Outcome"
              effects={event.effects}
              events={events}
              onChange={(effects) => {
                onChange({ ...event, effects });
              }}
            />
          </>
        ) : (
          <>
            {event.choices.map((choice, i) => (
              <div
                key={choice.id}
                className="flex flex-col gap-2 rounded-xl border border-border p-3"
                role="group"
                aria-label={`Choice ${String(i + 1)}`}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${id}-cl${String(i)}`} className="text-xs text-muted">
                      Choice {i + 1}
                    </label>
                    <input
                      id={`${id}-cl${String(i)}`}
                      className={inputClass}
                      value={text.choices[choice.id] ?? ''}
                      onChange={(e) => {
                        setText({ choices: { ...text.choices, [choice.id]: e.target.value } });
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${id}-co${String(i)}`} className="text-xs text-muted">
                      What happens
                    </label>
                    <input
                      id={`${id}-co${String(i)}`}
                      className={inputClass}
                      value={text.outcomes[choice.id] ?? ''}
                      onChange={(e) => {
                        setText({ outcomes: { ...text.outcomes, [choice.id]: e.target.value } });
                      }}
                    />
                  </div>
                </div>
                <Effects
                  label={`Choice ${String(i + 1)}`}
                  effects={choice.effects}
                  events={events}
                  onChange={(effects) => {
                    onChange({
                      ...event,
                      choices: event.choices.map((c, j) => (j === i ? { ...c, effects } : c)),
                    });
                  }}
                />
                {event.choices.length > 2 && (
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const rest = event.choices.filter((_, j) => j !== i);
                        const choices = Object.fromEntries(
                          Object.entries(text.choices).filter(([k]) => k !== choice.id),
                        );
                        const outcomes = Object.fromEntries(
                          Object.entries(text.outcomes).filter(([k]) => k !== choice.id),
                        );
                        onChange({
                          ...event,
                          choices: rest,
                          text: { en: { ...text, choices, outcomes } },
                        });
                      }}
                    >
                      Remove this choice
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="secondary"
                disabled={event.choices.length >= 5}
                onClick={() => {
                  let n = event.choices.length + 1;
                  while (event.choices.some((c) => c.id === `option${String(n)}`)) n += 1;
                  const cid = `option${String(n)}`;
                  onChange({
                    ...event,
                    choices: [...event.choices, { id: cid, requires: null, effects: [] }],
                    text: {
                      en: {
                        ...text,
                        choices: { ...text.choices, [cid]: 'Another option' },
                        outcomes: { ...text.outcomes, [cid]: 'Something else happened.' },
                      },
                    },
                  });
                }}
              >
                Add a choice
              </Button>
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Screen
// ------------------------------------------------------------------------------------------

function download(fileName: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function EditorScreen() {
  const navigate = useNavigate();
  const [library, setLibrary] = useState<PackSummary[]>([]);
  const [draft, setDraft] = useState<Pack | null>(null);
  const [selected, setSelected] = useState(0);
  const [issues, setIssues] = useState<PackIssue[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [view, setView] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [setup, setSetup] = useState({ countryCode: 'GB', ageYears: 30, seed: 'preview-1' });
  const [deleting, setDeleting] = useState<PackSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  const refresh = useCallback(async () => {
    try {
      setLibrary(await getEngine().call('packs.list'));
    } catch (e) {
      setStatus(describeError(e));
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    getEngine()
      .call('packs.list')
      .then((rows) => {
        if (!cancelled) setLibrary(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setStatus(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live validation of the draft (debounced).
  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => {
      void getEngine()
        .call('packs.validate', { json: JSON.stringify(draft) })
        .then((r) => {
          setIssues(r.issues);
        })
        .catch((e: unknown) => {
          setStatus(describeError(e));
        });
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draft]);

  const open = async (id: string) => {
    const result = await getEngine().call('packs.get', { id });
    if (!result) return;
    const pack = JSON.parse(result.json) as Pack;
    setDraft(pack);
    setSelected(0);
    setPreview(null);
    setJsonText(JSON.stringify(pack, null, 2));
  };

  const save = async (bump: boolean) => {
    if (!draft) return;
    const next = bump ? { ...draft, packVersion: bumpVersion(draft.packVersion) } : draft;
    const result = await getEngine().call('packs.save', { json: JSON.stringify(next) });
    if (!result.ok) {
      setIssues(result.issues);
      setStatus('The pack has problems; fix them before saving.');
      return;
    }
    setDraft(next);
    setStatus(`Saved ${next.name} ${next.packVersion} to your library.`);
    await refresh();
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const result = await getEngine().call('packs.save', { json: text });
    if (!result.ok) {
      setIssues(result.issues);
      setStatus(`Import refused: ${String(result.issues.length)} problem(s). Nothing was stored.`);
      return;
    }
    setStatus(`Imported ${result.summary?.name ?? 'pack'}.`);
    await refresh();
  };

  const startScenario = async (packId: string, scenarioId: string) => {
    try {
      const got = await getEngine().call('packs.get', { id: packId });
      if (!got) return;
      const pack = JSON.parse(got.json) as {
        scenarios: {
          id: string;
          name: string;
          countryCode: string;
          scenario: string;
          originCountryCode: string | null;
          difficulty: string;
          easyMigration: boolean;
        }[];
      };
      const s = pack.scenarios.find((x) => x.id === scenarioId);
      if (!s) return;
      const seed = crypto.randomUUID().slice(0, 8);
      const created = await getEngine().call('saves.create', {
        input: {
          seed,
          start: { year: 2026, month: 11 },
          countryCode: s.countryCode,
          locationId: null,
          scenario: s.scenario as 'middle',
          originCountryCode: s.originCountryCode,
          difficulty: s.difficulty as 'realistic',
          easyMigration: s.easyMigration,
          identity: { firstName: null, lastName: null, gender: null },
          appearance: null,
        },
        displayName: s.name,
      });
      await getEngine().call('game.command', {
        saveId: created.saveId,
        command: { type: 'enablePack', id: `pack-${seed}`, pack: JSON.parse(got.json) as unknown },
      });
      await navigate(`/play/${created.saveId}/life`);
    } catch (e) {
      setStatus(describeError(e));
    }
  };

  const event = draft?.events[selected];
  const setEvent = (e: EventDefinition) => {
    if (!draft) return;
    setDraft({ ...draft, events: draft.events.map((x, i) => (i === selected ? e : x)) });
  };

  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
        ← Your lives
      </Link>
      <PageHeader
        title="Event creator"
        description="Write your own events and scenarios as content packs. Packs are plain data and are checked before they can be used."
      />
      <div aria-live="polite" className="min-h-0 text-sm">
        {status && <p className="rounded-xl bg-surface-2 px-3 py-2 text-fg">{status}</p>}
      </div>

      <Card title="Library">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const p = blankPack() as Pack;
              setDraft(p);
              setSelected(0);
              setJsonText(JSON.stringify(p, null, 2));
              setPreview(null);
            }}
          >
            New pack
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import a pack file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Pack file to import"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {library.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Your library is empty.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {library.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium text-fg">{p.name}</span>{' '}
                    <span className="text-muted">
                      {p.packVersion} · {p.mode === 'player' ? 'player pack' : 'developer pack'} ·{' '}
                      {p.events} events
                      {p.versions.length > 1
                        ? ` · earlier: ${p.versions.slice(1, 4).join(', ')}`
                        : ''}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => void open(p.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Export ${p.name}`}
                      onClick={() =>
                        void getEngine()
                          .call('packs.get', { id: p.id })
                          .then((r) => {
                            if (r)
                              download(
                                `${p.id}-${p.packVersion}.welife-pack.json`,
                                JSON.stringify(JSON.parse(r.json), null, 2),
                              );
                          })
                      }
                    >
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => {
                        setDeleting(p);
                      }}
                    >
                      Delete
                    </Button>
                  </span>
                </div>
                {p.scenarios.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 pl-3 text-muted"
                  >
                    <span>
                      Scenario: {s.name}
                      {s.description ? ` · ${s.description}` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void startScenario(p.id, s.id)}
                    >
                      Start a life
                    </Button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(o) => {
            if (!o) setDeleting(null);
          }}
          title={`Delete ${deleting?.name ?? ''}?`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            if (deleting) await getEngine().call('packs.delete', { id: deleting.id });
            setDeleting(null);
            await refresh();
          }}
        >
          It is removed from this device's library. Lives that already use it keep their copy.
        </ConfirmDialog>
      </Card>

      {draft && (
        <Card title={`Editing: ${draft.name}`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`${ids}-pid`} className="text-sm font-medium text-fg">
                Pack id
              </label>
              <input
                id={`${ids}-pid`}
                className={inputClass}
                value={draft.id}
                onChange={(e) => {
                  setDraft({ ...draft, id: e.target.value });
                }}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-pn`} className="text-sm font-medium text-fg">
                Name
              </label>
              <input
                id={`${ids}-pn`}
                className={inputClass}
                value={draft.name}
                onChange={(e) => {
                  setDraft({ ...draft, name: e.target.value });
                }}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-pv`} className="text-sm font-medium text-fg">
                Version
              </label>
              <input
                id={`${ids}-pv`}
                className={inputClass}
                value={draft.packVersion}
                onChange={(e) => {
                  setDraft({ ...draft, packVersion: e.target.value });
                }}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-pa`} className="text-sm font-medium text-fg">
                Author
              </label>
              <input
                id={`${ids}-pa`}
                className={inputClass}
                value={draft.author}
                onChange={(e) => {
                  setDraft({ ...draft, author: e.target.value });
                }}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-pm`} className="text-sm font-medium text-fg">
                Mode
              </label>
              <select
                id={`${ids}-pm`}
                className={inputClass}
                value={draft.mode}
                onChange={(e) => {
                  setDraft({ ...draft, mode: e.target.value as 'player' });
                }}
              >
                <option value="player">Player (safer limits)</option>
                <option value="developer">Developer (full rules)</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Editor view">
            <Button
              size="sm"
              role="tab"
              aria-selected={view === 'visual'}
              variant={view === 'visual' ? 'primary' : 'secondary'}
              onClick={() => {
                setView('visual');
              }}
            >
              Visual
            </Button>
            <Button
              size="sm"
              role="tab"
              aria-selected={view === 'json'}
              variant={view === 'json' ? 'primary' : 'secondary'}
              onClick={() => {
                setJsonText(JSON.stringify(draft, null, 2));
                setView('json');
              }}
            >
              JSON
            </Button>
          </div>

          {view === 'visual' ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor={`${ids}-ev`} className="text-sm font-medium text-fg">
                    Event
                  </label>
                  <select
                    id={`${ids}-ev`}
                    className={inputClass}
                    value={selected}
                    onChange={(e) => {
                      setSelected(Number(e.target.value));
                      setPreview(null);
                    }}
                  >
                    {draft.events.map((e, i) => (
                      <option key={`${e.id}-${String(i)}`} value={i}>
                        {e.id}: {e.text.en.title}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    let n = draft.events.length + 1;
                    while (draft.events.some((e) => e.id === `${draft.id}-event-${String(n)}`))
                      n += 1;
                    setDraft({
                      ...draft,
                      events: [...draft.events, blankEvent(`${draft.id}-event-${String(n)}`)],
                    });
                    setSelected(draft.events.length);
                  }}
                >
                  Add an event
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={draft.events.length <= 1}
                  onClick={() => {
                    setDraft({ ...draft, events: draft.events.filter((_, i) => i !== selected) });
                    setSelected(0);
                  }}
                >
                  Delete this event
                </Button>
              </div>
              {event && <EventForm event={event} events={draft.events} onChange={setEvent} />}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor={`${ids}-json`} className="text-sm font-medium text-fg">
                Pack JSON
              </label>
              <textarea
                id={`${ids}-json`}
                className="min-h-80 w-full rounded-lg border border-border bg-surface p-2 font-mono text-xs text-fg"
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                }}
              />
              <div>
                <Button
                  size="sm"
                  onClick={() => {
                    try {
                      setDraft(JSON.parse(jsonText) as Pack);
                      setStatus('JSON applied.');
                    } catch {
                      setStatus('That is not valid JSON.');
                    }
                  }}
                >
                  Apply JSON
                </Button>
              </div>
            </div>
          )}

          <section aria-labelledby={`${ids}-val`} className="mt-4">
            <h3 id={`${ids}-val`} className="text-sm font-semibold text-fg">
              Validation
            </h3>
            {issues.length === 0 ? (
              <p className="text-sm text-fg">No problems found.</p>
            ) : (
              <ul className="mt-1 list-disc pl-5 text-sm text-danger">
                {issues.slice(0, 50).map((i) => (
                  <li key={`${i.path}-${i.message}`}>
                    <code>{i.path}</code>: {i.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby={`${ids}-prev`} className="mt-4 flex flex-col gap-2">
            <h3 id={`${ids}-prev`} className="text-sm font-semibold text-fg">
              Test this event
            </h3>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={`${ids}-pc`} className="text-xs text-muted">
                  Country
                </label>
                <select
                  id={`${ids}-pc`}
                  className={inputClass}
                  value={setup.countryCode}
                  onChange={(e) => {
                    setSetup({ ...setup, countryCode: e.target.value });
                  }}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${ids}-pg`} className="text-xs text-muted">
                  Age
                </label>
                <input
                  id={`${ids}-pg`}
                  type="number"
                  min={0}
                  max={110}
                  className={inputClass}
                  value={setup.ageYears}
                  onChange={(e) => {
                    setSetup({ ...setup, ageYears: Number(e.target.value) });
                  }}
                />
              </div>
              <div>
                <label htmlFor={`${ids}-ps`} className="text-xs text-muted">
                  Seed
                </label>
                <input
                  id={`${ids}-ps`}
                  className={inputClass}
                  value={setup.seed}
                  onChange={(e) => {
                    setSetup({ ...setup, seed: e.target.value });
                  }}
                />
              </div>
              <Button
                size="sm"
                disabled={!event || issues.length > 0}
                onClick={() => {
                  if (!event) return;
                  void getEngine()
                    .call('packs.preview', {
                      json: JSON.stringify(draft),
                      eventId: event.id,
                      ...setup,
                    })
                    .then(setPreview)
                    .catch((e: unknown) => {
                      setStatus(describeError(e));
                    });
                }}
              >
                Run test
              </Button>
            </div>
            {issues.length > 0 && (
              <p className="text-xs text-muted">Fix the problems above to test.</p>
            )}
            {preview && (
              <div className="rounded-xl border border-border p-3 text-sm text-fg" role="status">
                <p>
                  {preview.scheduledOnly
                    ? 'Follow-up only: it happens when another event schedules it.'
                    : preview.eligible
                      ? `Eligible for this person: ${String(preview.chancePpm / 10_000)}% chance each month.`
                      : preview.conditionsMet
                        ? 'Conditions met, but a cooldown, limit or missing person stops it.'
                        : 'Not eligible for this person.'}
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {preview.options.map((o) => (
                    <li key={o.id}>
                      <span className="font-medium">{o.label || o.id}</span>
                      {o.available ? '' : ' (not available)'}:{' '}
                      {o.changes.length === 0
                        ? 'no changes'
                        : o.changes
                            .map((c) => `${c.label} ${String(c.before)} → ${String(c.after)}`)
                            .join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={issues.length > 0} onClick={() => void save(false)}>
              Save to library
            </Button>
            <Button
              variant="secondary"
              disabled={issues.length > 0}
              onClick={() => void save(true)}
            >
              Save as new version
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                download(
                  `${draft.id}-${draft.packVersion}.welife-pack.json`,
                  JSON.stringify(draft, null, 2),
                );
              }}
            >
              Export JSON
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
