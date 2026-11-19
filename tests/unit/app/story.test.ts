import { describe, expect, it } from 'vitest';
import { storyText } from '@app/i18n/format';
import type { BiographyEntry } from '@engine/state/schema';

function bio(key: string, params: Record<string, string | number> = {}): BiographyEntry {
  return { id: 'b', tick: 0, characterId: 'c', category: 'life', key, params };
}

describe('story lines (roadmap 07)', () => {
  it('gives biography lines a subject so the story reads consistently', () => {
    expect(storyText(bio('bio.movedCity', { location: 'Penang' }))).toBe('You moved to Penang.');
    expect(storyText(bio('bio.retired'))).toBe('You retired.');
    expect(storyText(bio('bio.released'))).toBe('You were released from custody.');
  });

  it('leaves lines that are not about the player’s own action unchanged', () => {
    expect(storyText(bio('bio.case', { kindName: 'Traffic', outcomeName: 'won' }))).toBe(
      'Court case (Traffic): won.',
    );
  });

  it('keeps event outcomes, which already speak to the player', () => {
    expect(storyText(bio('bio.event', { eventId: 'first-steps' }))).toBe(
      'You took your first steps.',
    );
  });
});
