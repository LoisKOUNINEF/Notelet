import { countList, plural } from '#root/dist/src/app/lib/plural.js';

describe('plural', () => {
  it('counts in the singular for one, the plural otherwise', () => {
    expect(plural(1, 'note')).toBe('1 note');
    expect(plural(0, 'note')).toBe('0 notes');
    expect(plural(3, 'done to-do')).toBe('3 done to-dos');
  });
});

describe('countList', () => {
  it('joins the counts that aren\'t zero', () => {
    expect(countList([[2, 'note'], [1, 'to-do']])).toBe('2 notes and 1 to-do');
    expect(countList([[0, 'note'], [3, 'to-do']])).toBe('3 to-dos');
    expect(countList([[1, 'note'], [2, 'to-do']], ', ')).toBe('1 note, 2 to-dos');
    expect(countList([[0, 'note'], [0, 'to-do']])).toBe('');
  });
});
