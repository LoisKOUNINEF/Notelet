import { AppEventBus, Service } from '../../../core/index.js';
import { isNotesStorageKey, storageKey } from '../../lib/scope-keys.js';
import { chromeApiService } from '../chrome-api/chrome-api.service.js';
import { settingsService } from '../settings/settings.service.js';

export interface IScopedNotes {
  page: INote[];
  site: INote[];
}

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Notes CRUD over chrome.storage. Each scope key's notes are one storage item
 * (`notes:page:<url>`, `notes:site:<domain>`): a page/site pair loads in a single read,
 * an edit only rewrites its own scope, and no item gets near sync's per-item limit
 * the way one item holding every note would.
 *
 * Writes are read-modify-write, so they run one at a time.
 */
export class NotesStoreService extends Service<NotesStoreService> {
  private _queue: Promise<unknown> = Promise.resolve();

  constructor() {
    super();
  }

  private get area(): StorageAreaName {
    return settingsService.storageArea;
  }

  // Every change to the notes, made here or in another window, ends up in `notes-changed`.
  public init(): void {
    this.registerCleanup(chromeApiService.onStorageChanged((changes, area) => {
      if (area === this.area && Object.keys(changes).some(isNotesStorageKey)) {
        AppEventBus.emit('notes-changed');
      }
    }));
  }

  public async load(keys: IScopeKeys): Promise<IScopedNotes> {
    const pageItem = storageKey('page', keys.page);
    const siteItem = storageKey('site', keys.site);
    const stored = await chromeApiService.storageGet(this.area, [pageItem, siteItem]);
    return {
      page: sortNotes(stored[pageItem]),
      site: sortNotes(stored[siteItem]),
    };
  }

  public add(scope: NoteScope, key: string, text: string): Promise<INote> {
    const now = Date.now();
    const note: INote = { id: createId(), scope, key, text, createdAt: now, updatedAt: now };
    return this.enqueue(async () => {
      await this.write(scope, key, (notes) => [...notes, note]);
      return note;
    });
  }

  public update(note: INote, text: string): Promise<INote> {
    const updated: INote = { ...note, text, updatedAt: Date.now() };
    return this.enqueue(async () => {
      await this.write(note.scope, note.key, (notes) => notes.map((n) => (n.id === note.id ? updated : n)));
      return updated;
    });
  }

  public remove(note: INote): Promise<void> {
    return this.enqueue(() => this.write(note.scope, note.key, (notes) => notes.filter((n) => n.id !== note.id)));
  }

  // Undoes a remove: the note comes back with its id and dates, so at the same place in its list.
  public restore(note: INote): Promise<void> {
    return this.enqueue(() => this.write(note.scope, note.key, (notes) => [...notes.filter((n) => n.id !== note.id), note]));
  }

  // Moves a note to the other scope of the same tab (page ↔ site), in a single write.
  public move(note: INote, keys: IScopeKeys): Promise<INote> {
    const scope: NoteScope = note.scope === 'page' ? 'site' : 'page';
    const moved: INote = { ...note, scope, key: keys[scope], updatedAt: Date.now() };
    const from = storageKey(note.scope, note.key);
    const to = storageKey(moved.scope, moved.key);

    return this.enqueue(async () => {
      const stored = await chromeApiService.storageGet(this.area, [from, to]);
      await chromeApiService.storageSet(this.area, {
        [from]: sortNotes(stored[from]).filter((n) => n.id !== note.id),
        [to]: [...sortNotes(stored[to]), moved],
      });
      return moved;
    });
  }

  /**
   * Moves every note to the other storage area, then switches the setting. Refuses (and keeps
   * everything where it is) if they don't fit in chrome.storage.sync.
   */
  public migrateTo(target: StorageAreaName): Promise<void> {
    return this.enqueue(async () => {
      const source = this.area;
      if (source === target) return;

      const notes = Object.fromEntries(
        Object.entries(await chromeApiService.storageGet(source, null)).filter(([key]) => isNotesStorageKey(key))
      );
      if (target === 'sync') this.checkSyncQuota(notes);

      await chromeApiService.storageSet(target, notes);
      // Switch before clearing the source: its removals are then in an area nobody listens to.
      await settingsService.setStorageArea(target);
      await chromeApiService.storageRemove(source, Object.keys(notes));
    });
  }

  private checkSyncQuota(items: Record<string, unknown>): void {
    const quota = chromeApiService.syncQuota();
    let total = 0;

    for (const [key, value] of Object.entries(items)) {
      // How chrome.storage.sync counts an item: its key plus its JSON value.
      const size = byteLength(key) + byteLength(JSON.stringify(value));
      if (size > quota.perItem) {
        throw new QuotaExceededError('Some notes are too long to sync. Shorten or remove a few and try again.');
      }
      total += size;
    }
    if (total > quota.total) {
      throw new QuotaExceededError('Your notes are too large to sync. Remove a few and try again.');
    }
  }

  private async write(scope: NoteScope, key: string, change: (notes: INote[]) => INote[]): Promise<void> {
    const item = storageKey(scope, key);
    const stored = await chromeApiService.storageGet(this.area, [item]);
    const notes = change(sortNotes(stored[item]));

    if (notes.length > 0) await chromeApiService.storageSet(this.area, { [item]: notes });
    else await chromeApiService.storageRemove(this.area, [item]);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this._queue.then(task);
    // A failed write is reported to its caller, but doesn't block the next ones.
    this._queue = result.catch(() => undefined);
    return result;
  }
}

// Newest first.
function sortNotes(value: unknown): INote[] {
  return Array.isArray(value) ? [...(value as INote[])].sort((a, b) => b.createdAt - a.createdAt) : [];
}

function createId(): string {
  return crypto.randomUUID();
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export const notesStoreService = NotesStoreService.getInstance();
