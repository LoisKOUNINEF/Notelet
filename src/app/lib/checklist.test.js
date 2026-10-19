import { parseChecklist, withIds } from '#root/dist/src/app/lib/checklist.js';

describe('parseChecklist', () => {
  it('pulls item lines out of the text, open and checked', () => {
    expect(parseChecklist('Groceries\n- [ ] Milk\n- [x] Bread\n* [X] Eggs')).toEqual({
      text: 'Groceries',
      items: [
        { text: 'Milk', done: false },
        { text: 'Bread', done: true },
        { text: 'Eggs', done: true },
      ],
    });
  });

  it('keeps the other lines as the text, wherever the items are', () => {
    expect(parseChecklist('Intro\n- [ ] One\nMiddle line\n  - [ ]   Two  \nOutro')).toEqual({
      text: 'Intro\nMiddle line\nOutro',
      items: [{ text: 'One', done: false }, { text: 'Two', done: false }],
    });
  });

  it('drops empty items', () => {
    expect(parseChecklist('- [ ] \n- [ ]\n- [x]   ').items).toEqual([]);
  });

  it('leaves plain notes and look-alikes alone', () => {
    expect(parseChecklist('  Just text  ')).toEqual({ text: 'Just text', items: [] });
    expect(parseChecklist('- not an item\n[ ] nor this\n-[ ] nor this')).toEqual({
      text: '- not an item\n[ ] nor this\n-[ ] nor this',
      items: [],
    });
  });

  it('gives an empty text for an items-only note', () => {
    expect(parseChecklist('- [ ] Only').text).toBe('');
  });
});

describe('withIds', () => {
  it('gives each item its own id', () => {
    const [a, b] = withIds([{ text: 'A', done: false }, { text: 'B', done: true }]);
    expect(a.text).toBe('A');
    expect(b.done).toBe(true);
    expect(typeof a.id).toBe('string');
    expect(a.id).not.toBe(b.id);
  });
});
