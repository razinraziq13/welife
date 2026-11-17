import { describe, expect, it } from 'vitest';
import { matchShortcut } from '@app/keyboard/shortcuts';
import { formatBytes } from '@app/lib/format';

describe('matchShortcut', () => {
  it('opens help with ?', () => {
    expect(matchShortcut(null, '?')).toEqual({ action: 'help', pending: null });
  });

  it('recognises the g-then-key navigation sequences', () => {
    const first = matchShortcut(null, 'g');
    expect(first).toEqual({ action: null, pending: 'g' });
    expect(matchShortcut(first.pending, 's')).toEqual({ action: 'settings', pending: null });
    expect(matchShortcut('g', 'h')).toEqual({ action: 'home', pending: null });
  });

  it('cancels an unfinished sequence on any other key', () => {
    expect(matchShortcut('g', 'x')).toEqual({ action: null, pending: null });
    expect(matchShortcut(null, 's')).toEqual({ action: null, pending: null });
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5 MB'],
    [300 * 1024 * 1024 * 1024, '300 GB'],
  ])('formats %d as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('handles invalid input', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});
