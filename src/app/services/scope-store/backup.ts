import { kindOf } from '../../lib/scope-keys.js';
import { sortItems, type IStoredList } from './scope-items.js';
import { InvalidBackupError } from './store-errors.js';

// What "Export" writes, and "Import" reads (ScopeStoreService.exportAll/importAll).
export interface IBackup {
  format: typeof FORMAT;
  // The stored format it holds (SCHEMA_VERSION).
  schemaVersion: number;
  exportedAt: string;
  lists: Record<string, unknown[]>;
}

const FORMAT = 'notelet';

// Reading a file much bigger could freeze the panel.
// Well above any real backup: export is indented (often 1.5x the stored size)
// A backup too big for storage fails when it's written, not here.
export const MAX_BACKUP_SIZE = 50 * 1024 * 1024;
export const TOO_LARGE = 'This file is too large to be a Notelet backup.';

// What Notelet's ids look like (UUIDs). They end up in the page's element ids and ARIA references
// A file's spaces or odd characters there could point a label at another item.
const ID = /^[\w-]{1,64}$/;

export function createBackup(lists: IStoredList[], schemaVersion: number, now: Timestamp): IBackup {
  const kept = lists
    .map(({ key, kind, value }) => [key, sortItems(kind, value)] as const)
    .filter(([, items]) => items.length > 0);
  return { format: FORMAT, schemaVersion, exportedAt: new Date(now).toISOString(), lists: Object.fromEntries(kept) };
}

/**
 * The lists of a backup file's text, checked and repaired the way stored lists are
 * Keys that aren't notes or to-dos lists, and items that can't be read, are left out.
 * Ids must look like Notelet's (one item each)
 * Times after `now` become `now` (an item edited "in the future" would win every merge against the user's edits).
 * Throws an InvalidBackupError for a file that isn't a backup, is too large, or of a newer version than `schemaVersion`.
 */
export function readBackup(text: string, schemaVersion: number, now: Timestamp): IStoredList[] {
  if (text.length > MAX_BACKUP_SIZE) throw new InvalidBackupError(TOO_LARGE);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidBackupError('This file isn\'t a Notelet backup.');
  }
  if (!data || typeof data !== 'object') throw new InvalidBackupError('This file isn\'t a Notelet backup.');
  const backup = data as Partial<IBackup>;
  if (backup.format !== FORMAT || !backup.lists || typeof backup.lists !== 'object') {
    throw new InvalidBackupError('This file isn\'t a Notelet backup.');
  }
  if (typeof backup.schemaVersion !== 'number' || backup.schemaVersion > schemaVersion) {
    throw new InvalidBackupError('This backup comes from a newer version of Notelet. Update Notelet, then try again.');
  }

  return Object.entries(backup.lists).flatMap(([key, value]): IStoredList[] => {
    const kind = kindOf(key);
    const owner = kind && ownerOf(key);
    if (!kind || !owner) return [];
    const items = latestById(sortItems(kind, value).filter(({ id }) => ID.test(id)).map((item) => ({ ...clamped(item, now), ...owner })));
    return items.length > 0 ? [{ key, kind, value: sortItems(kind, items) }] : [];
  });
}

// The item with its times no later than `now`, and its checklist's items with valid, unique ids.
function clamped(item: IScopeItem | ITodo, now: Timestamp): IScopeItem | ITodo {
  const copy = { ...item, createdAt: Math.min(item.createdAt, now), updatedAt: Math.min(item.updatedAt, now) };
  if ('doneAt' in copy && copy.doneAt !== null) copy.doneAt = Math.min(copy.doneAt, now);
  if ('items' in copy && copy.items) {
    const ids = new Set<string>();
    copy.items = copy.items.filter(({ id }) => ID.test(id) && !ids.has(id) && ids.add(id));
    // None left: a single to-do again.
    if (copy.items.length === 0) delete copy.items;
  }
  return copy;
}

// One item per id: the one edited last.
function latestById<T extends IScopeItem>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const kept = byId.get(item.id);
    if (!kept || item.updatedAt > kept.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

// The scope and key a list's items belong to, from its storage key; null for a malformed one
function ownerOf(storageItem: string): { scope: NoteScope; key: string } | null {
  const [, scope, ...rest] = storageItem.split(':');
  const key = rest.join(':');
  if (!key) return null;
  if (scope === 'site') return /^[^\s/]+$/.test(key) ? { scope, key } : null;
  if (scope !== 'page') return null;
  try {
    const { protocol } = new URL(key);
    return protocol === 'http:' || protocol === 'https:' ? { scope, key } : null;
  } catch {
    return null;
  }
}
