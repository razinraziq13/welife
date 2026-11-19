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
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { GameView } from '@engine/view';
import { Avatar } from '@app/components/avatar/Avatar';
import { t } from '@app/i18n/en';
import { displayValue, formatAge, formatShortMonth, storyText } from '@app/i18n/format';
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

/** The top of the Life tab: who you are, where you are and how you are doing. */
export function LifeHero({ view, base }: { view: GameView; base: string }) {
  const c = view.character;
  const generation = view.legacy.generation;
  return (
    <section
      aria-labelledby="life-hero-name"
      className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"
    >
      <div
        aria-hidden="true"
        className="h-16 bg-linear-to-br from-primary/30 via-primary-soft to-accent/35 sm:h-20"
      />
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="-mt-10 flex items-end gap-4">
          <Avatar
            appearance={c.appearance}
            stage={c.stage}
            ageYears={c.age.years}
            className="size-24 shrink-0 rounded-full border-4 border-surface bg-surface shadow-md sm:size-28"
            label={`Portrait of ${c.displayName}`}
          />
          <div className="min-w-0 flex-1 pb-1">
            {generation > 1 && (
              <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-fg">
                <Crown aria-hidden="true" className="size-3.5 text-accent-strong" />
                Generation {generation}
              </p>
            )}
            <h2
              id="life-hero-name"
              className="text-xl leading-tight font-bold break-words text-fg sm:text-2xl"
            >
              {c.displayName}
            </h2>
            <p className="text-sm text-muted">
              {c.alive ? formatAge(c.age) : `Died at ${String(c.age.years)}`}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1 text-sm text-muted">
          <p className="flex items-start gap-1.5">
            <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{occupationLine(view)}</span>
          </p>
          <p className="flex items-start gap-1.5">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">
              {c.location.name}, {view.country.name}
            </span>
          </p>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <HeadlineStats view={view} />
        </div>
        <Link
          to={`${base}/character`}
          className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary-soft px-4 font-semibold text-fg hover:bg-primary hover:text-primary-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Profile and full stats
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
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
  const body: ReactNode = (
    <>
      <span
        className={cn('flex size-11 items-center justify-center rounded-2xl', tile.tone)}
        aria-hidden="true"
      >
        <Icon className="size-6" />
      </span>
      <span className="text-sm font-semibold text-fg">{tile.label}</span>
      <span className="text-xs text-muted">{tile.hint}</span>
    </>
  );
  const className =
    'flex h-full min-h-28 flex-col items-center justify-start gap-1 rounded-2xl border border-border bg-surface p-3 text-center shadow-sm hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
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
export function ActionGrid({
  view,
  base,
  onActivities,
}: {
  view: GameView;
  base: string;
  onActivities: () => void;
}) {
  // Before working age (or while studying without a job) this part of life is school.
  const studying =
    view.work.job === null && (view.education.current !== null || !view.work.canWork);
  const tiles: ActionTile[] = [
    {
      label: 'Activities',
      hint: 'Spend your free time',
      icon: Sparkles,
      tone: 'bg-accent-soft text-accent-strong',
      onClick: onActivities,
    },
    {
      label: studying ? 'School' : 'Work',
      hint: studying ? 'Grades, clubs, study' : 'Jobs and career',
      icon: studying ? GraduationCap : Briefcase,
      tone: 'bg-primary-soft text-primary',
      to: `${base}/career`,
    },
    {
      label: 'People',
      hint: 'Family and friends',
      icon: Users,
      tone: 'bg-surface-2 text-danger',
      to: `${base}/social`,
    },
    {
      label: 'Money',
      hint: 'Accounts and spending',
      icon: Wallet,
      tone: 'bg-accent-soft text-accent-strong',
      to: `${base}/finance`,
    },
    {
      label: 'Calendar',
      hint: 'Plans and dates',
      icon: CalendarDays,
      tone: 'bg-primary-soft text-primary',
      to: `${base}/calendar`,
    },
    {
      label: 'More',
      hint: 'Legacy, world, media',
      icon: LayoutGrid,
      tone: 'bg-surface-2 text-fg',
      to: `${base}/more`,
    },
  ];
  return (
    <section aria-labelledby="action-grid-title">
      <h2 id="action-grid-title" className="mb-3 text-lg font-semibold text-fg">
        What do you want to do?
      </h2>
      <ul className="grid grid-cols-3 gap-3 lg:grid-cols-6">
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
