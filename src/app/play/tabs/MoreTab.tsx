import { Link } from 'react-router';
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  Crown,
  GitBranch,
  Globe,
  HeartPulse,
  Home,
  Landmark,
  LogOut,
  Megaphone,
  Network,
  Scale,
  Settings,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react';
import { PageHeader } from '@app/components/PageHeader';
import { Card } from '@app/components/ui/card';
import { useGameStore } from '@app/stores/gameStore';

export function MoreTab() {
  const session = useGameStore((s) => s.session);
  const close = useGameStore((s) => s.close);
  if (!session) return null;
  const base = `/play/${session.saveId}`;
  const items = [
    {
      to: `${base}/character`,
      label: 'Character details',
      desc: 'Stats, needs, skills and your life story',
      icon: UserRound,
    },
    {
      to: `${base}/calendar`,
      label: 'Calendar',
      desc: 'Your month, recurring plans, bookings and the year ahead',
      icon: CalendarDays,
    },
    {
      to: `${base}/shopping`,
      label: 'Shopping',
      desc: 'Homes, cars, aeroplanes and helicopters',
      icon: ShoppingBag,
    },
    {
      to: `${base}/business`,
      label: 'Business',
      desc: 'Start, run, grow and sell companies',
      icon: Building2,
    },
    {
      to: `${base}/property`,
      label: 'Property',
      desc: 'Let, renovate and sell homes and premises you own',
      icon: Home,
    },
    {
      to: `${base}/legacy`,
      label: 'Legacy',
      desc: 'Your family line, heirs, your will and inheritances',
      icon: Crown,
    },
    {
      to: `${base}/achievements`,
      label: 'Achievements and biography',
      desc: 'What you have achieved and your detailed life story',
      icon: Trophy,
    },
    {
      to: `${base}/media`,
      label: 'Social media',
      desc: 'Posts, followers, sponsorships and trends',
      icon: Megaphone,
    },
    {
      to: `${base}/world`,
      label: 'World and migration',
      desc: 'Citizenship, visas, country rules and moving abroad',
      icon: Globe,
    },
    {
      to: `${base}/health`,
      label: 'Health care',
      desc: 'Conditions, treatment and your cover',
      icon: HeartPulse,
    },
    {
      to: `${base}/politics`,
      label: 'Politics and public life',
      desc: 'Parties, elections, office and public duties',
      icon: Landmark,
    },
    {
      to: `${base}/military`,
      label: 'Military service',
      desc: 'Conscription, enlisting and your service record',
      icon: Shield,
    },
    {
      to: `${base}/legal`,
      label: 'Law',
      desc: 'Legal cases, lawyers and the law where you live',
      icon: Scale,
    },
    {
      to: `${base}/religion`,
      label: 'Religion and belief',
      desc: 'Your beliefs and community life',
      icon: Sparkles,
    },
    {
      to: `${base}/family`,
      label: 'Family tree',
      desc: 'Your ancestors, relatives and descendants',
      icon: Network,
    },
    {
      to: `${base}/timeline`,
      label: 'Timeline and rewind',
      desc: `Monthly history · ${session.branch.name}`,
      icon: GitBranch,
    },
    {
      to: `${base}/notifications`,
      label: 'Notifications',
      desc: `${String(session.view.unreadCount)} unread`,
      icon: Bell,
    },
    {
      to: `${base}/rules`,
      label: 'Game rules',
      desc: 'Difficulty and Easy Migration for this life',
      icon: SlidersHorizontal,
    },
    {
      to: '/settings',
      label: 'Settings',
      desc: 'Theme, text size, motion and shortcuts',
      icon: Settings,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="More" />
      <Card>
        <ul className="divide-y divide-border">
          {items.map(({ to, label, desc, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-surface-2"
              >
                <Icon aria-hidden="true" className="size-5 text-muted" />
                <span className="flex-1">
                  <span className="block font-medium text-fg">{label}</span>
                  <span className="block text-sm text-muted">{desc}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 text-muted" />
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/"
              onClick={close}
              className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-surface-2"
            >
              <LogOut aria-hidden="true" className="size-5 text-muted" />
              <span className="flex-1">
                <span className="block font-medium text-fg">Back to your lives</span>
                <span className="block text-sm text-muted">Everything is saved automatically</span>
              </span>
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
