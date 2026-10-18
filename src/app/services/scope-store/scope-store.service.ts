import { AppEventBus, Service } from '../../../core/index.js';
import { isScopeContentKey, storageKey } from '../../lib/scope-keys.js';
import { chromeApiService } from '../chrome-api/chrome-api.service.js';
import { settingsService } from '../settings/settings.service.js';

// What one scope (a page, or a site) holds.
export interface IScopeContent {
  notes: INote[];
  todos: ITodo[];
}

export type IScopedContent = Record<NoteScope, IScopeContent>;

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

// Notes: newest first. To-dos: a checklist, the open ones in the order the user arranged them
// (oldest first until then, new ones last), then the done ones in the order they were checked,
// so the one just checked is always last.
const SORTERS: { [K in ScopeContentKind]: (a: IScopeItemKinds[K], b: IScopeItemKinds[K]) => number } = {
  notes: (a, b) => b.createdAt - a.createdAt,
  todos: (a, b) => Number(a.done) - Number(b.done)
    || (a.done ? doneTime(a) - doneTime(b) : position(a) - position(b))
    || a.createdAt - b.createdAt,
};

// Not reordered yet: after the ones that were.
function position(todo: ITodo): number {
  return todo.position ?? Number.MAX_SAFE_INTEGER;
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

  public addNote(scope: NoteScope, key: string, text: string, items: IChecklistItem[] = []): Promise<INote> {
    return this.add('notes', { ...this.newItem(scope, key, text), items });
  }

  public addTodo(scope: NoteScope, key: string, text: string): Promise<ITodo> {
    return this.add('todos', { ...this.newItem(scope, key, text), done: false, doneAt: null });
  }

  public update<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K], changes: ScopeItemChanges<K>): Promise<IScopeItemKinds[K]> {
    const now = Date.now();
    const updated = { ...item, ...changes, updatedAt: now } as IScopeItemKinds[K];
    if (kind === 'todos') stampDoneAt(item as ITodo, updated as ITodo, now);
    return this.enqueue(async () => {
      await this.write(kind, item.scope, item.key, (items) => items.map((i) => (i.id === item.id ? updated : i)));
      return updated;
    });
  }

  /**
   * Like update(), but the changes are computed from the item as currently stored, inside the
   * write queue: two quick changes to one item (e.g. checking two of a note's checklist items)
   * both stick, where update() would have the second overwrite the first with a stale copy.
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

  // Removes several items of one list (one scope key) in a single write, e.g. "Clear completed".
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

  // Moves an item to the other scope of the same tab (page ↔ site), in a single write.
  public move<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K], keys: IScopeKeys): Promise<IScopeItemKinds[K]> {
    const scope: NoteScope = item.scope === 'page' ? 'site' : 'page';
    const moved = { ...item, scope, key: keys[scope], updatedAt: Date.now() };
    const from = storageKey(kind, item.scope, item.key);
    const to = storageKey(kind, moved.scope, moved.key);

    return this.enqueue(async () => {
      const stored = await chromeApiService.storageGet(this.area, [from, to]);
      await chromeApiService.storageSet(this.area, {
        [from]: sortItems(kind, stored[from]).filter((i) => i.id !== item.id),
        [to]: sortItems(kind, [...sortItems(kind, stored[to]), moved]),
      });
      return moved;
    });
  }

  /**
   * Saves the order the user gave a list's open to-dos, in one write. Open to-dos missing from
   * `openIds` (added in another window meanwhile) keep their place after them; done ones keep theirs.
   */
  public reorderTodos(scope: NoteScope, key: string, openIds: string[]): Promise<void> {
    return this.enqueue(() => this.write('todos', scope, key, (todos) => {
      const open = todos.filter((todo) => !todo.done);
      const ordered = [
        ...openIds.map((id) => open.find((todo) => todo.id === id)).filter((todo): todo is ITodo => !!todo),
        ...open.filter((todo) => !openIds.includes(todo.id)),
      ];
      return [
        ...ordered.map((todo, index) => ({ ...todo, position: index })),
        ...todos.filter((todo) => todo.done),
      ];
    }));
  }

  /**
   * Moves every note and to-do to the other storage area, then switches the setting. Refuses
   * (and keeps everything where it is) if they don't fit in chrome.storage.sync.
   */
  public migrateTo(target: StorageAreaName): Promise<void> {
    return this.enqueue(async () => {
      const source = this.area;
      if (source === target) return;

      const content = Object.fromEntries(
        Object.entries(await chromeApiService.storageGet(source, null)).filter(([key]) => isScopeContentKey(key))
      );
      if (target === 'sync') this.checkSyncQuota(content);

      await chromeApiService.storageSet(target, content);
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

// Stored lists are kept in display order, and sorted again on read.
function sortItems<K extends ScopeContentKind>(kind: K, value: unknown): IScopeItemKinds[K][] {
  return Array.isArray(value) ? [...(value as IScopeItemKinds[K][])].sort(SORTERS[kind]) : [];
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
