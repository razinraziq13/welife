import { clamp } from '../core/data';
import { applyPercent, minBig } from '../core/money';
import { Rng } from '../core/rng';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { spendHours, timeBudget } from '../calendar/time';
import { changeSkill, changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { payExpense, payerFor, receiveIncome } from '../economy/finance';
import { meetPeople } from '../social/npcs';
import { adjustPair } from '../social/relationships';
import { getCountry } from '../world/countries';
import {
  MUSIC_GENRES,
  type Character,
  type MusicRelease,
  type MusicState,
  type Song,
  type World,
} from '../state/schema';
import { activeEmployment } from './jobs';

/**
 * The music career (decision E90). Musicians write original songs over several sessions
 * (alone or with an NPC co-writer, with credit splits), record them at a studio they can
 * afford, and release singles, EPs or albums independently or through a label (advance,
 * recoupment, royalty share, releases owed, exclusivity). Releases earn capped monthly
 * royalties while their momentum lasts and compete with fictional artists on a monthly
 * chart; live shows come from a venue board gated by fans and setlist size. Simulated mode
 * runs routine work on its own. All numbers PROPOSED TUNING; titles and artists are fictional.
 */

type Genre = (typeof MUSIC_GENRES)[number];
type Studio = 'home' | 'independent' | 'professional';
type ReleaseType = 'single' | 'ep' | 'album';

export const NEW_MUSIC: MusicState = {
  songs: [],
  releases: [],
  fans: 0,
  recognition: 0,
  critics: 0,
  prep: 20,
  label: null,
  labelOffer: null,
  venues: [],
  chart: [],
  autopilot: false,
};

const WRITES_PER_MONTH = 3;
/** Studio cost (% of the median monthly wage) and the best production it allows. */
export const STUDIO = {
  home: { costPct: 5, cap: 55 },
  independent: { costPct: 40, cap: 80 },
  professional: { costPct: 150, cap: 100 },
} as const;
/** Songs needed, revenue weight and monthly momentum decay by release type. */
export const RELEASE = {
  single: { songs: 1, weight: 1, decay: 15 },
  ep: { songs: 3, weight: 2, decay: 10 },
  album: { songs: 6, weight: 4, decay: 6 },
} as const;
const PROMO = {
  none: { pct: 0, boost: 0 },
  small: { pct: 20, boost: 6 },
  big: { pct: 80, boost: 15 },
} as const;
/** A month's royalties never exceed this many median wages (no uncapped streaming money). */
const ROYALTY_CAP_MONTHS = 40;
const VENUES = {
  cafe: { capacity: 40, ticketBp: 30, minSongs: 1, minFans: 0 },
  club: { capacity: 150, ticketBp: 60, minSongs: 3, minFans: 300 },
  festival: { capacity: 2_000, ticketBp: 80, minSongs: 5, minFans: 5_000 },
  theatre: { capacity: 1_500, ticketBp: 120, minSongs: 6, minFans: 25_000 },
  arena: { capacity: 15_000, ticketBp: 150, minSongs: 8, minFans: 250_000 },
} as const;
const VENUE_NAMES = {
  cafe: ['The Kettle Room', 'Corner Bean', 'Lantern Cafe'],
  club: ['The Basement', 'Blue Door Club', 'Night Owl'],
  festival: ['Riverside Sounds', 'Summer Fields Festival', 'Coastline Weekender'],
  theatre: ['The Grand Hall', 'Royal Crescent Theatre', 'Old Mill Stage'],
  arena: ['Harbour Arena', 'Central Dome', 'Northgate Arena'],
} as const;
const LABELS = [
  'Brightwave Records',
  'Tin Moon Music',
  'Copperline Records',
  'Saltmarsh Sound',
  'Polar Light Music',
];
const CHART_ARTISTS = [
  'Lumen & Ash',
  'Mira Solano',
  'Coastline Theory',
  'Neon Orchard',
  'Saffron Tide',
  'Rafi Lane',
  'The Copper Moths',
  'Nadia Vale',
  'Glasshouse Choir',
  'Ivy Marlowe',
  'Static Bloom',
  'North Avenue Kids',
];
const WORDS_A = [
  'Paper',
  'Neon',
  'Silver',
  'Late',
  'Golden',
  'Quiet',
  'Electric',
  'Borrowed',
  'Midnight',
  'Wild',
];
const WORDS_B = [
  'Hearts',
  'Skyline',
  'Rain',
  'Summer',
  'Static',
  'Letters',
  'Tides',
  'Signals',
  'Echoes',
  'Streets',
];

export const MUSIC_MESSAGES = {
  notMusician: 'Start the musician path in Career, Paths to make music.',
  tooManySongs: 'Your notebook is full: release or abandon some songs first.',
  noSong: 'That song is not in your catalog.',
  notDraft: 'This song is no longer a draft.',
  writeLimit: 'You have already had three writing sessions this month.',
  noTime: 'You have no free time left this month.',
  tooTired: 'You are too tired; rest first.',
  unfinished: 'Finish writing the song first.',
  cannotAfford: 'You cannot afford this right now.',
  notEnoughSongs: 'You do not have enough recorded songs for this release.',
  exclusive: 'Your label deal is exclusive: release through the label.',
  noLabel: 'You do not have a label deal.',
  noOffer: 'There is no label offer to answer.',
  negotiated: 'You have already negotiated this offer.',
  showThisMonth: 'You have already played a show this month.',
  smallSetlist: 'You need more recorded songs for this setlist.',
  fewFans: 'This venue only books acts with a bigger following.',
  noVenue: 'That booking is no longer available.',
  rehearsed: 'You have already rehearsed this month.',
  hasBand: 'You are already in a band.',
  noBand: 'You are not in a band.',
  hasManager: 'You already have a manager.',
  noManager: 'You do not have a manager.',
  fewFansManager: 'Managers take on acts with at least 500 fans.',
  onTour: 'You are already on tour.',
  fewFansTour: 'A tour needs at least 2,000 fans to sell tickets.',
} as const;
export type MusicBlock = keyof typeof MUSIC_MESSAGES;

export class MusicError extends Error {
  constructor(readonly code: MusicBlock) {
    super(MUSIC_MESSAGES[code]);
    this.name = 'MusicError';
  }
}

export function musicOf(c: Character): MusicState {
  c.career.music ??= { ...NEW_MUSIC, songs: [], releases: [], venues: [], chart: [] };
  return c.career.music;
}
const read = (c: Character) => c.career.music ?? NEW_MUSIC;

export function isMusician(world: World, c: Character): boolean {
  return activeEmployment(world, c)?.terms.occupationId === 'musician';
}

const count = (world: World, key: string) =>
  world.activity.tick === world.tick ? (world.activity.counts[`music:${key}`] ?? 0) : 0;
function mark(world: World, key: string) {
  if (world.activity.tick !== world.tick)
    world.activity = { tick: world.tick, counts: {}, hoursUsed: 0 };
  world.activity.counts[`music:${key}`] = count(world, key) + 1;
}
function busyBlock(world: World, c: Character, hours: number, energy: number): MusicBlock | null {
  const t = timeBudget(world);
  if (t.used + hours > t.total) return 'noTime';
  return c.stats.energy < energy ? 'tooTired' : null;
}
const median = (world: World, c: Character) => medianWage(world, c.countryCode);
function canPay(world: World, c: Character, amount: bigint): boolean {
  const payer = payerFor(world, c);
  const bal = (id: string | null | undefined) =>
    id ? (world.ledger.accounts[id]?.balance ?? 0n) : 0n;
  return !!payer && bal(payer.checkingId) + bal(payer.savingsId) >= amount;
}
function spend(
  world: World,
  c: Character,
  category: string,
  amount: bigint,
  kind: string,
  params: Record<string, string> = {},
) {
  const payer = payerFor(world, c);
  if (payer && amount > 0n) payExpense(world, payer, category, amount, kind, params);
}
function earn(
  world: World,
  c: Character,
  amount: bigint,
  kind: string,
  params: Record<string, string> = {},
) {
  const into = c.finance?.checkingId ?? c.finance?.savingsId;
  if (!into || amount <= 0n) return;
  receiveIncome(world, c.id, into, 'music', amount, kind, params);
  // A manager takes their commission on everything the music earns.
  const manager = c.career.music?.manager;
  if (manager)
    spend(
      world,
      c,
      'agentFees',
      applyPercent(amount, manager.commissionPct),
      'tx.managerCommission',
      { name: manager.name },
    );
}

/** One genre is in fashion each year (seeded from the world, no stored state). */
export function musicTrend(world: World): Genre {
  const rng = Rng.fromSeed(`${world.seed}:music-trend:${String(world.clock.year)}`);
  return MUSIC_GENRES[rng.int(MUSIC_GENRES.length)] ?? 'pop';
}

// ---------- Songwriting ----------

export function newSongBlock(world: World, c: Character): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  return read(c).songs.filter((s) => s.status !== 'released').length >= 12 ? 'tooManySongs' : null;
}

/** Starts a draft; a co-writer is a new musician you meet (they take half the credit). */
export function startSong(
  world: World,
  c: Character,
  title: string,
  genre: Genre,
  mood: Song['mood'],
  coWrite: boolean,
): Song {
  const block = newSongBlock(world, c);
  if (block) throw new MusicError(block);
  const m = musicOf(c);
  let coWriterId: string | null = null;
  let coWriter = '';
  if (coWrite) {
    const age = ageYears(world, c);
    const [npc] = meetPeople(world, c, 1, 'friend', [Math.max(18, age - 8), age + 10]);
    if (npc) {
      coWriterId = npc.id;
      coWriter = `${npc.identity.firstName} ${npc.identity.lastName}`.trim();
      changeSkill(world, npc, 'music', 200, 'music:cowriter');
    }
  }
  const song: Song = {
    id: nextId(world, 'song'),
    title: title.trim(),
    genre,
    mood,
    coWriterId,
    coWriter,
    shareBp: coWriterId ? 5_000 : 10_000,
    progress: 0,
    quality: 0,
    production: 0,
    status: 'draft',
    studio: null,
    createdTick: world.tick,
  };
  m.songs.push(song);
  return song;
}

export function writeBlock(world: World, c: Character, song: Song | undefined): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  if (!song) return 'noSong';
  if (song.status !== 'draft') return 'notDraft';
  if (song.progress >= 100) return 'notDraft';
  if (count(world, 'write') >= WRITES_PER_MONTH) return 'writeLimit';
  return busyBlock(world, c, 4, 30);
}

/** A writing session: progress slows as the song nears done; quality follows skill. */
export function writeSession(world: World, c: Character, songId: string, auto = false): Song {
  const song = read(c).songs.find((s) => s.id === songId);
  const block = auto ? (song?.status === 'draft' ? null : 'notDraft') : writeBlock(world, c, song);
  if (block || !song) throw new MusicError(block ?? 'noSong');
  if (!auto) {
    spendHours(world, 4);
    changeStat(world, c, 'energy', -30, 'music:write');
  }
  mark(world, 'write');
  const co = song.coWriterId ? world.characters[song.coWriterId] : undefined;
  const sample = withRng(world, 'career', (rng) =>
    clamp(
      Math.floor(c.skills.music / 10) +
        (co ? Math.floor(co.skills.music / 40) : 0) +
        rng.range(-12, 12),
      5,
      100,
    ),
  );
  const gain = Math.max(12, 45 - Math.floor(song.progress / 3)) + (co ? 10 : 0);
  const next = Math.min(100, song.progress + gain);
  song.quality = Math.round(
    (song.quality * song.progress + sample * (next - song.progress)) / next,
  );
  song.progress = next;
  changeSkill(world, c, 'music', 6, 'music:write');
  if (co) adjustPair(world, c.id, co.id, { closeness: 6, trust: 4 });
  return song;
}

export function abandonSong(c: Character, songId: string): void {
  const m = musicOf(c);
  const song = m.songs.find((s) => s.id === songId);
  if (!song) throw new MusicError('noSong');
  if (song.status !== 'draft' && song.status !== 'recorded') throw new MusicError('notDraft');
  m.songs = m.songs.filter((s) => s !== song);
}

// ---------- Recording ----------

export function studioCost(world: World, c: Character, studio: Studio): bigint {
  return applyPercent(median(world, c), STUDIO[studio].costPct);
}

export function recordBlock(
  world: World,
  c: Character,
  song: Song | undefined,
  studio: Studio,
): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  if (!song) return 'noSong';
  if (song.status !== 'draft') return 'notDraft';
  if (song.progress < 100) return 'unfinished';
  // Under a label, the label pays for the studio (charged against your royalties).
  if (!read(c).label && !canPay(world, c, studioCost(world, c, studio))) return 'cannotAfford';
  return null;
}

/** Books the studio: recording takes the rest of the month. */
export function recordSong(world: World, c: Character, songId: string, studio: Studio): Song {
  const m = musicOf(c);
  const song = m.songs.find((s) => s.id === songId);
  const block = recordBlock(world, c, song, studio);
  if (block || !song) throw new MusicError(block ?? 'noSong');
  const cost = studioCost(world, c, studio);
  if (m.label) m.label.unrecoupedMinor += cost;
  else spend(world, c, 'studio', cost, 'tx.studioTime', { title: song.title });
  song.status = 'recording';
  song.studio = studio;
  song.production = withRng(world, 'career', (rng) =>
    clamp(
      Math.floor((c.skills.music + c.skills.technology) / 25) + 20 + rng.range(-10, 10),
      10,
      STUDIO[studio].cap,
    ),
  );
  return song;
}

// ---------- Releases ----------

/** The songs a release would use: the best recorded, unreleased ones. */
export function tracklist(c: Character, type: ReleaseType): Song[] {
  return read(c)
    .songs.filter((s) => s.status === 'recorded')
    .sort((a, b) => b.quality + b.production - (a.quality + a.production))
    .slice(0, RELEASE[type].songs);
}

export function promoCost(world: World, c: Character, promo: keyof typeof PROMO): bigint {
  return applyPercent(median(world, c), PROMO[promo].pct);
}

export function releaseBlock(
  world: World,
  c: Character,
  type: ReleaseType,
  viaLabel: boolean,
  promo: keyof typeof PROMO,
): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  const m = read(c);
  if (tracklist(c, type).length < RELEASE[type].songs) return 'notEnoughSongs';
  if (viaLabel && !m.label) return 'noLabel';
  if (!viaLabel && m.label) return 'exclusive';
  if (!viaLabel && !canPay(world, c, promoCost(world, c, promo))) return 'cannotAfford';
  return null;
}

export function releaseMusic(
  world: World,
  c: Character,
  title: string,
  type: ReleaseType,
  viaLabel: boolean,
  promo: keyof typeof PROMO,
): MusicRelease {
  const block = releaseBlock(world, c, type, viaLabel, promo);
  if (block) throw new MusicError(block);
  const m = musicOf(c);
  const songs = tracklist(c, type);
  const cost = promoCost(world, c, promo);
  if (viaLabel && m.label) m.label.unrecoupedMinor += cost;
  else spend(world, c, 'promotion', cost, 'tx.musicPromotion', { title });
  const avg = (f: (s: Song) => number) =>
    Math.round(songs.reduce((t, s) => t + f(s), 0) / songs.length);
  const trend = songs.some((s) => s.genre === musicTrend(world)) ? 10 : 0;
  const { appeal, critics } = withRng(world, 'career', (rng) => ({
    appeal: clamp(
      Math.floor(avg((s) => s.quality) * 0.4 + avg((s) => s.production) * 0.3) +
        trend +
        PROMO[promo].boost +
        (viaLabel ? 8 : 0) +
        rng.range(-15, 15),
      1,
      100,
    ),
    critics: clamp(
      Math.floor(avg((s) => s.quality) * 0.7 + avg((s) => s.production) * 0.2) +
        (type === 'album' ? 5 : 0) +
        rng.range(-12, 12),
      0,
      100,
    ),
  }));
  const release: MusicRelease = {
    id: nextId(world, 'rel'),
    title: title.trim() || (songs[0]?.title ?? 'Untitled'),
    type,
    songIds: songs.map((s) => s.id),
    label: viaLabel && m.label ? m.label.name : null,
    artistPct: viaLabel && m.label ? m.label.artistPct : 100,
    tick: world.tick,
    appeal,
    critics,
    momentum: appeal,
    peakRank: 0,
    grossMinor: 0n,
    paidMinor: 0n,
    award: null,
  };
  for (const s of songs) s.status = 'released';
  m.releases = [...m.releases, release].slice(-60);
  m.critics = clamp(m.critics + Math.floor((critics - 50) * RELEASE[type].weight), 0, 1000);
  c.career.reputation = clamp(c.career.reputation + 10 * RELEASE[type].weight, 0, 1000);
  if (viaLabel && m.label) m.label.releasesOwed = Math.max(0, m.label.releasesOwed - 1);
  // Awards: a strong EP or album can be up for a (fictional) Golden Note.
  if (type !== 'single' && critics >= 78) {
    const roll = withRng(world, 'career', (rng) => rng.int(100));
    if (roll < (critics - 60) * 3) {
      release.award = roll < critics - 70 ? 'won' : 'nominated';
      m.recognition = clamp(m.recognition + (release.award === 'won' ? 120 : 40), 0, 1000);
      addBiography(
        world,
        c.id,
        'work',
        release.award === 'won' ? 'bio.goldenNoteWon' : 'bio.goldenNoteNominated',
        { title: release.title },
      );
      addNotification(
        world,
        'work',
        release.award === 'won' ? 'ntf.goldenNoteWon' : 'ntf.goldenNoteNominated',
        { title: release.title },
        'career',
      );
    }
  }
  addBiography(world, c.id, 'work', 'bio.musicReleased', { title: release.title, type });
  return release;
}

/** Royalties for one release this month, split by credits, then label share and recoupment. */
function royalties(world: World, c: Character, m: MusicState, r: MusicRelease): void {
  const songs = m.songs.filter((s) => r.songIds.includes(s.id));
  const shareBp = songs.length
    ? Math.round(songs.reduce((t, s) => t + s.shareBp, 0) / songs.length)
    : 10_000;
  const fanFactor = 100 + Math.min(400, Math.floor(m.fans / 2_000));
  const gross = minBig(
    (median(world, c) * BigInt(r.momentum * r.momentum * RELEASE[r.type].weight * fanFactor)) /
      1_000_000n,
    median(world, c) * BigInt(ROYALTY_CAP_MONTHS),
  );
  if (gross <= 0n) return;
  r.grossMinor += gross;
  let artist = (applyPercent(gross, r.artistPct) * BigInt(shareBp)) / 10_000n;
  if (r.label && m.label?.name === r.label && m.label.unrecoupedMinor > 0n) {
    const recoup = minBig(artist, m.label.unrecoupedMinor);
    m.label.unrecoupedMinor -= recoup;
    artist -= recoup;
  }
  if (artist > 0n) {
    r.paidMinor += artist;
    earn(world, c, artist, 'tx.musicRoyalties', { title: r.title });
  }
}

// ---------- Live ----------

export function rehearseBlock(world: World, c: Character): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  if (count(world, 'rehearse') > 0) return 'rehearsed';
  return busyBlock(world, c, 4, 40);
}

export function rehearseLive(world: World, c: Character): number {
  const block = rehearseBlock(world, c);
  if (block) throw new MusicError(block);
  spendHours(world, 4);
  mark(world, 'rehearse');
  changeStat(world, c, 'energy', -40, 'music:rehearse');
  const m = musicOf(c);
  m.prep = clamp(m.prep + Math.max(5, 30 - Math.floor(m.prep / 4)), 0, 100);
  changeSkill(world, c, 'music', 5, 'music:rehearse');
  return m.prep;
}

const setlist = (m: MusicState) =>
  m.songs.filter((s) => s.status === 'recorded' || s.status === 'released').length;

/** Band members take this share of ticket takings (they play too). */
const BAND_SHARE = 30;

export function bandBlock(world: World, c: Character): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  return read(c).band ? 'hasBand' : null;
}

/** Form a band with two musicians you meet: bigger, better shows, shared takings. */
export function formBand(world: World, c: Character, name: string): void {
  const block = bandBlock(world, c);
  if (block) throw new MusicError(block);
  const age = ageYears(world, c);
  const members = meetPeople(world, c, 2, 'friend', [Math.max(18, age - 8), age + 8]);
  for (const npc of members) changeSkill(world, npc, 'music', 300, 'music:band');
  musicOf(c).band = {
    name: name.trim(),
    memberIds: members.map((n) => n.id),
    memberNames: members.map((n) => `${n.identity.firstName} ${n.identity.lastName}`.trim()),
  };
  addBiography(world, c.id, 'work', 'bio.formedBand', { band: name.trim() });
}

export function leaveBand(c: Character): void {
  if (!c.career.music?.band) throw new MusicError('noBand');
  c.career.music.band = null;
}

export function managerBlock(world: World, c: Character): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  const m = read(c);
  if (m.manager) return 'hasManager';
  return m.fans < 500 ? 'fewFansManager' : null;
}

/** A manager (15% of music income) brings label interest and bigger venues sooner. */
export function hireManager(world: World, c: Character): void {
  const block = managerBlock(world, c);
  if (block) throw new MusicError(block);
  const [npc] = meetPeople(world, c, 1, 'colleague', [28, 60]);
  if (!npc) return;
  musicOf(c).manager = {
    id: npc.id,
    name: `${npc.identity.firstName} ${npc.identity.lastName}`.trim(),
    commissionPct: 15,
  };
}

export function fireManager(c: Character): void {
  if (!c.career.music?.manager) throw new MusicError('noManager');
  c.career.music.manager = null;
}

export function tourBlock(world: World, c: Character): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  const m = read(c);
  if (m.tour) return 'onTour';
  if (m.fans < 2_000) return 'fewFansTour';
  return setlist(m) < 3 ? 'smallSetlist' : null;
}

/** A three-month tour: up to three shows a month at your best venues, played for you. */
export function startTour(world: World, c: Character): void {
  const block = tourBlock(world, c);
  if (block) throw new MusicError(block);
  musicOf(c).tour = { monthsLeft: 3, shows: 0, netMinor: 0n };
}

function tourMonth(world: World, c: Character, m: MusicState): void {
  const tour = m.tour;
  if (!tour) return;
  for (let i = 0; i < 3; i++) {
    const venue = [...m.venues].reverse().find((v) => !showBlock(world, c, v.id, true, true));
    if (!venue) break;
    const r = playShow(world, c, venue.id, true, true);
    tour.shows += 1;
    tour.netMinor += r.net;
  }
  changeStat(world, c, 'energy', -30, 'music:tour');
  changeStat(world, c, 'stress', 15, 'music:tour');
  tour.monthsLeft -= 1;
  if (tour.monthsLeft <= 0) {
    addNotification(world, 'work', 'ntf.tourDone', { shows: tour.shows }, 'career');
    m.tour = null;
  }
}

export function showBlock(
  world: World,
  c: Character,
  venueId: string,
  auto = false,
  onTour = false,
): MusicBlock | null {
  if (!isMusician(world, c)) return 'notMusician';
  const m = read(c);
  const v = m.venues.find((x) => x.id === venueId);
  if (!v) return 'noVenue';
  // One show a month, except on tour (several, booked for you).
  if (!onTour && count(world, 'show') > 0) return 'showThisMonth';
  if (m.fans < v.minFans) return 'fewFans';
  if (setlist(m) < v.minSongs) return 'smallSetlist';
  if (!canPay(world, c, v.costMinor)) return 'cannotAfford';
  return auto ? null : busyBlock(world, c, 6, 60);
}

/** Plays a booked show: costs up front, tickets after; fans and reputation follow how it went. */
export function playShow(
  world: World,
  c: Character,
  venueId: string,
  auto = false,
  onTour = false,
) {
  const block = showBlock(world, c, venueId, auto, onTour);
  if (block) throw new MusicError(block);
  const m = musicOf(c);
  const v = m.venues.find((x) => x.id === venueId);
  if (!v) throw new MusicError('noVenue');
  if (!auto) {
    spendHours(world, 6);
    changeStat(world, c, 'energy', -60, 'music:show');
  }
  mark(world, 'show');
  spend(world, c, 'touring', v.costMinor, 'tx.showCosts', { venue: v.venue });
  const { satisfaction, crowd } = withRng(world, 'career', (rng) => ({
    satisfaction: clamp(
      Math.floor(m.prep * 0.4 + c.skills.music / 30 + c.skills.socializing / 50) +
        (m.band ? 10 : 0) +
        rng.range(-15, 15),
      0,
      100,
    ),
    crowd: rng.range(25, 60),
  }));
  // A band draws a bigger crowd (and shares the takings).
  const bandBoost = m.band ? 130 : 100;
  const attendance = Math.min(
    v.capacity,
    Math.floor((((v.capacity * crowd) / 100 + m.fans / 20) * bandBoost) / 100),
  );
  const takings = v.ticketMinor * BigInt(attendance);
  earn(world, c, takings, 'tx.ticketSales', { venue: v.venue });
  if (m.band)
    spend(world, c, 'bandShares', applyPercent(takings, BAND_SHARE), 'tx.bandShare', {
      band: m.band.name,
    });
  m.fans = Math.min(100_000_000, m.fans + Math.floor((attendance * satisfaction) / 150));
  m.prep = Math.max(20, m.prep - 30);
  c.career.reputation = clamp(c.career.reputation + Math.floor((satisfaction - 40) / 4), 0, 1000);
  changeStat(world, c, 'happiness', Math.floor((satisfaction - 40) / 2), 'music:show');
  m.venues = m.venues.filter((x) => x !== v);
  return { venue: v.venue, attendance, satisfaction, net: takings - v.costMinor };
}

// ---------- Labels ----------

export function answerLabel(
  world: World,
  c: Character,
  response: 'accept' | 'negotiate' | 'decline',
): string {
  const m = musicOf(c);
  const o = m.labelOffer;
  if (!o) throw new MusicError('noOffer');
  if (response === 'decline') {
    m.labelOffer = null;
    return 'declined';
  }
  if (response === 'negotiate') {
    if (o.negotiated) throw new MusicError('negotiated');
    o.negotiated = true;
    const roll = withRng(world, 'career', (rng) => rng.int(100));
    if (roll < 25 + Math.floor(c.career.reputation / 25)) {
      o.artistPct = Math.min(50, o.artistPct + 5);
      return 'labelImproved';
    }
    if (roll >= 85) {
      m.labelOffer = null;
      return 'labelWithdrew';
    }
    return 'labelHeldFirm';
  }
  m.label = {
    name: o.name,
    artistPct: o.artistPct,
    advanceMinor: o.advanceMinor,
    releasesOwed: o.releasesOwed,
    unrecoupedMinor: o.advanceMinor,
    endTick: world.tick + 36,
  };
  m.labelOffer = null;
  earn(world, c, o.advanceMinor, 'tx.labelAdvance', { label: o.name });
  addBiography(world, c.id, 'work', 'bio.signedLabel', { label: o.name });
  return 'signed';
}

// ---------- Monthly ----------

function refreshVenues(world: World, c: Character, m: MusicState): void {
  const rng = new Rng(world.rng.career);
  const med = median(world, c);
  const kinds = (['cafe', 'club', 'festival', 'theatre', 'arena'] as const).filter(
    // A manager books bigger rooms sooner.
    (k) => m.fans >= VENUES[k].minFans / (m.manager ? 4 : 2),
  );
  m.venues = kinds.slice(-3).map((kind) => {
    const v = VENUES[kind];
    const ticket = (med * BigInt(v.ticketBp)) / 10_000n;
    return {
      id: nextId(world, 'gig'),
      venue: rng.pick(VENUE_NAMES[kind]),
      kind,
      capacity: v.capacity,
      ticketMinor: ticket,
      costMinor: (ticket * BigInt(v.capacity)) / 4n,
      minSongs: v.minSongs,
      minFans: v.minFans,
    };
  });
  world.rng.career = rng.state();
}

/** The month's chart: fictional artists against your releases still in play. */
function chartMonth(world: World, c: Character, m: MusicState): void {
  const rng = Rng.fromSeed(`${world.seed}:chart:${String(world.tick)}`);
  const entries = CHART_ARTISTS.map((artist) => ({
    title: `${rng.pick(WORDS_A)} ${rng.pick(WORDS_B)}`,
    artist,
    player: false,
    score: rng.range(35, 95),
  }));
  const you = `${c.identity.firstName} ${c.identity.lastName}`.trim();
  for (const r of m.releases)
    if (r.momentum > 0)
      entries.push({
        title: r.title,
        artist: you,
        player: true,
        score: r.momentum + Math.min(30, Math.floor(m.fans / 20_000)),
      });
  entries.sort((a, b) => b.score - a.score);
  const top = entries.slice(0, 10);
  m.chart = top.map(({ title, artist, player }) => ({ title, artist, player }));
  top.forEach((e, i) => {
    if (!e.player) return;
    const r = m.releases.find((x) => x.title === e.title && x.momentum > 0);
    if (!r) return;
    if (r.peakRank === 0 || i + 1 < r.peakRank) r.peakRank = i + 1;
    m.recognition = clamp(m.recognition + (10 - i) * 3, 0, 1000);
  });
}

/** Simulated mode: one writing session, record what is finished, release, and play a show. */
function autopilot(world: World, c: Character, m: MusicState): void {
  let draft = m.songs.find((s) => s.status === 'draft' && s.progress < 100);
  if (!draft && !newSongBlock(world, c)) {
    const rng = new Rng(world.rng.career);
    const genre = m.songs.at(-1)?.genre ?? rng.pick(MUSIC_GENRES);
    const title = `${rng.pick(WORDS_A)} ${rng.pick(WORDS_B)}`;
    world.rng.career = rng.state();
    draft = startSong(world, c, title, genre, 'upbeat', false);
  }
  if (draft) writeSession(world, c, draft.id, true);
  for (const s of m.songs.filter((x) => x.status === 'draft' && x.progress >= 100))
    if (!recordBlock(world, c, s, 'home')) recordSong(world, c, s.id, 'home');
  if (!releaseBlock(world, c, 'single', !!m.label, 'none'))
    releaseMusic(world, c, '', 'single', !!m.label, 'none');
  const venue = [...m.venues].reverse().find((v) => !showBlock(world, c, v.id, true));
  if (venue) playShow(world, c, venue.id, true);
}

/** Once a month for the player: recordings finish, royalties pay, the chart and offers move. */
export function processMusic(world: World, c: Character): void {
  if (!c.career.music && !isMusician(world, c)) return;
  const m = musicOf(c);
  for (const s of m.songs) if (s.status === 'recording') s.status = 'recorded';
  for (const r of m.releases) {
    if (r.momentum <= 0) continue;
    royalties(world, c, m, r);
    m.fans = Math.min(
      100_000_000,
      m.fans + Math.floor((r.momentum * RELEASE[r.type].weight * (40 + m.fans / 500)) / 10),
    );
    const resurgence = withRng(world, 'career', (rng) => rng.int(100) < 3);
    r.momentum = clamp(r.momentum - RELEASE[r.type].decay + (resurgence ? 20 : 0), 0, 100);
  }
  if (m.label && (m.label.releasesOwed === 0 || world.tick >= m.label.endTick)) {
    addNotification(world, 'work', 'ntf.labelDealEnded', { label: m.label.name }, 'career');
    m.label = null;
  }
  if (m.labelOffer && world.tick > m.labelOffer.expiresTick) m.labelOffer = null;
  if (!isMusician(world, c)) return;
  chartMonth(world, c, m);
  const charted = m.releases.some((r) => r.peakRank > 0);
  if (
    !m.label &&
    !m.labelOffer &&
    (m.fans >= (m.manager ? 1_000 : 2_000) || charted) &&
    withRng(world, 'career', (rng) => rng.int(100) < 30)
  ) {
    const rng = new Rng(world.rng.career);
    m.labelOffer = {
      name: rng.pick(LABELS),
      artistPct: rng.range(18, 30),
      advanceMinor: median(world, c) * BigInt(Math.min(60, 2 + Math.floor(m.fans / 5_000))),
      releasesOwed: 2,
      expiresTick: world.tick + 2,
      negotiated: false,
    };
    world.rng.career = rng.state();
    addNotification(world, 'work', 'ntf.labelOffer', { label: m.labelOffer.name }, 'career');
  }
  refreshVenues(world, c, m);
  if (m.tour) tourMonth(world, c, m);
  else if (m.autopilot) autopilot(world, c, m);
}

export function projectMusic(world: World, c: Character) {
  if (!c.career.music && !isMusician(world, c)) return null;
  const m = read(c);
  const reason = (b: MusicBlock | null) => (b ? MUSIC_MESSAGES[b] : null);
  return {
    isMusician: isMusician(world, c),
    fans: m.fans,
    recognition: m.recognition,
    critics: m.critics,
    prep: m.prep,
    autopilot: m.autopilot,
    band: m.band ?? null,
    manager: m.manager ?? null,
    tour: m.tour ?? null,
    bandReason: reason(bandBlock(world, c)),
    managerReason: reason(managerBlock(world, c)),
    tourReason: reason(tourBlock(world, c)),
    trend: musicTrend(world),
    writesLeft: Math.max(0, WRITES_PER_MONTH - count(world, 'write')),
    newSongReason: reason(newSongBlock(world, c)),
    // Released songs stay in the list (marked released) so your catalogue never vanishes.
    songs: m.songs.map((s) => ({
      ...s,
      writeReason:
        s.status === 'draft' && s.progress < 100 ? reason(writeBlock(world, c, s)) : null,
      record: (['home', 'independent', 'professional'] as const).map((studio) => ({
        studio,
        costMinor: studioCost(world, c, studio),
        reason: reason(recordBlock(world, c, s, studio)),
      })),
    })),
    releaseOptions: (['single', 'ep', 'album'] as const).map((type) => ({
      type,
      songs: RELEASE[type].songs,
      tracklist: tracklist(c, type).map((s) => s.title),
    })),
    releaseReasons: (['single', 'ep', 'album'] as const).map((type) => ({
      type,
      independent: reason(releaseBlock(world, c, type, false, 'none')),
      label: reason(releaseBlock(world, c, type, true, 'none')),
    })),
    promoCosts: { none: 0n, small: promoCost(world, c, 'small'), big: promoCost(world, c, 'big') },
    releases: [...m.releases].reverse().map((r) => ({
      ...r,
      tracks: r.songIds.map((id) => m.songs.find((s) => s.id === id)?.title ?? ''),
    })),
    label: m.label,
    labelOffer: m.labelOffer,
    venues: m.venues.map((v) => ({ ...v, reason: reason(showBlock(world, c, v.id)) })),
    rehearseReason: reason(rehearseBlock(world, c)),
    setlist: setlist(m),
    chart: m.chart,
    currency: getCountry(c.countryCode).currency,
  };
}
