// Notes are attached either to one page (its URL) or to a whole site (its domain).
declare type NoteScope = 'page' | 'site';

// Where notes are kept: this device only, or synced across the user's Chrome profiles.
declare type StorageAreaName = 'local' | 'sync';

// Epoch milliseconds (Date.now()). chrome.storage serializes to JSON, where a Date would become {}.
declare type Timestamp = number;

// What a scope holds: its notes and its to-do list, each kept in its own storage item.
declare type ScopeContentKind = 'notes' | 'todos';

// Common to notes and to-dos.
declare interface IScopeItem {
  id: string;
  scope: NoteScope;
  // The page key or site key the item belongs to (see lib/scope-keys.ts).
  key: string;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

declare interface INote extends IScopeItem {}

declare interface ITodo extends IScopeItem {
  done: boolean;
  // When it was last checked (null while open): done to-dos are listed in the order they were done.
  doneAt: Timestamp | null;
}

// The item type of each kind.
declare interface IScopeItemKinds {
  notes: INote;
  todos: ITodo;
}

// Both keys of the active tab's URL, plus short labels to show them.
declare interface IScopeKeys {
  page: string;
  site: string;
  pageLabel: string;
  siteLabel: string;
}

declare namespace Nutin {
  interface AppEventMap {
    // The active tab's notes keys changed (tab switch, navigation); null on pages that can't have notes.
    'active-scope-changed': { keys: IScopeKeys | null };
    // Notes or to-dos were added, edited, moved or removed, here or in another window.
    'scope-content-changed': undefined;
    'storage-area-changed': { area: StorageAreaName };
  }
}
