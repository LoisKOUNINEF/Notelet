// Moves `id` to `toIndex` (clamped to the list), without changing the given array.
export function moveId(ids: string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const rest = ids.filter((other) => other !== id);
  const to = Math.max(0, Math.min(toIndex, rest.length));
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}

/**
 * Where a dragged item lands: past every other item whose vertical middle the pointer has
 * crossed. `midpoints` are every item's, in list order, the dragged one included (it's skipped).
 */
export function targetIndex(pointerY: number, midpoints: number[], fromIndex: number): number {
  let index = fromIndex;
  midpoints.forEach((middle, i) => {
    if (i < fromIndex && pointerY < middle) index = Math.min(index, i);
    if (i > fromIndex && pointerY > middle) index = Math.max(index, i);
  });
  return index;
}
