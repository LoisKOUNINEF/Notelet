// Notes are attached either to one page (its URL) or to a whole site (its domain).
declare type NoteScope = 'page' | 'site';

// Where notes are kept: this device only, or synced across the user's Chrome profiles.
declare type StorageAreaName = 'local' | 'sync';

// Epoch milliseconds (Date.now()). chrome.storage serializes to JSON, where a Date would become {}.
declare type Timestamp = number;

declare interface INote {
  id: string;
  scope: NoteScope;
  // The page key or site key the note belongs to (see lib/scope-keys.ts).
  key: string;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
    // Notes were added, edited, moved or removed, here or in another window.
    'notes-changed': undefined;
    'storage-area-changed': { area: StorageAreaName };
  }
}
