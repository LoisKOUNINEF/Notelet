// Unsent text per field and scope key, for the panel's lifetime: switching tabs or pages
// (which re-creates the composers) doesn't lose what was being typed.
const drafts = new Map<string, string>();

export function getDraft(id: string): string {
  return drafts.get(id) ?? '';
}

export function setDraft(id: string, text: string): void {
  if (text) drafts.set(id, text);
  else drafts.delete(id);
}

// An item's edit left open when its item went away (tab switch, navigation, another window
// saving it...): restored when the item shows up again in this panel.
export function getEditDraft<T>(kind: 'note' | 'todo', id: string): T | null {
  const draft = getDraft(`edit:${kind}:${id}`);
  if (!draft) return null;
  try {
    return JSON.parse(draft) as T;
  } catch {
    return null;
  }
}

export function setEditDraft(kind: 'note' | 'todo', id: string, draft: unknown): void {
  setDraft(`edit:${kind}:${id}`, draft === null ? '' : JSON.stringify(draft));
}

// Forgets every draft (tests start each panel fresh).
export function clearDrafts(): void {
  drafts.clear();
}
