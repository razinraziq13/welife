import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Battery,
  Brain,
  Briefcase,
  CalendarDays,
  BookOpen,
  ChevronRight,
  Crown,
  GraduationCap,
  Heart,
  LayoutGrid,
  MapPin,
  Smile,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { GameView } from '@engine/view';
import { Avatar } from '@app/components/avatar/Avatar';
import { t } from '@app/i18n/en';
import {
  displayValue,
  formatAge,
  formatMonth,
  formatShortMonth,
  storyText,
} from '@app/i18n/format';
import { Money } from '@app/components/Money';
import { fromMonthIndex, monthIndex } from '@engine/core/clock';
import { cn } from '@app/lib/cn';

/** What the player is doing now: their job, their school, or their stage of life. */
export function occupationLine(view: GameView): string {
  const job = view.work.job;
  if (job) return `${job.title} · ${job.employer}`;
  const school = view.education.current;
  if (school) return `${school.programName ?? school.stageName} · ${school.institution}`;
  return t(`stage.${view.character.stage}`);
}

const HEADLINE = [
  { key: 'health', icon: Heart, tone: 'text-danger' },
  { key: 'happiness', icon: Smile, tone: 'text-accent-strong' },
  { key: 'intelligence', icon: Brain, tone: 'text-primary' },
  { key: 'energy', icon: Battery, tone: 'text-success' },
] as const;

/** Four headline stats with an icon, the number as text and a decorative bar. */
export function HeadlineStats({ view }: { view: GameView }) {
  const stats = view.character.stats;
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" aria-label="Headline stats">
      {HEADLINE.map(({ key, icon: Icon, tone }) => {
        const value = displayValue(stats[key]);
        return (
          <li key={key} className="min-w-0">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-fg">
                <Icon aria-hidden="true" className={cn('size-4 shrink-0', tone)} />
                <span className="truncate">{t(`stat.${key}`)}</span>
              </span>
              <span className="font-semibold tabular-nums text-fg">{value}</span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  value >= 60 ? 'bg-success' : value <= 30 ? 'bg-danger' : 'bg-primary',
                )}
                style={{ width: `${String(Math.max(2, value))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const GLANCE = [
  {
    key: 'health',
    label: 'Health',
    icon: Heart,
    tone: 'wl-tone-health',
    icolor: 'text-danger',
    bar: 'bg-success',
  },
  {
    key: 'happiness',
    label: 'Happiness',
    icon: Smile,
    tone: 'wl-tone-happiness',
    icolor: 'text-accent-strong',
    bar: 'bg-accent',
  },
  {
    key: 'intelligence',
    label: 'Mind',
    icon: Brain,
    tone: 'wl-tone-mind',
    icolor: 'text-[#6a4fc9]',
    bar: 'bg-[#8b74e6]',
  },
] as const;

/** The top of the Life tab: an illustrated scene with who you are, then three wellbeing meters. */
export function LifeHero({ view, base }: { view: GameView; base: string }) {
  const c = view.character;
  const generation = view.legacy.generation;
  const checking = view.finance.personal?.checking ?? null;
  // Text sits on the light illustration, so it keeps dark ink in both themes.
  const pill =
    'inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-[#173a40]';
  return (
    <>
      <section
        aria-labelledby="life-hero-name"
        className="relative overflow-hidden rounded-[1.75rem] border border-border shadow-md"
      >
        <div aria-hidden="true" className="wl-town-scene absolute inset-0" />
        <div className="relative flex flex-wrap items-center gap-4 px-4 pt-6 pb-5 sm:px-6">
          <Avatar
            appearance={c.appearance}
            stage={c.stage}
            ageYears={c.age.years}
            className="size-24 shrink-0 rounded-full border-[5px] border-white bg-primary-soft shadow-lg sm:size-36"
            label={`Portrait of ${c.displayName}`}
          />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <p className={pill}>
              {generation > 1 ? (
                <>
                  <Crown aria-hidden="true" className="size-4 text-accent-strong" />
                  Generation {generation}
                </>
              ) : (
                <>
                  <Sparkles aria-hidden="true" className="size-4 text-primary" />
                  Your story
                </>
              )}
            </p>
            <h2
              id="life-hero-name"
              className="rounded-xl bg-white/80 px-2 text-2xl leading-tight font-extrabold tracking-tight break-words text-[#102b36] sm:text-3xl"
            >
              {c.displayName}
            </h2>
            <p className={pill}>
              {c.alive ? formatAge(c.age) : `Died at ${String(c.age.years)}`} ·{' '}
              {formatMonth(view.clock)}
            </p>
            <p className={pill}>
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0">
                {c.location.name}, {view.country.name}
              </span>
            </p>
            <p className={pill}>
              <Briefcase aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0">{occupationLine(view)}</span>
            </p>
          </div>
          <div className="flex w-full justify-end">
            <Link
              to={`${base}/character`}
              className="ms-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-fg shadow-md hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <UserRound aria-hidden="true" className="size-4" />
              Profile
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>
      <section
        aria-label="Wellbeing"
        className="rounded-[1.75rem] border border-border bg-surface p-3 shadow-sm sm:p-4"
      >
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          {GLANCE.map(({ key, label, icon: Icon, tone, icolor, bar }) => {
            const value = displayValue(view.character.stats[key]);
            return (
              <li key={key} className={cn('min-w-0 rounded-2xl p-2 sm:p-3', tone)}>
                <p className="flex items-center gap-1 text-xs font-bold text-fg sm:gap-1.5 sm:text-sm">
                  <Icon aria-hidden="true" className={cn('size-5 shrink-0', icolor)} />
                  <span className="truncate">{label}</span>
                </p>
                <div
                  aria-hidden="true"
                  className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/10"
                >
                  <div
                    className={cn('h-full rounded-full', bar)}
                    style={{ width: `${String(Math.max(2, value))}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right text-lg font-extrabold tabular-nums text-fg">
                  {value}%
                </p>
              </li>
            );
          })}
        </ul>
        {checking !== null && (
          <p className="mt-3 flex items-center justify-between gap-2 border-t border-border px-1 pt-3 text-sm">
            <span className="flex items-center gap-2 text-muted">
              <Wallet aria-hidden="true" className="size-4" />
              Current account
            </span>
            <Money minor={checking} currency={view.finance.currency} className="font-semibold" />
          </p>
        )}
      </section>
    </>
  );
}

interface ActionTile {
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
  to?: string;
  onClick?: () => void;
}

function Tile({ tile }: { tile: ActionTile }) {
  const Icon = tile.icon;
  const [bg, ink] = tile.tone.split(' ');
  const body: ReactNode = (
    <>
      <span
        className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-sm"
        aria-hidden="true"
      >
        <Icon className={cn('size-7', ink)} />
      </span>
      <span className="block font-bold text-fg">{tile.label}</span>
      <span className="block text-xs text-muted">{tile.hint}</span>
    </>
  );
  // Pastel tile: icon badge, title and hint (illustrated redesign).
  const className = cn(
    'flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-3xl border border-border px-2 py-4 text-center shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none',
    bg,
  );
  return tile.to ? (
    <Link to={tile.to} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={tile.onClick} className={className}>
      {body}
    </button>
  );
}

/** "What do you want to do?": one tap to each part of life. */
export function ActionGrid({ view, base }: { view: GameView; base: string }) {
  // Before working age (or while studying without a job) this part of life is school.
  const studying =
    view.work.job === null && (view.education.current !== null || !view.work.canWork);
  const tiles: ActionTile[] = [
    {
      label: 'Activities',
      hint: 'Spend your free time',
      icon: Sparkles,
      tone: 'wl-tone-gold text-accent-strong',
      to: base + '/activities',
    },
    {
      label: studying ? 'School' : 'Career',
      hint: studying ? 'Grades, clubs, study' : 'Jobs and career',
      icon: studying ? GraduationCap : Briefcase,
      tone: 'wl-tone-sky text-[#1b6f9c]',
      to: `${base}/career`,
    },
    {
      label: 'Social',
      hint: 'Family and friends',
      icon: Users,
      tone: 'wl-tone-rose text-danger',
      to: `${base}/social`,
    },
    {
      label: 'Money',
      hint: 'Accounts, investments and shopping',
      icon: Wallet,
      tone: 'wl-tone-sand text-[#8a5a2b]',
      to: `${base}/finance`,
    },
    {
      label: 'Calendar',
      hint: 'Plans and dates',
      icon: CalendarDays,
      tone: 'wl-tone-lilac text-[#6a4fc9]',
      to: `${base}/calendar`,
    },
    {
      label: 'More',
      hint: 'Legacy, world, media',
      icon: LayoutGrid,
      tone: 'wl-tone-stone text-fg',
      to: `${base}/more`,
    },
  ];
  return (
    <section aria-labelledby="action-grid-title">
      <h2 id="action-grid-title" className="text-xl font-extrabold tracking-tight text-fg">
        What do you want to do?
      </h2>
      <p className="mb-3 text-sm text-muted">Choose your next chapter</p>
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Tile tile={tile} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Biography categories too routine for the headline story (they stay in the full life story). */
const QUIET_CATEGORIES = new Set(['activity', 'rules', 'achievement']);

/** The latest moments of the player's life, newest first, with a link to the whole story. */
export function StoryFeed({
  view,
  base,
  limit = 3,
}: {
  view: GameView;
  base: string;
  limit?: number;
}) {
  const entries = [...view.feed]
    .reverse()
    .filter((e) => !QUIET_CATEGORIES.has(e.category))
    .slice(0, limit);
  const month = (tick: number) =>
    formatShortMonth(fromMonthIndex(monthIndex(view.clock) - (view.tick - tick)));
  return (
    <section
      aria-labelledby="story-feed-title"
      className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="story-feed-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
          <BookOpen aria-hidden="true" className="size-5 text-primary" />
          Your story
        </h2>
        <Link
          to={`${base}/character`}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Whole story
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Your story is just beginning.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <span className="w-16 shrink-0 pt-0.5 text-xs text-muted">{month(entry.tick)}</span>
              <span className="min-w-0 text-fg">{storyText(entry)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
