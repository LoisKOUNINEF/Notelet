import { TodoListComponent } from '#root/dist/src/app/components/todo-list/todo-list.component.js';
import { KEYS, startPanel, typeInto } from '../../testing/panel.js';

describe('TodoListComponent', () => {
  let panel;
  let list;

  const todo = (id, text, done = false, createdAt = 1) => ({ id, scope: 'page', key: KEYS.page, text, done, doneAt: done ? createdAt : null, createdAt, updatedAt: createdAt });
  const mount = (todos) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    list = new TodoListComponent(placeholder, { scope: 'page', key: KEYS.page, todos });
    list.render();
  };
  const labels = () => $$('.todo-item a11y-checkbox').map((el) => el.getAttribute('label'));

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    list.destroy();
    await panel.stop();
  });

  it('shows only the quick add while empty', () => {
    mount([]);
    expect($('.todo-list__items')).toBeFalsy();
    expect($('.todo-composer__input')).toBeTruthy();
  });

  it('lists the to-dos in a labelled list, in the order given', () => {
    mount([todo('a', 'Open'), todo('b', 'Done', true)]);
    expect($('.todo-list__items').getAttribute('aria-label')).toBe('To-dos for this page');
    expect(labels()).toEqual(['Open', 'Done']);
  });

  it('keeps unchanged items and the quick add\'s text when updated', () => {
    const a = todo('a', 'Unchanged');
    mount([a, todo('b', 'Before')]);
    const kept = $('[data-todo-id="a"]');
    typeInto($('.todo-composer__input'), 'Typing…');

    list.update([a, { ...todo('b', 'After'), updatedAt: 2 }]);

    expect($('[data-todo-id="a"]')).toBe(kept);
    expect(labels()).toEqual(['Unchanged', 'After']);
    expect($('.todo-composer__input').value).toBe('Typing…');
    typeInto($('.todo-composer__input'), '');
  });

  it('does nothing when handed the same to-dos', () => {
    const todos = [todo('a', 'Same')];
    mount(todos);
    const render = spyOn(list, 'render');
    list.update(todos);
    expect(render.callCount).toBe(0);
    render.restore();
  });
});
