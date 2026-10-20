// chrome.storage's quota errors ("QUOTA_BYTES_PER_ITEM quota exceeded"...), as users can read them.
// Firefox only says "QuotaExceededError: storage.sync API call exceeded its quota limitations.".
const FIREFOX_SYNC_QUOTA = /QuotaExceededError|exceeded its quota/;
const STORAGE_QUOTA = /^(QUOTA_BYTES(_PER_ITEM)?|MAX_ITEMS|MAX_WRITE_OPERATIONS_PER_(MINUTE|HOUR)|MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE) quota exceeded/;
const SYNC_FULL = 'Sync storage is full. Remove some notes or to-dos, or keep them on this device (Settings).';
const QUOTA_HINT: Record<string, string> = {
  QUOTA_BYTES_PER_ITEM: 'This page\'s or site\'s notes are too long to sync. Shorten some, or keep notes on this device (Settings).',
  QUOTA_BYTES: SYNC_FULL,
  MAX_ITEMS: SYNC_FULL,
};
const TOO_MANY_WRITES = 'Too many changes in a short time for sync. Wait a minute and try again.';

// The readable part of whatever a failed call threw, for a toast.
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (FIREFOX_SYNC_QUOTA.test(message)) return SYNC_FULL;
  const quota = STORAGE_QUOTA.exec(message)?.[1];
  if (!quota) return message;
  return QUOTA_HINT[quota] ?? TOO_MANY_WRITES;
}
