import { clamp, sortedKeys } from '../core/data';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { emptyFinance, moveToHousehold } from '../characters/factory';
import { changeStat } from '../characters/stats';
import { displayName } from '../characters/names';
import type { Character, Partnership, World } from '../state/schema';
import { addMemory } from './memories';
import { createNpc, createPotentialPartner, newNpcHousehold } from './npcs';
import { activeNpcCount, MAX_ACTIVE_NPCS } from './population';
import { adjustPair, findRelationship, kinship, linkPair, parentsOf } from './relationships';

/**
 * Partnerships, weddings, family planning and births (spec §1 "non-explicit adult
 * relationships", §3.11 "non-explicit adult family planning"). Adult features require both
 * people to be 18 or older. Nothing here is explicit; outcomes are described plainly.
 */

export const ADULT_AGE = 18;

export function formPartnership(
  world: World,
  a: Character,
  b: Character,
  status: Partnership['status'],
): void {
  a.partnership = { partnerId: b.id, status, since: world.tick, planningFamily: false };
  b.partnership = { partnerId: a.id, status, since: world.tick, planningFamily: false };
}

export function setPartnershipStatus(
  a: Character,
  b: Character,
  status: Partnership['status'],
): void {
  if (a.partnership) a.partnership.status = status;
  if (b.partnership) b.partnership.status = status;
}

/** Ends a partnership; a partner who lived with them moves to a home of their own. */
export function endPartnership(world: World, a: Character, reason: 'breakup' | 'death'): void {
  const partnerId = a.partnership?.partnerId;
  a.partnership = null;
  if (!partnerId) return;
  const b = world.characters[partnerId];
  if (!b) return;
  b.partnership = null;
  if (reason === 'death') return;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const rel = findRelationship(world, x.id, y.id);
    if (rel?.type === 'partner') rel.type = 'exPartner';
  }
  if (a.householdId === b.householdId) {
    // Whoever does not run the household moves out.
    const home = world.households[a.householdId];
    const leaver = home?.finance?.headId === a.id ? b : home?.finance?.headId === b.id ? a : b;
    const household = newNpcHousehold(world, leaver.locationId, home?.wealth ?? 'middle');
    moveToHousehold(world, leaver, household.id);
  }
}

/** Biologically possible pregnancy within a couple (female partner of 18-50). */
function carrierOf(a: Character, b: Character): Character | null {
  const pair = [a, b];
  const female = pair.find((p) => p.identity.gender === 'female');
  const male = pair.find((p) => p.identity.gender === 'male');
  return female && male ? female : null;
}

export function canConceive(world: World, a: Character, b: Character): boolean {
  const carrier = carrierOf(a, b);
  return (
    carrier !== null &&
    ageYears(world, carrier) <= 50 &&
    ageYears(world, a) >= ADULT_AGE &&
    ageYears(world, b) >= ADULT_AGE
  );
}

function conceptionChancePercent(world: World, carrier: Character): number {
  const age = ageYears(world, carrier);
  return age <= 30 ? 18 : age <= 35 ? 14 : age <= 40 ? 8 : age <= 45 ? 3 : 1;
}

export function expect(
  world: World,
  kind: 'birth' | 'adoption',
  parentIds: string[],
  householdId: string,
  months: number,
): void {
  world.expecting.push({
    id: nextId(world, 'exp'),
    kind,
    parentIds,
    householdId,
    dueTick: world.tick + months,
  });
}

function isExpecting(world: World, id: string): boolean {
  return world.expecting.some((e) => e.parentIds.includes(id));
}

/** A new baby joins the family (biological or adopted). */
function welcomeChild(
  world: World,
  parents: Character[],
  householdId: string,
  adopted: boolean,
): Character | null {
  const first = parents[0];
  if (!first || !world.households[householdId]) return null;
  if (
    activeNpcCount(world) >= MAX_ACTIVE_NPCS &&
    !parents.some((p) => p.id === world.activeCharacterId)
  )
    return null;
  const surname =
    parents.find((p) => p.identity.gender === 'male')?.identity.lastName ?? first.identity.lastName;
  const child = createNpc(world, {
    countryCode: first.countryCode,
    householdId,
    ageYears: 0,
    lastName: surname,
    tier: 'close',
    ...(adopted ? {} : { parents }),
  });
  child.birth = { ...world.clock };
  if (adopted) {
    for (const parent of parents) {
      const id = nextId(world, 'fam');
      world.familyLinks[id] = { id, parentId: parent.id, childId: child.id, type: 'adoptive' };
    }
  }
  const player = world.characters[world.activeCharacterId];
  if (player) {
    const kin = kinship(world, player.id, child.id);
    if (kin === 'child') linkPair(world, player, child, 'child', 'parent', { closeness: 90 });
    else if (kin === 'sibling')
      linkPair(world, player, child, 'sibling', 'sibling', { closeness: 70 });
    else if (kin === 'grandchild')
      linkPair(world, player, child, 'grandchild', 'grandparent', { closeness: 75 });
    else if (kin === 'nieceNephew')
      linkPair(world, player, child, 'nieceNephew', 'auntUncle', { closeness: 55 });
    else if (kin === 'cousin')
      linkPair(world, player, child, 'cousin', 'cousin', { closeness: 40 });
    if (kin) {
      addBiography(
        world,
        player.id,
        'family',
        kin === 'child' ? (adopted ? 'bio.adoptedChild' : 'bio.childBorn') : 'bio.relativeBorn',
        {
          name: child.identity.firstName,
          relation: kin,
        },
      );
      addNotification(
        world,
        'family',
        kin === 'child' ? 'ntf.childBorn' : 'ntf.relativeBorn',
        { name: child.identity.firstName, relation: kin },
        'person',
        child.id,
      );
      if (kin === 'child') {
        changeStat(world, player, 'happiness', 150, 'family:newChild');
        changeStat(world, player, 'stress', 60, 'family:newChild');
      }
    }
  }
  return child;
}

/** Births and adoptions that are due this month. */
export function processExpecting(world: World): void {
  const due = world.expecting.filter((e) => e.dueTick <= world.tick);
  world.expecting = world.expecting.filter((e) => e.dueTick > world.tick);
  for (const e of due) {
    const parents = e.parentIds
      .map((id) => world.characters[id])
      .filter((c): c is Character => !!c);
    if (parents.length === 0) continue;
    const alive = parents.filter((p) => p.death === null);
    if (e.kind === 'birth' && !alive.some((p) => p.identity.gender === 'female')) continue;
    if (alive.length === 0) continue;
    const home = world.households[e.householdId]
      ? e.householdId
      : (alive[0] as Character).householdId;
    welcomeChild(world, parents, home, e.kind === 'adoption');
  }
}

/** The player's family planning: a monthly chance once a couple decides to try. */
export function playerFamilyPlanning(world: World): void {
  const player = world.characters[world.activeCharacterId];
  const p = player?.partnership;
  if (!player || !p?.planningFamily || player.death !== null) return;
  const partner = world.characters[p.partnerId];
  if (partner?.death !== null || partner.householdId !== player.householdId) return;
  if (isExpecting(world, player.id) || !canConceive(world, player, partner)) return;
  const carrier = carrierOf(player, partner) as Character;
  const chance = conceptionChancePercent(world, carrier);
  if (withRng(world, 'social', (rng) => rng.int(100) < chance)) {
    expect(world, 'birth', [player.id, partner.id], player.householdId, 9);
    addNotification(
      world,
      'family',
      'ntf.expecting',
      { name: partner.identity.firstName },
      'family',
    );
    addBiography(world, player.id, 'family', 'bio.expecting', { name: partner.identity.firstName });
  }
}

type NpcChoice = 'nothing' | 'seekPartner' | 'marry' | 'separate' | 'haveChild' | 'moveAway';

/**
 * NPC autonomy (spec §4: decision utility = goals + personality + resources + relationships
 * + seeded noise; weighted selection, not guaranteed best). Close NPCs decide monthly,
 * relevant NPCs yearly with the same relative weights.
 */
/** Closeness at which the player can ask someone on a date. */
export const DATE_CLOSENESS = 45;

/**
 * Whether a single adult is a romantic prospect for the single adult player: not family, of a
 * similar age (within ten years) and already getting close (closeness 30+). Such people do not
 * go looking for someone else while the player is getting to know them.
 */
export function isRomanticProspect(world: World, player: Character, c: Character): boolean {
  if (player.death !== null || c.death !== null || player.partnership || c.partnership)
    return false;
  const a = ageYears(world, player);
  const b = ageYears(world, c);
  if (a < ADULT_AGE || b < ADULT_AGE || Math.abs(a - b) > 10) return false;
  if (kinship(world, player.id, c.id)) return false;
  const rel = findRelationship(world, player.id, c.id);
  return rel !== undefined && rel.closeness >= 30;
}

export function npcFamilyLife(world: World, c: Character, yearly: boolean): void {
  const age = ageYears(world, c);
  if (age < ADULT_AGE) return;
  const player = world.characters[world.activeCharacterId];
  const inPlayerHome = c.householdId === player?.householdId;
  const p = c.partnership;
  const partner = p ? world.characters[p.partnerId] : undefined;
  const months = p ? world.tick - p.since : 0;
  const options: { value: NpcChoice; weight: number }[] = [
    { value: 'nothing', weight: yearly ? 100 : 1200 },
  ];
  // Someone getting close to the single player waits to see where it goes.
  const waiting = !p && player !== undefined && isRomanticProspect(world, player, c);
  if (!p && !waiting && age <= 55 && activeNpcCount(world) < MAX_ACTIVE_NPCS - 5) {
    options.push({
      value: 'seekPartner',
      weight: 6 + Math.floor(c.traits.extraversion / 4) + (age >= 24 && age <= 36 ? 12 : 0),
    });
  }
  if (p?.status === 'dating' && months >= 12)
    options.push({ value: 'marry', weight: 18 + Math.floor(c.traits.agreeableness / 5) });
  if (p && partner && !inPlayerHome && partner.id !== world.activeCharacterId) {
    options.push({ value: 'separate', weight: 1 + Math.floor(c.traits.neuroticism / 25) });
  }
  if (
    p &&
    partner?.death === null &&
    months >= 12 &&
    canConceive(world, c, partner) &&
    !isExpecting(world, c.id) &&
    activeNpcCount(world) < MAX_ACTIVE_NPCS - 5
  ) {
    const kids = Object.values(world.familyLinks).filter((l) => l.parentId === c.id).length;
    const carrierAge = ageYears(world, carrierOf(c, partner) as Character);
    if (kids < 3 && carrierAge <= 42) {
      options.push({
        value: 'haveChild',
        weight:
          10 +
          Math.floor(c.traits.agreeableness / 6) +
          (carrierAge >= 25 && carrierAge <= 36 ? 10 : 0),
      });
    }
  }
  if (c.tier === 'relevant' && player && !kinship(world, player.id, c.id) && !inPlayerHome) {
    options.push({ value: 'moveAway', weight: 3 });
  }
  const choice = withRng(world, 'npc', (rng) => rng.weighted(options));
  switch (choice) {
    case 'seekPartner': {
      const partnerNpc = createPotentialPartner(world, c);
      formPartnership(world, c, partnerNpc, 'dating');
      break;
    }
    case 'marry':
      if (partner) {
        setPartnershipStatus(c, partner, 'married');
        if (partner.householdId !== c.householdId) {
          const mover = partner;
          moveToHousehold(world, mover, c.householdId);
          if (world.households[c.householdId]?.finance && !mover.finance)
            mover.finance = emptyFinance(world.tick);
        }
        if (player && kinship(world, player.id, c.id)) {
          addNotification(
            world,
            'family',
            'ntf.relativeMarried',
            { name: c.identity.firstName, partner: partner.identity.firstName },
            'person',
            c.id,
          );
        }
      }
      break;
    case 'separate':
      endPartnership(world, c, 'breakup');
      break;
    case 'haveChild':
      if (partner) expect(world, 'birth', [c.id, partner.id], c.householdId, 9);
      break;
    case 'moveAway':
      c.tier = 'archived';
      c.flags.movedAway = true;
      break;
    default:
      break;
  }
}

/** Step 7 (family part) for every active NPC. */
export function processNpcFamilies(world: World): void {
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (c?.death !== null || c.tier === 'archived' || id === world.activeCharacterId) continue;
    if (c.tier === 'close') npcFamilyLife(world, c, false);
    else if (world.clock.month === c.birth.month) npcFamilyLife(world, c, true);
  }
}

/** Grief and partnership endings when someone dies. */
export function onDeath(world: World, c: Character): void {
  if (c.partnership) endPartnership(world, c, 'death');
  world.expecting = world.expecting.filter(
    (e) => !(e.kind === 'adoption' && e.parentIds.every((id) => id === c.id)),
  );
}

/** Who an adult player could move back in with: a living parent's home. */
export function familyHomeFor(world: World, c: Character): string | null {
  for (const parentId of parentsOf(world, c.id)) {
    const parent = world.characters[parentId];
    if (parent?.death === null && parent.householdId !== c.householdId) return parent.householdId;
  }
  return null;
}

/** A memorable shared moment between the player and someone (both remember it). */
export function shareMoment(
  world: World,
  a: Character,
  b: Character,
  key: string,
  valence: number,
  salience: number,
  source: string,
): void {
  addMemory(world, {
    ownerId: b.id,
    subjectIds: [a.id],
    key,
    source,
    valence,
    salience,
    decay: salience >= 60 ? 'slow' : 'fast',
  });
  addMemory(world, {
    ownerId: a.id,
    subjectIds: [b.id],
    key,
    source,
    valence,
    salience: clamp(salience - 10, 1, 100),
    decay: 'fast',
  });
  adjustPair(world, a.id, b.id, { closeness: Math.trunc(valence / 10) });
}

export function personLabel(c: Character): string {
  return displayName(c.identity, false);
}
