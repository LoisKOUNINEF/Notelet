// What other components target inside the to-do list (focus after an action), kept here so a
// renamed class can't silently break them. In its own module: the items import it, and the list
// imports the items.

// The "Done (n)" group's toggle: where the focus goes when an item leaves the view into it.
export const DONE_TOGGLE = '.todo-list__done-toggle';

// Each group of to-dos is its own catalog, with its own indexes.
export function todoCatalog(group: 'open' | 'done'): string {
  return `[data-catalog="${group}-todos"]`;
}
