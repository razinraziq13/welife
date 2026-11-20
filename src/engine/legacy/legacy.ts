import { addBiography, addNotification, ageYears, withRng } from '../core/world';
import { monthIndex } from '../core/clock';
import { catchUpSkills, emptyFinance } from '../characters/factory';
import { currencyFor, ensurePlayerAccounts, rentFor } from '../economy/finance';
import { netWorthIn } from '../economy/fx';
import { openAccount } from '../economy/ledger';
import { rebalancePopulation } from '../social/population';
import {
  childrenOf,
  findRelationship,
  kinship,
  linkPair,
  parentsOf,
  siblingsOf,
} from '../social/relationships';
import type { Character, RelationType, World } from '../state/schema';

/**
 * Legacy (spec §4 Legacy, §8, decision D7). One continuous world clock and family history:
 *
 * - When the player dies, an adult descendant takes over; with none, the nearest adult
 *   relative; with no relative at all, the life ends (the world can continue with a new
 *   life). Control passes; ownership passes only by inheritance.
 * - While alive, the player may hand control to an adult descendant. The previous character
 *   lives on as an autonomous person, keeping everything they own.
 * - The lineage records every character the player has been, with their generation.
 */

export type LegacyRejection = 'notCandidate' | 'notDescendant' | 'noSuccession' | 'dead' | 'self';

export const LEGACY_MESSAGES: Record<LegacyRejection, string> = {
  notCandidate: 'That person cannot take over.',
  notDescendant: 'You can hand over only to an adult child or grandchild.',
  noSuccession: 'There is no succession to decide.',
  dead: 'That person has died.',
  self: 'You are already playing as that person.',
};

export class LegacyError extends Error {
  readonly code: LegacyRejection;
  constructor(code: LegacyRejection) {
    super(LEGACY_MESSAGES[code]);
    this.name = 'LegacyError';
    this.code = code;
  }
}

/** Generations below (positive) or above (negative) the reference person, 0 for siblings. */
const KIN_GENERATION: Partial<Record<RelationType, number>> = {
  child: 1,
  grandchild: 2,
  sibling: 0,
  nieceNephew: 1,
  cousin: 0,
  parent: -1,
  auntUncle: -1,
  grandparent: -2,
};

/** Living descendants (children, grandchildren, ...), nearest generation first. */
export function descendantsOf(world: World, id: string): { c: Character; depth: number }[] {
  const out: { c: Character; depth: number }[] = [];
  let frontier = [id];
  const seen = new Set([id]);
  for (let depth = 1; depth <= 6 && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const parent of frontier) {
      for (const child of childrenOf(world, parent)) {
        if (seen.has(child)) continue;
        seen.add(child);
        next.push(child);
        const c = world.characters[child];
        if (c?.death === null) out.push({ c, depth });
      }
    }
    frontier = next;
  }
  return out;
}

function byAgeDesc(a: Character, b: Character): number {
  return monthIndex(a.birth) - monthIndex(b.birth) || (a.id < b.id ? -1 : 1);
}

/** Adult descendants a player may hand over to (voluntary switching). */
/** Living children and grandchildren, any age, nearest first (heirs on death need `minAge` 18). */
export function switchCandidates(world: World, player: Character, minAge = 0): Character[] {
  return descendantsOf(world, player.id)
    .filter(({ c }) => ageYears(world, c) >= minAge)
    .sort((a, b) => a.depth - b.depth || byAgeDesc(a.c, b.c))
    .map(({ c }) => c);
}

/** Heirs on death: adult descendants, else the nearest adult relatives (decision D7). */
export function heirCandidates(world: World, deceased: Character): Character[] {
  const descendants = switchCandidates(world, deceased, 18);
  if (descendants.length > 0) return descendants.slice(0, 30);
  const adult = (ids: string[]) =>
    ids
      .map((id) => world.characters[id])
      .filter((c): c is Character => c?.death === null && ageYears(world, c) >= 18)
      .sort(byAgeDesc);
  const siblings = adult(siblingsOf(world, deceased.id));
  const nieces = adult(siblingsOf(world, deceased.id).flatMap((s) => childrenOf(world, s)));
  const parents = adult(parentsOf(world, deceased.id));
  const cousins = adult(
    parentsOf(world, deceased.id).flatMap((p) =>
      siblingsOf(world, p).flatMap((u) => childrenOf(world, u)),
    ),
  );
  const unique = new Map<string, Character>();
  for (const c of [...siblings, ...nieces, ...parents, ...cousins]) unique.set(c.id, c);
  return [...unique.values()].slice(0, 30);
}

function currentEntry(world: World) {
  return world.legacy.lineage.find(
    (l) => l.characterId === world.activeCharacterId && l.toTick === null,
  );
}

/** Starts the lineage with the first life. */
export function initLegacy(world: World): void {
  const player = world.characters[world.activeCharacterId];
  if (!player) return;
  world.legacy = {
    generation: 1,
    lineage: [
      {
        characterId: player.id,
        generation: 1,
        fromTick: world.tick,
        toTick: null,
        reason: 'start',
        peakNetWorthMinor: 0n,
        currency: currencyFor(player.countryCode),
      },
    ],
    wills: {},
    estates: [],
    succession: null,
    house: null,
  };
}

/** Called when the player dies (after their estate is settled). */
export function beginSuccession(world: World, deceased: Character): void {
  const entry = currentEntry(world);
  if (entry) entry.toTick = world.tick;
  const candidates = heirCandidates(world, deceased);
  world.events.pendingInstanceId = null;
  if (candidates.length === 0) {
    world.lifeStatus = 'ended';
    world.legacy.succession = null;
    addNotification(world, 'legacy', 'ntf.noHeir', {}, 'legacy');
    return;
  }
  world.lifeStatus = 'succession';
  world.legacy.succession = { deceasedId: deceased.id, candidates: candidates.map((c) => c.id) };
  addNotification(world, 'legacy', 'ntf.chooseHeir', { count: candidates.length }, 'legacy');
}

/** Gives the new player a household budget of their own if their home is not tracked. */
function takeOverHousehold(world: World, heir: Character): void {
  const home = world.households[heir.householdId];
  if (!home) return;
  if (home.finance) {
    const head = world.characters[home.finance.headId];
    if (head?.death !== null) home.finance.headId = heir.id;
    return;
  }
  const checkingId = heir.finance?.checkingId;
  const savingsId = heir.finance?.savingsId;
  if (!checkingId || !savingsId) return;
  home.finance = {
    checkingId,
    savingsId,
    lifestyle: 'moderate',
    housing: 'rented',
    homeSize: 'apartment',
    rentMinor: rentFor(world, home.locationId, 'apartment'),
    propertyId: null,
    headId: heir.id,
  };
}

/** Makes sure the new player knows their own family (relationships exist both ways). */
function linkFamily(world: World, heir: Character): void {
  const pairs: [string[], RelationType, RelationType, number][] = [
    [parentsOf(world, heir.id), 'parent', 'child', 75],
    [childrenOf(world, heir.id), 'child', 'parent', 85],
    [siblingsOf(world, heir.id), 'sibling', 'sibling', 60],
  ];
  for (const [ids, typeOfOther, typeOfHeir, closeness] of pairs) {
    for (const id of ids) {
      const other = world.characters[id];
      if (!other || findRelationship(world, heir.id, id)) continue;
      linkPair(world, heir, other, typeOfOther, typeOfHeir, { closeness });
    }
  }
  const partnerId = heir.partnership?.partnerId;
  const partner = partnerId ? world.characters[partnerId] : undefined;
  if (partner && !findRelationship(world, heir.id, partner.id))
    linkPair(world, heir, partner, 'partner', 'partner', { closeness: 80 });
}

/** Transfers control of the game to another character (spec §4 Legacy). */
export function takeControl(world: World, heir: Character, reason: 'heir' | 'switch'): void {
  const previous = world.characters[world.activeCharacterId];
  const entry = currentEntry(world);
  if (entry) entry.toTick = world.tick;
  const previousGeneration =
    world.legacy.lineage.find((l) => l.characterId === previous?.id)?.generation ??
    world.legacy.generation;
  const kin = previous ? kinship(world, previous.id, heir.id) : null;
  const depth = previous
    ? descendantsOf(world, previous.id).find((d) => d.c.id === heir.id)?.depth
    : undefined;
  const generation = Math.max(
    1,
    previousGeneration + (depth ?? (kin ? (KIN_GENERATION[kin] ?? 0) : 0)),
  );

  world.activeCharacterId = heir.id;
  world.lifeStatus = 'alive';
  world.legacy.succession = null;
  world.legacy.generation = Math.max(world.legacy.generation, generation);
  heir.tier = 'close';
  if (previous?.death === null) previous.tier = 'close';
  // An heir raised off-screen may lag behind (saves from before NPC skill growth): catch up.
  withRng(world, 'npc', (rng) => {
    catchUpSkills(rng, heir.skills, ageYears(world, heir));
  });

  heir.finance ??= emptyFinance(world.tick);
  ensurePlayerAccounts(world, heir);
  if (!heir.finance.checkingId && ageYears(world, heir) >= 16)
    heir.finance.checkingId = openAccount(
      world,
      heir.id,
      'checking',
      currencyFor(heir.countryCode),
    );
  takeOverHousehold(world, heir);
  linkFamily(world, heir);
  const code = heir.civic.residence.countryCode;
  if ((heir.civic.residedMonths[code] ?? 0) === 0)
    heir.civic.residedMonths[code] = Math.max(0, monthIndex(world.clock) - monthIndex(heir.birth));

  // Plans and bookings belonged to the previous character.
  world.calendar = { plans: [], items: [] };
  world.activity = { tick: world.tick, counts: {}, hoursUsed: 0 };
  world.jobs.refreshedTick = Math.min(world.jobs.refreshedTick, Math.max(0, world.tick - 1));

  world.legacy.lineage = [
    ...world.legacy.lineage,
    {
      characterId: heir.id,
      generation,
      fromTick: world.tick,
      toTick: null,
      reason,
      peakNetWorthMinor: 0n,
      currency: currencyFor(heir.countryCode),
    },
  ].slice(-500);
  addBiography(world, heir.id, 'legacy', reason === 'heir' ? 'bio.tookOverHeir' : 'bio.tookOver', {
    name: previous?.identity.firstName ?? '',
    generation,
  });
  addNotification(
    world,
    'legacy',
    'ntf.nowPlaying',
    { name: heir.identity.firstName, generation },
    'legacy',
  );
  rebalancePopulation(world);
}

/** Chooses an heir during succession, or hands over to an adult descendant while alive. */
export function continueAs(world: World, heirId: string): void {
  const heir = world.characters[heirId];
  if (!heir) throw new LegacyError('notCandidate');
  if (heir.death !== null) throw new LegacyError('dead');
  if (heirId === world.activeCharacterId) throw new LegacyError('self');
  if (world.lifeStatus === 'succession') {
    if (!world.legacy.succession?.candidates.includes(heirId))
      throw new LegacyError('notCandidate');
    takeControl(world, heir, 'heir');
    return;
  }
  const player = world.characters[world.activeCharacterId];
  if (!player || world.lifeStatus !== 'alive') throw new LegacyError('noSuccession');
  if (!switchCandidates(world, player).some((c) => c.id === heirId))
    throw new LegacyError('notDescendant');
  takeControl(world, heir, 'switch');
}

/** Keeps each lineage member's peak net worth (for the biography's wealth record). */
export function trackLineage(world: World): void {
  const entry = currentEntry(world);
  if (!entry) return;
  const worth = netWorthIn(world, entry.characterId, entry.currency);
  if (worth > entry.peakNetWorthMinor) entry.peakNetWorthMinor = worth;
}
