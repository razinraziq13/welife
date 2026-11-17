import { describe, expect, it } from 'vitest';
import { advanceMonth, completePendingMonth } from '@engine/core/tick';
import { getEvent } from '@engine/content';
import { newState } from '../../helpers/sim';

/**
 * Turn-time measurement (spec §8: p95 monthly turn < 250 ms for a typical 150-NPC world).
 * Worlds currently hold only the player's family (about 3-6 people); the 150-NPC benchmark
 * becomes meaningful when NPC populations arrive in Milestone 3. This guards against
 * regressions in the core loop meanwhile.
 */
describe('monthly turn performance (engine only, Node)', () => {
  it('keeps the p95 monthly turn well under the 250 ms budget over 600 months', () => {
    let world = newState({ seed: 'perf' }).world;
    const durations: number[] = [];
    for (let i = 0; i < 600 && world.lifeStatus === 'alive'; i++) {
      const start = performance.now();
      const result = advanceMonth(world);
      if (result.kind === 'pending') {
        const id = result.world.events.pendingInstanceId ?? '';
        const def = getEvent(result.world.events.instances[id]?.definitionId ?? '');
        world = completePendingMonth(result.world, id, def.choices[0]?.id ?? '');
      } else world = result.world;
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
    console.warn(`monthly turn p95: ${p95.toFixed(2)} ms over ${String(durations.length)} months`);
    expect(p95).toBeLessThan(50);
  });
});
