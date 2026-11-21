import { describe, expect, it } from 'vitest';
import { checkLedger } from '@engine/economy/ledger';
import type { SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { checked, findWork, giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** An adult musician with money, skill and energy to spare. */
function musician(seed: string): SimState {
  const state = giveMoney(
    findWork(advanceMonths(newState({ seed, scenario: 'wealthy' }), 22 * 12)),
    500_000_000n,
  );
  const world = structuredClone(state.world);
  const p = world.characters[world.activeCharacterId];
  const job = p?.employmentId ? world.employment[p.employmentId] : undefined;
  if (!p || !job) throw new Error('no job');
  job.terms = { ...job.terms, industryId: 'arts', occupationId: 'musician' };
  p.skills.music = 700;
  p.stats.energy = 1000;
  return { world, pending: null };
}
const music = (s: SimState) => projectGame(s).work.career.music;
const rest = (s: SimState) => {
  playerOf(s).stats.energy = 1000;
  return s;
};

/** Writes a song to 100% (two sessions a month at most) and records it at home. */
function writeAndRecord(state: SimState, title: string, coWrite = false): SimState {
  state = checked(state, { type: 'startSong', title, genre: 'pop', mood: 'upbeat', coWrite }).state;
  const id = music(state)?.songs.find((s) => s.title === title)?.id ?? '';
  for (
    let i = 0;
    i < 12 && (music(state)?.songs.find((s) => s.id === id)?.progress ?? 0) < 100;
    i++
  ) {
    const r = run(state, { type: 'writeSong', songId: id });
    if (r.outcome.status === 'applied') state = r.state;
    else state = rest(advanceMonths(state, 1));
  }
  return checked(state, { type: 'recordSong', songId: id, studio: 'home' }).state;
}

describe('music career (E90)', () => {
  it('a song is written over sessions, recorded, released and pays royalties once a month', () => {
    let state = musician('music-indie');
    state = checked(state, {
      type: 'startSong',
      title: 'Paper Skyline',
      genre: 'pop',
      mood: 'upbeat',
      coWrite: false,
    }).state;
    const id = music(state)?.songs[0]?.id ?? '';
    // Not finished: cannot record; three writing sessions a month at most.
    expect(run(state, { type: 'recordSong', songId: id, studio: 'home' }).outcome.status).toBe(
      'rejected',
    );
    for (let i = 0; i < 3 && (music(state)?.songs[0]?.progress ?? 100) < 100; i++)
      state = checked(rest(state), { type: 'writeSong', songId: id }).state;
    if ((music(state)?.songs[0]?.progress ?? 100) < 100)
      expect(run(rest(state), { type: 'writeSong', songId: id }).outcome.status).toBe('rejected');
    state = writeAndRecord(rest(advanceMonths(state, 1)), 'Late Signals', true);
    state = rest(advanceMonths(state, 1));
    expect(music(state)?.songs.find((s) => s.title === 'Late Signals')?.status).toBe('recorded');
    expect(music(state)?.songs.find((s) => s.title === 'Late Signals')?.shareBp).toBe(5_000);
    state = checked(state, {
      type: 'releaseMusic',
      title: 'Late Signals',
      kind: 'single',
      viaLabel: false,
      promo: 'small',
    }).state;
    for (let m = 0; m < 3; m++) state = advanceMonths(state, 1);
    const release = music(state)?.releases[0];
    expect(release?.grossMinor).toBeGreaterThan(0n);
    // Co-written: you keep half of what the song earns; three months, three payments.
    const paid = release ? release.grossMinor / 2n : 0n;
    expect(Number(release?.paidMinor)).toBeCloseTo(Number(paid), -1);
    expect(music(state)?.chart).toHaveLength(10);
    expect(checkLedger(state.world)).toEqual([]);
  }, 180_000);

  it('a label pays an advance, is exclusive, and recoups before you are paid', () => {
    let state = musician('music-label');
    const m = playerOf(state).career.music ?? undefined;
    expect(m).toBeUndefined();
    state = writeAndRecord(state, 'Neon Rain');
    const p = playerOf(state);
    if (!p.career.music) throw new Error('no music');
    p.career.music.labelOffer = {
      name: 'Tin Moon Music',
      artistPct: 20,
      advanceMinor: 1_000_000n,
      releasesOwed: 2,
      expiresTick: state.world.tick + 2,
      negotiated: false,
    };
    state = checked(state, { type: 'answerLabel', response: 'accept' }).state;
    expect(music(state)?.label?.unrecoupedMinor).toBe(1_000_000n);
    state = rest(advanceMonths(state, 1));
    expect(
      run(state, {
        type: 'releaseMusic',
        title: '',
        kind: 'single',
        viaLabel: false,
        promo: 'none',
      }).outcome.status,
    ).toBe('rejected');
    state = checked(state, {
      type: 'releaseMusic',
      title: '',
      kind: 'single',
      viaLabel: true,
      promo: 'big',
    }).state;
    state = advanceMonths(state, 1);
    const r = music(state)?.releases[0];
    expect(r?.label).toBe('Tin Moon Music');
    expect(r?.paidMinor).toBe(0n);
    expect(music(state)?.label?.releasesOwed).toBe(1);
    expect(checkLedger(state.world)).toEqual([]);
  }, 180_000);

  it('live shows need a setlist, cost money up front and happen once a month', () => {
    let state = writeAndRecord(musician('music-live'), 'Golden Streets');
    state = rest(advanceMonths(state, 1));
    state = checked(state, { type: 'rehearseLive' }).state;
    const cafe = music(state)?.venues.find((v) => v.kind === 'cafe');
    expect(cafe?.reason).toBeNull();
    state = checked(state, { type: 'playShow', venueId: cafe?.id ?? '' }).state;
    expect(music(state)?.fans).toBeGreaterThan(0);
    const other = music(state)?.venues[0];
    if (other) expect(other.reason).toMatch(/already played|following|more recorded/);
    expect(checkLedger(state.world)).toEqual([]);
  }, 180_000);

  it('simulated mode writes, records and releases on its own', () => {
    let state = checked(musician('music-autopilot'), {
      type: 'setMusicAutopilot',
      value: true,
    }).state;
    for (let m = 0; m < 12; m++) {
      state = advanceMonths(state, 1);
      // Life can end a job (a layoff, say); stay a musician without touching music decisions.
      if (!music(state)?.isMusician)
        state = checked(state, { type: 'startCreativePath', occupationId: 'musician' }).state;
    }
    expect(music(state)?.releases.length).toBeGreaterThan(0);
    expect(checkLedger(state.world)).toEqual([]);
  }, 180_000);
});

describe('music: catalogue and pace', () => {
  it('released songs stay in the list, and a song can get several sessions a month', () => {
    let state = musician('music-catalogue');
    state = checked(state, {
      type: 'startSong',
      title: 'Quiet Tides',
      genre: 'folk',
      mood: 'dreamy',
      coWrite: false,
    }).state;
    const id = music(state)?.songs[0]?.id ?? '';
    state = checked(state, { type: 'writeSong', songId: id }).state;
    state = rest(state);
    state = checked(state, { type: 'writeSong', songId: id }).state;
    expect(music(state)?.songs[0]?.progress).toBeGreaterThanOrEqual(70);
    state = writeAndRecord(rest(state), 'Late Rain');
    state = rest(advanceMonths(state, 1));
    state = checked(state, {
      type: 'releaseMusic',
      title: '',
      kind: 'single',
      viaLabel: false,
      promo: 'none',
    }).state;
    const released = music(state)?.songs.filter((s) => s.status === 'released') ?? [];
    expect(released.length).toBe(1);
  }, 180_000);
});

describe('music depth: band, manager, tour (E102)', () => {
  it('a band shares takings, a manager takes commission, a tour plays shows for you', () => {
    let state = writeAndRecord(musician('music-crew'), 'Silver Streets');
    state = rest(advanceMonths(state, 1));
    for (const t of ['Paper Rain', 'Quiet Echoes'])
      state = rest(advanceMonths(writeAndRecord(state, t), 1));
    // Too few fans for a manager or a tour yet: each explains why.
    expect(run(state, { type: 'hireManager' }).outcome.status).toBe('rejected');
    expect(run(state, { type: 'startTour' }).outcome.status).toBe('rejected');
    state = checked(state, { type: 'formBand', name: 'The Lanterns' }).state;
    expect(music(state)?.band?.memberNames).toHaveLength(2);
    const m = playerOf(state).career.music;
    if (!m) throw new Error('no music');
    m.fans = 5_000;
    state = checked(state, { type: 'hireManager' }).state;
    state = checked(state, { type: 'startTour' }).state;
    for (let i = 0; i < 3; i++) state = advanceMonths(state, 1);
    const journal = Object.values(state.world.ledger.journal).flat();
    expect(journal.some((t) => t.kind === 'tx.bandShare')).toBe(true);
    expect(journal.some((t) => t.kind === 'tx.managerCommission')).toBe(true);
    expect(music(state)?.tour).toBeNull();
    expect(checkLedger(state.world)).toEqual([]);
  }, 240_000);
});
