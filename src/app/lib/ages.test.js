import { AGES, DEFAULT_AGE, ageOption, cutoff, isAge } from '#root/dist/src/app/lib/ages.js';

describe('ages', () => {
  it('offers 1 to 3 weeks and 1 to 12 months, 1 month by default', () => {
    expect(AGES.map((age) => age.label)).toEqual(['1 week', '2 weeks', '3 weeks', '1 month', '2 months', '3 months', '6 months', '12 months']);
    expect(DEFAULT_AGE).toBe('1m');
    expect(ageOption('1m').since).toBe('month');
    expect(isAge('2w')).toBe(true);
    expect(isAge('5y')).toBe(false);
  });

  it('counts weeks in days', () => {
    const now = new Date(2026, 9, 19, 15, 30).getTime();
    expect(new Date(cutoff('1w', now))).toEqual(new Date(2026, 9, 12, 15, 30));
    expect(new Date(cutoff('3w', now))).toEqual(new Date(2026, 8, 28, 15, 30));
  });

  it('counts months on the calendar, at the same time of day', () => {
    const now = new Date(2026, 9, 19, 15, 30).getTime();
    expect(new Date(cutoff('1m', now))).toEqual(new Date(2026, 8, 19, 15, 30));
    expect(new Date(cutoff('6m', now))).toEqual(new Date(2026, 3, 19, 15, 30));
    expect(new Date(cutoff('12m', now))).toEqual(new Date(2025, 9, 19, 15, 30));
  });

  it('stops at the end of a shorter month', () => {
    expect(new Date(cutoff('1m', new Date(2026, 2, 31, 9).getTime()))).toEqual(new Date(2026, 1, 28, 9));
    expect(new Date(cutoff('1m', new Date(2028, 2, 31, 9).getTime()))).toEqual(new Date(2028, 1, 29, 9));
    expect(new Date(cutoff('3m', new Date(2026, 4, 31).getTime()))).toEqual(new Date(2026, 1, 28));
  });
});
