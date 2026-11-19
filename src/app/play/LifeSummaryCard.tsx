import type { ReactNode } from 'react';
import { Award, Briefcase, Crown, Globe2, GraduationCap, Users, Wallet } from 'lucide-react';
import type { GameView } from '@engine/view';
import { Money } from '@app/components/Money';
import { t } from '@app/i18n/en';
import { formatMonth, storyText } from '@app/i18n/format';

const DEGREE_NAMES: Record<string, string> = {
  master: 'master’s',
  bachelor: 'bachelor’s',
  diploma: 'diploma',
  upperSecondary: 'secondary school',
  none: 'no',
};

const EDUCATION_LABELS: Record<string, string> = {
  master: 'Master’s degree',
  bachelor: 'Bachelor’s degree',
  diploma: 'Diploma',
  upperSecondary: 'Secondary school',
  none: 'None yet',
};

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Award;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
      <div className="min-w-0 text-sm">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-semibold text-fg">{value}</dd>
      </div>
    </div>
  );
}

/**
 * The story of a life that has just ended (roadmap 04): its title, a few facts and the moments
 * that defined it. Everything comes from what the game recorded; nothing is invented.
 */
export function LifeSummaryCard({ view }: { view: GameView }) {
  const s = view.legacy.lifeSummary;
  if (!s) return null;
  const f = s.facts;
  const params = {
    countries: f.countries,
    children: f.children,
    grandchildren: f.grandchildren,
    jobs: f.jobs,
    friends: f.friends,
    businessesFounded: f.businessesFounded,
    degreeName: DEGREE_NAMES[f.degree] ?? f.degree,
    followers: f.followers.toLocaleString('en'),
  };
  return (
    <section
      aria-labelledby="life-summary-title"
      className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"
    >
      <div className="bg-linear-to-br from-primary/30 via-primary-soft to-accent/35 px-4 py-5 sm:px-6">
        <p className="text-sm text-muted">
          {s.name} · {formatMonth(s.born)}
          {s.died ? ` – ${formatMonth(s.died)}` : ''} · aged {f.ageYears}
        </p>
        <h2
          id="life-summary-title"
          className="mt-1 flex items-center gap-2 text-2xl font-bold text-fg"
        >
          <Award aria-hidden="true" className="size-6 shrink-0 text-accent-strong" />
          {t(`lifeTitle.${s.title}`)}
        </h2>
        <p className="mt-1 text-fg">{t(`lifeTitle.${s.title}.why`, params)}</p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-fg">
          <Crown aria-hidden="true" className="size-3.5 text-accent-strong" />
          Generation {s.generation}
        </p>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Fact icon={Globe2} label="Countries lived in" value={Math.max(1, f.countries)} />
          <Fact icon={Users} label="Children" value={f.children} />
          <Fact icon={Briefcase} label="Jobs" value={f.jobs} />
          <Fact
            icon={GraduationCap}
            label="Education"
            value={EDUCATION_LABELS[f.degree] ?? f.degree}
          />
          <Fact icon={Users} label="Close friends" value={f.friends} />
          {s.peakNetWorthMinor !== null && (
            <Fact
              icon={Wallet}
              label="Highest net worth"
              value={<Money minor={s.peakNetWorthMinor} currency={s.currency} />}
            />
          )}
        </dl>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-fg">Moments that defined this life</h3>
          {s.milestones.length === 0 ? (
            <p className="text-sm text-muted">A life that had only just begun.</p>
          ) : (
            <ol className="flex flex-col gap-2 border-l-2 border-primary-soft pl-4 text-sm">
              {s.milestones.map((m) => (
                <li key={m.id} className="text-fg">
                  {storyText(m)}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
