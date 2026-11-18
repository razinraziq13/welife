import { describe, expect, it } from 'vitest';
import { advanceMonth, completePendingMonth } from '@engine/core/tick';
import { getEvent } from '@engine/content';
import { meetPeople } from '@engine/social/npcs';
import { MAX_ACTIVE_NPCS, activeNpcCount, rebalancePopulation } from '@engine/social/population';
import type { World } from '@engine/state/schema';
import { advanceMonths, newState } from '../../helpers/sim';

/**
 * Turn-time measurement (spec §8: p95 monthly turn < 250 ms for a typical 150-NPC world on
 * reference desktop hardware). Engine only, in Node; persistence (hash + gzip) adds a few
 * milliseconds per month in the browser.
 */
function measure(start: World, months: number): { p95: number; durations: number[]; end: World } {
  let world = start;
  const durations: number[] = [];
  for (let i = 0; i < months && world.lifeStatus === 'alive'; i++) {
    const t0 = performance.now();
    const result = advanceMonth(world);
    if (result.kind === 'pending') {
      const id = result.world.events.pendingInstanceId ?? '';
      const def = getEvent(result.world.events.instances[id]?.definitionId ?? '');
      world = completePendingMonth(result.world, id, def.choices[0]?.id ?? '');
    } else world = result.world;
    durations.push(performance.now() - t0);
  }
  const sorted = [...durations].sort((a, b) => a - b);
  return { p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, durations, end: world };
}

describe('monthly turn performance (engine only, Node)', () => {
  it('keeps the p95 monthly turn under 250 ms in a 150-NPC world', () => {
    // An adult life with a full social circle: 150 individually simulated people.
    const state = advanceMonths(newState({ seed: 'perf' }), 25 * 12);
    const world = structuredClone(state.world);
    const player = world.characters[world.activeCharacterId];
    if (!player) throw new Error('no player');
    const missing = MAX_ACTIVE_NPCS - activeNpcCount(world);
    if (missing > 0) meetPeople(world, player, missing, 'acquaintance', [18, 70]);
    rebalancePopulation(world);
    expect(activeNpcCount(world)).toBeGreaterThanOrEqual(MAX_ACTIVE_NPCS - 2);
    const { p95, durations, end } = measure(world, 240);
    console.warn(
      `150-NPC world: monthly turn p95 ${p95.toFixed(2)} ms over ${String(durations.length)} months (active NPCs at end: ${String(activeNpcCount(end))})`,
    );
    expect(p95).toBeLessThan(250);
  }, 120_000);
});
