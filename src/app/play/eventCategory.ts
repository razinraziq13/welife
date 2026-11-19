import {
  Baby,
  Backpack,
  Briefcase,
  Building2,
  GraduationCap,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  MessagesSquare,
  Sparkles,
  Store,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icon and label for each kind of life event (decision dialog). Content packs may use their
 * own category names; those fall back to FALLBACK_CATEGORY.
 */
export const EVENT_CATEGORY: Record<string, { icon: LucideIcon; label: string }> = {
  childhood: { icon: Baby, label: 'Childhood' },
  teen: { icon: Backpack, label: 'Growing up' },
  adult: { icon: UserRound, label: 'Adult life' },
  health: { icon: HeartPulse, label: 'Health' },
  family: { icon: Users, label: 'Family' },
  personal: { icon: Sparkles, label: 'Personal' },
  school: { icon: GraduationCap, label: 'School' },
  social: { icon: MessagesSquare, label: 'Friends' },
  work: { icon: Briefcase, label: 'Work' },
  money: { icon: Wallet, label: 'Money' },
  romance: { icon: Heart, label: 'Romance' },
  business: { icon: Store, label: 'Business' },
  property: { icon: Home, label: 'Home and property' },
  civic: { icon: Landmark, label: 'Public life' },
};

export const FALLBACK_CATEGORY = { icon: Building2, label: 'Life' };
