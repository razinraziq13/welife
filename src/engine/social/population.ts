import { sortedKeys } from '../core/data';
import type { Character, World } from '../state/schema';
import { childrenOf, immediateFamily, parentsOf, relationshipIndex } from './relationships';

/**
 * Simulation detail levels (spec §4 NPCs; decision R4): 10-30 close NPCs simulated monthly,
 * up to 120 more relevant NPCs in simplified yearly form, an active total of at most 150.
 * Dead, moved-away and dormant NPCs are archived: kept for family history and memories,
 * but no longer simulated and not counted towards the cap.
 */

export const MAX_ACTIVE_NPCS = 150;
export const MAX_CLOSE_NPCS = 30;

/** How much a person matters to the player's life right now. */
function relevance(
  world: World,
  player: Character,
  c: Character,
  family: Set<string>,
  partners: Set<string>,
): number {
  if (c.householdId === player.householdId) return 1000;
  if (player.partnership?.partnerId === c.id) return 990;
  const index = relevanceIndex.get(world);
  const rel = index?.get(`${player.id}|${c.id}`);
  const closeness = rel?.closeness ?? 0;
  const recent = rel && world.tick - rel.lastContactTick <= 12 ? 40 : 0;
  if (family.has(c.id)) return 800 + closeness;
  if (!rel) return partners.has(c.id) ? 20 : 0;
  switch (rel.type) {
    case 'friend':
      return 500 + closeness + recent;
    case 'manager':
      return 450 + closeness;
    case 'auntUncle':
    case 'cousin':
    case 'nieceNephew':
      return 300 + closeness + recent;
    case 'teacher':
    case 'classmate':
    case 'colleague':
      return 100 + closeness + recent;
    case 'exPartner':
      return 60 + closeness;
    default:
      return 40 + closeness + recent;
  }
}

const relevanceIndex = new WeakMap<
  World,
  Map<string, { closeness: number; type: string; lastContactTick: number }>
>();

/** Re-tiers every NPC and archives the least relevant above the cap. */
export function rebalancePopulation(world: World): void {
  const player = world.characters[world.activeCharacterId];
  if (!player) return;
  relevanceIndex.set(world, relationshipIndex(world));
  const family = new Set(immediateFamily(world, player.id));
  // Partners of active people stay with them.
  const partners = new Set<string>();
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (c?.partnership && c.death === null) partners.add(c.partnership.partnerId);
  }
  const scored: { c: Character; score: number }[] = [];
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (!c || id === player.id) continue;
    if (c.death !== null) {
      c.tier = 'archived';
      continue;
    }
    if (c.tier === 'archived' && !family.has(id) && c.householdId !== player.householdId) continue;
    let score = relevance(world, player, c, family, partners);
    // Children of active NPCs stay while young (they live with them).
    if (score === 0) {
      const parents = parentsOf(world, c.id);
      if (
        parents.some(
          (p) => world.characters[p]?.tier !== 'archived' && world.characters[p]?.death === null,
        )
      )
        score = 10;
    }
    if (
      score === 0 &&
      childrenOf(world, c.id).some((k) => world.characters[k]?.tier !== 'archived')
    )
      score = 10;
    scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.c.id < b.c.id ? -1 : 1));
  let close = 0;
  let active = 0;
  for (const { c, score } of scored) {
    // Household and close family score highest, so they are never the ones archived.
    if (score <= 0 || active >= MAX_ACTIVE_NPCS) {
      c.tier = 'archived';
      continue;
    }
    active += 1;
    if (score >= 500 && close < MAX_CLOSE_NPCS) {
      c.tier = 'close';
      close += 1;
    } else c.tier = 'relevant';
  }
  relevanceIndex.delete(world);
}

/** Re-tiers only when the caps are exceeded (cheap check; used after people are added). */
export function enforcePopulation(world: World): void {
  let active = 0;
  let close = 0;
  for (const id of Object.keys(world.characters)) {
    const c = world.characters[id];
    if (!c || id === world.activeCharacterId || c.tier === 'archived' || c.death !== null) continue;
    active += 1;
    if (c.tier === 'close') close += 1;
  }
  if (active > MAX_ACTIVE_NPCS || close > MAX_CLOSE_NPCS) rebalancePopulation(world);
}

export function activeNpcCount(world: World): number {
  let n = 0;
  for (const id of Object.keys(world.characters)) {
    const c = world.characters[id];
    if (c && id !== world.activeCharacterId && c.tier !== 'archived' && c.death === null) n += 1;
  }
  return n;
}
