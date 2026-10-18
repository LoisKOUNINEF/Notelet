// Checklist lines as written in a note's text: "- [ ] item", "- [x] item" (or "*" bullets).
const ITEM_LINE = /^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/;
const MARKER = '- [ ] ';

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

/**
 * What Enter does on a checklist line while typing one: start the next item, or, on an
 * empty item, end the list (its marker is removed). Null on any other line: Enter is left alone.
 * Selected text (`caret` to `selectionEnd`) is replaced first, as Enter would.
 */
export function continueChecklist(
  typed: string,
  caret: number,
  selectionEnd: number = caret
): { value: string; caret: number } | null {
  const value = typed.slice(0, caret) + typed.slice(selectionEnd);
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const lineEnd = value.indexOf('\n', caret);
  const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
  const match = ITEM_LINE.exec(line);
  if (!match) return null;

  if (!match[2]!.trim()) {
    const next = value.slice(0, lineStart) + value.slice(lineStart + line.length);
    return { value: next, caret: lineStart };
  }
  const next = `${value.slice(0, caret)}\n${MARKER}${value.slice(caret)}`;
  return { value: next, caret: caret + 1 + MARKER.length };
}

// Starts a checklist line where the caret is: on the current line if it's empty, else on a new one.
export function startChecklistLine(value: string, caret: number): { value: string; caret: number } {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const lineEnd = value.indexOf('\n', caret);
  const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
  if (ITEM_LINE.test(line)) return { value, caret };

  if (!line.trim()) {
    const next = value.slice(0, lineStart) + MARKER + value.slice(lineStart + line.length);
    return { value: next, caret: lineStart + MARKER.length };
  }
  const end = lineEnd === -1 ? value.length : lineEnd;
  const next = `${value.slice(0, end)}\n${MARKER}${value.slice(end)}`;
  return { value: next, caret: end + 1 + MARKER.length };
}
