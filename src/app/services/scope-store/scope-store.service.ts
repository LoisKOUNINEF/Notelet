import { AppEventBus, Service } from '../../../core/index.js';
import { hostOf, isScopeContentKey, pageLabelOf, siteOf, storageKey } from '../../lib/scope-keys.js';
import { chromeApiService } from '../chrome-api/chrome-api.service.js';
import { settingsService } from '../settings/settings.service.js';
import { editTodo, listDone, mergeContent, scopeLists, sortItems, topPosition, type IStoredList } from './scope-items.js';
import { checkSyncQuota } from './sync-quota.js';

export { QuotaExceededError } from './sync-quota.js';

// What one scope (a page, or a site) holds.
export interface IScopeContent {
  notes: INote[];
  todos: ITodo[];
}

export type ScopedContent = Record<NoteScope, IScopeContent>;

// One stored note or to-do, with its kind (see listEverything()).
export interface IStoredItem {
  kind: ScopeContentKind;
  item: IScopeItem;
}

// What removeOlderThan() took out, by storage item: what restoreRemoved() puts back.
export type RemovedItems = Record<string, IScopeItem[]>;

// What makes an item that item: never changed by an update (doneAt follows done, see editTodo).
type ItemIdentity = Exclude<keyof IScopeItem, 'text'>;
// What an update may change: everything else.
export type ScopeItemChanges<K extends ScopeContentKind> = Partial<Omit<IScopeItemKinds[K], ItemIdentity | 'doneAt'>>;

// What moveIntoList() did, for its Undo (moveOutOfList).
export interface IMovedIntoList {
  // The to-do and the list, as they were.
  before: ITodo[];
  list: ITodo;
  itemId: string;
}

const KINDS: ScopeContentKind[] = ['notes', 'todos'];
const SCOPES: NoteScope[] = ['page', 'site'];

/**
 * Notes and to-dos CRUD over chrome.storage. Each kind of each scope key is one storage item
 * (`notes:page:<url>`, `todos:site:<domain>`...): a tab's page and site content loads in a
 * single read, an edit only rewrites its own list, and no item gets near sync's per-item
 * limit the way one item holding everything would. The rules (sorting, validation, when a to-do
 * is done) are in scope-items.ts.
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
      const keys = Object.keys(changes).filter(isScopeContentKey);
      if (area === this.area && keys.length > 0) AppEventBus.emit('scope-content-changed', { keys });
    }));
  }

  public async load(keys: IScopeKeys): Promise<ScopedContent> {
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
    const pages = new Map<string, ISitePage>();
    for (const { key: item, kind, value } of await this.readAll()) {
      const prefix = storageKey(kind, 'page', '');
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
    return [...pages.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  public addNote(scope: NoteScope, key: string, text: string): Promise<INote> {
    return this.add('notes', this.newItem(scope, key, text));
  }

  // A single to-do, or a to-do list when given items (`text` is then the list's name).
  public addTodo(scope: NoteScope, key: string, text: string, items: IChecklistItem[] = []): Promise<ITodo> {
    const todo: ITodo = { ...this.newItem(scope, key, text), done: false, doneAt: null };
    return this.add('todos', items.length > 0 ? { ...todo, items, done: listDone(items) } : todo);
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
   * quick changes to one item (e.g. checking two of a list's items) both stick. A to-do list is
   * done once every item is (see editTodo). An item gone meanwhile (deleted in another window) is
   * left gone: the caller's copy comes back.
   */
  public updateWith<K extends ScopeContentKind>(
    kind: K,
    item: IScopeItemKinds[K],
    change: (current: IScopeItemKinds[K]) => ScopeItemChanges<K>
  ): Promise<IScopeItemKinds[K]> {
    return this.replaceItem(kind, item, (current) => {
      const now = Date.now();
      if (kind === 'todos') return editTodo(current as ITodo, change(current), now) as IScopeItemKinds[K];
      return { ...current, ...change(current), updatedAt: now };
    });
  }

  /**
   * Folds or unfolds a note or a to-do list. Not an edit: its updatedAt (shown as "Edited", and
   * counted by "Delete all older than") stays. Resolves to the item as stored, or the caller's
   * copy if it's gone.
   */
  public setCollapsed<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K], collapsed: boolean): Promise<IScopeItemKinds[K]> {
    return this.replaceItem(kind, item, (current) => {
      const folded = { ...current };
      if (collapsed) folded.collapsed = true;
      else delete folded.collapsed;
      return folded;
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
    return this.enqueue(() => this.writeList(kind, scope, key, (items) => ({ items: [], result: items })));
  }

  // Moves an item to the other scope of the same tab (page ↔ site), in a single write.
  // It lands at the top of the other list: a note as one not reordered yet, a to-do at the top
  // of the open ones (see topPosition). Not an edit, like folding: its updatedAt stays.
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
      const moved = { ...current, scope, key: keys[scope] };
      if (kind === 'todos') moved.position = topPosition(target as ITodo[]);
      else delete moved.position;

      await this.writeLists({ [to]: sortItems(kind, [...target, moved]), [from]: source.filter((i) => i.id !== item.id) });
      return moved;
    });
  }

  // Undoes move(), in a single write: the item leaves the list it was moved to as it is now
  // (edits made since stay), back to its old list at its old place. Gone since: left gone.
  public moveBack<K extends ScopeContentKind>(kind: K, moved: IScopeItemKinds[K], original: IScopeItemKinds[K]): Promise<void> {
    const from = storageKey(kind, moved.scope, moved.key);
    const to = storageKey(kind, original.scope, original.key);

    return this.enqueue(async () => {
      const stored = await chromeApiService.storageGet(this.area, [from, to]);
      const source = sortItems(kind, stored[from]);
      const current = source.find((i) => i.id === moved.id);
      if (!current) return;
      const target = sortItems(kind, stored[to]).filter((i) => i.id !== moved.id);
      const back = { ...current, scope: original.scope, key: original.key, position: original.position };
      if (original.position === undefined) delete back.position;

      await this.writeLists({ [to]: sortItems(kind, [...target, back]), [from]: source.filter((i) => i.id !== moved.id) });
    });
  }

  /**
   * Saves an edited to-do, in one write: its text and items (none left: a single to-do again).
   * The items `takenOut` of it become single to-dos, as they were (checked or not), the open ones
   * right after it: the open to-dos are numbered in that order, like a reorder.
   */
  public editList(todo: ITodo, text: string, items: IChecklistItem[], takenOut: IChecklistItem[] = []): Promise<ITodo> {
    return this.enqueue(() => this.writeList('todos', todo.scope, todo.key, (todos) => {
      const current = todos.find((t) => t.id === todo.id);
      // Gone meanwhile (deleted in another window): left gone.
      if (!current) return { items: todos, result: todo };
      const now = Date.now();
      const edited = editTodo(current, { text, items }, now);

      const singles: ITodo[] = takenOut.map((item) => ({
        ...this.newItem(todo.scope, todo.key, item.text),
        done: item.done,
        doneAt: item.done ? now : null,
      }));
      const rest = todos.map((t) => (t.id === todo.id ? edited : t));
      const openSingles = singles.filter((t) => !t.done);
      const doneSingles = singles.filter((t) => t.done);
      if (openSingles.length === 0) return { items: [...rest, ...doneSingles], result: edited };

      const open = rest.filter((t) => !t.done);
      const at = open.findIndex((t) => t.id === todo.id) + 1 || open.length;
      const ordered = [...open.slice(0, at), ...openSingles, ...open.slice(at)];
      return {
        items: [...ordered.map((t, index) => ({ ...t, position: index })), ...rest.filter((t) => t.done), ...doneSingles],
        result: edited,
      };
    }));
  }

  /**
   * Puts a single to-do into a list, as its last item (checked or not, as it was), in one write.
   * Resolves to what its Undo needs (moveOutOfList), or null when either is gone or the to-do is
   * itself a list.
   */
  public moveIntoList(todo: ITodo, list: ITodo): Promise<IMovedIntoList | null> {
    return this.enqueue(() => this.writeList('todos', list.scope, list.key, (todos): { items: ITodo[]; result: IMovedIntoList | null } => {
      const single = todos.find((t) => t.id === todo.id);
      const target = todos.find((t) => t.id === list.id);
      if (!single || !target || single.items?.length || !target.items?.length) return { items: todos, result: null };
      const itemId = crypto.randomUUID();
      const moved = editTodo(target, { items: [...target.items, { id: itemId, text: single.text, done: single.done }] }, Date.now());
      return {
        items: todos.filter((t) => t.id !== single.id).map((t) => (t.id === target.id ? moved : t)),
        result: { before: [single, target], list: moved, itemId },
      };
    }));
  }

  /**
   * Undoes moveIntoList(), in one write: the item it added leaves the list as the list is now
   * (items checked or renamed since stay so), and the single to-do comes back as it was.
   */
  public moveOutOfList(single: ITodo, list: ITodo, itemId: string): Promise<void> {
    return this.enqueue(() => this.write('todos', list.scope, list.key, (todos) => {
      const now = Date.now();
      const rest = todos.filter((t) => t.id !== single.id).map((t) => {
        if (t.id !== list.id || !t.items?.some((item) => item.id === itemId)) return t;
        return editTodo(t, { items: t.items.filter((item) => item.id !== itemId) }, now);
      });
      return [...rest, single];
    }));
  }

  /**
   * Saves the order the user gave a list, in one write: all of a scope's notes, or its open
   * to-dos (done ones keep their place). Items missing from `ids` (added in another window
   * meanwhile) keep theirs too: new notes stay on top, new to-dos after the ordered ones.
   */
  public reorder(kind: ScopeContentKind, scope: NoteScope, key: string, ids: string[]): Promise<void> {
    return this.enqueue(() => this.write(kind, scope, key, (items: IScopeItem[]) => {
      const reorderable = (item: IScopeItem) => kind === 'notes' || !(item as ITodo).done;
      const byId = new Map(items.filter(reorderable).map((item) => [item.id, item]));
      const ordered = new Set(ids);
      const listed = ids.map((id) => byId.get(id)).filter((item) => item !== undefined);
      const positioned = listed.map((item, index) => ({ ...item, position: index }));
      if (kind === 'notes') return [...items.filter((item) => !ordered.has(item.id)), ...positioned];
      return [
        ...positioned,
        ...items.filter((item) => reorderable(item) && !ordered.has(item.id)),
        ...items.filter((item) => !reorderable(item)),
      ];
    }));
  }

  // Every note and to-do of the storage area in use, on every page and site, in one read.
  public async listEverything(): Promise<IStoredItem[]> {
    return (await this.readAll()).flatMap(({ kind, value }) => sortItems(kind, value).map((item) => ({ kind, item })));
  }

  /**
   * Deletes every note and to-do not edited since `cutoff`, on every page and site, in one
   * write (plus one removal for the lists it empties). Resolves to what it removed, for an Undo.
   */
  public removeOlderThan(cutoff: Timestamp): Promise<RemovedItems> {
    return this.enqueue(async () => {
      const removed: RemovedItems = {};
      const lists: RemovedItems = {};
      for (const { key, kind, value } of await this.readAll()) {
        const items: IScopeItem[] = sortItems(kind, value);
        const old = items.filter((item) => item.updatedAt < cutoff);
        if (old.length === 0) continue;
        removed[key] = old;
        lists[key] = items.filter((item) => item.updatedAt >= cutoff);
      }
      await this.writeLists(lists);
      return removed;
    });
  }

  // Undoes removeOlderThan(): each list gets its items back, next to what was added since.
  public restoreRemoved(removed: RemovedItems): Promise<void> {
    return this.enqueue(async () => {
      const keys = Object.keys(removed);
      if (keys.length === 0) return;
      const stored = await chromeApiService.storageGet(this.area, keys);
      const lists: RemovedItems = {};
      for (const { key, kind, value } of scopeLists(Object.fromEntries(keys.map((key) => [key, stored[key]])))) {
        const current: IScopeItem[] = sortItems(kind, value);
        const ids = new Set(current.map((item) => item.id));
        // An item back elsewhere since (restored, moved...) isn't duplicated.
        const back = (removed[key] ?? []).filter((item) => !ids.has(item.id));
        lists[key] = sortItems(kind, [...current, ...back]);
      }
      await this.writeLists(lists);
    });
  }

  // Every site with notes or to-dos (on the site itself or any of its pages), in one read. Unsorted.
  public async listSites(): Promise<ISiteSummary[]> {
    const sites = new Map<string, ISiteSummary>();
    for (const { key, kind, value } of await this.readAll()) {
      const site = siteOf(key);
      if (!site) continue;
      const items: IScopeItem[] = sortItems(kind, value);
      if (items.length === 0) continue;
      const summary = sites.get(site) ?? { site, notes: 0, todos: 0, lastEdited: 0 };
      summary[kind] += items.length;
      summary.lastEdited = Math.max(summary.lastEdited, ...items.map((item) => item.updatedAt));
      sites.set(site, summary);
    }
    return [...sites.values()];
  }

  /**
   * Deletes everything kept for a site: its own notes and to-dos and those of each of its pages,
   * in one removal. Resolves to what it removed, for an Undo (restoreRemoved).
   */
  public removeSite(site: string): Promise<RemovedItems> {
    return this.enqueue(async () => {
      const removed: RemovedItems = {};
      for (const { key, kind, value } of await this.readAll()) {
        if (siteOf(key) === site) removed[key] = sortItems(kind, value);
      }
      await chromeApiService.storageRemove(this.area, Object.keys(removed));
      return removed;
    });
  }

  // Deletes every note and to-do of the storage area in use, on every page and site (settings stay).
  public clearEverything(): Promise<void> {
    return this.enqueue(async () => {
      await chromeApiService.storageRemove(this.area, (await this.readAll()).map(({ key }) => key));
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

      const content = await this.readAll(source);
      const existing = Object.fromEntries((await this.readAll(target)).map(({ key, value }) => [key, value]));
      const merged = mergeContent(existing, content);
      if (target === 'sync') checkSyncQuota(merged, chromeApiService.syncQuota());

      await chromeApiService.storageSet(target, merged);
      // Switch before clearing the source: its removals are then in an area nobody listens to.
      await settingsService.setStorageArea(target);
      await chromeApiService.storageRemove(source, content.map(({ key }) => key));
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

  // Replaces one item by `replace(current)`, in its list's write. Resolves to the new item, or the
  // caller's copy if it's gone.
  private replaceItem<K extends ScopeContentKind>(
    kind: K,
    item: IScopeItemKinds[K],
    replace: (current: IScopeItemKinds[K]) => IScopeItemKinds[K]
  ): Promise<IScopeItemKinds[K]> {
    return this.enqueue(() => this.writeList(kind, item.scope, item.key, (items) => {
      const current = items.find((i) => i.id === item.id);
      if (!current) return { items, result: item };
      const replaced = replace(current);
      return { items: items.map((i) => (i === current ? replaced : i)), result: replaced };
    }));
  }

  // Every notes and to-dos list of a storage area (the one in use by default), in one read.
  private async readAll(area: StorageAreaName = this.area): Promise<IStoredList[]> {
    return scopeLists(await chromeApiService.storageGet(area, null));
  }

  private write<K extends ScopeContentKind>(
    kind: K,
    scope: NoteScope,
    key: string,
    change: (items: IScopeItemKinds[K][]) => IScopeItemKinds[K][]
  ): Promise<void> {
    return this.writeList(kind, scope, key, (items) => ({ items: change(items), result: undefined }));
  }

  // Read-modify-write of one list; `change` also says what the write resolves to.
  private async writeList<K extends ScopeContentKind, R>(
    kind: K,
    scope: NoteScope,
    key: string,
    change: (items: IScopeItemKinds[K][]) => { items: IScopeItemKinds[K][]; result: R }
  ): Promise<R> {
    const item = storageKey(kind, scope, key);
    const stored = await chromeApiService.storageGet(this.area, [item]);
    const { items, result } = change(sortItems(kind, stored[item]));
    await this.writeLists({ [item]: sortItems(kind, items) });
    return result;
  }

  // Several lists in one write; the emptied ones are removed (sync allows 512 items), in one removal.
  private async writeLists(lists: Record<string, unknown[]>): Promise<void> {
    const entries = Object.entries(lists);
    const kept = entries.filter(([, items]) => items.length > 0);
    const emptied = entries.filter(([, items]) => items.length === 0).map(([key]) => key);
    if (kept.length > 0) await chromeApiService.storageSet(this.area, Object.fromEntries(kept));
    await chromeApiService.storageRemove(this.area, emptied);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this._queue.then(task);
    // A failed write is reported to its caller, but doesn't block the next ones.
    this._queue = result.catch(() => undefined);
    return result;
  }
}

export const scopeStoreService = ScopeStoreService.getInstance();
