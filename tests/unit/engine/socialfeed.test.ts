import { describe, expect, it } from 'vitest';
import { projectGame } from '@engine/view';
import { checked } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf } from '../../helpers/sim';

describe('social media feed (E100)', () => {
  it('each post appears in your feed with a caption, likes, comments and a fan reply', () => {
    let state = advanceMonths(newState({ seed: 'feed' }), 1);
    playerOf(state).birth.year -= 20;
    state = checked(state, {
      type: 'createProfile',
      platformId: 'murmur',
      niche: 'food',
      handle: 'cook_up',
    }).state;
    const id = Object.keys(state.world.media.profiles)[0] ?? '';
    for (let i = 0; i < 25; i++) {
      if (i % 4 === 0) state = advanceMonths(state, 1);
      state = checked(state, { type: 'post', profileId: id, style: 'funny' }).state;
    }
    const profile = projectGame(state).media.profiles[0];
    expect(profile?.feed.length).toBe(20);
    const latest = profile?.feed[0];
    expect(latest?.caption).toMatch(/food/);
    expect(latest?.likes).toBeGreaterThanOrEqual(0);
    expect(latest?.topComment.length).toBeGreaterThan(0);
  }, 120_000);
});
