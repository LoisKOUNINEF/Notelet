import { kindOf } from '../../lib/scope-keys.js';

// The pure rules behind ScopeStoreService: what a stored item must look like, how lists are
// sorted and merged, and when a to-do is done. No storage here.

// One storage item holding a scope's notes or to-dos, as read: its key, its kind, its raw value.
export interface IStoredList {
  key: string;
  kind: ScopeContentKind;
  value: unknown;
}

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

// To-dos checked before doneAt existed have none: their last update is the closest guess.
function doneTime(todo: ITodo): Timestamp {
  return todo.doneAt ?? todo.updatedAt;
}

// Above every open to-do of a list: reordered ones start at 0, never-reordered ones sort last.
export function topPosition(todos: ITodo[]): number {
  return Math.min(0, ...todos.filter((todo) => !todo.done && todo.position !== undefined).map((todo) => todo.position!)) - 1;
}

// Stored lists are kept in display order, and sorted again on read. Malformed entries (a
// hand-edited or foreign list) are dropped rather than breaking the whole panel.
export function sortItems<K extends ScopeContentKind>(kind: K, value: unknown): IScopeItemKinds[K][] {
  if (!Array.isArray(value)) return [];
  const items = value.map((entry) => normalizeItem(kind, entry)).filter((item) => item !== null);
  return items.sort(SORTERS[kind]);
}

/**
 * The item as the panel can render it, or null. Only an id, a creation time and a text are
 * required; other fields that are missing or of the wrong type are repaired (a write saves the
 * list back as read, so an item dropped here would be lost for good).
 */
function normalizeItem<K extends ScopeContentKind>(kind: K, value: unknown): IScopeItemKinds[K] | null {
  if (!value || typeof value !== 'object') return null;
  const stored = value as Record<string, unknown>;
  const { id, createdAt, text } = stored;
  if (typeof id !== 'string' || !isTime(createdAt) || typeof text !== 'string') return null;

  // Copied as is (scope, key, and anything a newer version may have added), then repaired.
  const item = { ...stored, id, text, createdAt, updatedAt: isTime(stored.updatedAt) ? stored.updatedAt : createdAt } as IScopeItem;
  if (item.position !== undefined && !Number.isFinite(item.position)) delete item.position;
  if (kind === 'notes') {
    const note: INote = item;
    if (note.name !== undefined && typeof note.name !== 'string') delete note.name;
    if (note.collapsed !== undefined && typeof note.collapsed !== 'boolean') delete note.collapsed;
    return note as IScopeItemKinds[K];
  }

  const todo: ITodo = { ...item, done: stored.done === true, doneAt: isTime(stored.doneAt) ? stored.doneAt : null };
  if (Array.isArray(stored.items)) todo.items = stored.items.filter(isChecklistItem);
  else delete todo.items;
  if (todo.collapsed !== undefined && typeof todo.collapsed !== 'boolean') delete todo.collapsed;
  return todo as IScopeItemKinds[K];
}

function isChecklistItem(value: unknown): value is IChecklistItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<IChecklistItem>;
  return typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean';
}

// A timestamp a Date can represent: toISOString() throws on anything else.
function isTime(value: unknown): value is Timestamp {
  return typeof value === 'number' && Number.isFinite(new Date(value).getTime());
}

// The notes and to-dos items of a storage area (leaving the settings and anything else out).
export function scopeLists(items: Record<string, unknown>): IStoredList[] {
  return Object.entries(items).flatMap(([key, value]) => {
    const kind = kindOf(key);
    return kind ? [{ key, kind, value }] : [];
  });
}

/**
 * Both areas' lists together: a page's list present in both is merged item by item, the copy
 * edited last (updatedAt) winning; lists in only one area are kept as they are.
 */
export function mergeContent(target: Record<string, unknown>, incoming: IStoredList[]): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...target };
  for (const { key, kind, value } of incoming) {
    const byId = new Map<string, IScopeItem>();
    for (const item of [...sortItems(kind, target[key]), ...sortItems(kind, value)]) {
      const kept = byId.get(item.id);
      if (!kept || item.updatedAt > kept.updatedAt) byId.set(item.id, item);
    }
    merged[key] = sortItems(kind, [...byId.values()]);
  }
  return merged;
}

export function listDone(items: IChecklistItem[]): boolean {
  return items.length > 0 && items.every((item) => item.done);
}

/**
 * `current` after `changes`, edited `now`: a list (items left) is done once every item is, an
 * emptied one is a single to-do again; checking it records when, unchecking it clears that.
 */
export function editTodo(current: ITodo, changes: Partial<ITodo>, now: Timestamp): ITodo {
  const todo: ITodo = { ...current, ...changes, updatedAt: now };
  if (todo.items?.length) todo.done = listDone(todo.items);
  else delete todo.items;
  if (todo.done !== current.done) todo.doneAt = todo.done ? now : null;
  return todo;
}
