import { firstLine, noteRef, quoted, sentence, shortLabel, todoRef } from '#root/dist/src/app/lib/labels.js';

describe('labels', () => {
  it('reads the first non-empty line, trimmed, its spaces made single', () => {
    expect(firstLine('\n  \n  Buy   milk\tnow \nand eggs')).toBe('Buy milk now');
    expect(firstLine('   ')).toBe('');
  });

  it('keeps a short label as it is, and cuts a long one at a word, with "…"', () => {
    expect(shortLabel('Buy milk')).toBe('Buy milk');
    expect(shortLabel('Exactly twenty chars')).toBe('Exactly twenty chars');
    expect(shortLabel('Meeting with Paul about the budget')).toBe('Meeting with Paul…');
    expect(shortLabel('Meeting with Paul about the budget').length).toBeLessThan(21);
  });

  it('cuts one long word right at the limit', () => {
    expect(shortLabel('Supercalifragilisticexpialidocious')).toBe('Supercalifragilisti…');
    expect(shortLabel('Supercalifragilisticexpialidocious').length).toBe(20);
  });

  it('names a note by its name, else its first line', () => {
    expect(noteRef({ name: 'Ideas', text: 'Something else' })).toBe('note “Ideas”');
    expect(noteRef({ text: '\nFirst line\nSecond' })).toBe('note “First line”');
    expect(noteRef({ text: '  ' })).toBe('note');
  });

  it('names a to-do as a to-do, or as a checklist when it has items', () => {
    expect(todoRef({ text: 'Call back' })).toBe('to-do “Call back”');
    expect(todoRef({ text: 'Call back', items: [] })).toBe('to-do “Call back”');
    expect(todoRef({ text: 'Groceries', items: [{ id: 'a', text: 'Milk', done: false }] })).toBe('checklist “Groceries”');
  });

  it('quotes a short label, and starts a sentence with a capital', () => {
    expect(quoted('Meeting with Paul about the budget')).toBe('“Meeting with Paul…”');
    expect(sentence('note “Ideas” deleted.')).toBe('Note “Ideas” deleted.');
    expect(sentence('“Ideas” moved.')).toBe('“Ideas” moved.');
  });
});
