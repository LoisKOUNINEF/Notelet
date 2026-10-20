import { editTodo, listDone, mergeContent, scopeLists, sortItems, topPosition } from '#root/dist/src/app/services/scope-store/scope-items.js';
import { note as baseNote, todo as baseTodo } from '../../testing/fixtures.js';

// The fixtures, with fields set.
const todo = (id, fields = {}) => ({ ...baseTodo(id), ...fields });
const note = (id, fields = {}) => ({ ...baseNote(id), ...fields });

describe('sortItems', () => {
  it('lists notes newest first, the ones the user arranged after them in their order', () => {
    const items = [note('old', { createdAt: 1 }), note('new', { createdAt: 3 }), note('second', { position: 1 }), note('first', { position: 0 })];
    expect(sortItems('notes', items).map((n) => n.id)).toEqual(['new', 'old', 'first', 'second']);
  });

  it('lists open to-dos in their order, then the done ones in the order they were checked', () => {
    const items = [todo('done-late', { done: true, doneAt: 9 }), todo('b', { position: 1 }), todo('done-early', { done: true, doneAt: 5 }), todo('a', { position: 0 })];
    expect(sortItems('todos', items).map((t) => t.id)).toEqual(['a', 'b', 'done-early', 'done-late']);
  });

  it('returns no items for anything but an array', () => {
    expect(sortItems('notes', { id: 'x' })).toEqual([]);
    expect(sortItems('todos', undefined)).toEqual([]);
  });
});

describe('scopeLists', () => {
  it('keeps the notes and to-dos items, with their kind', () => {
    expect(scopeLists({ 'notes:site:a.com': [1], 'settings:contentKind': 'notes', 'todos:page:https://a.com': [] })).toEqual([
      { key: 'notes:site:a.com', kind: 'notes', value: [1] },
      { key: 'todos:page:https://a.com', kind: 'todos', value: [] },
    ]);
  });
});

describe('mergeContent', () => {
  it('merges a list present on both sides item by item, the latest edit winning', () => {
    const key = 'notes:site:a.com';
    const merged = mergeContent(
      { [key]: [note('x', { text: 'theirs', updatedAt: 5 }), note('y')], 'notes:site:b.com': [note('z')] },
      [{ key, kind: 'notes', value: [note('x', { text: 'ours', updatedAt: 2 }), note('w')] }],
    );
    expect(merged[key].map((n) => [n.id, n.text]).sort()).toEqual([['w', 'w'], ['x', 'theirs'], ['y', 'y']]);
    expect(merged['notes:site:b.com'].length).toBe(1);
  });
});

describe('editTodo', () => {
  it('marks a list done once every item is, recording when', () => {
    const list = todo('l', { items: [{ id: 'a', text: 'A', done: true }, { id: 'b', text: 'B', done: false }] });
    const done = editTodo(list, { items: [{ id: 'a', text: 'A', done: true }, { id: 'b', text: 'B', done: true }] }, 50);
    expect([done.done, done.doneAt, done.updatedAt]).toEqual([true, 50, 50]);
    const reopened = editTodo(done, { items: [{ id: 'a', text: 'A', done: false }] }, 60);
    expect([reopened.done, reopened.doneAt]).toEqual([false, null]);
  });

  it('makes an emptied list a single to-do again, keeping whether it was done', () => {
    const single = editTodo(todo('l', { done: true, doneAt: 4, items: [{ id: 'a', text: 'A', done: true }] }), { items: [] }, 50);
    expect(single.items).toBeUndefined();
    expect([single.done, single.doneAt]).toEqual([true, 4]);
  });

  it('records when a single to-do is checked, and keeps that through other edits', () => {
    const checked = editTodo(todo('t'), { done: true }, 10);
    expect(checked.doneAt).toBe(10);
    expect(editTodo(checked, { text: 'Renamed' }, 20).doneAt).toBe(10);
  });
});

describe('listDone / topPosition', () => {
  it('needs every item checked, and at least one', () => {
    expect(listDone([])).toBe(false);
    expect(listDone([{ id: 'a', text: 'A', done: true }])).toBe(true);
  });

  it('puts a to-do above every open one that was arranged', () => {
    expect(topPosition([todo('a', { position: 2 }), todo('b', { position: -1 }), todo('c', { done: true, position: -9 })])).toBe(-2);
    expect(topPosition([todo('a')])).toBe(-1);
  });
});
