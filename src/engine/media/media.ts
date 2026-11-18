import { clamp, sortedValues } from '../core/data';
import { applyBp, applyPercent } from '../core/money';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { receiveIncome } from '../economy/finance';
import type { Character, MediaProfile, MediaStyle, SkillKey, World } from '../state/schema';

/**
 * Social media studio (spec §3.16): three fictional platforms, content niches with
 * simulated trends, posting with diminishing returns, followers, engagement, ad revenue
 * and brand sponsorships, and the reputation that comes with an audience. All platforms
 * and brands are fictional (decision D8). Numbers are PROPOSED TUNING.
 */

export interface Platform {
  id: string;
  name: string;
  format: string;
  minAge: number;
  /** Hours one post takes. */
  hours: number;
  /** Followers needed before ad revenue starts. */
  monetiseAt: number;
  /** Ad revenue per 1,000 followers a month, basis points of the median monthly wage. */
  rateBp: number;
}

export const PLATFORMS: readonly Platform[] = [
  {
    id: 'murmur',
    name: 'Murmur',
    format: 'Short posts and threads',
    minAge: 13,
    hours: 2,
    monetiseAt: 10_000,
    rateBp: 8,
  },
  {
    id: 'glimpse',
    name: 'Glimpse',
    format: 'Photos and stories',
    minAge: 13,
    hours: 4,
    monetiseAt: 10_000,
    rateBp: 12,
  },
  {
    id: 'streamline',
    name: 'Streamline',
    format: 'Long videos and live streams',
    minAge: 13,
    hours: 8,
    monetiseAt: 1_000,
    rateBp: 25,
  },
];

export const NICHES: readonly { id: string; name: string; skill: SkillKey }[] = [
  { id: 'lifestyle', name: 'Lifestyle', skill: 'socializing' },
  { id: 'gaming', name: 'Gaming', skill: 'technology' },
  { id: 'food', name: 'Food', skill: 'craft' },
  { id: 'fitness', name: 'Fitness', skill: 'fitness' },
  { id: 'education', name: 'Education', skill: 'science' },
  { id: 'comedy', name: 'Comedy', skill: 'socializing' },
  { id: 'music', name: 'Music', skill: 'music' },
  { id: 'business', name: 'Business', skill: 'business' },
  { id: 'travel', name: 'Travel', skill: 'reading' },
  { id: 'art', name: 'Art and design', skill: 'art' },
];

const STYLE: Record<
  MediaStyle,
  { reach: number; engagement: number; trust: number; risk: number }
> = {
  casual: { reach: 100, engagement: 0, trust: 1, risk: 0 },
  informative: { reach: 90, engagement: 5, trust: 6, risk: 0 },
  funny: { reach: 130, engagement: 10, trust: 0, risk: 3 },
  personal: { reach: 100, engagement: 20, trust: 3, risk: 2 },
  controversial: { reach: 180, engagement: 25, trust: -12, risk: 25 },
};

const BRANDS = [
  'Northwind Outfitters',
  'Brightleaf Foods',
  'Lumen Audio',
  'Cobalt Fitness',
  'Willow & Pine',
  'Quill Learning',
  'Harbour Travel Co.',
  'Pixelforge Games',
];

export const MAX_PROFILES = 3;

export type MediaRejection =
  | 'tooYoung'
  | 'unknownPlatform'
  | 'unknownNiche'
  | 'already'
  | 'tooMany'
  | 'unknownProfile'
  | 'noTime'
  | 'noOffer'
  | 'handle';

export const MEDIA_MESSAGES: Record<MediaRejection, string> = {
  tooYoung: 'These platforms are for people aged 13 and over.',
  unknownPlatform: 'There is no such platform.',
  unknownNiche: 'There is no such topic.',
  already: 'You already have an account on this platform.',
  tooMany: 'You can run at most three accounts.',
  unknownProfile: 'There is no such account.',
  noTime: 'You have no free time left this month.',
  noOffer: 'There is no offer to answer.',
  handle: 'Handles use 2-30 letters, numbers, dots or underscores.',
};

export class MediaError extends Error {
  readonly code: MediaRejection;
  constructor(code: MediaRejection) {
    super(MEDIA_MESSAGES[code]);
    this.name = 'MediaError';
    this.code = code;
  }
}

export function getPlatform(id: string): Platform {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new MediaError('unknownPlatform');
  return p;
}

export function profilesOf(world: World, characterId: string): MediaProfile[] {
  return sortedValues(world.media.profiles).filter(
    (p) => p.characterId === characterId && p.closedTick === null,
  );
}

export function totalFollowers(world: World, characterId: string): number {
  return profilesOf(world, characterId).reduce((s, p) => s + p.followers, 0);
}

export function createProfile(
  world: World,
  c: Character,
  platformId: string,
  niche: string,
  handle: string,
): MediaProfile {
  const platform = getPlatform(platformId);
  if (ageYears(world, c) < platform.minAge) throw new MediaError('tooYoung');
  if (!NICHES.some((n) => n.id === niche)) throw new MediaError('unknownNiche');
  if (!/^[A-Za-z0-9._]{2,30}$/.test(handle)) throw new MediaError('handle');
  const mine = profilesOf(world, c.id);
  if (mine.some((p) => p.platformId === platformId)) throw new MediaError('already');
  if (mine.length >= MAX_PROFILES) throw new MediaError('tooMany');
  const profile: MediaProfile = {
    id: nextId(world, 'media'),
    characterId: c.id,
    platformId,
    handle,
    niche,
    followers: Math.floor(c.stats.socialSkill / 50),
    engagementBp: 300,
    trust: 500,
    posts: 0,
    lastPostTick: null,
    earningsMinor: 0n,
    sponsor: null,
    offer: null,
    closedTick: null,
  };
  world.media.profiles[profile.id] = profile;
  addBiography(world, c.id, 'media', 'bio.joinedPlatform', { platform: platform.name });
  return profile;
}

function owned(world: World, c: Character, profileId: string): MediaProfile {
  const p = world.media.profiles[profileId];
  if (p?.characterId !== c.id || p.closedTick !== null) throw new MediaError('unknownProfile');
  return p;
}

export function closeProfile(world: World, c: Character, profileId: string): void {
  owned(world, c, profileId).closedTick = world.tick;
}

/** Integer square root (followers grow faster from a bigger audience, but sub-linearly). */
function isqrt(n: number): number {
  return Math.floor(Math.sqrt(Math.max(0, n)));
}

/** One post. Returns the change in followers (can be negative after a backlash). */
export function post(
  world: World,
  c: Character,
  profileId: string,
  style: MediaStyle,
  spend: (hours: number) => boolean,
  repeats: number,
): number {
  const profile = owned(world, c, profileId);
  const platform = getPlatform(profile.platformId);
  if (!spend(platform.hours)) throw new MediaError('noTime');
  const niche = NICHES.find((n) => n.id === profile.niche) ?? NICHES[0];
  const rule = STYLE[style];
  const quality = clamp(
    Math.floor(
      (c.stats.creativity + c.stats.socialSkill + c.skills[niche?.skill ?? 'socializing']) / 3,
    ) + withRng(world, 'media', (rng) => rng.range(-150, 150)),
    50,
    1000,
  );
  const trend = world.media.trends[profile.niche] ?? 10_000;
  const base = 20 + isqrt(profile.followers) * 4;
  let gain = Math.floor((base * quality * rule.reach * trend) / (500 * 100 * 10_000));
  gain = Math.trunc(gain / (1 + 0.35 * repeats));
  // Controversial posts can backfire.
  const backlash = withRng(world, 'media', (rng) => rng.int(100) < rule.risk);
  if (backlash) {
    const loss = Math.floor(profile.followers / 10) + 10;
    gain = -Math.min(loss, profile.followers);
    profile.trust = clamp(profile.trust - 80, 0, 1000);
    changeStat(world, c, 'reputation', -20, 'media:backlash');
    changeStat(world, c, 'stress', 40, 'media:backlash');
    addNotification(
      world,
      'media',
      'ntf.backlash',
      { platform: platform.name },
      'media',
      profile.id,
    );
  } else {
    profile.trust = clamp(profile.trust + rule.trust, 0, 1000);
  }
  profile.followers = Math.max(0, profile.followers + gain);
  profile.engagementBp = clamp(
    Math.floor(
      (profile.engagementBp * 9 + (300 + rule.engagement * 10 + Math.floor(quality / 10))) / 10,
    ),
    50,
    3000,
  );
  profile.posts += 1;
  profile.lastPostTick = world.tick;
  for (const milestone of [1_000, 10_000, 100_000, 1_000_000]) {
    if (profile.followers >= milestone && profile.followers - gain < milestone) {
      addNotification(
        world,
        'media',
        'ntf.followerMilestone',
        { platform: platform.name, followers: milestone },
        'media',
        profile.id,
      );
      addBiography(world, c.id, 'media', 'bio.followerMilestone', {
        platform: platform.name,
        followers: milestone,
      });
    }
  }
  return gain;
}

export function answerOffer(world: World, c: Character, profileId: string, accept: boolean): void {
  const profile = owned(world, c, profileId);
  const offer = profile.offer;
  if (!offer || offer.expiresTick < world.tick) throw new MediaError('noOffer');
  profile.offer = null;
  if (accept) {
    profile.sponsor = {
      brand: offer.brand,
      monthlyMinor: offer.monthlyMinor,
      untilTick: world.tick + offer.months,
    };
    addBiography(world, c.id, 'media', 'bio.sponsored', { brand: offer.brand });
  }
}

/** Monthly: trends drift; audiences grow or fade; revenue and sponsorship offers. */
export function processMedia(world: World): void {
  for (const niche of NICHES) {
    const now = world.media.trends[niche.id] ?? 10_000;
    const drift = withRng(world, 'media', (rng) => rng.range(-600, 600));
    // Pulled back towards normal over time.
    world.media.trends[niche.id] = clamp(
      now + drift + Math.trunc((10_000 - now) / 12),
      4_000,
      25_000,
    );
  }
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null) return;
  const median = medianWage(world, c.countryCode);
  const into = c.finance?.checkingId ?? c.finance?.savingsId ?? null;
  for (const profile of profilesOf(world, c.id)) {
    const platform = getPlatform(profile.platformId);
    const idle = profile.lastPostTick === null ? 99 : world.tick - profile.lastPostTick;
    if (idle >= 2)
      profile.followers = Math.max(0, profile.followers - Math.ceil(profile.followers / 50));
    else profile.followers += Math.floor((profile.followers * profile.engagementBp) / 200_000);
    profile.engagementBp = clamp(profile.engagementBp - (idle >= 2 ? 20 : 0), 50, 3000);
    let income = 0n;
    if (profile.followers >= platform.monetiseAt && idle < 3) {
      income += applyBp(
        median,
        Math.floor((((platform.rateBp * profile.followers) / 1000) * profile.engagementBp) / 300),
      );
    }
    if (profile.sponsor) {
      if (world.tick > profile.sponsor.untilTick) profile.sponsor = null;
      else income += profile.sponsor.monthlyMinor;
    }
    if (profile.offer && profile.offer.expiresTick < world.tick) profile.offer = null;
    if (!profile.sponsor && !profile.offer && profile.followers >= 5_000 && profile.trust >= 400) {
      if (withRng(world, 'media', (rng) => rng.int(100) < 15)) {
        const brand = withRng(world, 'media', (rng) => rng.pick(BRANDS));
        const monthly = applyPercent(median, clamp(Math.floor(profile.followers / 5_000), 5, 400));
        profile.offer = {
          brand,
          monthlyMinor: monthly,
          months: withRng(world, 'media', (rng) => rng.range(3, 12)),
          expiresTick: world.tick + 2,
        };
        addNotification(
          world,
          'media',
          'ntf.sponsorOffer',
          { brand, platform: platform.name },
          'media',
          profile.id,
        );
      }
    }
    if (income > 0n && into) {
      receiveIncome(world, c.id, into, 'creatorIncome', income, 'tx.creatorIncome', {
        platform: platform.name,
      });
      profile.earningsMinor += income;
    }
  }
  // Fame lifts reputation a little.
  const followers = totalFollowers(world, c.id);
  if (followers >= 10_000 && world.tick % 6 === 0)
    changeStat(
      world,
      c,
      'reputation',
      followers >= 1_000_000 ? 20 : followers >= 100_000 ? 10 : 4,
      'media:audience',
    );
}
