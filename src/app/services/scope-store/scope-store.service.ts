import { AppEventBus, Service } from '../../../core/index.js';
import { hostOf, isScopeContentKey, pageLabelOf, siteOf, storageKey } from '../../lib/scope-keys.js';
import { chromeApiService } from '../chrome-api/chrome-api.service.js';
import { settingsService } from '../settings/settings.service.js';
import { editTodo, listDone, mergeContent, scopeLists, sortItems, topPosition, type IStoredList } from './scope-items.js';
import { createBackup, readBackup, type IBackup } from './backup.js';
import { SettingsNotLoadedError } from './store-errors.js';
import { checkSyncQuota } from './sync-quota.js';

export type { IBackup } from './backup.js';
export { InvalidBackupError, SettingsNotLoadedError } from './store-errors.js';
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

// How many notes and to-dos an import brought: new here, or newer than the copy here.
export interface IImported {
  notes: number;
  todos: number;
}

// What removeOlderThan() took out, by storage item: what restoreRemoved() puts back.
export type RemovedItems = Record<string, IScopeItem[]>;

// What makes an item that item: never changed by an update.
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

/**
 * The stored format's version, for later migrations.
 * Version 1 stores no marker
 * A later format writes its number in the `meta:schemaVersion` item of each area it migrates
 */
export const SCHEMA_VERSION = 1;

const KINDS: ScopeContentKind[] = ['notes', 'todos'];
const SCOPES: NoteScope[] = ['page', 'site'];

/**
 * Notes and to-dos CRUD over chrome.storage.
 * Refused until the settings are read.
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

  // Every page of a site that has notes or to-dos (done ones included), by path.
  // Reads the whole area: a site's pages can't be listed from their keys alone.
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
   * Applies `changes` to the item as currently stored.
   * Only the given fields change.
   */
  public update<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K], changes: ScopeItemChanges<K>): Promise<IScopeItemKinds[K]> {
    return this.updateWith(kind, item, () => changes);
  }

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

  // Folds or unfolds a note or a to-do list.
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

  // Undoes a remove: the item comes back with its id and dates, at the same place in its list.
  public restore<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K]): Promise<void> {
    return this.restoreMany(kind, [item]);
  }

  // Removes several items of one list (one scope key) in a single write.
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

  // Empties one list (a scope's notes, or its to-dos) in a single write. Resolves to what was in it.
  public removeAll<K extends ScopeContentKind>(kind: K, scope: NoteScope, key: string): Promise<IScopeItemKinds[K][]> {
    return this.enqueue(() => this.writeList(kind, scope, key, (items) => ({ items: [], result: items })));
  }

  // Moves an item to the other scope of the same tab (page ↔ site), in a single write.
  public async move<K extends ScopeContentKind>(kind: K, item: IScopeItemKinds[K], keys: IScopeKeys): Promise<IScopeItemKinds[K]> {
    const [moved] = await this.moveMany(kind, [item], keys);
    return moved ?? item;
  }

  // Undoes move(), in a single write. Edits made since stay.
  public moveBack<K extends ScopeContentKind>(kind: K, moved: IScopeItemKinds[K], original: IScopeItemKinds[K]): Promise<void> {
    return this.moveManyBack(kind, [moved], [original]);
  }

  /**
   * Moves several items of one list (one scope key) to the tab's other scope, in a single write.
   * To-dos land on top of the other list in the order given; items gone meanwhile are skipped.
   * Resolves to the items as moved.
   */
  public moveMany<K extends ScopeContentKind>(kind: K, items: IScopeItemKinds[K][], keys: IScopeKeys): Promise<IScopeItemKinds[K][]> {
    const [first] = items;
    if (!first) return Promise.resolve([]);
    const scope: NoteScope = first.scope === 'page' ? 'site' : 'page';
    const from = storageKey(kind, first.scope, first.key);
    const to = storageKey(kind, scope, keys[scope]);
    const ids = new Set(items.map((item) => item.id));

    return this.enqueue(async () => {
      const stored = await chromeApiService.storageGet(this.area, [from, to]);
      const source = sortItems(kind, stored[from]);
      const target = sortItems(kind, stored[to]);
      const picked = items
        .map((item) => source.find((i) => i.id === item.id))
        .filter((item): item is IScopeItemKinds[K] => item !== undefined);
      if (picked.length === 0) return [];
      const top = kind === 'todos' ? topPosition(target as ITodo[]) : 0;
      const moved = picked.map((current, index) => {
        const item = { ...current, scope, key: keys[scope] };
        // The first one given ends up on top.
        if (kind === 'todos') item.position = top - (picked.length - 1) + index;
        else delete item.position;
        return item;
      });

      await this.writeLists({ [to]: sortItems(kind, [...target, ...moved]), [from]: source.filter((i) => !ids.has(i.id)) });
      return moved;
    });
  }

  // Undoes moveMany() (`originals` as they were before it), in a single write. Edits made since stay.
  public moveManyBack<K extends ScopeContentKind>(kind: K, moved: IScopeItemKinds[K][], originals: IScopeItemKinds[K][]): Promise<void> {
    const [first] = moved;
    const [original] = originals;
    if (!first || !original) return Promise.resolve();
    const from = storageKey(kind, first.scope, first.key);
    const to = storageKey(kind, original.scope, original.key);
    const ids = new Set(moved.map((item) => item.id));

    return this.enqueue(async () => {
      const stored = await chromeApiService.storageGet(this.area, [from, to]);
      const source = sortItems(kind, stored[from]);
      const back = source.flatMap((current) => {
        const before = originals.find((item) => item.id === current.id);
        if (!before || !ids.has(current.id)) return [];
        const item = { ...current, scope: before.scope, key: before.key, position: before.position };
        if (before.position === undefined) delete item.position;
        return [item];
      });
      if (back.length === 0) return;
      const backIds = new Set(back.map((item) => item.id));
      const target = sortItems(kind, stored[to]).filter((i) => !backIds.has(i.id));

      await this.writeLists({ [to]: sortItems(kind, [...target, ...back]), [from]: source.filter((i) => !backIds.has(i.id)) });
    });
  }

  // Saves an edited to-do, in one write
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

  public async listEverything(): Promise<IStoredItem[]> {
    return (await this.readAll()).flatMap(({ kind, value }) => sortItems(kind, value).map((item) => ({ kind, item })));
  }

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

  public clearEverything(): Promise<void> {
    return this.enqueue(async () => {
      await chromeApiService.storageRemove(this.area, (await this.readAll()).map(({ key }) => key));
    });
  }

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

  public async exportAll(): Promise<IBackup> {
    return createBackup(await this.readAll(), SCHEMA_VERSION, Date.now());
  }

  public async importAll(text: string): Promise<IImported> {
    const incoming = readBackup(text, SCHEMA_VERSION, Date.now());
    return this.enqueue(async () => {
      const existing = Object.fromEntries((await this.readAll()).map(({ key, value }) => [key, value]));
      const imported: IImported = { notes: 0, todos: 0 };
      const changed: IStoredList[] = [];
      for (const list of incoming) {
        const here = new Map(sortItems(list.kind, existing[list.key]).map((item) => [item.id, item.updatedAt]));
        const brought = sortItems(list.kind, list.value).filter((item) => (here.get(item.id) ?? -Infinity) < item.updatedAt);
        imported[list.kind] += brought.length;
        if (brought.length > 0) changed.push(list);
      }
      if (changed.length === 0) return imported;

      const merged = mergeContent(existing, changed);
      if (this.area === 'sync') checkSyncQuota(merged, chromeApiService.syncQuota());
      await this.writeLists(Object.fromEntries(changed.map(({ key }) => [key, merged[key] as unknown[]])));
      return imported;
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

  private async writeLists(lists: Record<string, unknown[]>): Promise<void> {
    const entries = Object.entries(lists);
    const kept = entries.filter(([, items]) => items.length > 0);
    const emptied = entries.filter(([, items]) => items.length === 0).map(([key]) => key);
    if (kept.length > 0) await chromeApiService.storageSet(this.area, Object.fromEntries(kept));
    await chromeApiService.storageRemove(this.area, emptied);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this._queue.then(() => {
      if (!settingsService.loaded) throw new SettingsNotLoadedError();
      return task();
    });
    // A failed write is reported to its caller, but doesn't block the next ones.
    this._queue = result.catch(() => undefined);
    return result;
  }
}

export const scopeStoreService = ScopeStoreService.getInstance();
