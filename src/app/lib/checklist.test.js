import { continueChecklist, parseChecklist, startChecklistLine, withIds } from '#root/dist/src/app/lib/checklist.js';

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

describe('continueChecklist', () => {
  it('starts the next item after an item line', () => {
    const value = 'List\n- [ ] Milk';
    expect(continueChecklist(value, value.length)).toEqual({ value: 'List\n- [ ] Milk\n- [ ] ', caret: value.length + 7 });
  });

  it('splits an item where the caret is', () => {
    expect(continueChecklist('- [ ] MilkBread', 10)).toEqual({ value: '- [ ] Milk\n- [ ] Bread', caret: 17 });
  });

  it('ends the list on an empty item, removing its marker', () => {
    const value = '- [ ] Milk\n- [ ] ';
    expect(continueChecklist(value, value.length)).toEqual({ value: '- [ ] Milk\n', caret: 11 });
  });

  it('leaves Enter alone on other lines', () => {
    expect(continueChecklist('Plain', 5)).toBe(null);
    expect(continueChecklist('- [ ] Item\nPlain', 16)).toBe(null);
  });
});

describe('startChecklistLine', () => {
  it('starts an empty field with a marker', () => {
    expect(startChecklistLine('', 0)).toEqual({ value: '- [ ] ', caret: 6 });
  });

  it('uses the current line when it is empty', () => {
    expect(startChecklistLine('Title\n', 6)).toEqual({ value: 'Title\n- [ ] ', caret: 12 });
  });

  it('starts a new line after a line with text', () => {
    expect(startChecklistLine('Title\nMore', 3)).toEqual({ value: 'Title\n- [ ] \nMore', caret: 12 });
  });

  it('does nothing on an item line', () => {
    expect(startChecklistLine('- [ ] Milk', 4)).toEqual({ value: '- [ ] Milk', caret: 4 });
  });
});

describe('continueChecklist, mid-text', () => {
  it('continues an item line that has more lines after it', () => {
    expect(continueChecklist('- [ ] Milk\nAfter', 10)).toEqual({ value: '- [ ] Milk\n- [ ] \nAfter', caret: 17 });
  });

  it('ends the list on an empty item followed by other lines', () => {
    expect(continueChecklist('- [ ] Milk\n- [ ] \nAfter', 17)).toEqual({ value: '- [ ] Milk\n\nAfter', caret: 11 });
  });
});

