export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export interface ISyncQuota {
  total: number;
  perItem: number;
  items: number;
}

const encoder = new TextEncoder();

/**
 * Throws a QuotaExceededError if `items` (storage key → value) wouldn't fit in chrome.storage.sync,
 * counted the way it counts them: each key plus its JSON value, in bytes.
 */
export function checkSyncQuota(items: Record<string, unknown>, quota: ISyncQuota): void {
  // One item per page and per site that has notes or to-dos.
  if (Object.keys(items).length > quota.items) {
    throw new QuotaExceededError('Notes and to-dos are kept on too many pages to sync. Remove some and try again.');
  }
  let total = 0;
  for (const [key, value] of Object.entries(items)) {
    const size = byteLength(key) + byteLength(JSON.stringify(value));
    if (size > quota.perItem) {
      throw new QuotaExceededError('Some notes or to-do lists are too long to sync. Shorten or remove a few and try again.');
    }
    total += size;
  }
  if (total > quota.total) {
    throw new QuotaExceededError('Your notes and to-dos are too large to sync. Remove a few and try again.');
  }
}

function byteLength(text: string): number {
  return encoder.encode(text).length;
}
