import { TodoListComponent } from '#root/dist/src/app/components/todo-list/todo-list.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { KEYS, keydown, settle, startPanel, typeInto } from '../../testing/panel.js';

describe('TodoListComponent', () => {
  let panel;
  let list;

  const todo = (id, text, done = false, createdAt = 1) => ({ id, scope: 'page', key: KEYS.page, text, done, doneAt: done ? createdAt : null, createdAt, updatedAt: createdAt });
  const mount = (todos) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    list = new TodoListComponent(placeholder, { scope: 'page', keys: KEYS, todos });
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

describe('TodoListComponent - reordering', () => {
  let panel;
  let list;
  let todos;

  const handle = (todo) => $(`[data-todo-id="${todo.id}"] .todo-item__handle`);
  const shown = () => $$('[data-catalog="open-todos"] a11y-checkbox').map((el) => el.getAttribute('label'));
  const stored = async () => (await scopeStoreService.load(KEYS)).page.todos.map((t) => t.text);
  const spoken = async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return document.getElementById('app-announcer').textContent;
  };
  const mount = (items = todos) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    list = new TodoListComponent(placeholder, { scope: 'page', keys: KEYS, todos: items });
    list.render();
  };
  // jsdom has no layout: each open to-do is 40px tall, stacked from y = 0.
  const layOut = () => $$('[data-catalog="open-todos"] > li').forEach((li, i) => {
    li.getBoundingClientRect = () => ({ top: i * 40, height: 40, bottom: i * 40 + 40, left: 0, right: 300, width: 300 });
  });
  const pointer = (type, target, clientY, extra = {}) => {
    const Ctor = window.PointerEvent ?? window.MouseEvent;
    const event = new Ctor(type, { bubbles: true, cancelable: true, clientY, button: 0, pointerId: 1, isPrimary: true, ...extra });
    if (!('pointerId' in event) || event.pointerId === undefined) Object.defineProperty(event, 'pointerId', { value: extra.pointerId ?? 1 });
    if (!('isPrimary' in event) || event.isPrimary === undefined) Object.defineProperty(event, 'isPrimary', { value: extra.isPrimary ?? true });
    target.dispatchEvent(event);
  };

  beforeEach(async () => {
    panel = await startPanel();
    const now = spyOn(Date, 'now');
    for (const [i, text] of ['A', 'B', 'C'].entries()) {
      now.andReturn(1000 + i);
      await scopeStoreService.addTodo('page', KEYS.page, text);
    }
    now.restore();
    todos = (await scopeStoreService.load(KEYS)).page.todos;
    mount();
  });

  afterEach(async () => {
    list.destroy();
    document.getElementById('app-announcer')?.remove();
    await panel.stop();
  });

  it('gives each open to-do a labelled handle, explained by the hidden help', () => {
    expect(handle(todos[0]).getAttribute('aria-label')).toBe('Reorder: A');
    expect(handle(todos[0]).getAttribute('aria-describedby')).toBe('todo-reorder-help');
    expect(handle(todos[0]).getAttribute('aria-pressed')).toBe('false');
    expect($('#todo-reorder-help').textContent).toContain('Press Space to pick up');
  });

  it('shows no handle with a single open to-do, nor on done ones', async () => {
    list.destroy();
    const done = await scopeStoreService.update('todos', todos[1], { done: true });
    mount([todos[0], done]);
    expect($('.todo-item__handle')).toBeFalsy();
    expect($('#todo-reorder-help')).toBeFalsy();
  });

  it('picks a to-do up with Space, moves it with the arrows and drops it with Space', async () => {
    handle(todos[0]).focus();
    keydown(handle(todos[0]), ' ');
    expect(handle(todos[0]).getAttribute('aria-pressed')).toBe('true');
    expect(await spoken()).toBe('Picked up A. Position 1 of 3.');

    keydown(handle(todos[0]), 'ArrowDown');
    expect(shown()).toEqual(['B', 'A', 'C']);
    expect(document.activeElement).toBe(handle(todos[0]));
    expect(await spoken()).toBe('Moved to position 2 of 3.');

    keydown(handle(todos[0]), 'End');
    keydown(handle(todos[0]), 'ArrowDown');
    expect(shown()).toEqual(['B', 'C', 'A']);

    keydown(handle(todos[0]), ' ');
    await settle();
    expect(await stored()).toEqual(['B', 'C', 'A']);
    expect(handle(todos[0]).getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(handle(todos[0]));
    expect(await spoken()).toBe('Dropped A at position 3 of 3.');
  });

  it('moves up and to the top with Enter, ArrowUp and Home', async () => {
    handle(todos[2]).focus();
    keydown(handle(todos[2]), 'Enter');
    keydown(handle(todos[2]), 'ArrowUp');
    expect(shown()).toEqual(['A', 'C', 'B']);
    keydown(handle(todos[2]), 'Home');
    keydown(handle(todos[2]), 'ArrowUp');
    keydown(handle(todos[2]), 'Enter');
    await settle();
    expect(await stored()).toEqual(['C', 'A', 'B']);
  });

  it('puts everything back with Escape', async () => {
    handle(todos[0]).focus();
    keydown(handle(todos[0]), ' ');
    keydown(handle(todos[0]), 'ArrowDown');
    keydown(handle(todos[0]), 'Escape');

    expect(shown()).toEqual(['A', 'B', 'C']);
    expect(handle(todos[0]).getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(handle(todos[0]));
    expect(await spoken()).toBe('Reorder cancelled.');
    expect(await stored()).toEqual(['A', 'B', 'C']);
  });

  it('drops where it is when focus leaves, and says so when nothing moved', async () => {
    handle(todos[1]).focus();
    keydown(handle(todos[1]), ' ');
    keydown(handle(todos[1]), 'ArrowUp');
    $('.todo-composer__input').focus();
    await settle();
    expect(await stored()).toEqual(['B', 'A', 'C']);

    handle(todos[2]).focus();
    keydown(handle(todos[2]), ' ');
    keydown(handle(todos[2]), 'ArrowDown');
    keydown(handle(todos[2]), ' ');
    expect(await spoken()).toBe('Dropped C.');
  });

  it('ignores keys away from the handles, and other keys on them', () => {
    keydown($('.todo-composer__input'), ' ');
    keydown(handle(todos[0]), 'a');
    expect(handle(todos[0]).getAttribute('aria-pressed')).toBe('false');
    handle(todos[0]).focus();
    keydown(handle(todos[0]), ' ');
    keydown(handle(todos[0]), 'a');
    expect(shown()).toEqual(['A', 'B', 'C']);
  });

  it('holds updates from elsewhere until the to-do is dropped', async () => {
    handle(todos[0]).focus();
    keydown(handle(todos[0]), ' ');
    const added = await scopeStoreService.addTodo('page', KEYS.page, 'D');
    list.update([...todos, added]);
    expect(shown()).toEqual(['A', 'B', 'C']);

    keydown(handle(todos[0]), 'Escape');
    expect(shown()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('reorders by dragging a handle, the others making room', async () => {
    layOut();
    const items = () => $$('[data-catalog="open-todos"] > li');
    handle(todos[0]).setPointerCapture = () => {};
    pointer('pointerdown', handle(todos[0]), 20);
    expect(items()[0].classList.contains('todo-list__item--dragging')).toBe(true);

    pointer('pointermove', handle(todos[0]), 105);
    expect(items()[0].style.transform).toBe('translateY(85px)');
    expect(items()[1].style.transform).toBe('translateY(-40px)');
    expect(items()[2].style.transform).toBe('translateY(-40px)');

    pointer('pointermove', handle(todos[0]), 65);
    expect(items()[2].style.transform).toBe('');

    pointer('pointerup', handle(todos[0]), 65);
    await settle();
    expect(shown()).toEqual(['B', 'A', 'C']);
    expect(await stored()).toEqual(['B', 'A', 'C']);
    expect(items().every((li) => !li.style.transform && !li.classList.contains('todo-list__item--dragging'))).toBe(true);
    expect(document.activeElement).toBe(handle(todos[0]));
    expect(await spoken()).toBe('Moved A to position 2 of 3.');
  });

  it('moves a dragged to-do up, the ones above making room', () => {
    layOut();
    const items = () => $$('[data-catalog="open-todos"] > li');
    pointer('pointerdown', handle(todos[2]), 100);
    pointer('pointermove', handle(todos[2]), 10);
    expect(items()[0].style.transform).toBe('translateY(40px)');
    expect(items()[1].style.transform).toBe('translateY(40px)');
    pointer('pointercancel', handle(todos[2]), 10);
    expect(shown()).toEqual(['A', 'B', 'C']);
    expect(items().every((li) => !li.style.transform)).toBe(true);
  });

  it('cancels a drag with Escape, and drops in place without saving', async () => {
    layOut();
    const set = spyOn(panel.fake.storage.local, 'set');
    pointer('pointerdown', handle(todos[0]), 20);
    pointer('pointermove', handle(todos[0]), 105);
    keydown(handle(todos[0]), 'Escape');
    keydown(handle(todos[0]), 'a');
    pointer('pointerup', handle(todos[0]), 105);

    pointer('pointerdown', handle(todos[1]), 60);
    pointer('pointermove', handle(todos[1]), 70);
    pointer('pointerup', handle(todos[1]), 70);
    await settle();

    expect(set.callCount).toBe(0);
    set.restore();
    expect(shown()).toEqual(['A', 'B', 'C']);
    expect(document.activeElement).toBe(handle(todos[1]));
  });

  it('ignores secondary buttons, other pointers, and pointers away from the handles', () => {
    layOut();
    pointer('pointerdown', handle(todos[0]), 20, { button: 2 });
    pointer('pointerdown', $('.todo-composer__input'), 20);
    expect($('.todo-list__item--dragging')).toBeFalsy();

    pointer('pointerdown', handle(todos[0]), 20, { pointerId: 1 });
    pointer('pointermove', handle(todos[0]), 105, { pointerId: 2 });
    pointer('pointerup', handle(todos[0]), 105, { pointerId: 2 });
    expect($('.todo-list__item--dragging')).toBeTruthy();
    pointer('pointercancel', handle(todos[0]), 105);
  });

  it('reports a failed save and shows the order as it still is', async () => {
    handle(todos[0]).focus();
    keydown(handle(todos[0]), ' ');
    keydown(handle(todos[0]), 'ArrowDown');
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    keydown(handle(todos[0]), ' ');
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t reorder the to-dos. Quota exceeded.', type: 'error', duration: 6000 });
    expect(shown()).toEqual(['A', 'B', 'C']);
  });

  it('drops a picked-up to-do when its handle loses focus to nothing', async () => {
    handle(todos[0]).focus();
    keydown(handle(todos[0]), ' ');
    keydown(handle(todos[0]), 'ArrowDown');
    handle(todos[0]).blur();
    await settle();
    expect(await stored()).toEqual(['B', 'A', 'C']);
  });

  it('ignores a pointer cancel with no drag going on', () => {
    pointer('pointercancel', handle(todos[0]), 0);
    expect(shown()).toEqual(['A', 'B', 'C']);
  });

  it('keeps the done to-dos when the open ones are reordered', async () => {
    list.destroy();
    const extra = await scopeStoreService.addTodo('page', KEYS.page, 'Done one');
    const done = await scopeStoreService.update('todos', extra, { done: true });
    mount([...todos, done]);
    handle(todos[2]).focus();
    keydown(handle(todos[2]), ' ');
    keydown(handle(todos[2]), 'Home');
    keydown(handle(todos[2]), ' ');
    await settle();

    expect(shown()).toEqual(['C', 'A', 'B']);
    expect($$('[data-catalog="done-todos"] a11y-checkbox').map((el) => el.getAttribute('label'))).toEqual(['Done one']);
    expect(await stored()).toEqual(['C', 'A', 'B', 'Done one']);
  });
});

