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
