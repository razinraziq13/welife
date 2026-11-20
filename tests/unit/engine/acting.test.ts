import { describe, expect, it } from 'vitest';
import { applyPercent } from '@engine/core/money';
import { actingRole, workActionBlock } from '@engine/career/workActions';
import { balanceOf, checkLedger } from '@engine/economy/ledger';
import type { SimState } from '@engine/core/commands';
import { checked, findWork } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';
import { projectGame, projectPerson } from '@engine/view';
import { knownFor, trendingGenre } from '@engine/career/acting';

/** An adult re-cast as an actor, rested, with a strong reputation. */
function actor(seed: string, occupationId = 'actor'): SimState {
  const state = findWork(advanceMonths(newState({ seed, scenario: 'wealthy' }), 22 * 12));
  const world = structuredClone(state.world);
  const p = world.characters[world.activeCharacterId];
  const job = p?.employmentId ? world.employment[p.employmentId] : undefined;
  if (!p || !job) throw new Error('no job');
  job.terms = { ...job.terms, industryId: 'arts', occupationId };
  p.career.reputation = 1000;
  p.stats.energy = 1000;
  return { world, pending: null };
}

describe('acting contracts (Career Expansion)', () => {
  it('roles grow from extra to lead with credits and reputation', () => {
    const p = playerOf(actor('acting-roles'));
    p.career.credits = 0;
    expect(actingRole(p)).toBe('extra');
    p.career.credits = 2;
    expect(actingRole(p)).toBe('supporting');
    p.career.credits = 5;
    expect(actingRole(p)).toBe('lead');
    p.career.reputation = 400;
    expect(actingRole(p)).toBe('supporting');
  });

  it('a successful audition starts a contract and blocks auditions until it wraps', () => {
    // Other arts careers still audition in one click; actors use the casting board.
    let state = actor('acting-cast', 'illustrator');
    for (let i = 0; i < 24 && !playerOf(state).career.contract; i++) {
      state = checked(state, { type: 'workAction', actionId: 'audition' }).state;
      if (!playerOf(state).career.contract) {
        state = advanceMonths(state, 1);
        playerOf(state).stats.energy = 1000;
      }
    }
    const k = playerOf(state).career.contract;
    expect(k?.role).toBe('extra');
    expect(workActionBlock(state.world, playerOf(state), 'audition')).toBe('underContract');
    expect(checkLedger(state.world)).toEqual([]);
  }, 60_000);

  it('TV pays every month and a wrapped production adds a credit', () => {
    const state = actor('acting-tv');
    const p = playerOf(state);
    p.career.contract = { kind: 'tv', role: 'supporting', monthlyMinor: 50_000n, monthsLeft: 1 };
    const account = p.finance?.checkingId ?? null;
    const before = balanceOf(state.world, account);
    const next = advanceMonths(state, 1);
    const tv = Object.values(next.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.tvEpisodes');
    expect(tv.length).toBe(1);
    expect(balanceOf(next.world, account)).not.toBe(before);
    expect(playerOf(next).career.contract).toBeUndefined();
    expect(playerOf(next).career.credits).toBe(1);
  });
});

describe('acting career: casting board to filmography (E89)', () => {
  /** Auditions every open listing it can until an offer of the wanted format arrives. */
  function castIn(state: SimState, format: 'film' | 'tv'): SimState {
    for (let month = 0; month < 36; month++) {
      const screen = projectGame(state).work.career.screen;
      const offer = screen?.board.find((l) => l.status === 'offered' && l.format === format);
      if (offer)
        return checked(state, { type: 'answerCasting', listingId: offer.id, response: 'accept' })
          .state;
      for (const l of screen?.board ?? []) {
        if (l.status !== 'open' || l.format !== format || l.auditionReason) continue;
        const approach =
          l.genre === 'comedy' || l.genre === 'family'
            ? 'comedic'
            : l.genre === 'action'
              ? 'energetic'
              : 'restrained';
        state = checked(state, { type: 'audition', listingId: l.id, approach }).state;
      }
      state = advanceMonths(state, 1);
      playerOf(state).stats.energy = 1000;
    }
    throw new Error('never cast');
  }

  it('an actor auditions, works through a film and is paid exactly the fee once', () => {
    let state = advanceMonths(actor('acting-film'), 1);
    const board = projectGame(state).work.career.screen?.board ?? [];
    expect(board.length).toBe(4);
    // Board listings stay put between reads: no endless regeneration.
    expect(projectGame(state).work.career.screen?.board.map((l) => l.id)).toEqual(
      board.map((l) => l.id),
    );
    const lead = board.find((l) => l.prominence === 'lead');
    if (lead) expect(lead.auditionReason).toMatch(/experience/);
    state = castIn(state, 'film');
    const fee = playerOf(state).career.acting?.production?.payMinor ?? 0n;
    expect(playerOf(state).career.acting?.production?.stage).toBe('rehearsal');
    for (const action of ['studyScript', 'rehearse', 'workWithCast'] as const)
      state = checked(state, { type: 'productionAction', action }).state;
    expect(run(state, { type: 'productionAction', action: 'rehearse' }).outcome.status).toBe(
      'rejected',
    );
    for (let i = 0; i < 12 && playerOf(state).career.acting?.production; i++) {
      state = advanceMonths(state, 1);
      playerOf(state).stats.energy = 1000;
      if (playerOf(state).career.acting?.production?.stage === 'post')
        state = run(state, { type: 'productionAction', action: 'promote' }).state;
    }
    const acting = playerOf(state).career.acting;
    expect(acting?.production).toBeNull();
    expect(acting?.filmography).toHaveLength(1);
    const creditEntry = acting?.filmography[0];
    // 25% + 50% + 25% of the fee (each rounded), plus a bonus only for a studio hit.
    const bonus = creditEntry?.budget === 'studio' && creditEntry.audience >= 70;
    expect(creditEntry?.earnedMinor).toBe(bonus ? (fee * 120n) / 100n : fee);
    expect(checkLedger(state.world)).toEqual([]);
  }, 120_000);

  it('TV pays each filming month, then the network renews or cancels', () => {
    let state = castIn(advanceMonths(actor('acting-tv-show'), 1), 'tv');
    for (let i = 0; i < 6 && playerOf(state).career.acting?.production?.stage !== 'renewal'; i++) {
      state = advanceMonths(state, 1);
      if (!playerOf(state).career.acting?.production) break;
    }
    const episodes = Object.values(state.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.actingEpisodes');
    expect(episodes.length).toBe(3);
    const acting = playerOf(state).career.acting;
    if (acting?.production) {
      expect(acting.production.stage).toBe('renewal');
      const pay = acting.production.payMinor;
      state = checked(state, { type: 'answerRenewal', accept: true }).state;
      expect(playerOf(state).career.acting?.production?.payMinor).toBe(pay + applyPercent(pay, 10));
      expect(playerOf(state).career.acting?.production?.season).toBe(2);
    } else {
      expect(acting?.filmography[0]?.format).toBe('tv');
    }
    expect(checkLedger(state.world)).toEqual([]);
  }, 120_000);

  it('leaving a production costs reputation and the director remembers', () => {
    let state = castIn(advanceMonths(actor('acting-leave'), 1), 'film');
    const p = playerOf(state);
    const before = p.career.reputation;
    const directorId = p.career.acting?.production?.directorId ?? '';
    state = checked(state, { type: 'leaveProduction' }).state;
    expect(playerOf(state).career.reputation).toBe(before - 100);
    expect(playerOf(state).career.acting?.production).toBeNull();
    expect(
      Object.values(state.world.memories).some(
        (m) => m.ownerId === directorId && m.key === 'leftProduction',
      ),
    ).toBe(true);
  }, 120_000);

  it('agents need a credit, may say no, and take their commission from pay', () => {
    const state = advanceMonths(actor('acting-agent'), 1);
    expect(run(state, { type: 'actingAgent', sign: true }).outcome.status).toBe('rejected');
    const p = playerOf(state);
    p.career.acting = {
      ...(p.career.acting ?? {
        recognition: 0,
        critics: 0,
        board: [],
        production: null,
        agent: null,
        filmography: [],
      }),
      filmography: [
        {
          title: 'Paper Tides',
          format: 'film',
          genre: 'drama',
          studio: 'Lumen Pictures',
          director: 'A B',
          character: 'X, a chef',
          prominence: 'background',
          script: 50,
          budget: 'indie',
          startTick: 0,
          endTick: 1,
          seasons: 1,
          earnedMinor: 0n,
          critics: 50,
          audience: 50,
          award: null,
          coStar: '',
        },
      ],
    };
    const r = run(state, { type: 'actingAgent', sign: true });
    expect(r.outcome.status).toBe('applied');
    expect(run(r.state, { type: 'actingAgent', sign: true }).outcome.status).toBe('rejected');
  });
});

describe('typecasting and acting legacy (E89)', () => {
  const credit = (genre: 'drama' | 'comedy') => ({
    title: 'Paper Tides',
    format: 'film' as const,
    genre,
    studio: 'Lumen Pictures',
    director: 'A B',
    character: 'X, a chef',
    prominence: 'supporting' as const,
    script: 50,
    budget: 'indie' as const,
    startTick: 0,
    endTick: 1,
    seasons: 1,
    earnedMinor: 0n,
    critics: 80,
    audience: 50,
    award: 'won' as const,
    coStar: '',
  });
  const acting = (genres: ('drama' | 'comedy')[]) => ({
    recognition: 0,
    critics: 0,
    board: [],
    production: null,
    agent: null,
    filmography: genres.map(credit),
  });

  it('three or more credits mostly in one genre make you known for it', () => {
    expect(knownFor(acting(['drama', 'drama']))).toBeNull();
    expect(knownFor(acting(['drama', 'drama', 'comedy']))).toBe('drama');
    expect(knownFor(acting(['drama', 'comedy', 'drama', 'comedy']))).toBeNull();
  });

  it("a person's filmography shows on their profile, also after they die", () => {
    const state = actor('acting-legacy');
    const other = Object.values(state.world.characters).find(
      (p) => p.id !== state.world.activeCharacterId,
    );
    if (!other) throw new Error('no other person');
    other.career.acting = acting(['comedy', 'comedy', 'comedy']);
    other.death = { ...state.world.clock };
    const profile = projectPerson(state, other.id);
    expect(profile?.acting?.filmography).toHaveLength(3);
    expect(profile?.acting?.knownFor).toBe('comedy');
  });
});

describe('industry outlook (E89)', () => {
  it('one genre is in fashion each year, the same on replay, and fashion moves on', () => {
    const { world } = newState({ seed: 'acting-trend' });
    const year = world.clock.year;
    const seen = new Set<string>();
    for (let y = 0; y < 12; y++) {
      world.clock = { ...world.clock, year: year + y };
      expect(trendingGenre(world)).toBe(trendingGenre(structuredClone(world)));
      seen.add(trendingGenre(world));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
