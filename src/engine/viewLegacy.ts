import { sortedValues } from './core/data';
import { ageOf, monthIndex } from './core/clock';
import { displayName } from './characters/names';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, findAchievement } from './achievements/achievements';
import { switchCandidates } from './legacy/legacy';
import { intestateHeirs } from './legacy/inheritance';
import { lineOfSuccession, successionRule } from './legacy/succession';
import { lifeSummary, type LifeSummary, type LifeTitle } from './legacy/summary';
import { currencyFor } from './economy/finance';
import { MEDIA_STYLES } from './state/schema';
import { NICHES, PLATFORMS, profilesOf } from './media/media';
import { getInstitutions } from './world/institutions';
import { getCountry } from './world/countries';
import { findRelationship, kinship } from './social/relationships';
import type { EventDefinition } from './events/schema';
import type { Character, World } from './state/schema';

/** Read-only projections for Milestones 7-8: legacy, media, achievements, packs. */

export interface PersonRef {
  id: string;
  name: string;
  age: number;
  relation: string | null;
}

export interface LegacyView {
  generation: number;
  lineage: {
    characterId: string;
    name: string;
    generation: number;
    fromTick: number;
    toTick: number | null;
    reason: string;
    peakNetWorthMinor: bigint;
    currency: { code: string; exponent: number; symbol: string };
    alive: boolean;
    born: { year: number; month: number };
    died: { year: number; month: number } | null;
    /** For a life that has ended: what it was about (roadmap 30). */
    title: LifeTitle | null;
  }[];
  succession: { deceasedName: string; candidates: PersonRef[] } | null;
  /** When the player has died: the summary of that life (roadmap 04). */
  lifeSummary:
    | (LifeSummary & {
        name: string;
        born: { year: number; month: number };
        died: { year: number; month: number } | null;
        generation: number;
        peakNetWorthMinor: bigint | null;
        currency: { code: string; exponent: number; symbol: string };
      })
    | null;
  house: {
    kind: 'royal' | 'noble';
    title: string | null;
    headName: string | null;
    youAreHead: boolean;
    line: { name: string; age: number }[];
    rule: string;
    heads: string[];
  } | null;
  switchCandidates: PersonRef[];
  will: { characterId: string; name: string; sharesBp: number }[] | null;
  intestate: { characterId: string; name: string; sharesBp: number }[];
  willOptions: PersonRef[];
  forcedHeirship: boolean;
  estates: {
    id: string;
    deceasedName: string;
    tick: number;
    currency: { code: string; exponent: number; symbol: string };
    grossMinor: bigint;
    taxMinor: bigint;
    writtenOffMinor: bigint;
    byWill: boolean;
    heirs: { name: string; sharesBp: number; amountMinor: bigint }[];
  }[];
}

export interface MediaView {
  canJoin: boolean;
  reason: string | null;
  platforms: { id: string; name: string; format: string; hours: number; monetiseAt: number }[];
  niches: { id: string; name: string; trendBp: number }[];
  styles: readonly string[];
  profiles: {
    id: string;
    platformId: string;
    platformName: string;
    handle: string;
    niche: string;
    followers: number;
    engagementBp: number;
    trust: number;
    posts: number;
    lastPostTick: number | null;
    earningsMinor: bigint;
    sponsor: { brand: string; monthlyMinor: bigint; untilTick: number } | null;
    offer: { brand: string; monthlyMinor: bigint; months: number; expiresTick: number } | null;
  }[];
}

export interface AchievementsView {
  total: number;
  categories: readonly string[];
  unlocked: {
    id: string;
    title: string;
    description: string;
    category: string;
    tick: number;
    characterName: string;
    generation: number;
  }[];
  locked: { id: string; title: string; description: string; category: string }[];
}

function name(world: World, id: string): string {
  const c = world.characters[id];
  return c ? displayName(c.identity, false) : id;
}

function ref(world: World, player: Character, c: Character): PersonRef {
  return {
    id: c.id,
    name: displayName(c.identity, false),
    age: ageOf(c.birth, world.clock).years,
    relation:
      kinship(world, player.id, c.id) ?? findRelationship(world, player.id, c.id)?.type ?? null,
  };
}

function currencyInfo(code: string) {
  return currencyByCode(code);
}

const CURRENCIES = new Map<string, { code: string; exponent: number; symbol: string }>();
function currencyByCode(code: string): { code: string; exponent: number; symbol: string } {
  if (CURRENCIES.size === 0) {
    for (const cc of [
      'MY',
      'SG',
      'ID',
      'TH',
      'JP',
      'KR',
      'CN',
      'IN',
      'AU',
      'NZ',
      'US',
      'CA',
      'GB',
      'FR',
      'BR',
      'ZA',
      'AE',
      'SA',
    ]) {
      const cur = getCountry(cc).currency;
      CURRENCIES.set(cur.code, cur);
    }
  }
  return CURRENCIES.get(code) ?? { code, exponent: 2, symbol: code };
}

function summaryOf(world: World, c: Character): LegacyView['lifeSummary'] {
  const entry = world.legacy.lineage.find((l) => l.characterId === c.id);
  return {
    ...lifeSummary(world, c),
    name: name(world, c.id),
    born: c.birth,
    died: c.death,
    generation: entry?.generation ?? world.legacy.generation,
    peakNetWorthMinor: entry?.peakNetWorthMinor ?? null,
    currency: currencyInfo(entry?.currency ?? currencyFor(c.countryCode)),
  };
}

export function projectLegacy(world: World, player: Character): LegacyView {
  const s = world.legacy.succession;
  const will = world.legacy.wills[player.id];
  const people = sortedValues(world.relationships)
    .filter((r) => r.aId === player.id)
    .map((r) => world.characters[r.bId])
    .filter((c): c is Character => c?.death === null);
  return {
    generation: world.legacy.generation,
    lineage: world.legacy.lineage.map((l) => {
      const c = world.characters[l.characterId];
      return {
        characterId: l.characterId,
        name: name(world, l.characterId),
        generation: l.generation,
        fromTick: l.fromTick,
        toTick: l.toTick,
        reason: l.reason,
        peakNetWorthMinor: l.peakNetWorthMinor,
        currency: currencyInfo(l.currency),
        alive: c?.death === null,
        born: c?.birth ?? { year: 0, month: 1 },
        died: c?.death ?? null,
        title: c && c.death !== null ? lifeSummary(world, c).title : null,
      };
    }),
    lifeSummary: world.lifeStatus === 'alive' ? null : summaryOf(world, player),
    succession: s
      ? {
          deceasedName: name(world, s.deceasedId),
          candidates: s.candidates
            .map((id) => world.characters[id])
            .filter((c): c is Character => Boolean(c))
            .map((c) => {
              const dead = world.characters[s.deceasedId];
              return ref(world, dead ?? player, c);
            }),
        }
      : null,
    house: world.legacy.house
      ? {
          kind: world.legacy.house.kind,
          title: world.legacy.house.title,
          headName: world.legacy.house.headId ? name(world, world.legacy.house.headId) : null,
          youAreHead: world.legacy.house.headId === player.id,
          line: world.legacy.house.headId
            ? lineOfSuccession(
                world,
                world.legacy.house.headId,
                world.legacy.house.countryCode,
                5,
              ).map((c) => ({
                name: displayName(c.identity, false),
                age: ageOf(c.birth, world.clock).years,
              }))
            : [],
          rule: successionRule(world.legacy.house.countryCode),
          heads: world.legacy.house.heads.map((h) => name(world, h.characterId)),
        }
      : null,
    switchCandidates:
      world.lifeStatus === 'alive'
        ? switchCandidates(world, player).map((c) => ref(world, player, c))
        : [],
    will: will ? will.map((b) => ({ ...b, name: name(world, b.characterId) })) : null,
    intestate: intestateHeirs(world, player).map((b) => ({
      ...b,
      name: name(world, b.characterId),
    })),
    willOptions: people
      .filter((c) => ageOf(c.birth, world.clock).years >= 0)
      .map((c) => ref(world, player, c))
      .sort(
        (a, b) =>
          (a.relation ?? 'z').localeCompare(b.relation ?? 'z') || a.name.localeCompare(b.name),
      )
      .slice(0, 60),
    forcedHeirship: getInstitutions(player.civic.residence.countryCode).inheritance.forcedHeirship,
    estates: [...world.legacy.estates]
      .reverse()
      .slice(0, 30)
      .map((e) => ({
        id: e.id,
        deceasedName: name(world, e.deceasedId),
        tick: e.tick,
        currency: currencyInfo(e.currency),
        grossMinor: e.grossMinor,
        taxMinor: e.taxMinor,
        writtenOffMinor: e.writtenOffMinor,
        byWill: e.byWill,
        heirs: e.heirs.map((h) => ({
          name: name(world, h.characterId),
          sharesBp: h.sharesBp,
          amountMinor: h.amountMinor,
        })),
      })),
  };
}

export function projectMedia(world: World, player: Character): MediaView {
  const age = ageOf(player.birth, world.clock).years;
  return {
    canJoin: age >= 13,
    reason: age >= 13 ? null : 'These platforms are for people aged 13 and over.',
    platforms: PLATFORMS.map((p) => ({
      id: p.id,
      name: p.name,
      format: p.format,
      hours: p.hours,
      monetiseAt: p.monetiseAt,
    })),
    niches: NICHES.map((n) => ({
      id: n.id,
      name: n.name,
      trendBp: world.media.trends[n.id] ?? 10_000,
    })),
    styles: MEDIA_STYLES,
    profiles: profilesOf(world, player.id).map((p) => ({
      id: p.id,
      platformId: p.platformId,
      platformName: PLATFORMS.find((x) => x.id === p.platformId)?.name ?? p.platformId,
      handle: p.handle,
      niche: p.niche,
      followers: p.followers,
      engagementBp: p.engagementBp,
      trust: p.trust,
      posts: p.posts,
      lastPostTick: p.lastPostTick,
      earningsMinor: p.earningsMinor,
      sponsor: p.sponsor,
      offer: p.offer && p.offer.expiresTick >= world.tick ? p.offer : null,
    })),
  };
}

export function projectAchievements(world: World): AchievementsView {
  const unlocked = Object.values(world.achievements)
    .sort((a, b) => b.tick - a.tick || (a.achievementId < b.achievementId ? -1 : 1))
    .map((u) => {
      const a = findAchievement(u.achievementId);
      return {
        id: u.achievementId,
        title: a?.title ?? u.achievementId,
        description: a?.description ?? '',
        category: a?.category ?? 'life',
        tick: u.tick,
        characterName: name(world, u.characterId),
        generation: u.generation,
      };
    });
  return {
    total: ACHIEVEMENTS.length,
    categories: ACHIEVEMENT_CATEGORIES,
    unlocked,
    locked: ACHIEVEMENTS.filter((a) => !world.achievements[a.id]).map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      category: a.category,
    })),
  };
}

export interface PackSummary {
  id: string;
  name: string;
  packVersion: string;
  mode: string;
  author: string;
  enabled: boolean;
  events: number;
}

export function projectPacks(world: World): {
  packs: PackSummary[];
  customEventTexts: Record<string, { title: string; outcomes: Record<string, string> }>;
} {
  const customEventTexts: Record<string, { title: string; outcomes: Record<string, string> }> = {};
  for (const record of world.contentPacks) {
    for (const raw of record.events) {
      const e = raw as unknown as EventDefinition;
      customEventTexts[e.id] = { title: e.text.en.title, outcomes: e.text.en.outcomes };
    }
  }
  return {
    packs: world.contentPacks.map((r) => ({
      id: r.id,
      name: r.name,
      packVersion: r.packVersion,
      mode: r.mode,
      author: r.author,
      enabled: r.enabled,
      events: r.events.length,
    })),
    customEventTexts,
  };
}

/** Detailed biography of one person (spec §3.18): summary and chapters by life stage. */
export interface BiographyView {
  personId: string;
  name: string;
  born: { year: number; month: number };
  died: { year: number; month: number } | null;
  ageYears: number;
  generation: number | null;
  summary: {
    jobs: { title: string; employer: string; fromTick: number; toTick: number | null }[];
    partners: string[];
    children: string[];
    peakNetWorthMinor: bigint | null;
    currency: { code: string; exponent: number; symbol: string } | null;
    achievements: number;
    offices: string[];
    companies: string[];
    countries: string[];
  };
  chapters: {
    title: string;
    entries: {
      tick: number;
      key: string;
      params: Record<string, string | number>;
      category: string;
    }[];
  }[];
}

const STAGES: [number, string][] = [
  [0, 'Early years'],
  [13, 'Teenage years'],
  [18, 'Young adulthood'],
  [30, 'Building a life'],
  [50, 'Middle years'],
  [65, 'Later life'],
];

export function projectBiography(world: World, personId: string): BiographyView | null {
  const c = world.characters[personId];
  if (!c) return null;
  const entry = world.legacy.lineage.find((l) => l.characterId === personId);
  const birthIndex = monthIndex(c.birth);
  const startIndex = world.startIndex;
  const ageAt = (tick: number) => Math.floor((startIndex + tick - birthIndex) / 12);
  const entries = world.biography.filter((b) => b.characterId === personId);
  const chapters = STAGES.map(([from, title], i) => {
    const to = STAGES[i + 1]?.[0] ?? 999;
    return {
      title,
      entries: entries
        .filter((b) => ageAt(b.tick) >= from && ageAt(b.tick) < to)
        .map((b) => ({ tick: b.tick, key: b.key, params: b.params, category: b.category })),
    };
  }).filter((ch) => ch.entries.length > 0);
  const partners = new Set<string>();
  for (const r of sortedValues(world.relationships))
    if (r.aId === personId && (r.type === 'partner' || r.type === 'exPartner'))
      partners.add(name(world, r.bId));
  const children = sortedValues(world.familyLinks)
    .filter((l) => l.parentId === personId)
    .map((l) => name(world, l.childId));
  return {
    personId,
    name: displayName(c.identity, false),
    born: c.birth,
    died: c.death,
    ageYears: ageOf(c.birth, c.death ?? world.clock).years,
    generation: entry?.generation ?? null,
    summary: {
      jobs: sortedValues(world.employment)
        .filter((e) => e.characterId === personId)
        .map((e) => ({
          title: e.title,
          employer: e.terms.employer,
          fromTick: e.startTick,
          toTick: e.endTick,
        })),
      partners: [...partners],
      children,
      peakNetWorthMinor: entry ? entry.peakNetWorthMinor : null,
      currency: entry ? currencyInfo(entry.currency) : null,
      achievements: Object.values(world.achievements).filter((a) => a.characterId === personId)
        .length,
      offices: sortedValues(world.civics.politics)
        .filter((p) => p.characterId === personId)
        .flatMap((p) =>
          p.history
            .filter((h) => h.result === 'won' || h.result === 'appointed')
            .map((h) => getInstitutions(p.countryCode).politics.offices[h.level]?.title ?? h.level),
        ),
      companies: sortedValues(world.businesses)
        .filter((b) => b.owners.some((o) => o.ownerId === personId))
        .map((b) => b.name),
      countries: Object.keys(c.civic.residedMonths).map((code) => getCountry(code).name),
    },
    chapters,
  };
}
