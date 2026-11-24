// Replaced at build time by esbuild's define (see lib/errors.ts).
declare const process: { env: { NODE_ENV?: string } };

// Notes are attached either to one page (its URL) or to a whole site (its domain).
declare type NoteScope = 'page' | 'site';

// Where notes are kept: this device only, or synced across the user's Chrome profiles (Firefox accounts).
declare type StorageAreaName = 'local' | 'sync';

// The panel's colours: the device's light/dark setting, or always light or dark (see lib/theme.ts).
declare type ThemeName = 'system' | 'light' | 'dark';

// The browser the extension runs in (see ChromeApiService.browser()).
declare type BrowserName = 'chrome' | 'firefox';

// Epoch milliseconds (Date.now()). chrome.storage serializes to JSON, where a Date would become {}.
declare type Timestamp = number;

// What a scope holds: its notes and its to-dos, each kept in its own storage item.
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

// One checkable item of a checklist (checked items stay in place).
declare interface IChecklistItem {
  id: string;
  text: string;
  done: boolean;
  // Folded down to its first line, cut with an ellipsis (see ChecklistItemComponent). Not an edit.
  collapsed?: boolean;
}

// A note: text only (lists of things to check off are checklists).
declare interface INote extends IScopeItem {
  // Optional, set in the note editor: shown above the text, and names the note in labels.
  name?: string;
  // Its text folded down to its first line (see NoteItemComponent). Not an edit: keeps updatedAt.
  collapsed?: boolean;
  // Its name cut to one line, folded apart from the text (see NoteItemComponent). Not an edit either.
  nameCollapsed?: boolean;
}

declare interface ITodo extends IScopeItem {
  // A checklist: its text is the checklist's name, and it's done once every item is (see ScopeStoreService).
  // Absent or empty: a single to-do.
  items?: IChecklistItem[];
  // Folded: a single to-do down to its first line, a checklist down to its name's first line and
  // its progress (see TodoItemComponent). Not an edit: keeps updatedAt.
  collapsed?: boolean;
  done: boolean;
  // When it was last checked (null while open): done to-dos are listed in the order they were done.
  doneAt: Timestamp | null;
}

// A to-do that has items: a checklist (see isChecklist in services/scope-store/scope-items.ts).
declare type IChecklist = ITodo & { items: IChecklistItem[] };

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
