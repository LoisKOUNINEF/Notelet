import { isChecklist } from '../services/scope-store/scope-items.js';

// How long an item's label gets in a message: enough to recognize it, short enough to scan.
const SHORT_LENGTH = 20;

// A text's first non-empty line, trimmed, its runs of spaces and tabs made single.
export function firstLine(text: string): string {
  return (text.split('\n').find((line) => line.trim()) ?? '').trim().replace(/[ \t]+/g, ' ');
}

/**
 * A text's first line, cut to `max` characters (the "…" included): at the last word that fits,
 * unless that keeps less than half of it (one long word), then right at the limit.
 */
export function shortLabel(text: string, max: number = SHORT_LENGTH): string {
  const line = firstLine(text);
  if (line.length <= max) return line;
  const room = line.slice(0, max - 1);
  const space = room.lastIndexOf(' ');
  return `${(space >= max / 2 ? room.slice(0, space) : room).trimEnd()}…`;
}

/**
 * A page's path cut in the middle to `max` characters (the "…" included), so both ends stay
 * recognizable: its first segments, then its last one (query string included), as in
 * "/docs/guides/…/install". When that last segment alone is too long: the path's start, then
 * the end of it ("/docs/…started-with-everything").
 */
export function shortPath(path: string, max: number = 30): string {
  if (path.length <= max) return path;
  const query = path.indexOf('?');
  const cut = (query === -1 ? path : path.slice(0, query)).lastIndexOf('/');
  const tail = path.slice(cut + 1);
  // As many leading segments as fit before "…/" and the last one, each ending on a "/".
  let head = '';
  for (let slash = path.indexOf('/'); slash !== -1 && slash < cut; slash = path.indexOf('/', slash + 1)) {
    const candidate = path.slice(0, slash + 1);
    if (candidate.length + 2 + tail.length > max) break;
    head = candidate;
  }
  if (head) return `${head}…/${tail}`;
  const second = path.indexOf('/', 1);
  const start = second !== -1 && second < max / 2 ? path.slice(0, second + 1) : path.slice(0, Math.floor(max / 2));
  return `${start}…${path.slice(path.length - (max - start.length - 1))}`;
}

// “Its short label”, in curly quotes.
export function quoted(text: string): string {
  return `“${shortLabel(text)}”`;
}

// How a message names a note: `note “Its name or first line”` (just `note` if it has neither).
export function noteRef(note: Pick<INote, 'name' | 'text'>): string {
  const label = shortLabel(note.name || note.text || '');
  return label ? `note “${label}”` : 'note';
}

// How a message names a to-do: `to-do “Its text”`, or `checklist “Its name”` when it has items.
export function todoRef(todo: Pick<ITodo, 'text' | 'items'>): string {
  const kind = isChecklist(todo as ITodo) ? 'checklist' : 'to-do';
  const label = shortLabel(todo.text || '');
  return label ? `${kind} “${label}”` : kind;
}

// A message starting with a ref: its first letter capitalized ("Note “Ideas” deleted.").
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
