import { activeCharacter } from '../core/world';
import type { World } from '../state/schema';
import {
  ACTIVITIES,
  findActivity,
  listActivities,
  performActivity,
  type ActivityResult,
} from './activities';
import {
  HUB_OF,
  LIFESTYLE,
  LIFESTYLE_MESSAGES,
  findLifestyle,
  lifestyleBlock,
  lifestyleCost,
  performLifestyle,
  recommendations,
  timesThisMonth,
  type HubCategory,
  type Recommendation,
} from './lifestyle';

/**
 * The Activities Hub (gameplay expansion, feature 8): one list of everything a person can do
 * in their free time, from the original personal activities and the lifestyle activities,
 * with categories, costs, reasons when unavailable, plans and suggestions.
 */

export function isKnownActivity(id: string): boolean {
  return findActivity(id) !== undefined || findLifestyle(id) !== undefined;
}

/** Hours one attempt of any activity takes (for calendar planning). */
export function activityHours(id: string): number {
  return findActivity(id)?.hours ?? findLifestyle(id)?.hours ?? 0;
}

export function isPlannable(id: string): boolean {
  return findActivity(id) !== undefined || findLifestyle(id)?.recurring === true;
}

/**
 * Runs one attempt for a calendar plan. Lifestyle activities that cannot be done (no time,
 * no money) report 'no-time' so the plan skips them, as with personal activities.
 */
export function performPlanned(world: World, id: string): ActivityResult['status'] {
  if (findActivity(id)) return performActivity(world, id).status;
  const c = activeCharacter(world);
  const block = lifestyleBlock(world, c, id);
  if (block) return block === 'tooYoung' ? 'too-young' : 'no-time';
  performLifestyle(world, id);
  return 'done';
}

export interface HubItem {
  id: string;
  kind: 'activity' | 'lifestyle';
  category: HubCategory;
  hours: number;
  energy: number;
  costMinor: bigint;
  available: boolean;
  reason: string | null;
  recurring: boolean;
  planned: boolean;
  /** Personal projects: percent complete (null otherwise). */
  progress: number | null;
  timesThisMonth: number;
}

export interface HubView {
  items: HubItem[];
  recommendations: Recommendation[];
}

const ACTIVITY_REASON: Record<string, string> = {
  'too-young': 'You are too young for this.',
  'too-old': 'You have outgrown this.',
  'no-time': 'You have no free time left this month.',
};

export function projectHub(world: World): HubView {
  const c = activeCharacter(world);
  const planned = new Set(world.calendar.plans.map((p) => p.activityId));
  const personal: HubItem[] = listActivities(world).map((a) => ({
    id: a.id,
    kind: 'activity',
    category: HUB_OF[a.id] ?? 'learning',
    hours: a.hours,
    energy: a.energy,
    costMinor: 0n,
    available: a.available,
    reason: a.reason ? (ACTIVITY_REASON[a.reason] ?? null) : null,
    recurring: true,
    planned: planned.has(a.id),
    progress: null,
    timesThisMonth: a.timesThisMonth,
  }));
  const lifestyle: HubItem[] = LIFESTYLE.map((d) => {
    const block = lifestyleBlock(world, c, d.id);
    return {
      id: d.id,
      kind: 'lifestyle',
      category: d.hub,
      hours: d.hours,
      energy: d.energy,
      costMinor: lifestyleCost(world, c, d),
      available: block === null,
      reason: block ? LIFESTYLE_MESSAGES[block] : null,
      recurring: d.recurring,
      planned: planned.has(d.id),
      progress: d.project ? (c.projects[d.id] ?? 0) : null,
      timesThisMonth: timesThisMonth(world, d.id),
    };
  });
  const items = [...personal, ...lifestyle];
  const open = new Set(items.filter((i) => i.available).map((i) => i.id));
  return {
    items,
    recommendations:
      world.lifeStatus === 'alive' ? recommendations(world, c, (id) => open.has(id)) : [],
  };
}

export { ACTIVITIES };
