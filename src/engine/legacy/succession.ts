import { addBiography, addNotification } from '../core/world';
import { monthIndex } from '../core/clock';
import { childrenOf } from '../social/relationships';
import { getCountry } from '../world/countries';
import type { Character, World } from '../state/schema';

/**
 * Royal and noble succession (spec §4 Legacy: "royal succession is separate" from
 * inheritance; decisions D4/D5). A royal or noble house has a head; when the head dies the
 * headship passes down the line of succession, independently of who inherits money and of
 * who the player chooses to play. Families are fictional; the order rules follow each
 * country's tradition, simplified:
 *
 * - male-preference primogeniture: sons before daughters, then their lines in birth order;
 * - agnatic: only male lines (daughters are passed over);
 * - absolute primogeniture: eldest child first, whatever their gender.
 */

export type SuccessionRule = 'absolute' | 'malePreference' | 'agnatic';

export const SUCCESSION_RULES: Record<string, SuccessionRule> = {
  MY: 'agnatic',
  ID: 'agnatic',
  AE: 'agnatic',
  SA: 'agnatic',
  TH: 'malePreference',
  ZA: 'malePreference',
  GB: 'malePreference',
  FR: 'malePreference',
  DE: 'malePreference',
  IT: 'malePreference',
  IN: 'malePreference',
};

export function successionRule(countryCode: string): SuccessionRule {
  return SUCCESSION_RULES[countryCode] ?? 'absolute';
}

export const HOUSE_FLAGS = { royal: 'house.royal', noble: 'house.noble' } as const;

function ordered(world: World, parentId: string, rule: SuccessionRule): Character[] {
  const kids = childrenOf(world, parentId)
    .map((id) => world.characters[id])
    .filter((c): c is Character => Boolean(c))
    .sort((a, b) => monthIndex(a.birth) - monthIndex(b.birth) || (a.id < b.id ? -1 : 1));
  if (rule === 'absolute') return kids;
  const sons = kids.filter((k) => k.identity.gender === 'male');
  if (rule === 'agnatic') return sons;
  return [...sons, ...kids.filter((k) => k.identity.gender !== 'male')];
}

/** The line of succession after a head of house: depth-first by the country's rule. */
export function lineOfSuccession(
  world: World,
  headId: string,
  countryCode: string,
  limit = 10,
): Character[] {
  const rule = successionRule(countryCode);
  const line: Character[] = [];
  const seen = new Set<string>([headId]);
  const visit = (id: string, depth: number) => {
    if (line.length >= limit || depth > 6) return;
    for (const child of ordered(world, id, rule)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (child.death === null) line.push(child);
      visit(child.id, depth + 1);
      if (line.length >= limit) return;
    }
  };
  visit(headId, 1);
  // With no descendants in line, the headship passes to the head's siblings' lines.
  if (line.length === 0) {
    const head = world.characters[headId];
    const parents = head
      ? Object.values(world.familyLinks)
          .filter((l) => l.childId === headId)
          .map((l) => l.parentId)
      : [];
    for (const parent of parents) visit(parent, 1);
  }
  return line;
}

/** Sets up the house when a life starts in a royal or noble family. */
export function initHouse(world: World): void {
  const player = world.characters[world.activeCharacterId];
  if (!player) return;
  const home = world.households[player.householdId];
  const kind = home?.flags.royal ? 'royal' : home?.flags.noble ? 'noble' : null;
  if (!kind || !home) return;
  for (const id of home.memberIds) {
    const member = world.characters[id];
    if (member) member.flags[HOUSE_FLAGS[kind]] = true;
  }
  // The head is the parent through whom the line runs (the father where the rule prefers men).
  const parents = Object.values(world.familyLinks)
    .filter((l) => l.childId === player.id)
    .map((l) => world.characters[l.parentId])
    .filter((c): c is Character => Boolean(c));
  const rule = successionRule(player.countryCode);
  const head =
    (rule !== 'absolute' ? parents.find((p) => p.identity.gender === 'male') : undefined) ??
    parents[0] ??
    player;
  const monarchy = getCountry(player.countryCode).monarchy;
  const titles = kind === 'royal' ? monarchy.royalTitle : monarchy.nobleTitle;
  world.legacy.house = {
    kind,
    countryCode: player.countryCode,
    headId: head.id,
    title: titles ? (head.identity.gender === 'female' ? titles.female : titles.male) : null,
    heads: [{ characterId: head.id, fromTick: world.tick }],
  };
}

/** Children of a house member belong to the house. */
export function inheritHouse(child: Character, parents: readonly Character[]): void {
  for (const flag of Object.values(HOUSE_FLAGS))
    if (parents.some((p) => p.flags[flag])) child.flags[flag] = true;
}

/** When the head of the house dies, the headship passes down the line. */
export function onHouseDeath(world: World, deceased: Character): void {
  const house = world.legacy.house;
  if (house?.headId !== deceased.id) return;
  const next = lineOfSuccession(world, deceased.id, house.countryCode, 1)[0];
  if (!next) {
    house.headId = null;
    return;
  }
  house.headId = next.id;
  house.heads = [...house.heads, { characterId: next.id, fromTick: world.tick }].slice(-50);
  const kind = house.kind === 'royal' ? 'bio.headOfRoyalHouse' : 'bio.headOfHouse';
  addBiography(world, next.id, 'legacy', kind, { name: deceased.identity.firstName });
  addNotification(world, 'legacy', 'ntf.newHead', { name: next.identity.firstName }, 'legacy');
}
