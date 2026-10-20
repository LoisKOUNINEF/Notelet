import { inOrder, keepUnchanged } from '#root/dist/src/app/lib/unchanged.js';

describe('keepUnchanged', () => {
  const item = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra });

  it('keeps the previous object of each item that didn\'t change, folded or not', () => {
    const previous = [item('a', 1), item('b', 1), item('c', 1, { collapsed: true })];
    const next = [item('a', 1), item('b', 2), item('c', 1)];
    const kept = keepUnchanged(previous, next);
    expect(kept[0]).toBe(previous[0]);
    expect(kept[1]).toBe(next[1]);
    expect(kept[2]).toBe(next[2]);
  });
});

describe('inOrder', () => {
  it('returns the items in the order of the ids', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(inOrder(items, ['c', 'a', 'b'])).toEqual([items[2], items[0], items[1]]);
  });
});
