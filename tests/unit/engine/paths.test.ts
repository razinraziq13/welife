import { describe, expect, it } from 'vitest';
import { workActionBlock } from '@engine/career/workActions';
import { checkLedger } from '@engine/economy/ledger';
import type { SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { checked, findWork, giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** An employed adult with chosen skill levels (0-1000). */
function adult(seed: string, skill: number): SimState {
  const state = giveMoney(
    findWork(advanceMonths(newState({ seed, scenario: 'wealthy' }), 22 * 12)),
    5_000_000n,
  );
  const world = structuredClone(state.world);
  const p = world.characters[world.activeCharacterId];
  if (!p) throw new Error('no player');
  for (const k of ['art', 'leadership', 'music', 'socializing'] as const) p.skills[k] = skill;
  p.stats.energy = 1000;
  return { world, pending: null };
}

describe('Career paths: start freelance as musician, actor or director', () => {
  it('explains why not when skills are short, and starts when they are enough', () => {
    const weak = adult('paths-weak', 100);
    const path = projectGame(weak).work.paths.find((x) => x.occupationId === 'film-director');
    expect(path?.block).toMatch(/skills/i);
    expect(
      run(weak, { type: 'startCreativePath', occupationId: 'film-director' }).outcome.status,
    ).toBe('rejected');

    const strong = adult('paths-strong', 700);
    const started = checked(strong, {
      type: 'startCreativePath',
      occupationId: 'film-director',
    }).state;
    const p = playerOf(started);
    const job = p.employmentId ? started.world.employment[p.employmentId] : undefined;
    expect(job?.terms).toMatchObject({ occupationId: 'film-director', contract: 'casual' });
    expect(
      projectGame(started).work.paths.find((x) => x.occupationId === 'film-director')?.block,
    ).not.toBeNull();
    // Directors shoot films and do not audition.
    expect(workActionBlock(started.world, p, 'audition')).toBe('otherTrack');
    expect(workActionBlock(started.world, p, 'shootShortFilm')).toBeNull();
    const shot = checked(started, { type: 'workAction', actionId: 'shootShortFilm' });
    expect(shot.outcome.status).toBe('applied');
    expect(checkLedger(shot.state.world)).toEqual([]);
  }, 60_000);
});
