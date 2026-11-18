import { clamp, sortedValues } from '../core/data';
import { nextId, withRng } from '../core/world';
import {
  INTEREST_KEYS,
  type Character,
  type Relationship,
  type RelationType,
  type World,
} from '../state/schema';

/**
 * Relationships (spec §4 Relationships): directed edges stored in pairs, with type, trust,
 * closeness, respect, chemistry (compatibility), shared history, conflict and last contact.
 * Family roles are derived from family links so they can never contradict the family tree.
 */

export const FAMILY_TYPES: ReadonlySet<RelationType> = new Set([
  'parent',
  'child',
  'sibling',
  'grandparent',
  'grandchild',
  'auntUncle',
  'nieceNephew',
  'cousin',
]);

/** Compatibility from personality similarity and shared interests (PROPOSED TUNING). */
export function chemistryBetween(world: World, a: Character, b: Character): number {
  const similarity =
    100 -
    Math.floor(
      (Math.abs(a.traits.openness - b.traits.openness) +
        Math.abs(a.traits.extraversion - b.traits.extraversion) +
        Math.abs(a.traits.agreeableness - b.traits.agreeableness)) /
        3,
    );
  const shared = a.interests.filter((i) => b.interests.includes(i)).length;
  const noise = withRng(world, 'social', (rng) => rng.range(-12, 12));
  return clamp(Math.floor(similarity / 2) + 15 + shared * 12 + noise, 5, 95);
}

export function randomInterests(world: World): Character['interests'] {
  return withRng(world, 'social', (rng) => {
    const count = rng.range(1, 3);
    return rng.shuffle(INTEREST_KEYS).slice(0, count);
  });
}

export interface PairOptions {
  closeness: number;
  trust?: number;
  respect?: number;
  chemistry?: number;
}

/** Creates (or retypes) both directions of a relationship. */
export function linkPair(
  world: World,
  a: Character,
  b: Character,
  typeOfB: RelationType,
  typeOfA: RelationType,
  options: PairOptions,
): void {
  const chemistry = options.chemistry ?? chemistryBetween(world, a, b);
  for (const [from, to, type] of [
    [a, b, typeOfB],
    [b, a, typeOfA],
  ] as const) {
    const existing = findRelationship(world, from.id, to.id);
    if (existing) {
      existing.type = type;
      continue;
    }
    const id = nextId(world, 'rel');
    world.relationships[id] = {
      id,
      aId: from.id,
      bId: to.id,
      type,
      closeness: clamp(options.closeness, 0, 100),
      trust: clamp(options.trust ?? options.closeness, 0, 100),
      respect: clamp(options.respect ?? 55, 0, 100),
      conflict: 5,
      chemistry,
      history: 0,
      since: world.tick,
      lastContactTick: world.tick,
    };
  }
}

export function findRelationship(world: World, aId: string, bId: string): Relationship | undefined {
  for (const rel of Object.values(world.relationships)) {
    if (rel.aId === aId && rel.bId === bId) return rel;
  }
  return undefined;
}

/** Index of edges by "a|b" for loops over many people. */
export function relationshipIndex(world: World): Map<string, Relationship> {
  const index = new Map<string, Relationship>();
  for (const rel of sortedValues(world.relationships)) index.set(`${rel.aId}|${rel.bId}`, rel);
  return index;
}

/** Relationships from one person's side, in id order. */
export function relationshipsOf(world: World, aId: string): Relationship[] {
  return sortedValues(world.relationships).filter((r) => r.aId === aId);
}

export interface PairChange {
  closeness?: number;
  trust?: number;
  respect?: number;
  conflict?: number;
}

/** Adjusts both directions of a pair (one side may feel slightly differently). */
export function adjustPair(
  world: World,
  aId: string,
  bId: string,
  change: PairChange,
  contact = true,
): void {
  for (const [from, to] of [
    [aId, bId],
    [bId, aId],
  ] as const) {
    const rel = findRelationship(world, from, to);
    if (!rel) continue;
    rel.closeness = clamp(rel.closeness + (change.closeness ?? 0), 0, 100);
    rel.trust = clamp(rel.trust + (change.trust ?? 0), 0, 100);
    rel.respect = clamp(rel.respect + (change.respect ?? 0), 0, 100);
    rel.conflict = clamp(rel.conflict + (change.conflict ?? 0), 0, 100);
    if (contact) {
      rel.lastContactTick = world.tick;
      rel.history = Math.min(1000, rel.history + 1);
    }
  }
}

export function removePair(world: World, aId: string, bId: string): void {
  for (const id of Object.keys(world.relationships)) {
    const rel = world.relationships[id];
    if (!rel) continue;
    if ((rel.aId === aId && rel.bId === bId) || (rel.aId === bId && rel.bId === aId)) {
      Reflect.deleteProperty(world.relationships, id);
    }
  }
}

interface FamilyIndex {
  size: number;
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
}

/**
 * Family links are only ever added, so an index keyed by the links object and its size is
 * safe to reuse until a link is added (pure cache; never part of the world state).
 */
const familyIndexCache = new WeakMap<object, FamilyIndex>();

function familyIndex(world: World): FamilyIndex {
  const size = Object.keys(world.familyLinks).length;
  const cached = familyIndexCache.get(world.familyLinks);
  if (cached?.size === size) return cached;
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const link of sortedValues(world.familyLinks)) {
    parents.set(link.childId, [...(parents.get(link.childId) ?? []), link.parentId]);
    children.set(link.parentId, [...(children.get(link.parentId) ?? []), link.childId]);
  }
  const index = { size, parents, children };
  familyIndexCache.set(world.familyLinks, index);
  return index;
}

/** Parent ids of a character (biological and adoptive), in link order. */
export function parentsOf(world: World, id: string): string[] {
  return familyIndex(world).parents.get(id) ?? [];
}

export function childrenOf(world: World, id: string): string[] {
  return familyIndex(world).children.get(id) ?? [];
}

export function siblingsOf(world: World, id: string): string[] {
  const parents = parentsOf(world, id);
  const out = new Set<string>();
  for (const p of parents) for (const c of childrenOf(world, p)) if (c !== id) out.add(c);
  return [...out].sort();
}

/** Kinship of `otherId` relative to `id`, derived from family links (null if not kin). */
export function kinship(world: World, id: string, otherId: string): RelationType | null {
  const parents = parentsOf(world, id);
  if (parents.includes(otherId)) return 'parent';
  if (parentsOf(world, otherId).includes(id)) return 'child';
  if (siblingsOf(world, id).includes(otherId)) return 'sibling';
  for (const p of parents) {
    if (parentsOf(world, p).includes(otherId)) return 'grandparent';
    if (siblingsOf(world, p).includes(otherId)) return 'auntUncle';
    for (const auntUncle of siblingsOf(world, p))
      if (childrenOf(world, auntUncle).includes(otherId)) return 'cousin';
  }
  for (const child of childrenOf(world, id)) {
    if (childrenOf(world, child).includes(otherId)) return 'grandchild';
  }
  for (const sibling of siblingsOf(world, id)) {
    if (childrenOf(world, sibling).includes(otherId)) return 'nieceNephew';
  }
  return null;
}

/** Ids of living close family: parents, siblings, children, grandparents, grandchildren. */
export function immediateFamily(world: World, id: string): string[] {
  const out = new Set<string>();
  for (const p of parentsOf(world, id)) {
    out.add(p);
    for (const gp of parentsOf(world, p)) out.add(gp);
  }
  for (const s of siblingsOf(world, id)) out.add(s);
  for (const c of childrenOf(world, id)) {
    out.add(c);
    for (const gc of childrenOf(world, c)) out.add(gc);
  }
  return [...out].sort();
}
