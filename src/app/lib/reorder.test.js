import { moveId, targetIndex } from '#root/dist/src/app/lib/reorder.js';

describe('moveId', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves an id up or down, to the ends, or nowhere', () => {
    expect(moveId(ids, 'c', 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveId(ids, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(ids, 'b', 0)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveId(ids, 'b', 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveId(ids, 'b', 1)).toEqual(ids);
  });

  it('clamps the index to the list', () => {
    expect(moveId(ids, 'b', -1)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveId(ids, 'b', 9)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('leaves the list alone for an unknown id, and never changes the given array', () => {
    expect(moveId(ids, 'z', 0)).toEqual(ids);
    moveId(ids, 'a', 3);
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('targetIndex', () => {
  // Four 40px-tall items stacked from y = 0.
  const midpoints = [20, 60, 100, 140];

  it('stays in place until the pointer crosses a neighbour\'s middle', () => {
    expect(targetIndex(55, midpoints, 1)).toBe(1);
    expect(targetIndex(70, midpoints, 1)).toBe(1);
  });

  it('moves down past every middle crossed', () => {
    expect(targetIndex(101, midpoints, 1)).toBe(2);
    expect(targetIndex(500, midpoints, 1)).toBe(3);
  });

  it('moves up past every middle crossed', () => {
    expect(targetIndex(59, midpoints, 2)).toBe(1);
    expect(targetIndex(-50, midpoints, 2)).toBe(0);
  });
});
