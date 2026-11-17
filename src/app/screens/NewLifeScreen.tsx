import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Dices, Sparkles } from 'lucide-react';
import { scenarioAvailability } from '@engine/characters/scenarios';
import { COUNTRIES, getCountry } from '@engine/world/countries';
import {
  APPEARANCE_LIMITS,
  DIFFICULTIES,
  SCENARIO_IDS,
  type Appearance,
  type Difficulty,
  type Gender,
  type ScenarioId,
} from '@engine/state/schema';
import type { NewLifeInput } from '@engine/characters/create';
import { PageHeader } from '@app/components/PageHeader';
import { Avatar } from '@app/components/avatar/Avatar';
import {
  EYE_COLOR_NAMES,
  EYE_COLORS,
  FACE_SHAPE_NAMES,
  HAIR_COLOR_NAMES,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  SKIN_TONES,
} from '@app/components/avatar/palette';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { SwatchGroup } from '@app/components/ui/swatch-group';
import { Switch } from '@app/components/ui/switch';
import { describeError } from '@app/bridge/errors';
import { t } from '@app/i18n/en';
import { cn } from '@app/lib/cn';
import { useSavesStore } from '@app/stores/savesStore';

const STEPS = ['Place', 'Family', 'You', 'Rules'] as const;
const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));

function randomSeed(): string {
  return crypto.randomUUID().slice(0, 8);
}

function randomAppearance(): Appearance {
  const pick = (n: number) => Math.floor(Math.random() * n);
  return {
    skinTone: pick(APPEARANCE_LIMITS.skinTone),
    hairColor: pick(APPEARANCE_LIMITS.hairColor),
    hairStyle: pick(APPEARANCE_LIMITS.hairStyle),
    eyeColor: pick(APPEARANCE_LIMITS.eyeColor),
    faceShape: pick(APPEARANCE_LIMITS.faceShape),
    freckles: pick(5) === 0,
  };
}

function currentStart(): { year: number; month: number } {
  const now = new Date();
  return now.getFullYear() < 2026
    ? { year: 2026, month: 1 }
    : { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  maxLength: number;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-fg">
        {label}
      </label>
      {hint !== undefined && (
        <p id={hintId} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      )}
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={hint === undefined ? undefined : hintId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg placeholder:text-muted"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-fg">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NewLifeScreen() {
  const navigate = useNavigate();
  const create = useSavesStore((s) => s.create);
  const [step, setStep] = useState(0);
  const [countryCode, setCountryCode] = useState('MY');
  const [locationId, setLocationId] = useState<string>('any');
  const [scenario, setScenario] = useState<ScenarioId>('middle');
  const [origin, setOrigin] = useState<string>('any');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<'random' | Gender>('random');
  const [customLook, setCustomLook] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(randomAppearance);
  const [difficulty, setDifficulty] = useState<Difficulty>('realistic');
  const [easyMigration, setEasyMigration] = useState(false);
  const [seed, setSeed] = useState(randomSeed);
  const [saveName, setSaveName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = getCountry(countryCode);
  const location = country.locations.find((l) => l.id === locationId) ?? null;
  const availability = useMemo(
    () => Object.fromEntries(SCENARIO_IDS.map((id) => [id, scenarioAvailability(id, country)])),
    [country],
  );

  const problems: string[] = [];
  if (!availability[scenario]?.available)
    problems.push(`${t(`scenario.${scenario}`)} is not available in ${country.name}.`);
  if (scenario === 'rural' && location !== null && location.kind !== 'rural') {
    problems.push(
      'The rural scenario needs a rural area. Choose a rural area or “Anywhere” in Place.',
    );
  }

  const input: NewLifeInput = {
    seed: seed.trim() || 'welife',
    start: currentStart(),
    countryCode,
    locationId: location?.id ?? null,
    scenario,
    originCountryCode: scenario === 'immigrant' && origin !== 'any' ? origin : null,
    difficulty,
    easyMigration,
    identity: {
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      gender: gender === 'random' ? null : gender,
    },
    appearance: customLook ? appearance : null,
  };

  const start = () => {
    setSubmitting(true);
    setError(null);
    void create(input, saveName.trim() || null)
      .then((saveId) => navigate(`/play/${saveId}/life`))
      .catch((err: unknown) => {
        setError(describeError(err));
        setSubmitting(false);
      });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="New life"
        description="Choose where and how your story begins. Anything you leave open is decided by chance."
      />

      <nav aria-label="New life steps">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => {
                  setStep(index);
                }}
                aria-current={index === step ? 'step' : undefined}
                className={cn(
                  'w-full rounded-xl border px-2 py-2 text-sm font-medium',
                  index === step
                    ? 'border-primary bg-primary-soft text-fg'
                    : 'border-border bg-surface text-muted hover:text-fg',
                )}
              >
                <span className="block text-xs">Step {index + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {step === 0 && (
        <Card title="Where will you be born?">
          <div className="flex flex-col gap-5">
            <SelectField
              label="Country"
              value={countryCode}
              onChange={(code) => {
                setCountryCode(code);
                setLocationId('any');
                if (origin === code) setOrigin('any');
              }}
              options={SORTED_COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
            />
            <ChoiceGroup
              legend="City or area"
              name="location"
              value={locationId}
              onChange={setLocationId}
              options={[
                { value: 'any', label: 'Anywhere', description: 'Decided by chance' },
                ...country.locations.map((l) => ({
                  value: l.id,
                  label: l.name,
                  description: `${l.region}${l.kind === 'rural' ? ' · rural' : ''}`,
                })),
              ]}
            />
            <p className="text-xs text-muted">
              Country figures are approximate baseline values (about {country.source.asOf}). After
              your life begins, the world evolves through simulation, not real-world data.
            </p>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="What kind of family?">
          <fieldset>
            <legend className="sr-only">Starting scenario</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCENARIO_IDS.map((id) => {
                const a = availability[id];
                const available = a?.available ?? false;
                return (
                  <label
                    key={id}
                    className={cn(
                      'flex cursor-pointer flex-col rounded-xl border p-3 text-sm',
                      'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                      scenario === id
                        ? 'border-primary bg-primary-soft'
                        : 'border-border bg-surface',
                      !available && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      type="radio"
                      name="scenario"
                      className="sr-only"
                      checked={scenario === id}
                      disabled={!available}
                      onChange={() => {
                        setScenario(id);
                      }}
                    />
                    <span className="font-semibold text-fg">{t(`scenario.${id}`)}</span>
                    <span className="mt-0.5 text-muted">{t(`scenario.${id}.desc`)}</span>
                    {!available && a?.reasonKey && (
                      <span className="mt-1 text-xs font-medium text-danger">
                        {t(a.reasonKey)}{' '}
                        {id === 'royal'
                          ? country.monarchy.royalNote
                          : id === 'noble'
                            ? country.monarchy.nobilityNote
                            : ''}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {scenario === 'immigrant' && (
            <div className="mt-5">
              <SelectField
                label="Your parents emigrated from"
                value={origin}
                onChange={setOrigin}
                options={[
                  { value: 'any', label: 'Decided by chance' },
                  ...SORTED_COUNTRIES.filter((c) => c.code !== countryCode).map((c) => ({
                    value: c.code,
                    label: c.name,
                  })),
                ]}
              />
            </div>
          )}
          {scenario === 'noble' && (
            <p className="mt-4 text-sm text-muted">{country.monarchy.nobilityNote}</p>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card
          title="Who are you?"
          description="Leave names empty for a name typical of your family's background."
        >
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="First name"
                value={firstName}
                onChange={setFirstName}
                placeholder="Random"
                maxLength={40}
              />
              <TextField
                label="Family name"
                value={lastName}
                onChange={setLastName}
                placeholder="Random"
                maxLength={40}
              />
            </div>
            <ChoiceGroup
              legend="Gender"
              name="gender"
              value={gender}
              onChange={setGender}
              options={[
                { value: 'random', label: 'Random' },
                { value: 'female', label: 'Girl' },
                { value: 'male', label: 'Boy' },
                { value: 'nonbinary', label: 'Non-binary' },
              ]}
            />
            <Switch
              label="Choose my appearance"
              description="Off: you inherit features from your parents. Appearance is cosmetic and never affects your life."
              checked={customLook}
              onChange={setCustomLook}
            />
            {customLook && (
              <div className="grid gap-5 md:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-4">
                  <SwatchGroup
                    legend="Skin tone"
                    name="skin"
                    colors={SKIN_TONES}
                    labels={SKIN_TONES.map((_, i) => `Tone ${String(i + 1)}`)}
                    value={appearance.skinTone}
                    onChange={(skinTone) => {
                      setAppearance({ ...appearance, skinTone });
                    }}
                  />
                  <SwatchGroup
                    legend="Hair colour"
                    name="hair"
                    colors={HAIR_COLORS}
                    labels={HAIR_COLOR_NAMES}
                    value={appearance.hairColor}
                    onChange={(hairColor) => {
                      setAppearance({ ...appearance, hairColor });
                    }}
                  />
                  <SwatchGroup
                    legend="Eye colour"
                    name="eyes"
                    colors={EYE_COLORS}
                    labels={EYE_COLOR_NAMES}
                    value={appearance.eyeColor}
                    onChange={(eyeColor) => {
                      setAppearance({ ...appearance, eyeColor });
                    }}
                  />
                  <SelectField
                    label="Hair style"
                    value={String(appearance.hairStyle)}
                    onChange={(v) => {
                      setAppearance({ ...appearance, hairStyle: Number(v) });
                    }}
                    options={HAIR_STYLE_NAMES.map((name, i) => ({ value: String(i), label: name }))}
                  />
                  <ChoiceGroup
                    legend="Face shape"
                    name="face"
                    value={String(appearance.faceShape)}
                    onChange={(v) => {
                      setAppearance({ ...appearance, faceShape: Number(v) });
                    }}
                    options={FACE_SHAPE_NAMES.map((name, i) => ({ value: String(i), label: name }))}
                  />
                  <Switch
                    label="Freckles"
                    checked={appearance.freckles}
                    onChange={(freckles) => {
                      setAppearance({ ...appearance, freckles });
                    }}
                  />
                  <div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setAppearance(randomAppearance());
                      }}
                    >
                      <Dices aria-hidden="true" className="size-4" /> Randomise look
                    </Button>
                  </div>
                </div>
                <figure className="flex flex-col items-center gap-2">
                  <div className="flex items-end gap-2">
                    <Avatar
                      appearance={appearance}
                      stage="baby"
                      ageYears={0}
                      className="size-20"
                      label="Preview as a baby"
                    />
                    <Avatar
                      appearance={appearance}
                      stage="youngAdult"
                      ageYears={25}
                      className="size-24"
                      label="Preview at 25"
                    />
                    <Avatar
                      appearance={appearance}
                      stage="senior"
                      ageYears={78}
                      className="size-20"
                      label="Preview at 78"
                    />
                  </div>
                  <figcaption className="text-xs text-muted">Baby, 25 and 78</figcaption>
                </figure>
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="Game rules">
          <div className="flex flex-col gap-6">
            <ChoiceGroup
              legend="Difficulty"
              name="difficulty"
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTIES.map((d) => ({
                value: d,
                label: t(`difficulty.${d}`),
                description: t(`difficulty.${d}.desc`),
              }))}
            />
            <Switch
              label="Easy Migration"
              description="Simplifies future visa and relocation decisions in this save. You can change it at any time; it never removes a residency you already have."
              checked={easyMigration}
              onChange={setEasyMigration}
            />
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField
                label="World seed"
                value={seed}
                onChange={setSeed}
                maxLength={64}
                hint="The same seed and choices always produce the same life."
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setSeed(randomSeed());
                }}
              >
                <Dices aria-hidden="true" className="size-4" /> New seed
              </Button>
            </div>
            <TextField
              label="Save name"
              value={saveName}
              onChange={setSaveName}
              placeholder="Your character's name"
              maxLength={80}
            />
            <div className="rounded-xl bg-surface-2 p-3 text-sm text-fg">
              <p>
                <strong>{t(`scenario.${scenario}`)}</strong> in{' '}
                {location ? `${location.name}, ` : ''}
                {country.name} · {t(`difficulty.${difficulty}`)} · Easy Migration{' '}
                {easyMigration ? 'on' : 'off'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {problems.length > 0 && (
        <ul
          role="alert"
          className="list-disc rounded-xl border border-danger/40 p-3 pl-8 text-sm text-danger"
        >
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          Could not start this life: {error}
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="secondary"
          disabled={step === 0}
          onClick={() => {
            setStep(step - 1);
          }}
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => {
              setStep(step + 1);
            }}
          >
            Next <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        ) : (
          <Button size="lg" disabled={submitting || problems.length > 0} onClick={start}>
            <Sparkles aria-hidden="true" className="size-5" /> Start life
          </Button>
        )}
      </div>
    </div>
  );
}
