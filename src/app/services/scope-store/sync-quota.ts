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

// Throws a QuotaExceededError if `items` (storage key → value) wouldn't fit in chrome.storage.sync
export function checkSyncQuota(items: Record<string, unknown>, quota: ISyncQuota): void {
  // One item per page and per site that has notes or to-dos.
  const count = Object.keys(items).length;
  if (count > quota.items) {
    throw new QuotaExceededError(`Notes and to-dos are kept on too many pages and sites to sync (${count}; sync allows ${quota.items}). Delete some in Settings, "Manage by site", then try again.`);
  }
  let total = 0;
  for (const [key, value] of Object.entries(items)) {
    const size = byteLength(key) + byteLength(JSON.stringify(value));
    if (size > quota.perItem) {
      throw new QuotaExceededError(`${listName(key)} too long to sync (${kilobytes(size)}; sync allows ${kilobytes(quota.perItem)} per page or site). Shorten or delete some, then try again.`);
    }
    total += size;
  }
  if (total > quota.total) {
    throw new QuotaExceededError(`Your notes and to-dos are too large to sync (${kilobytes(total)}; sync allows ${kilobytes(quota.total)}). Delete some, then try again.`);
  }
}

function listName(key: string): string {
  const [kind, scope, ...rest] = key.split(':');
  const where = rest.join(':').replace(/^https?:\/\//, '');
  if ((kind !== 'notes' && kind !== 'todos') || (scope !== 'page' && scope !== 'site') || !where) return 'Some notes or to-dos are';
  return `The ${kind === 'notes' ? 'notes' : 'to-dos'} of ${where} are`;
}

function kilobytes(bytes: number): string {
  return `${Math.max(0.1, Math.round(bytes / 102.4) / 10)} KB`;
}

function byteLength(text: string): number {
  return encoder.encode(text).length;
}
