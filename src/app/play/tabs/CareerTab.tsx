import { useId, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { Switch } from '@app/components/ui/switch';
import { SegmentBar } from '@app/components/ui/segment-bar';
import { Briefcase, Clapperboard, GraduationCap, Search, Signpost, Sparkles } from 'lucide-react';
import { ActingSection } from './ActingSection';
import { t } from '@app/i18n/en';
import { clubName, formatShortMonth, qualificationName } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { HABIT_KEYS, SKILL_KEYS, STUDY_EFFORTS, WORK_EFFORTS } from '@engine/state/schema';
import type { GameView } from '@engine/view';
import { ActivityList } from '../ActivityList';
import { tickToMonth } from '../widgets';
import { CareerPlayCard } from '../CareerPlay';
import { ActionButton } from '../ActionButton';

function habitLevel(value: number): string {
  if (value >= 70) return 'Strong habit';
  if (value >= 40) return 'Regular';
  if (value >= 15) return 'Forming';
  return 'Not yet a habit';
}

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  const alive = useGameStore((s) => s.session?.view.lifeStatus === 'alive');
  const blocked = pending
    ? 'Make the waiting decision first.'
    : !alive
      ? 'This life has ended.'
      : null;
  return { send, disabled: busy || blocked !== null, blocked };
}

function monthOf(view: GameView, tick: number): string {
  return formatShortMonth(tickToMonth(view, tick));
}

function EducationCard({ view }: { view: GameView }) {
  const { send, disabled, blocked } = useAct();
  const [leaving, setLeaving] = useState(false);
  const edu = view.education;
  const current = edu.current;
  const currency = view.country.currency;
  return (
    <Card
      title="Education"
      description={current ? undefined : 'You are not enrolled anywhere right now.'}
    >
      {current ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-semibold text-fg">
              {current.stage === 'tertiary' && current.programName
                ? `${t(`level.${current.level}`)} in ${current.programName}`
                : current.stageName}
            </p>
            <p className="text-sm text-muted">
              {current.institution} · {current.kind === 'private' ? 'Private' : 'Public'}
              {current.stage !== 'preschool' &&
                ` · Year ${String(Math.min(current.years, current.yearsCompleted + 1))} of ${String(current.years)}`}
              {current.scholarshipPercent > 0 &&
                ` · ${String(current.scholarshipPercent)}% scholarship`}
            </p>
          </div>
          {current.stage !== 'preschool' && (
            <>
              <StatBar label="Grade average" value={current.grade} />
              <ChoiceGroup
                legend="Study effort"
                description="Changes your grades, free time and stress from this month."
                name="study-effort"
                value={edu.effort}
                disabled={disabled}
                options={STUDY_EFFORTS.map((e) => ({
                  value: e,
                  label: t(`effort.${e}`),
                  description: t(`effort.${e}.desc`),
                }))}
                onChange={(value) => void send({ type: 'setStudyEffort', value })}
              />
            </>
          )}
          {(edu.fees.school > 0n || edu.fees.tuition > 0n) && (
            <p className="text-sm text-muted">
              Fees this month:{' '}
              {edu.fees.school > 0n && <Money minor={edu.fees.school} currency={currency} />}
              {edu.fees.tuition > 0n && (
                <>
                  <Money minor={edu.fees.tuition} currency={currency} /> tuition
                  {edu.hasStudentLoan ? ' (paid by your student loan)' : ''}
                </>
              )}
            </p>
          )}
          {current.stage === 'tertiary' && edu.studentLoans && !edu.hasStudentLoan && (
            <div>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => void send({ type: 'startStudentLoan' })}
              >
                Pay tuition with a student loan
              </Button>
              <p className="mt-1 text-xs text-muted">
                Repayments start six months after your studies end.
              </p>
            </div>
          )}
          {edu.reports.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-fg">Recent report cards</h3>
              <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                {edu.reports.slice(-6).map((r) => (
                  <li key={r.tick} className="rounded-lg bg-surface-2 px-2 py-1">
                    {monthOf(view, r.tick)}: <strong>{Math.round(r.grade / 10)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || !edu.canLeave}
              onClick={() => {
                setLeaving(true);
              }}
            >
              {current.stage === 'tertiary' ? 'Leave your course' : 'Leave school'}
            </Button>
            {!edu.canLeave && (
              <p className="mt-1 text-xs text-muted">
                You can leave school from the age of {edu.leavingAge}.
              </p>
            )}
            {blocked && <p className="mt-1 text-xs text-muted">{blocked}</p>}
          </div>
          <ConfirmDialog
            open={leaving}
            onOpenChange={setLeaving}
            title={current.stage === 'tertiary' ? 'Leave your course?' : 'Leave school?'}
            confirmLabel="Leave"
            tone="danger"
            onConfirm={() => send({ type: 'leaveSchool' })}
          >
            You will not finish this stage or earn its qualification. You can apply to study again
            later.
          </ConfirmDialog>
        </div>
      ) : (
        <p className="text-sm text-fg">
          {view.character.age.years < 3
            ? 'School starts when you are older.'
            : 'School years start in the month shown on your calendar.'}
        </p>
      )}
      {edu.qualifications.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-fg">Qualifications</h3>
          <ul className="mt-1 flex flex-wrap gap-2 text-sm">
            {edu.qualifications.map((q) => (
              <li key={q} className="rounded-lg bg-primary-soft px-2 py-1 text-fg">
                {qualificationName(q, view.character.countryCode)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {edu.awards.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-fg">Awards</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-fg">
            {edu.awards.slice(-8).map((a) => (
              <li key={a.id}>
                {a.key === 'award.competition'
                  ? `${t(`place.${String(a.params.place)}`)} place, ${clubName(String(a.params.clubId))} (${monthOf(view, a.tick)})`
                  : `${String(a.params.percent)}% scholarship (${monthOf(view, a.tick)})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ClubsCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const clubs = view.education.clubs;
  const currency = view.country.currency;
  const visible = clubs.filter(
    (c) => c.member || c.block === null || c.block === 'clubFull' || c.block === 'notStudying',
  );
  if (view.character.age.years < 6) return null;
  return (
    <Card
      title="Clubs"
      description="Clubs take a few hours a month, build skills and friendships, and hold yearly competitions."
    >
      {visible.length === 0 ? (
        <p className="text-sm text-muted">No clubs are open to you right now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((club) => (
            <li key={club.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">
                  {club.name}
                  {club.member && (
                    <span className="ml-2 rounded bg-primary-soft px-1.5 text-xs">Member</span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {club.hours} h a month
                  {club.feeMinor > 0n && (
                    <>
                      {' · '}
                      <Money minor={club.feeMinor} currency={currency} /> a month
                    </>
                  )}
                  {club.competition && ` · ${club.competition}`}
                </p>
                {!club.member && club.block && (
                  <p className="text-xs text-muted">{t(`eduBlock.${club.block}`)}</p>
                )}
              </div>
              {club.member ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void send({ type: 'leaveClub', clubId: club.id })}
                  aria-label={`Leave ${club.name}`}
                >
                  Leave
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || club.block !== null}
                  onClick={() => void send({ type: 'joinClub', clubId: club.id })}
                  aria-label={`Join ${club.name}`}
                >
                  Join
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FurtherStudyCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const edu = view.education;
  const programId = useId();
  const levelId = useId();
  const [program, setProgram] = useState(edu.programs[0]?.id ?? '');
  const selected = edu.programs.find((p) => p.id === program) ?? edu.programs[0];
  const [level, setLevel] = useState<string>('bachelor');
  if (edu.programs.length === 0 || !selected) return null;
  const levelOption = selected.levels.find((l) => l.level === level) ?? selected.levels[0];
  const open = edu.applications.filter((a) => a.status === 'pending' || a.status === 'accepted');
  const past = edu.applications
    .filter((a) => a.status !== 'pending' && a.status !== 'accepted')
    .slice(-5);
  return (
    <Card
      title="Further study"
      description="Apply to colleges and universities in your final school year or any time after. Decisions depend on your results, skills, awards and competition."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={programId} className="text-sm font-medium text-fg">
            Programme
          </label>
          <select
            id={programId}
            value={selected.id}
            onChange={(e) => {
              setProgram(e.target.value);
            }}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
          >
            {edu.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={levelId} className="text-sm font-medium text-fg">
            Level
          </label>
          <select
            id={levelId}
            value={levelOption?.level ?? ''}
            onChange={(e) => {
              setLevel(e.target.value);
            }}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
          >
            {selected.levels.map((l) => (
              <option key={l.level} value={l.level}>
                {t(`level.${l.level}`)}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="secondary"
          disabled={disabled || levelOption?.block !== null}
          onClick={() => {
            if (levelOption)
              void send({ type: 'applyStudy', programId: selected.id, level: levelOption.level });
          }}
        >
          Apply
        </Button>
      </div>
      {levelOption?.block && (
        <p className="mt-2 text-sm text-muted">{t(`eduBlock.${levelOption.block}`)}</p>
      )}
      {open.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {open.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-fg">
                  {a.programName} · {t(`level.${a.level}`)}
                </p>
                <p className="text-muted">
                  {t(`studyStatus.${a.status}`)}
                  {a.status === 'pending' && ` · decision ${monthOf(view, a.decisionTick)}`}
                  {a.status === 'accepted' &&
                    a.scholarshipPercent > 0 &&
                    ` · ${String(a.scholarshipPercent)}% scholarship`}
                  {a.status === 'accepted' && ` · reply by ${monthOf(view, a.decisionTick + 3)}`}
                </p>
              </div>
              {a.status === 'accepted' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      void send({ type: 'respondStudy', applicationId: a.id, accept: true })
                    }
                    aria-label={`Accept ${a.programName}`}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      void send({ type: 'respondStudy', applicationId: a.id, accept: false })
                    }
                    aria-label={`Decline ${a.programName}`}
                  >
                    Decline
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Earlier:{' '}
          {past
            .map((a) => `${a.programName} (${t(`studyStatus.${a.status}`).toLowerCase()})`)
            .join(', ')}
        </p>
      )}
    </Card>
  );
}

function JobCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const [confirm, setConfirm] = useState<'quit' | 'retire' | null>(null);
  const job = view.work.job;
  const currency = view.country.currency;
  const base = `/play/${useGameStore.getState().saveId ?? ''}`;
  if (!job) {
    return (
      <Card title="Work">
        <p className="text-sm text-fg">
          {view.work.retired
            ? 'You are retired.'
            : view.work.canWork
              ? 'You do not have a job. The job board below lists openings near you.'
              : `You can start working part-time from the age of ${String(view.work.minWorkAge)}.`}
        </p>
        {view.work.canRetire && (
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              setConfirm('retire');
            }}
          >
            Retire
          </Button>
        )}
        <ConfirmDialog
          open={confirm === 'retire'}
          onOpenChange={(o) => {
            setConfirm(o ? 'retire' : null);
          }}
          title="Retire?"
          confirmLabel="Retire"
          onConfirm={() => send({ type: 'retire' })}
        >
          Retiring ends any job search. Your retirement savings start paying you a monthly income,
          and the state pension starts at {view.finance.statePensionAge}.
        </ConfirmDialog>
      </Card>
    );
  }
  const raiseWait = job.raiseAvailableTick > view.tick;
  return (
    <Card title="Your job">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-lg font-semibold text-fg">{job.title}</p>
          <p className="text-sm text-muted">
            {job.employer} · {job.industry} · {t(`contract.${job.contract}`)} · {job.hours} h a
            month
          </p>
          <p className="text-sm text-fg">
            <Money minor={job.salaryMinor} currency={currency} /> a month before tax · since{' '}
            {monthOf(view, job.startTick)}
          </p>
          {job.managerId && (
            <p className="text-sm text-muted">
              Manager:{' '}
              <Link
                to={`${base}/people/${job.managerId}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {job.managerName}
              </Link>
            </p>
          )}
          <p className="text-sm text-muted">Next review: {monthOf(view, job.nextReviewTick)}</p>
        </div>
        <StatBar label="Performance" value={job.performance} />
        {job.warnings > 0 && (
          <p role="note" className="rounded-xl bg-surface-2 p-2 text-sm text-danger">
            You have {job.warnings} formal warning{job.warnings === 1 ? '' : 's'}. A third means
            dismissal.
          </p>
        )}
        <ChoiceGroup
          legend="Effort at work"
          name="work-effort"
          value={job.effort as (typeof WORK_EFFORTS)[number]}
          disabled={disabled}
          options={WORK_EFFORTS.map((e) => ({
            value: e,
            label: t(`workEffort.${e}`),
            description: t(`workEffort.${e}.desc`),
          }))}
          onChange={(value) => void send({ type: 'setWorkEffort', value })}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || raiseWait}
            onClick={() => void send({ type: 'requestRaise' })}
          >
            Ask for a raise
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setConfirm('quit');
            }}
          >
            Quit
          </Button>
          {view.work.canRetire && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setConfirm('retire');
              }}
            >
              Retire
            </Button>
          )}
        </div>
        {raiseWait && (
          <p className="text-xs text-muted">
            You can ask again from {monthOf(view, job.raiseAvailableTick)}.
          </p>
        )}
      </div>
      <ConfirmDialog
        open={confirm === 'quit'}
        onOpenChange={(o) => {
          setConfirm(o ? 'quit' : null);
        }}
        title="Quit your job?"
        confirmLabel="Quit"
        tone="danger"
        onConfirm={() => send({ type: 'quitJob' })}
      >
        Your pay stops from next month. People who leave by choice do not usually receive
        unemployment benefit.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'retire'}
        onOpenChange={(o) => {
          setConfirm(o ? 'retire' : null);
        }}
        title="Retire?"
        confirmLabel="Retire"
        onConfirm={() => send({ type: 'retire' })}
      >
        You will leave {job.employer}. Your retirement savings start paying you a monthly income,
        and the state pension starts at {view.finance.statePensionAge}.
      </ConfirmDialog>
    </Card>
  );
}

function JobBoardCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const work = view.work;
  const currency = view.country.currency;
  const ids = { min: useId(), max: useId(), field: useId(), industry: useId(), contract: useId() };
  const [onlyQualified, setOnlyQualified] = useState(false);
  const [onlyExperienced, setOnlyExperienced] = useState(false);
  const [minPay, setMinPay] = useState('');
  const [maxPay, setMaxPay] = useState('');
  const [field, setField] = useState('');
  const [industry, setIndustry] = useState('');
  const [contract, setContract] = useState('');
  if (!work.canWork || work.retired) return null;
  const scale = 10 ** currency.exponent;
  const major = (minor: bigint) => Number(minor) / scale;
  const unique = (xs: (string | null)[]) => [...new Set(xs.filter((x) => x !== null))].sort();
  const shown = work.postings
    .filter(
      (p) =>
        (!onlyQualified || p.block === null) &&
        (!onlyExperienced || p.experiencedHire) &&
        (minPay === '' || major(p.salaryMaxMinor) >= Number(minPay)) &&
        (maxPay === '' || major(p.salaryMinMinor) <= Number(maxPay)) &&
        (field === '' || p.field === field || p.field === null) &&
        (industry === '' || p.industry === industry) &&
        (contract === '' || p.contract === contract),
    )
    // Jobs you can apply for first, then the best paid.
    .sort(
      (a, b) =>
        Number(a.block !== null) - Number(b.block !== null) ||
        major(b.salaryMaxMinor) - major(a.salaryMaxMinor),
    );
  const selectClass = 'h-11 rounded-xl border border-border bg-surface px-3 text-sm text-fg';
  const choose = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
        className={selectClass}
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <Card
      title="Job App"
      description={`Openings near ${view.character.location.name}. New jobs appear every month; each closes after a few months.`}
    >
      {work.postings.length > 0 && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
          <Switch
            label="Only jobs I qualify for"
            checked={onlyQualified}
            onChange={setOnlyQualified}
          />
          <Switch
            label="Executive and specialist openings only"
            checked={onlyExperienced}
            onChange={setOnlyExperienced}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                [ids.min, `Min pay a month (${currency.symbol})`, minPay, setMinPay],
                [ids.max, `Max pay a month (${currency.symbol})`, maxPay, setMaxPay],
              ] as const
            ).map(([id, label, value, set]) => (
              <div key={id} className="flex flex-col gap-1">
                <label htmlFor={id} className="text-sm font-medium text-fg">
                  {label}
                </label>
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={value}
                  onChange={(e) => {
                    set(e.target.value);
                  }}
                  className={selectClass}
                />
              </div>
            ))}
            {choose(
              ids.field,
              'Field of study',
              field,
              setField,
              unique(work.postings.map((p) => p.field)).map((f) => ({ value: f, label: f })),
            )}
            {choose(
              ids.industry,
              'Industry',
              industry,
              setIndustry,
              unique(work.postings.map((p) => p.industry)).map((i) => ({ value: i, label: i })),
            )}
            {choose(
              ids.contract,
              'Contract',
              contract,
              setContract,
              unique(work.postings.map((p) => p.contract)).map((c) => ({
                value: c,
                label: t(`contract.${c}`),
              })),
            )}
          </div>
          <p role="status" className="text-xs text-muted">
            Showing {shown.length} of {work.postings.length} jobs; ones you can apply for come
            first.
          </p>
        </div>
      )}
      {work.postings.length === 0 ? (
        <p className="text-sm text-muted">No openings right now. Check again next month.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">No jobs match these filters.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((p) => {
            const reason = p.applied
              ? 'You have applied.'
              : p.block
                ? t(`jobBlock.${p.block}`)
                : null;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-fg">{p.title}</p>
                  <p className="text-muted">
                    {p.employer} · {p.industry} · {t(`contract.${p.contract}`)} · {p.hours} h
                  </p>
                  <p className="text-fg">
                    <Money minor={p.salaryMinMinor} currency={currency} /> –{' '}
                    <Money minor={p.salaryMaxMinor} currency={currency} /> a month
                  </p>
                  <p className="text-xs text-muted">
                    Needs: {t(`education.${p.education}`)}
                    {p.field ? ` (${p.field})` : ''} · {p.applicants} other applicants · closes{' '}
                    {monthOf(view, p.expiresTick)}
                  </p>
                  {p.experienceNeeded > 0 && (
                    <p className="text-xs text-muted">
                      Requires {p.experienceNeeded / 12}{' '}
                      {p.experienceNeeded === 12 ? 'year' : 'years'} in {p.industry.toLowerCase()}.
                    </p>
                  )}
                  {reason && <p className="text-xs font-medium text-muted">{reason}</p>}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || reason !== null}
                  onClick={() => void send({ type: 'applyJob', postingId: p.id })}
                  aria-label={`Apply: ${p.title} at ${p.employer}`}
                >
                  Apply
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ApplicationsCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const currency = view.country.currency;
  const apps = view.work.applications.filter(
    (a) => a.status === 'applied' || a.status === 'interview' || a.status === 'offered',
  );
  const recent = view.work.applications.filter((a) => !apps.includes(a)).slice(0, 5);
  if (apps.length === 0 && recent.length === 0) return null;
  return (
    <Card title="Applications">
      <ul className="divide-y divide-border">
        {apps.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 py-3 text-sm">
            <div>
              <p className="font-semibold text-fg">
                {a.title} · {a.employer}
              </p>
              <p className="text-muted">
                {a.headhunted && a.status === 'offered'
                  ? 'They approached you: a rival company wants to hire you'
                  : t(`jobStatus.${a.status}`)}
                {a.status === 'interview' &&
                  a.interviewTick !== null &&
                  ` · ${monthOf(view, a.interviewTick)} · preparation ${String(a.preparation)}%`}
                {a.referrerName && ` · ${a.referrerName} put in a good word`}
              </p>
              {a.status === 'offered' && a.offerSalaryMinor !== null && (
                <p className="text-fg">
                  Offer: <Money minor={a.offerSalaryMinor} currency={currency} /> a month
                  {a.offerExpiresTick !== null &&
                    ` · reply by ${monthOf(view, a.offerExpiresTick)}`}
                </p>
              )}
              {a.status === 'offered' && a.headhunted && view.work.job && (
                <p className="text-xs text-muted">
                  You earn <Money minor={view.work.job.salaryMinor} currency={currency} /> a month
                  at {view.work.job.employer}. Accepting means leaving that job.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {a.status === 'interview' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || a.preparation >= 100}
                  onClick={() => void send({ type: 'prepareInterview', applicationId: a.id })}
                >
                  Prepare (6 h)
                </Button>
              )}
              {a.status === 'offered' && (
                <>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      void send({ type: 'respondOffer', applicationId: a.id, response: 'accept' })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled || a.negotiated}
                    onClick={() =>
                      void send({
                        type: 'respondOffer',
                        applicationId: a.id,
                        response: 'negotiate',
                      })
                    }
                  >
                    Negotiate
                  </Button>
                  {a.headhunted && view.work.job && (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      busy={disabled}
                      reason={
                        a.counterChance === null
                          ? 'You have already asked your employer to match this offer.'
                          : null
                      }
                      onAct={() =>
                        void send({
                          type: 'respondOffer',
                          applicationId: a.id,
                          response: 'counter',
                        })
                      }
                    >
                      Ask {view.work.job.employer} to match
                      {a.counterChance !== null && ` (${String(a.counterChance)}% chance)`}
                    </ActionButton>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      void send({ type: 'respondOffer', applicationId: a.id, response: 'decline' })
                    }
                  >
                    Decline
                  </Button>
                </>
              )}
              {a.status !== 'offered' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void send({ type: 'withdrawApplication', applicationId: a.id })}
                >
                  Withdraw
                </Button>
              )}
            </div>
            {a.status === 'offered' && a.negotiated && (
              <p className="text-xs text-muted">You have already negotiated this offer.</p>
            )}
          </li>
        ))}
      </ul>
      {recent.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Earlier:{' '}
          {recent
            .map((a) => `${a.title} at ${a.employer} (${t(`jobStatus.${a.status}`).toLowerCase()})`)
            .join('; ')}
        </p>
      )}
    </Card>
  );
}

function HistoryCard({ view }: { view: GameView }) {
  const jobs = view.work.history;
  const schools = view.education.history;
  if (jobs.length === 0 && schools.length === 0) return null;
  return (
    <Card title="History">
      {schools.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-fg">Education</h3>
          <ul className="mt-1 mb-3 text-sm text-fg">
            {schools.map((h) => (
              <li key={h.id}>
                {h.programName ? `${t(`level.${h.level}`)} in ${h.programName}` : h.stageName},{' '}
                {h.institution} ({monthOf(view, h.startTick)} – {monthOf(view, h.endTick)})
                {h.status === 'left' ? ' · left early' : ''}
                {h.examScore !== null ? ` · exam ${String(Math.round(h.examScore / 10))}/100` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {jobs.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-fg">Work</h3>
          <ul className="mt-1 text-sm text-fg">
            {jobs.map((j) => (
              <li key={j.id}>
                {j.title}, {j.employer} ({monthOf(view, j.startTick)} –{' '}
                {j.endTick === null ? 'now' : monthOf(view, j.endTick)})
                {j.endReason ? ` · ${t(`endReason.${j.endReason}`)}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

const SECTIONS = [
  { value: 'job', label: 'Job', icon: Briefcase },
  { value: 'jobapp', label: 'Job App', icon: Search },
  { value: 'paths', label: 'Paths', icon: Signpost },
  { value: 'acting', label: 'Acting', icon: Clapperboard },
  { value: 'study', label: 'Study', icon: GraduationCap },
  { value: 'skills', label: 'Skills', icon: Sparkles },
] as const;
type Section = (typeof SECTIONS)[number]['value'];

export function CareerTab() {
  const session = useGameStore((s) => s.session);
  const [picked, setPicked] = useState<Section | null>(null);
  if (!session) return null;
  const view = session.view;
  const c = view.character;
  const working = c.age.years >= 13;
  // Open where the action is: a waiting offer, else your job, else school.
  const offer = view.work.applications.some((a) => a.status === 'offered');
  const screen = view.work.career.screen;
  const section: Section =
    picked ?? (!working ? 'study' : offer ? 'jobapp' : screen?.isActor ? 'acting' : 'job');
  // Acting appears once you take the actor path (and stays for your filmography).
  const items = working
    ? SECTIONS.filter((x) => x.value !== 'acting' || screen)
    : SECTIONS.filter((x) => x.value === 'study' || x.value === 'skills');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Career"
        description="School, further study and work. What you practise now shapes what you can do later."
      />
      <SegmentBar label="Career sections" items={items} value={section} onChange={setPicked} />
      {section === 'study' && (
        <>
          <EducationCard view={view} />
          <ClubsCard view={view} />
          <FurtherStudyCard view={view} />
        </>
      )}
      {working && section === 'job' && (
        <>
          <JobCard view={view} />
          <CareerPlayCard view={view} base={`/play/${session.saveId}`} />
          {c.age.years >= 18 && (
            <Card title="Your own business">
              <p className="text-sm text-fg">
                {view.enterprise.business.companies.length === 0
                  ? 'Rather work for yourself? Start a company and run it your way.'
                  : `You own ${String(view.enterprise.business.companies.length)} compan${view.enterprise.business.companies.length === 1 ? 'y' : 'ies'}.`}{' '}
                <Link
                  to={`/play/${session.saveId}/business`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Open Business
                </Link>
              </p>
            </Card>
          )}
          <HistoryCard view={view} />
        </>
      )}
      {working && section === 'jobapp' && (
        <>
          <ApplicationsCard view={view} />
          <JobBoardCard view={view} />
        </>
      )}
      {working && section === 'acting' && screen && <ActingSection view={view} screen={screen} />}
      {working && section === 'paths' && <PathsCard view={view} base={`/play/${session.saveId}`} />}
      {section === 'skills' && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Skills">
              {SKILL_KEYS.map((key) => (
                <StatBar key={key} label={t(`skill.${key}`)} value={c.skills[key]} />
              ))}
            </Card>
            <Card
              title="Habits"
              description="Habits form from repeating an activity month after month, and fade if you stop."
            >
              <dl className="divide-y divide-border text-sm">
                {HABIT_KEYS.map((key) => (
                  <div key={key} className="flex justify-between gap-2 py-2">
                    <dt className="text-fg">{t(`habit.${key}`)}</dt>
                    <dd className="text-muted">{habitLevel(c.habits[key])}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
          <Card title="Practise and learn">
            <ActivityList
              filter={(a) =>
                a.category === 'learn' || a.category === 'creative' || a.category === 'health'
              }
            />
          </Card>
        </>
      )}
    </div>
  );
}

const PATH_HINT: Record<string, string> = {
  actor: 'Auditions win film and TV roles; screen credits lead to bigger parts.',
  musician: 'Perform and audition for paid work; practise music to improve.',
  'film-director': 'Shoot short films; good ones earn credits, reputation and festival prizes.',
};

/** Choose a path: the forces, or start freelance as a musician, actor or film director. */
function PathsCard({ view, base }: { view: GameView; base: string }) {
  const { send, disabled } = useAct();
  const [confirm, setConfirm] = useState<(typeof view.work.paths)[number] | null>(null);
  const m = view.civic.military;
  const armyReason = m.current?.status === 'serving' ? null : (m.enlist.enlisted[0] ?? null);
  const job = view.work.job;
  return (
    <Card
      title="Choose a path"
      description="Careers you can start yourself, without a job posting."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        <li className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold text-fg">Army</p>
          <p className="text-muted">
            {m.current?.status === 'serving'
              ? `Serving as ${m.current.rank}. Choose your specialty and posting on the Military page.`
              : 'Enlist in the army, navy or air force: pay, ranks, a specialty and postings.'}
          </p>
          {armyReason && <p className="text-xs text-muted">{armyReason}</p>}
          <Link
            to={`${base}/military`}
            className="inline-flex min-h-11 items-center self-start rounded-xl border border-border px-3 font-medium text-fg hover:bg-primary-soft"
          >
            {m.current?.status === 'serving' ? 'Open Military' : 'Enlist'}
          </Link>
        </li>
        {view.work.paths.map((p) => (
          <li
            key={p.occupationId}
            className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm"
          >
            <p className="font-semibold text-fg">{p.title}</p>
            <p className="text-muted">{PATH_HINT[p.occupationId]}</p>
            <p className="text-xs text-muted">
              Needs {p.skills.map((s) => t(`skill.${s}`).toLowerCase()).join(' and ')}{' '}
              {p.skills.length > 1 ? 'skills averaging' : 'skill of'} {p.minSkill}.
            </p>
            {p.block && <p className="text-xs text-muted">{p.block}</p>}
            <ActionButton
              size="sm"
              variant="secondary"
              className="self-start"
              busy={disabled}
              reason={p.block}
              aria-label={`Start freelancing as ${p.title}`}
              onAct={() => {
                if (job) setConfirm(p);
                else void send({ type: 'startCreativePath', occupationId: p.occupationId });
              }}
            >
              Start freelancing
            </ActionButton>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        title={`Become a ${confirm?.title.toLowerCase() ?? ''}?`}
        confirmLabel="Leave my job and start"
        onConfirm={() =>
          confirm
            ? send({ type: 'startCreativePath', occupationId: confirm.occupationId })
            : undefined
        }
      >
        You will leave your job as {job?.title ?? ''} and start freelancing on a casual contract.
      </ConfirmDialog>
    </Card>
  );
}
