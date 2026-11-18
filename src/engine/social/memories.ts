import { sortedKeys, sortedValues } from '../core/data';
import { nextId } from '../core/world';
import type { Memory, World } from '../state/schema';

/**
 * Durable memories (spec §4 NPCs: subject, source event, valence, salience, timestamp,
 * decay rule and follow-up triggers). Memories shape relationships over time and make
 * events eligible years later (a childhood kindness can lead to a job referral; it never
 * guarantees one).
 */

/** Memories kept per person; the least salient are forgotten first. */
export const MEMORY_LIMIT = 24;

/** Yearly salience loss by decay rule (PROPOSED TUNING). */
const DECAY: Record<Memory['decay'], number> = { fast: 25, slow: 8, permanent: 0 };

export interface MemoryInput {
  ownerId: string;
  subjectIds: string[];
  key: string;
  source: string;
  valence: number;
  salience: number;
  decay: Memory['decay'];
}

export function addMemory(world: World, input: MemoryInput): Memory {
  const memory: Memory = {
    id: nextId(world, 'mem'),
    ownerId: input.ownerId,
    subjectIds: input.subjectIds,
    key: input.key,
    source: input.source,
    tick: world.tick,
    valence: Math.max(-100, Math.min(100, input.valence)),
    salience: Math.max(0, Math.min(100, input.salience)),
    decay: input.decay,
  };
  world.memories[memory.id] = memory;
  const owned = sortedValues(world.memories).filter((m) => m.ownerId === input.ownerId);
  if (owned.length > MEMORY_LIMIT) {
    const forget = owned
      .slice()
      .sort((a, b) => a.salience - b.salience || a.tick - b.tick || (a.id < b.id ? -1 : 1))
      .slice(0, owned.length - MEMORY_LIMIT);
    for (const m of forget) Reflect.deleteProperty(world.memories, m.id);
  }
  return memory;
}

/** Yearly fading; memories that reach zero salience are forgotten. */
export function decayMemories(world: World): void {
  for (const id of sortedKeys(world.memories)) {
    const m = world.memories[id];
    if (!m) continue;
    m.salience = Math.max(0, m.salience - DECAY[m.decay]);
    if (m.salience === 0) Reflect.deleteProperty(world.memories, id);
  }
}

/** Memories held by `ownerId` about `subjectId`. */
export function memoriesAbout(world: World, ownerId: string, subjectId: string): Memory[] {
  return sortedValues(world.memories).filter(
    (m) => m.ownerId === ownerId && m.subjectIds.includes(subjectId),
  );
}

/** Net feeling from memories, -100..100 (valence weighted by salience). */
export function memorySentiment(world: World, ownerId: string, subjectId: string): number {
  let total = 0;
  for (const m of memoriesAbout(world, ownerId, subjectId))
    total += Math.trunc((m.valence * m.salience) / 100);
  return Math.max(-100, Math.min(100, total));
}

/** People (other than the player) who hold a memory with `key` about `subjectId`. */
export function holdersOf(world: World, key: string, subjectId: string): string[] {
  const out = new Set<string>();
  for (const m of sortedValues(world.memories)) {
    if (m.key === key && m.subjectIds.includes(subjectId) && m.ownerId !== subjectId)
      out.add(m.ownerId);
  }
  return [...out].sort();
}

/** True if anyone remembers `key` about the subject, or the subject remembers it. */
export function hasMemory(world: World, key: string, subjectId: string): boolean {
  return sortedValues(world.memories).some(
    (m) => m.key === key && (m.subjectIds.includes(subjectId) || m.ownerId === subjectId),
  );
}

/** Removes memories that reference people who no longer exist. */
export function pruneMemories(world: World): void {
  for (const id of sortedKeys(world.memories)) {
    const m = world.memories[id];
    if (!m) continue;
    if (!world.characters[m.ownerId] || m.subjectIds.some((s) => !world.characters[s])) {
      Reflect.deleteProperty(world.memories, id);
    }
  }
}
