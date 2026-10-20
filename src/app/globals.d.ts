// Notes are attached either to one page (its URL) or to a whole site (its domain).
declare type NoteScope = 'page' | 'site';

// Where notes are kept: this device only, or synced across the user's Chrome profiles (Firefox accounts).
declare type StorageAreaName = 'local' | 'sync';

// The browser the extension runs in (see ChromeApiService.browser()).
declare type BrowserName = 'chrome' | 'firefox';

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
  // Where the user put it in its list; absent until they reorder it (see ScopeStoreService's sorters).
  position?: number;
}

// One checkable item of a to-do list (checked items stay in place).
declare interface IChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

// A note: text only (lists of things to check off are to-do lists).
declare interface INote extends IScopeItem {
  // Optional, set in the note editor: shown above the text, and names the note in labels.
  name?: string;
  // Folded down to its name or first line (see NoteItemComponent). Not an edit: keeps updatedAt.
  collapsed?: boolean;
}

declare interface ITodo extends IScopeItem {
  // A to-do list: its text is the list's name, and it's done once every item is (see ScopeStoreService).
  // Absent or empty: a single to-do.
  items?: IChecklistItem[];
  // A list folded down to its name and progress. Not an edit: keeps updatedAt.
  collapsed?: boolean;
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

// A page of the active tab's site that has notes or to-dos (see ScopeStoreService.listSitePages).
declare interface ISitePage {
  // Its page key, which is also a URL to open it.
  key: string;
  label: string;
  notes: number;
  todos: number;
  openTodos: number;
}

// A site with notes or to-dos, for "Manage by site" (see ScopeStoreService.listSites).
declare interface ISiteSummary {
  site: string;
  // Its own and its pages' together; to-dos done or not.
  notes: number;
  todos: number;
  // The latest edit of any of them.
  lastEdited: Timestamp;
}

// How "Manage by site" orders the sites: by last edit, or by name.
declare type SitesOrder = 'recent' | 'oldest' | 'az' | 'za';

declare namespace Nutin {
  interface AppEventMap {
    // The active tab's notes keys changed (tab switch, navigation); null on pages that can't have notes.
    'active-scope-changed': { keys: IScopeKeys | null };
    // Notes or to-dos were added, edited, moved or removed, here or in another window: the
    // storage items that changed (`notes:page:<url>`...).
    'scope-content-changed': { keys: string[] };
    'storage-area-changed': { area: StorageAreaName };
    // Any setting saved, here or in another window (see services/settings).
    'settings-changed': undefined;
    // Once a minute (services/clock): relative times refresh themselves.
    'minute-tick': undefined;
  }
}
