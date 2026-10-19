import { AppEventBus, Service } from '../../../core/index.js';
import { isScopeContentKey, pageLabelOf, storageKey } from '../../lib/scope-keys.js';
import { chromeApiService } from '../chrome-api/chrome-api.service.js';
import { settingsService } from '../settings/settings.service.js';

// What one scope (a page, or a site) holds.
export interface IScopeContent {
  notes: INote[];
  todos: ITodo[];
}

export type IScopedContent = Record<NoteScope, IScopeContent>;

// One stored note or to-do, with its kind (see listEverything()).
export interface IStoredItem {
  kind: ScopeContentKind;
  item: IScopeItem;
}

// What removeOlderThan() took out, by storage item: what restoreRemoved() puts back.
export type IRemovedItems = Record<string, IScopeItem[]>;

// What an update may change: everything but the item's identity and dates (doneAt follows done).
export type ScopeItemChanges<K extends ScopeContentKind> = Partial<Omit<IScopeItemKinds[K], keyof Omit<IScopeItem, 'text'> | 'doneAt'>>;

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

const KINDS: ScopeContentKind[] = ['notes', 'todos'];
const SCOPES: NoteScope[] = ['page', 'site'];

// Notes: newest first, or in the order the user arranged them, notes written since on top.
// To-dos: a checklist, the open ones in the order the user arranged them (oldest first until
// then, new ones last), then the done ones in the order they were checked, so the one just
// checked is always last.
const SORTERS: { [K in ScopeContentKind]: (a: IScopeItemKinds[K], b: IScopeItemKinds[K]) => number } = {
  notes: (a, b) => Number(a.position !== undefined) - Number(b.position !== undefined)
    || (a.position ?? 0) - (b.position ?? 0)
    || b.createdAt - a.createdAt,
  todos: (a, b) => Number(a.done) - Number(b.done)
    || (a.done ? doneTime(a) - doneTime(b) : position(a) - position(b))
    || a.createdAt - b.createdAt,
};

// A to-do not reordered yet: after the ones that were.
function position(todo: ITodo): number {
  return todo.position ?? Number.MAX_SAFE_INTEGER;
}

// Above every open to-do of a list: reordered ones start at 0, never-reordered ones sort last.
function topPosition(todos: ITodo[]): number {
  return Math.min(0, ...todos.filter((todo) => !todo.done && todo.position !== undefined).map((todo) => todo.position!)) - 1;
}

// To-dos checked before doneAt existed have none: their last update is the closest guess.
function doneTime(todo: ITodo): Timestamp {
  return todo.doneAt ?? todo.updatedAt;
}

/**
 * Notes and to-dos CRUD over chrome.storage. Each kind of each scope key is one storage item
 * (`notes:page:<url>`, `todos:site:<domain>`...): a tab's page and site content loads in a
 * single read, an edit only rewrites its own list, and no item gets near sync's per-item
 * limit the way one item holding everything would.
 *
 * Writes are read-modify-write, so they all run one at a time, whatever their kind.
 */
export class ScopeStoreService extends Service<ScopeStoreService> {
  private _queue: Promise<unknown> = Promise.resolve();

  constructor() {
    super();
  }

  private get area(): StorageAreaName {
    return settingsService.storageArea;
  }

  // Every change, made here or in another window, ends up in `scope-content-changed`.
  public init(): void {
    this.registerCleanup(chromeApiService.onStorageChanged((changes, area) => {
      if (area === this.area && Object.keys(changes).some(isScopeContentKey)) {
        AppEventBus.emit('scope-content-changed');
      }
    }));
  }

  public async load(keys: IScopeKeys): Promise<IScopedContent> {
    const items = SCOPES.flatMap((scope) => KINDS.map((kind) => storageKey(kind, scope, keys[scope])));
    const stored = await chromeApiService.storageGet(this.area, items);
    const content = (scope: NoteScope): IScopeContent => ({
      notes: sortItems('notes', stored[storageKey('notes', scope, keys[scope])]),
      todos: sortItems('todos', stored[storageKey('todos', scope, keys[scope])]),
    });
    return { page: content('page'), site: content('site') };
  }

  // Every page of a site that has notes or to-dos (done ones included), by path. Reads the whole area:
  // page items are keyed by URL, so a site's pages can't be listed from their keys alone.
  public async listSitePages(site: string): Promise<ISitePage[]> {
    const stored = await chromeApiService.storageGet(this.area, null);
    const pages = new Map<string, ISitePage>();

    for (const kind of KINDS) {
      const prefix = storageKey(kind, 'page', '');
      for (const [item, value] of Object.entries(stored)) {
        if (!item.startsWith(prefix)) continue;
        const key = item.slice(prefix.length);
        if (hostOf(key) !== site) continue;
        const items = sortItems(kind, value);
        if (items.length === 0) continue;

        const page = pages.get(key) ?? { key, label: pageLabelOf(key), notes: 0, todos: 0, openTodos: 0 };
        if (kind === 'notes') page.notes = items.length;
        else {
          page.todos = items.length;
          page.openTodos = (items as ITodo[]).filter((todo) => !todo.done).length;
        }
        pages.set(key, page);
      }
    }
    return [...pages.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  public addNote(scope: NoteScope, key: string, text: string, items: IChecklistItem[] = []): Promise<INote> {
    return this.add('notes', { ...this.newItem(scope, key, text), items });
  }

  public addTodo(scope: NoteScope, key: string, text: string): Promise<ITodo> {
    return this.add('todos', { ...this.newItem(scope, key, text), done: false, doneAt: null });
  }

  /**
   * Applies `changes` to the item as currently stored (not to the caller's copy, which may be
   * stale: renamed in another window, repositioned by a reorder...), so only the given fields change.
   */
  public update<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K], changes: ScopeItemChanges<K>): Promise<IScopeItemKinds[K]> {
    return this.updateWith(kind, item, () => changes);
  }

  /**
   * Like update(), with the changes computed from the stored item, inside the write queue: two
   * quick changes to one item (e.g. checking two of a note's checklist items) both stick.
   * An item gone meanwhile (deleted in another window) is left gone: the caller's copy comes back.
   */
  public updateWith<K extends ScopeContentKind>(
    kind: K,
    item: IScopeItemKinds[K],
    change: (current: IScopeItemKinds[K]) => ScopeItemChanges<K>
  ): Promise<IScopeItemKinds[K]> {
    return this.enqueue(async () => {
      let updated = item;
      await this.write(kind, item.scope, item.key, (items) => items.map((current) => {
        if (current.id !== item.id) return current;
        const now = Date.now();
        updated = { ...current, ...change(current), updatedAt: now } as IScopeItemKinds[K];
        if (kind === 'todos') stampDoneAt(current as ITodo, updated as ITodo, now);
        return updated;
      }));
      return updated;
    });
  }

  public remove<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K]): Promise<void> {
    return this.enqueue(() => this.write(kind, item.scope, item.key, (items) => items.filter((i) => i.id !== item.id)));
  }

  // Undoes a remove: the item comes back with its id and dates, so at the same place in its list.
  public restore<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K]): Promise<void> {
    return this.restoreMany(kind, [item]);
  }

  // Removes several items of one list (one scope key) in a single write, e.g. "Delete all done".
  public removeMany<K extends ScopeContentKind>(kind: K, items: IScopeItemKinds[K][]): Promise<void> {
    const [first] = items;
    if (!first) return Promise.resolve();
    const ids = new Set(items.map((item) => item.id));
    return this.enqueue(() => this.write(kind, first.scope, first.key, (list) => list.filter((i) => !ids.has(i.id))));
  }

  // Undoes removeMany(), in a single write.
  public restoreMany<K extends ScopeContentKind>(kind: K, items: IScopeItemKinds[K][]): Promise<void> {
    const [first] = items;
    if (!first) return Promise.resolve();
    const ids = new Set(items.map((item) => item.id));
    return this.enqueue(() => this.write(kind, first.scope, first.key, (list) => [...list.filter((i) => !ids.has(i.id)), ...items]));
  }

  // Empties one list (a scope's notes, or its to-dos) in a single write. Resolves to what was in
  // it, as stored at that moment, for an Undo (restoreMany).
  public removeAll<K extends ScopeContentKind>(kind: K, scope: NoteScope, key: string): Promise<IScopeItemKinds[K][]> {
    return this.enqueue(async () => {
      let removed: IScopeItemKinds[K][] = [];
      await this.write(kind, scope, key, (items) => {
        removed = items;
        return [];
      });
      return removed;
    });
  }

  // Moves an item to the other scope of the same tab (page ↔ site), in a single write.
  // It lands at the top of the other list: a note as one not reordered yet, a to-do at the top
  // of the open ones (see topPosition).
  public move<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K], keys: IScopeKeys): Promise<IScopeItemKinds[K]> {
    const scope: NoteScope = item.scope === 'page' ? 'site' : 'page';
    const from = storageKey(kind, item.scope, item.key);
    const to = storageKey(kind, scope, keys[scope]);

    return this.enqueue(async () => {
      const stored = await chromeApiService.storageGet(this.area, [from, to]);
      const source = sortItems(kind, stored[from]);
      // The stored version: fields changed elsewhere since the caller's copy are kept.
      const current = source.find((i) => i.id === item.id);
      if (!current) return item;
      const target = sortItems(kind, stored[to]);
      const moved = { ...current, scope, key: keys[scope], updatedAt: Date.now() };
      if (kind === 'todos') moved.position = topPosition(target as ITodo[]);
      else delete moved.position;

      const rest = source.filter((i) => i.id !== item.id);
      // Both lists in one write; an emptied one is removed, like write() does (sync allows 512 items).
      await chromeApiService.storageSet(this.area, {
        [to]: sortItems(kind, [...target, moved]),
        ...(rest.length > 0 ? { [from]: rest } : {}),
      });
      if (rest.length === 0) await chromeApiService.storageRemove(this.area, [from]);
      return moved;
    });
  }

  /**
   * Saves the order the user gave a list, in one write: all of a scope's notes, or its open
   * to-dos (done ones keep their place). Items missing from `ids` (added in another window
   * meanwhile) keep theirs too: new notes stay on top, new to-dos after the ordered ones.
   */
  public reorder(kind: ScopeContentKind, scope: NoteScope, key: string, ids: string[]): Promise<void> {
    return this.enqueue(() => this.write(kind, scope, key, (items: IScopeItem[]) => {
      const reorderable = (item: IScopeItem) => kind === 'notes' || !(item as ITodo).done;
      const listed = ids.map((id) => items.find((item) => item.id === id && reorderable(item))).filter((item): item is IScopeItem => !!item);
      const positioned = listed.map((item, index) => ({ ...item, position: index }));
      if (kind === 'notes') return [...items.filter((item) => !ids.includes(item.id)), ...positioned];
      return [
        ...positioned,
        ...items.filter((item) => reorderable(item) && !ids.includes(item.id)),
        ...items.filter((item) => !reorderable(item)),
      ];
    }));
  }

  // Every note and to-do of the storage area in use, on every page and site, in one read.
  public async listEverything(): Promise<IStoredItem[]> {
    const content = scopeContent(await chromeApiService.storageGet(this.area, null));
    return Object.entries(content).flatMap(([key, list]) => {
      const kind = kindOf(key);
      return sortItems(kind, list).map((item) => ({ kind, item: item as IScopeItem }));
    });
  }

  /**
   * Deletes every note and to-do not edited since `cutoff`, on every page and site, in one
   * write (plus one removal for the lists it empties). Resolves to what it removed, for an Undo.
   */
  public removeOlderThan(cutoff: Timestamp): Promise<IRemovedItems> {
    return this.enqueue(async () => {
      const content = scopeContent(await chromeApiService.storageGet(this.area, null));
      const removed: IRemovedItems = {};
      const kept: Record<string, IScopeItem[]> = {};
      const emptied: string[] = [];

      for (const [key, list] of Object.entries(content)) {
        const items = sortItems(kindOf(key), list) as IScopeItem[];
        const old = items.filter((item) => item.updatedAt < cutoff);
        if (old.length === 0) continue;
        removed[key] = old;
        const rest = items.filter((item) => item.updatedAt >= cutoff);
        if (rest.length > 0) kept[key] = rest;
        else emptied.push(key);
      }
      if (Object.keys(kept).length > 0) await chromeApiService.storageSet(this.area, kept);
      await chromeApiService.storageRemove(this.area, emptied);
      return removed;
    });
  }

  // Undoes removeOlderThan(): each list gets its items back, next to what was added since.
  public restoreRemoved(removed: IRemovedItems): Promise<void> {
    return this.enqueue(async () => {
      const keys = Object.keys(removed);
      if (keys.length === 0) return;
      const stored = await chromeApiService.storageGet(this.area, keys);
      const lists = Object.fromEntries(keys.map((key) => {
        const kind = kindOf(key);
        const current = sortItems(kind, stored[key]) as IScopeItem[];
        const ids = new Set(current.map((item) => item.id));
        // An item back elsewhere since (restored, moved...) isn't duplicated.
        const back = removed[key]!.filter((item) => !ids.has(item.id));
        return [key, sortItems(kind, [...current, ...back])];
      }));
      await chromeApiService.storageSet(this.area, lists);
    });
  }

  // Deletes every note and to-do of the storage area in use, on every page and site (settings stay).
  public clearEverything(): Promise<void> {
    return this.enqueue(async () => {
      const content = scopeContent(await chromeApiService.storageGet(this.area, null));
      await chromeApiService.storageRemove(this.area, Object.keys(content));
    });
  }

  /**
   * Moves every note and to-do to the other storage area, then switches the setting. Refuses
   * (and keeps everything where it is) if they don't fit in chrome.storage.sync.
   *
   * What the target already holds is merged, not replaced: Chrome sync may hold another
   * computer's notes. Lists of the same page are merged item by item, the latest edit winning.
   * Leaving sync clears the synced copy, on every device: the settings panel asks first.
   *
   * Known limitation: another window writing at that exact moment still uses the old area until
   * it sees the new setting, so its write can land there. Avoiding it needs a cross-window lock.
   */
  public migrateTo(target: StorageAreaName): Promise<void> {
    return this.enqueue(async () => {
      const source = this.area;
      if (source === target) return;

      const content = scopeContent(await chromeApiService.storageGet(source, null));
      const existing = scopeContent(await chromeApiService.storageGet(target, null));
      const merged = mergeContent(existing, content);
      if (target === 'sync') this.checkSyncQuota(merged);

      await chromeApiService.storageSet(target, merged);
      // Switch before clearing the source: its removals are then in an area nobody listens to.
      await settingsService.setStorageArea(target);
      await chromeApiService.storageRemove(source, Object.keys(content));
    });
  }

  private newItem(scope: NoteScope, key: string, text: string): IScopeItem {
    const now = Date.now();
    return { id: crypto.randomUUID(), scope, key, text, createdAt: now, updatedAt: now };
  }

  private add<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K]): Promise<IScopeItemKinds[K]> {
    return this.enqueue(async () => {
      await this.write(kind, item.scope, item.key, (items) => [...items, item]);
      return item;
    });
  }

  private checkSyncQuota(items: Record<string, unknown>): void {
    const quota = chromeApiService.syncQuota();
    // One item per page and per site that has notes or to-dos.
    if (Object.keys(items).length > quota.items) {
      throw new QuotaExceededError('Notes and to-dos are kept on too many pages to sync. Remove some and try again.');
    }
    let total = 0;

    for (const [key, value] of Object.entries(items)) {
      // How chrome.storage.sync counts an item: its key plus its JSON value.
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

  private async write<K extends ScopeContentKind>(
    kind: K,
    scope: NoteScope,
    key: string,
    change: (items: IScopeItemKinds[K][]) => IScopeItemKinds[K][]
  ): Promise<void> {
    const item = storageKey(kind, scope, key);
    const stored = await chromeApiService.storageGet(this.area, [item]);
    const items = sortItems(kind, change(sortItems(kind, stored[item])));

    if (items.length > 0) await chromeApiService.storageSet(this.area, { [item]: items });
    else await chromeApiService.storageRemove(this.area, [item]);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this._queue.then(task);
    // A failed write is reported to its caller, but doesn't block the next ones.
    this._queue = result.catch(() => undefined);
    return result;
  }
}

// Stored lists are kept in display order, and sorted again on read. Malformed entries (a
// hand-edited or foreign list) are dropped rather than breaking the whole panel.
function sortItems<K extends ScopeContentKind>(kind: K, value: unknown): IScopeItemKinds[K][] {
  return Array.isArray(value) ? (value.filter(isItem) as IScopeItemKinds[K][]).sort(SORTERS[kind]) : [];
}

function isItem(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<IScopeItem>;
  return typeof item.id === 'string' && typeof item.createdAt === 'number';
}

// A page key's host (already without `www.`), or null for a malformed key.
function hostOf(pageKey: string): string | null {
  try {
    return new URL(pageKey).hostname;
  } catch {
    return null;
  }
}

// Which kind a storage item holds (`notes:…` or `todos:…`).
function kindOf(key: string): ScopeContentKind {
  return key.startsWith('todos:') ? 'todos' : 'notes';
}

// The notes and to-dos items of a storage area (leaving `settings` and anything else out).
function scopeContent(items: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(items).filter(([key]) => isScopeContentKey(key)));
}

/**
 * Both areas' lists together: a page's list present in both is merged item by item, the copy
 * edited last (updatedAt) winning; lists in only one area are kept as they are.
 */
function mergeContent(target: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...target };
  for (const [key, list] of Object.entries(incoming)) {
    const kind = kindOf(key);
    const byId = new Map<string, IScopeItem>();
    for (const item of [...sortItems(kind, target[key]), ...sortItems(kind, list)]) {
      const kept = byId.get(item.id);
      if (!kept || item.updatedAt > kept.updatedAt) byId.set(item.id, item);
    }
    merged[key] = sortItems(kind, [...byId.values()]);
  }
  return merged;
}

// Checking a to-do records when; unchecking it clears that. Other edits keep it as it was.
function stampDoneAt(before: ITodo, after: ITodo, now: Timestamp): void {
  if (after.done === before.done) return;
  after.doneAt = after.done ? now : null;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export const scopeStoreService = ScopeStoreService.getInstance();
