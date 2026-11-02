import { MAX_BACKUP_SIZE, createBackup, readBackup } from '#root/dist/src/app/services/scope-store/backup.js';

const NOW = Date.UTC(2026, 10, 2);
const note = (id, key, text, updatedAt = 1) => ({ id, scope: 'page', key, text, createdAt: 1, updatedAt });

describe('backup files', () => {
  const error = (text, version = 1) => {
    try {
      readBackup(text, version, NOW);
      return null;
    } catch (e) {
      return e;
    }
  };

  it('holds every non-empty list, with its format and version', () => {
    const backup = createBackup([
      { key: 'notes:page:https://example.com/a', kind: 'notes', value: [note('1', 'https://example.com/a', 'Hi')] },
      { key: 'todos:site:example.com', kind: 'todos', value: [] },
    ], 1, Date.UTC(2026, 9, 29));
    expect(backup.format).toBe('notelet');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.exportedAt).toBe('2026-10-29T00:00:00.000Z');
    expect(Object.keys(backup.lists)).toEqual(['notes:page:https://example.com/a']);
  });

  it('reads back what it wrote', () => {
    const lists = [{ key: 'notes:page:https://example.com/a', kind: 'notes', value: [note('1', 'https://example.com/a', 'Hi')] }];
    expect(readBackup(JSON.stringify(createBackup(lists, 1, 0)), 1, NOW)).toEqual(lists);
  });

  it('refuses what isn\'t a backup, or comes from a newer version', () => {
    expect(error('{not json').name).toBe('InvalidBackupError');
    expect(error('[]').message).toContain('isn\'t a Notelet backup');
    expect(error(JSON.stringify({ format: 'other', schemaVersion: 1, lists: {} })).message).toContain('isn\'t a Notelet backup');
    expect(error(JSON.stringify({ format: 'notelet', schemaVersion: 2, lists: {} })).message).toContain('newer version');
  });

  it('leaves out other keys, malformed lists and unreadable items', () => {
    const lists = readBackup(JSON.stringify({
      format: 'notelet',
      schemaVersion: 1,
      lists: {
        'settings:storageArea': 'sync',
        'notes:page:javascript:alert(1)': [note('1', 'x', 'Bad')],
        'notes:site:': [note('2', '', 'Bad')],
        'todos:site:example.com': 'not a list',
        'notes:site:example.com': [{ id: 3 }, note('4', 'example.com', 'Kept')],
      },
    }), 1, NOW);
    expect(lists.map(({ key }) => key)).toEqual(['notes:site:example.com']);
    expect(lists[0].value.map(({ text }) => text)).toEqual(['Kept']);
  });

  it('files each item under the list it\'s in, whatever it says', () => {
    const [list] = readBackup(JSON.stringify({
      format: 'notelet',
      schemaVersion: 1,
      lists: { 'notes:site:example.com': [note('1', 'https://other.com/', 'Hi')] },
    }), 1, NOW);
    expect(list.value[0].scope).toBe('site');
    expect(list.value[0].key).toBe('example.com');
  });

  const read = (lists) => readBackup(JSON.stringify({ format: 'notelet', schemaVersion: 1, lists }), 1, NOW);

  it('refuses a file too large to be a backup', () => {
    expect(error(' '.repeat(MAX_BACKUP_SIZE + 1)).message).toContain('too large');
  });

  it('brings no time later than now', () => {
    const future = Date.UTC(9999, 0, 1);
    const [notes, todos] = read({
      'notes:site:example.com': [{ ...note('1', 'example.com', 'Hi'), createdAt: future, updatedAt: future }],
      'todos:site:example.com': [{ ...note('2', 'example.com', 'Done'), done: true, doneAt: future, updatedAt: future }],
    });
    expect([notes.value[0].createdAt, notes.value[0].updatedAt]).toEqual([NOW, NOW]);
    expect([todos.value[0].updatedAt, todos.value[0].doneAt]).toEqual([NOW, NOW]);
  });

  it('keeps one item per id, and only ids like Notelet\'s', () => {
    const [list] = read({
      'notes:site:example.com': [
        note('a', 'example.com', 'Older', 1), note('a', 'example.com', 'Newer', 2),
        note('b c', 'example.com', 'Spaces'), note('x'.repeat(65), 'example.com', 'Too long'), note('"><b>', 'example.com', 'Markup'),
        note(crypto.randomUUID(), 'example.com', 'UUID'),
      ],
    });
    expect(list.value.map(({ text }) => text).sort()).toEqual(['Newer', 'UUID']);
  });

  it('keeps a checklist\'s valid, unique items, and makes an emptied one a single to-do', () => {
    const [list] = read({
      'todos:site:example.com': [
        { ...note('1', 'example.com', 'List'), items: [{ id: 'i', text: 'A', done: false }, { id: 'i', text: 'Again', done: false }, { id: 'a b', text: 'Bad', done: false }] },
        { ...note('2', 'example.com', 'Emptied'), items: [{ id: '', text: 'Bad', done: false }] },
      ],
    });
    const byText = Object.fromEntries(list.value.map((todo) => [todo.text, todo]));
    expect(byText.List.items.map(({ text }) => text)).toEqual(['A']);
    expect(byText.Emptied.items).toBeUndefined();
  });

  it('can\'t reach the prototype, and leaves other keys out', () => {
    const lists = readBackup(`{"format":"notelet","schemaVersion":1,"lists":{"__proto__":{"polluted":true},"notes:site:example.com":[{"id":"1","createdAt":1,"text":"Hi","__proto__":{"polluted":true}}]}}`, 1, NOW);
    expect(lists.map(({ key }) => key)).toEqual(['notes:site:example.com']);
    expect({}.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(lists[0].value[0])).toBe(Object.prototype);
  });
});
