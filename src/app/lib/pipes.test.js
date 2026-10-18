import { formatTimeAgo } from '#root/dist/src/app/lib/pipes.js';

describe('formatTimeAgo', () => {
  const now = Date.UTC(2026, 9, 18, 12, 0, 0);
  const ago = (seconds) => now - seconds * 1000;

  it('says "now" under a minute', () => {
    expect(formatTimeAgo(ago(20), now, 'en')).toBe('now');
  });

  it('counts minutes, hours, days and weeks', () => {
    expect(formatTimeAgo(ago(5 * 60), now, 'en')).toBe('5 minutes ago');
    expect(formatTimeAgo(ago(3 * 3600), now, 'en')).toBe('3 hours ago');
    expect(formatTimeAgo(ago(24 * 3600), now, 'en')).toBe('yesterday');
    expect(formatTimeAgo(ago(14 * 24 * 3600), now, 'en')).toBe('2 weeks ago');
    expect(formatTimeAgo(ago(400 * 24 * 3600), now, 'en')).toBe('last year');
  });

  it('takes the timestamp as a string, as templates give it, or a date string', () => {
    expect(formatTimeAgo(String(ago(120)), now, 'en')).toBe('2 minutes ago');
    expect(formatTimeAgo(new Date(ago(120)).toISOString(), now, 'en')).toBe('2 minutes ago');
  });

  it('uses the given locale', () => {
    expect(formatTimeAgo(ago(24 * 3600), now, 'fr')).toBe('hier');
  });

  it('returns anything else unchanged', () => {
    expect(formatTimeAgo('soon', now, 'en')).toBe('soon');
  });
});
