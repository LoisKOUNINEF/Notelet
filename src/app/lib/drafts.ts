import { chromeApiService } from '../services/chrome-api/chrome-api.service.js';

// Unsent text per field and scope key: switching tabs or pages doesn't lose what was being typed.
// Closing and reopening the panel doesn't lose it either. Quitting the browser does.
const drafts = new Map<string, string>();

const KEY_PREFIX = 'draft:';
// Saved once typing pauses, not on every key.
const SAVE_DELAY = 250;

// Kept in session storage.
let persisted = false;
// Changed since the last save.
const pending = new Map<string, string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// What open editors hold but only hand over when they go away.
const openEdits = new Set<() => void>();

/**
 * Loads the drafts kept from the panel's last opening, then keeps saving them.
 * Rejects if they can't be read; drafts then still work, for this panel's lifetime only.
 */
export async function initDrafts(): Promise<void> {
  const stored = await chromeApiService.sessionGet(null);
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(KEY_PREFIX) && typeof value === 'string' && value) drafts.set(key.slice(KEY_PREFIX.length), value);
  }
  if (persisted) return;
  persisted = true;
  // The panel closing (or hidden): open edits and what's typed since the last save are saved.
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') void saveAllDrafts();
}

function onPageHide(): void {
  void saveAllDrafts();
}

/**
 * For an editor that writes its draft when it goes away (onBeforeDestroy): closing the panel
 * destroys nothing, so `save` is also run then. Returns a function that stops it (call it on destroy).
 */
export function keepDraftsOf(save: () => void): () => void {
  openEdits.add(save);
  return () => openEdits.delete(save);
}

// Every open edit's draft, then everything changed, saved now.
export async function saveAllDrafts(): Promise<void> {
  openEdits.forEach((save) => save());
  await flushDrafts();
}

export function getDraft(id: string): string {
  return drafts.get(id) ?? '';
}

export function setDraft(id: string, text: string): void {
  if (text) drafts.set(id, text);
  else drafts.delete(id);
  if (!persisted) return;
  pending.set(id, text);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushDrafts(), SAVE_DELAY);
}

// Saves the drafts changed since the last save. A failure is ignored: they're still in memory.
export async function flushDrafts(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (pending.size === 0) return;
  const changes = [...pending];
  pending.clear();
  const kept = changes.filter(([, text]) => text);
  const removed = changes.filter(([, text]) => !text).map(([id]) => KEY_PREFIX + id);
  try {
    if (kept.length > 0) await chromeApiService.sessionSet(Object.fromEntries(kept.map(([id, text]) => [KEY_PREFIX + id, text])));
    await chromeApiService.sessionRemove(removed);
  } catch {
    // Kept for this panel's lifetime anyway.
  }
}

// A draft holding structured data (stored as JSON); null when there's none, or it can't be read.
export function getJsonDraft<T>(id: string): T | null {
  const draft = getDraft(id);
  if (!draft) return null;
  try {
    return JSON.parse(draft) as T;
  } catch {
    return null;
  }
}

export function setJsonDraft(id: string, draft: unknown): void {
  setDraft(id, draft === null ? '' : JSON.stringify(draft));
}

// An item's edit left open when its item went away: restored when the item shows up again.
export function getEditDraft<T>(kind: 'note' | 'todo', id: string): T | null {
  return getJsonDraft<T>(`edit:${kind}:${id}`);
}

export function setEditDraft(kind: 'note' | 'todo', id: string, draft: unknown): void {
  setJsonDraft(`edit:${kind}:${id}`, draft);
}

// Forgets every draft, and stops saving them. Storage is left as is.
export function clearDrafts(): void {
  drafts.clear();
  pending.clear();
  openEdits.clear();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  persisted = false;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', onPageHide);
}
