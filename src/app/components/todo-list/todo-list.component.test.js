import { TodoListComponent } from '#root/dist/src/app/components/todo-list/todo-list.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { KEYS, settle, startPanel, typeInto } from '../../testing/panel.js';

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

  const toggle = () => $('.todo-list__done-toggle');
  const doneList = () => $('#todo-done-items');

  it('has no "Done" group while nothing is done', () => {
    mount([todo('a', 'Open')]);
    expect(toggle()).toBeFalsy();
    expect($('.todo-list__clear')).toBeFalsy();
  });

  it('puts done to-dos in a collapsed "Done (n)" group under the quick add', () => {
    mount([todo('a', 'Open'), todo('b', 'Done 1', true), todo('c', 'Done 2', true)]);

    expect(toggle().textContent.trim()).toBe('Done (2)');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe('todo-done-items');
    expect(doneList().hidden).toBe(true);
    expect(doneList().getAttribute('aria-label')).toBe('Done to-dos for this page');
    expect($$('[data-catalog="done-todos"] a11y-checkbox').map((el) => el.getAttribute('label'))).toEqual(['Done 1', 'Done 2']);
    expect($('[data-catalog="open-todos"]').compareDocumentPosition($('.todo-composer')) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect($('.todo-composer').compareDocumentPosition(toggle()) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens and closes the group, remembers it, and keeps focus on the toggle', async () => {
    mount([todo('b', 'Done', true)]);
    toggle().focus();
    toggle().click();
    await settle();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(doneList().hidden).toBe(false);
    expect(settingsService.doneExpanded).toBe(true);
    expect(document.activeElement).toBe(toggle());

    toggle().click();
    await settle();
    expect(doneList().hidden).toBe(true);
    expect(settingsService.doneExpanded).toBe(false);
  });

  it('starts open when it was left open', async () => {
    await settingsService.setDoneExpanded(true);
    mount([todo('b', 'Done', true)]);
    expect(doneList().hidden).toBe(false);
  });

  it('clears the completed to-dos at once, offers to undo it, and moves focus to the quick add', async () => {
    const open = await scopeStoreService.addTodo('page', KEYS.page, 'Open');
    const done = [];
    for (const text of ['Done 1', 'Done 2']) {
      const added = await scopeStoreService.addTodo('page', KEYS.page, text);
      done.push(await scopeStoreService.update('todos', added, { done: true }));
    }
    mount([open, ...done]);

    $('.todo-list__clear').click();
    await settle();
    const stored = async () => (await scopeStoreService.load(KEYS)).page.todos.map((t) => t.text);
    expect(await stored()).toEqual(['Open']);
    list.update((await scopeStoreService.load(KEYS)).page.todos);
    expect(toggle()).toBeFalsy();
    expect(document.activeElement).toBe($('.todo-composer__input'));

    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('2 completed to-dos cleared.');
    toast.onAction();
    await settle();
    expect(await stored()).toEqual(['Open', 'Done 1', 'Done 2']);
  });

  it('says "1 completed to-do" for a single one', async () => {
    const added = await scopeStoreService.addTodo('page', KEYS.page, 'Only');
    mount([await scopeStoreService.update('todos', added, { done: true })]);
    $('.todo-list__clear').click();
    await settle();
    expect(panel.toasts.at(-1).message).toBe('1 completed to-do cleared.');
  });

  it('reports a failed clear and a failed undo', async () => {
    const added = await scopeStoreService.addTodo('page', KEYS.page, 'Done');
    const done = await scopeStoreService.update('todos', added, { done: true });
    await scopeStoreService.addTodo('page', KEYS.page, 'Keeps the list item');
    mount([done]);

    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    $('.todo-list__clear').click();
    await settle();
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t clear the completed to-dos. Quota exceeded.', type: 'error', duration: 6000 });

    $('.todo-list__clear').click();
    await settle();
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    panel.toasts.at(-1).onAction();
    await settle();
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t restore the to-dos. Quota exceeded.', type: 'error', duration: 6000 });
  });
});
