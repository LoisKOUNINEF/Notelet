// A reloaded list, with each item that didn't change replaced by its previous object, so a catalog
// (which compares items shallowly) keeps it, along with an edit in progress. Every change to an item
// gives it a new updatedAt (folding it aside). Its position doesn't count: reordering alone keeps
// every item. Nor do its arrays (a to-do list's items), new on every load.
export function keepUnchanged<T extends IScopeItem & { collapsed?: boolean }>(previous: T[], next: T[]): T[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  return next.map((item) => {
    const kept = byId.get(item.id);
    return kept && kept.updatedAt === item.updatedAt && kept.collapsed === item.collapsed ? kept : item;
  });
}
