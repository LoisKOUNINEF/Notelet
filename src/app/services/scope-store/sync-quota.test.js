import { checkSyncQuota, QuotaExceededError } from '#root/dist/src/app/services/scope-store/sync-quota.js';

describe('checkSyncQuota', () => {
  // What it threw for `items`, or null.
  const error = (items, quota = { total: 100, perItem: 40, items: 2 }) => {
    try {
      checkSyncQuota(items, quota);
      return null;
    } catch (e) {
      return e;
    }
  };

  it('accepts what fits', () => {
    expect(error({ a: 'x', b: 'y' })).toBe(null);
  });

  it('refuses too many items', () => {
    expect(error({ a: 1, b: 2, c: 3 }).message).toContain('too many pages');
  });

  it('refuses an item over the per-item quota, its key and JSON value counted', () => {
    // 1 (key) + 2 (quotes) + 37 = 40 bytes fits; one more doesn't.
    expect(error({ a: 'x'.repeat(37) })).toBe(null);
    expect(error({ a: 'x'.repeat(38) }).message).toContain('too long');
  });

  it('counts bytes, not characters, like chrome.storage.sync', () => {
    // "é" is 2 bytes: 1 + 2 + 36 = 39 fits, 1 + 2 + 38 = 41 doesn't.
    expect(error({ a: 'é'.repeat(18) })).toBe(null);
    expect(error({ a: 'é'.repeat(19) })).toBeInstanceOf(QuotaExceededError);
  });

  it('refuses items that fit one by one but not together', () => {
    // 28 bytes each: under the per-item quota, 56 together over the total.
    const quota = { total: 50, perItem: 40, items: 2 };
    expect(error({ a: 'x'.repeat(25), b: 'y'.repeat(25) }, quota).message).toContain('too large');
  });
});
