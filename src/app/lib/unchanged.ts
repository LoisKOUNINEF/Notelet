// A reloaded list, with each item that didn't change replaced by its previous object,
// so a catalog (which compares items shallowly) keeps it, along with an edit in progress.
// Every change to an item gives it a new updatedAt (folding it, or one of a checklist's items, aside).
// Its position doesn't count: reordering alone keeps every item.
export function keepUnchanged<T extends IScopeItem & { collapsed?: boolean; nameCollapsed?: boolean; items?: { collapsed?: boolean }[] }>(previous: T[], next: T[]): T[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  return next.map((item) => {
    const kept = byId.get(item.id);
    return kept && kept.updatedAt === item.updatedAt && kept.collapsed === item.collapsed && kept.nameCollapsed === item.nameCollapsed && sameFolds(kept.items, item.items) ? kept : item;
  });
}

// The same checklist items folded (an unchanged updatedAt means the same items otherwise).
function sameFolds(a: { collapsed?: boolean }[] = [], b: { collapsed?: boolean }[] = []): boolean {
  return a.length === b.length && a.every((item, i) => !!item.collapsed === !!b[i]?.collapsed);
}

// `items` in the order of `ids` (the ids a reorder shows), in one pass over each.
// An id with no item is skipped.
export function inOrder<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
