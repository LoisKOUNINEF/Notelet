// Checklist lines as written in a note's text: "- [ ] item", "- [x] item" (or "*" bullets).
const ITEM_LINE = /^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/;

export interface IParsedChecklist {
  text: string;
  items: Omit<IChecklistItem, 'id'>[];
}

/**
 * Splits a note's typed text into its text and its checklist: every item line becomes an
 * item (empty ones are dropped), the other lines stay as the note's text.
 */
export function parseChecklist(value: string): IParsedChecklist {
  const lines: string[] = [];
  const items: IParsedChecklist['items'] = [];

  for (const line of value.split('\n')) {
    const match = ITEM_LINE.exec(line);
    if (!match) {
      lines.push(line);
      continue;
    }
    const text = match[2]!.trim();
    if (text) items.push({ text, done: match[1] !== ' ' });
  }
  return { text: lines.join('\n').trim(), items };
}

export function withIds(items: IParsedChecklist['items']): IChecklistItem[] {
  return items.map((item) => ({ id: crypto.randomUUID(), ...item }));
}
