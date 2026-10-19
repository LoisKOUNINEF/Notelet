import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { KEYS, keydown, settle, startPanel } from '../../testing/panel.js';

// Items are tested in their list, in the panel: their actions go through the store and come back as a new list.
// A to-do's text is beside its checkbox, which it labels (aria-labelledby).
describe('TodoItemComponent', () => {
  let panel;
  let sidebar;
  let todos;

  const item = (todo) => $(`[data-todo-id="${todo.id}"]`);
  const checkbox = (todo) => item(todo).querySelector('.todo-item__checkbox');
  const labels = () => $$('.todo-item__text').map((el) => el.textContent);
  const stored = async () => (await scopeStoreService.load(KEYS)).page.todos;
  const check = async (todo, checked = true) => {
    checkbox(todo).checked = checked;
    checkbox(todo).dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };

  beforeEach(async () => {
    panel = await startPanel({ settings: { contentKind: 'todos' } });
    const now = spyOn(Date, 'now');
    todos = [];
    for (const [i, text] of ['First', 'Second', 'Third'].entries()) {
      now.andReturn(1_000_000 + i);
      todos.push(await scopeStoreService.addTodo('page', KEYS.page, text));
    }
    now.restore();
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('is a labelled checkbox with actions described by its text, inside its list item', () => {
    const el = item(todos[0]);
    expect(labels()).toEqual(['First', 'Second', 'Third']);
    expect(el.classList.contains('todo-item')).toBe(true);
    expect(el.parentElement.tagName).toBe('LI');
    expect(checkbox(todos[0]).checked).toBe(false);

    const checkId = el.querySelector('.todo-item__text').id;
    expect(checkbox(todos[0]).getAttribute('aria-labelledby')).toBe(checkId);
    // The reorder handle is described by the reorder help, and "⋯" names the to-do in its label.
    el.querySelectorAll('button:not(.todo-item__handle):not(.todo-item__more)').forEach((button) => expect(button.getAttribute('aria-describedby')).toBe(checkId));
  });

  it('with "Done" open, checks a to-do, moves it below the open ones and keeps focus on its checkbox', async () => {
    await settingsService.setDoneExpanded(true);
    checkbox(todos[0]).focus();
    await check(todos[0]);

    expect((await stored()).find((t) => t.id === todos[0].id).done).toBe(true);
    expect(labels()).toEqual(['Second', 'Third', 'First']);
    expect(item(todos[0]).classList.contains('todo-item--done')).toBe(true);
    expect(checkbox(todos[0]).checked).toBe(true);
    expect(document.activeElement).toBe(checkbox(todos[0]));
  });

  it('puts the to-do just checked last, after those checked before it', async () => {
    // Fixed times: two checks in the same millisecond would tie on doneAt.
    const now = spyOn(Date, 'now').andReturn(2_000_000);
    await check(todos[1]);
    now.andReturn(3_000_000);
    await check(todos[0]);
    now.restore();
    expect(labels()).toEqual(['Third', 'Second', 'First']);
  });

  it('unchecks a to-do back among the open ones', async () => {
    await check(todos[0]);
    await check(todos[0], false);

    expect(labels()).toEqual(['First', 'Second', 'Third']);
    expect(item(todos[0]).classList.contains('todo-item--done')).toBe(false);
  });

  it('counts only open to-dos on the tab', async () => {
    const hidden = () => $('#scope-tab-page .a11y-visually-hidden').textContent;
    expect(hidden()).toBe(', 3 to-dos');
    await check(todos[0]);
    expect(hidden()).toBe(', 2 to-dos');
  });

  it('edits in place: Enter saves, focus goes back to Edit', async () => {
    item(todos[1]).querySelector('.todo-item__edit').click();
    const input = item(todos[1]).querySelector('.list-editor__input');
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Second');

    input.value = 'Second, revised';
    item(todos[1]).querySelector('button[type="submit"]').click();
    await settle();

    expect((await stored()).find((t) => t.id === todos[1].id).text).toBe('Second, revised');
    expect(item(todos[1]).querySelector('.todo-item__text').textContent).toBe('Second, revised');
    expect(document.activeElement).toBe(item(todos[1]).querySelector('.todo-item__edit'));
  });

  it('cancels an edit with Escape, without saving', async () => {
    item(todos[1]).querySelector('.todo-item__edit').click();
    item(todos[1]).querySelector('.list-editor__input').value = 'Discarded';
    keydown(item(todos[1]).querySelector('.list-editor__input'), 'Escape');
    await settle();

    expect(labels()).toEqual(['First', 'Second', 'Third']);
    expect(document.activeElement).toBe(item(todos[1]).querySelector('.todo-item__edit'));
  });

  it('refuses to save an empty to-do', async () => {
    item(todos[1]).querySelector('.todo-item__edit').click();
    item(todos[1]).querySelector('.list-editor__input').value = '   ';
    item(todos[1]).querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect((await stored()).find((t) => t.id === todos[1].id).text).toBe('Second');
    expect(item(todos[1]).querySelector('.list-editor__input')).toBeTruthy();
  });

  it('deletes a to-do, offers to undo it, and moves focus to the next one', async () => {
    item(todos[1]).querySelector('.todo-item__delete').click();
    await settle();

    expect(labels()).toEqual(['First', 'Third']);
    expect(document.activeElement).toBe(checkbox(todos[2]));
    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('To-do deleted.');
    expect(toast.actionText).toBe('Undo');

    toast.onAction();
    await settle();
    expect(labels()).toEqual(['First', 'Second', 'Third']);
  });

  it('moves focus to the quick add once the last to-do is deleted', async () => {
    for (const todo of [todos[2], todos[1], todos[0]]) {
      item(todo).querySelector('.todo-item__delete').click();
      await settle();
    }
    expect(document.activeElement).toBe($('.todo-composer__input'));
    expect($('.todo-list__items')).toBeFalsy();
  });

  it('reports a failed check and shows the to-do as it still is', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    await check(todos[0]);

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t update the to-do. Quota exceeded.', type: 'error', duration: 6000 });
    expect(checkbox(todos[0]).checked).toBe(false);
  });

  it('leaves edit mode without saving when the text is unchanged', async () => {
    const set = spyOn(panel.fake.storage.local, 'set');
    item(todos[0]).querySelector('.todo-item__edit').click();
    item(todos[0]).querySelector('button[type="submit"]').click();
    await settle();

    expect(set.callCount).toBe(0);
    set.restore();
    expect(item(todos[0]).querySelector('.list-editor__input')).toBeFalsy();
    expect(document.activeElement).toBe(item(todos[0]).querySelector('.todo-item__edit'));
  });

  it('ignores keys other than Escape while editing', () => {
    item(todos[0]).querySelector('.todo-item__edit').click();
    keydown(item(todos[0]).querySelector('.list-editor__input'), 'a');
    expect(item(todos[0]).querySelector('.list-editor__input')).toBeTruthy();
  });

  it('reports a failed save and stays in edit mode', async () => {
    item(todos[0]).querySelector('.todo-item__edit').click();
    item(todos[0]).querySelector('.list-editor__input').value = 'Renamed';
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    item(todos[0]).querySelector('button[type="submit"]').click();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t save the to-do. Quota exceeded.', type: 'error', duration: 6000 });
    expect(item(todos[0]).querySelector('.list-editor__input').value).toBe('Renamed');
  });

  it('reports a failed delete and keeps the to-do', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    item(todos[1]).querySelector('.todo-item__delete').click();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t delete the to-do. Quota exceeded.', type: 'error', duration: 6000 });
    expect(labels()).toEqual(['First', 'Second', 'Third']);
  });

  it('reports a failed undo', async () => {
    item(todos[1]).querySelector('.todo-item__delete').click();
    await settle();
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    panel.toasts.at(-1).onAction();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t restore the to-do. Quota exceeded.', type: 'error', duration: 6000 });
    expect(labels()).toEqual(['First', 'Third']);
  });

  it('with "Done" collapsed, hides the checked to-do and moves focus to the next open one', async () => {
    checkbox(todos[1]).focus();
    await check(todos[1]);

    expect(item(todos[1]).closest('ul').hidden).toBe(true);
    expect(item(todos[1]).closest('[data-catalog]').dataset.catalog).toBe('done-todos');
    expect(document.activeElement).toBe(checkbox(todos[2]));
    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('Marked as done.');
    expect(toast.type).toBe('success');
    expect(toast.actionText).toBe('Undo');
  });

  it('with "Done" collapsed, moves focus to the previous open one, then to the quick add', async () => {
    await check(todos[2]);
    expect(document.activeElement).toBe(checkbox(todos[1]));
    await check(todos[1]);
    await check(todos[0]);
    expect(document.activeElement).toBe($('.todo-composer__input'));
  });

  it('undoes a check made while "Done" is collapsed', async () => {
    await check(todos[0]);
    panel.toasts.at(-1).onAction();
    await settle();

    expect((await stored()).find((t) => t.id === todos[0].id).done).toBe(false);
    expect(item(todos[0]).closest('[data-catalog]').dataset.catalog).toBe('open-todos');
  });

  it('reports a failed undo of a check', async () => {
    await check(todos[0]);
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    panel.toasts.at(-1).onAction();
    await settle();
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t update the to-do. Quota exceeded.', type: 'error', duration: 6000 });
  });

  it('keeps focus inside its own group when a done to-do is deleted', async () => {
    await settingsService.setDoneExpanded(true);
    await check(todos[0]);
    await check(todos[1]);
    const doneDelete = (todo) => item(todo).querySelector('.todo-item__delete');

    doneDelete(todos[0]).click();
    await settle();
    expect(document.activeElement).toBe(checkbox(todos[1]));
  });

  it('opens the editor on a click on its text or its card, without checking it', async () => {
    item(todos[1]).querySelector('.todo-item__text').click();
    await settle();
    expect(item(todos[1]).querySelector('.list-editor')).toBeTruthy();
    expect(document.activeElement).toBe(item(todos[1]).querySelector('.list-editor__input'));
    expect((await stored()).find((t) => t.id === todos[1].id).done).toBe(false);

    item(todos[0]).click();
    expect(item(todos[0]).querySelector('.list-editor')).toBeTruthy();
  });

  it('checks a to-do from its checkbox only, without opening the editor', async () => {
    await check(todos[0]);
    expect((await stored()).find((t) => t.id === todos[0].id).done).toBe(true);
    expect($('.list-editor')).toBeFalsy();
  });

  it('does nothing on a click on a done to-do', async () => {
    await settingsService.setDoneExpanded(true);
    await check(todos[0]);
    item(todos[0]).querySelector('.todo-item__text').click();
    item(todos[0]).click();
    expect(item(todos[0]).querySelector('.list-editor')).toBeFalsy();
    expect((await stored()).find((t) => t.id === todos[0].id).done).toBe(true);
  });
});

describe('TodoItemComponent - actions menu', () => {
  let panel;
  let sidebar;
  let todos;

  const item = (todo) => $(`[data-todo-id="${todo.id}"]`);
  const menuItem = (todo) => document.getElementById(`todo-${todo.id}-menu`).querySelector('[data-action="move"]');
  const content = async () => scopeStoreService.load(KEYS);
  const mount = async () => {
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  };

  beforeEach(async () => {
    panel = await startPanel({ settings: { contentKind: 'todos' } });
    const now = spyOn(Date, 'now');
    todos = [];
    for (const [i, text] of ['First', 'Second'].entries()) {
      now.andReturn(1_000_000 + i);
      todos.push(await scopeStoreService.addTodo('page', KEYS.page, text));
    }
    now.restore();
    await scopeStoreService.addTodo('site', KEYS.site, 'Already on the site');
    await mount();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('has a "More actions" trigger per to-do, opening a menu with the move', () => {
    const trigger = item(todos[0]).querySelector('.todo-item__more');
    expect(trigger.getAttribute('aria-label')).toBe('More actions for: First');
    const menu = document.getElementById(`todo-${todos[0].id}-menu`);
    expect(menu.getAttribute('anchor')).toBe(trigger.id);
    expect(menuItem(todos[0]).textContent).toBe('Move to this site');
  });

  it('moves a to-do to the top of the site\'s list, with focus on the next one', async () => {
    item(todos[0]).querySelector('.todo-item__more').focus();
    menuItem(todos[0]).click();
    await settle();

    const stored = await content();
    expect(stored.page.todos.map((t) => t.text)).toEqual(['Second']);
    expect(stored.site.todos.map((t) => t.text)).toEqual(['First', 'Already on the site']);
    expect(panel.toasts.at(-1)).toEqual({ message: 'Moved to this site\'s to-dos.', type: 'success' });
    expect(document.activeElement).toBe(item(todos[1]).querySelector('.todo-item__checkbox'));
    expect($('#scope-tab-page .a11y-visually-hidden').textContent).toBe(', 1 to-do');
    expect($('#scope-tab-site .a11y-visually-hidden').textContent).toBe(', 2 to-dos');
  });

  it('offers "Move to this page" on the site\'s to-dos', async () => {
    $('#scope-tab-site').click();
    const [siteTodo] = (await content()).site.todos;
    expect(menuItem(siteTodo).textContent).toBe('Move to this page');
    menuItem(siteTodo).click();
    await settle();
    expect(panel.toasts.at(-1).message).toBe('Moved to this page\'s to-dos.');
    expect((await content()).page.todos[0].text).toBe('Already on the site');
  });

  it('offers only Delete on a done to-do, with no menu', async () => {
    const done = await scopeStoreService.update('todos', todos[1], { done: true });
    await settle();
    expect([...item(done).querySelectorAll('.todo-item__actions button')].map((b) => b.textContent)).toEqual(['Delete']);
    expect(document.getElementById(`todo-${done.id}-menu`)).toBeFalsy();

    // Unchecked, it gets its actions back.
    item(done).querySelector('.todo-item__checkbox').click();
    await settle();
    expect([...item(done).querySelectorAll('.todo-item__actions button')].map((b) => b.textContent)).toEqual(['Edit', 'Delete', '⋯']);
  });

  it('ignores clicks in the menu outside its items', async () => {
    const set = spyOn(panel.fake.storage.local, 'set');
    document.getElementById(`todo-${todos[0].id}-menu`).click();
    await settle();
    expect(set.callCount).toBe(0);
    set.restore();
  });

  it('reports a failed move and keeps the to-do', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    menuItem(todos[0]).click();
    await settle();
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t move the to-do. Quota exceeded.', type: 'error', duration: 6000 });
    expect((await content()).page.todos.map((t) => t.text)).toEqual(['First', 'Second']);
  });

  it('keeps one menu per to-do through re-renders, and none in edit mode', async () => {
    const count = (todo) => $$(`[id="todo-${todo.id}-menu"]`).length;
    await check(todos[0]);
    await check(todos[0], false);
    expect(count(todos[0])).toBe(1);

    item(todos[1]).querySelector('.todo-item__edit').click();
    expect(count(todos[1])).toBe(0);
  });

  async function check(todo, checked = true) {
    const box = item(todo).querySelector('.todo-item__checkbox');
    box.checked = checked;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  }
});


describe('TodoItemComponent - lists', () => {
  let panel;
  let sidebar;
  let list;
  let single;

  const item = (todo) => $(`[data-todo-id="${todo.id}"]`);
  const stored = async (id) => (await scopeStoreService.load(KEYS)).page.todos.find((t) => t.id === id);
  const itemLabels = (todo) => [...item(todo).querySelectorAll('.checklist-item__text')].map((el) => el.textContent);
  const checkItem = async (todo, id) => {
    const box = item(todo).querySelector(`[data-item-id="${id}"] .checklist-item__checkbox`);
    box.checked = true;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };
  const submit = async (form) => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };
  const mount = async () => {
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  };

  beforeEach(async () => {
    panel = await startPanel({ settings: { contentKind: 'todos' } });
    list = await scopeStoreService.addTodo('page', KEYS.page, 'Groceries', [
      { id: 'a', text: 'Milk', done: true },
      { id: 'b', text: 'Eggs', done: false },
    ]);
    single = await scopeStoreService.addTodo('page', KEYS.page, 'Call back');
    await mount();
  });

  afterEach(async () => {
    sidebar?.destroy();
    sidebar = null;
    await panel.stop();
  });

  it('shows a list by its name, how much of it is done, and its items, with no checkbox of its own', () => {
    expect(item(list).querySelector('.todo-item__checkbox')).toBeFalsy();
    expect(item(list).querySelector('.todo-item__title').textContent).toBe('Groceries · 1 of 2 done');
    expect(item(list).querySelector('.todo-item__checklist').getAttribute('aria-label')).toBe('Groceries');
    expect(itemLabels(list)).toEqual(['Milk', 'Eggs']);
    expect(item(list).querySelector('.todo-item__edit').getAttribute('aria-describedby')).toBe(item(list).querySelector('.todo-item__title').id);
    // Counted as one open to-do, like a single one.
    expect($('#kind-tab-todos .a11y-visually-hidden').textContent).toBe(', 2 open');
  });

  it('adds an item from the list, keeping focus in the field', async () => {
    item(list).querySelector('.todo-item__add-item-input').value = 'Bread';
    await submit(item(list).querySelector('.todo-item__add-item'));
    expect((await stored(list.id)).items.map((i) => i.text)).toEqual(['Milk', 'Eggs', 'Bread']);
    expect(document.activeElement).toBe(item(list).querySelector('.todo-item__add-item-input'));
  });

  it('moves to "Done" once every item is checked, then only offers Delete, items still checkable', async () => {
    await settingsService.setDoneExpanded(true);
    await settle();
    await checkItem(list, 'b');
    expect((await stored(list.id)).done).toBe(true);
    expect(item(list).closest('[data-catalog="done-todos"]')).toBeTruthy();
    expect([...item(list).querySelectorAll('.todo-item__actions button')].map((b) => b.textContent)).toEqual(['Delete']);
    expect(item(list).querySelector('.todo-item__add-item')).toBeFalsy();

    const box = item(list).querySelector('[data-item-id="b"] .checklist-item__checkbox');
    box.checked = false;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    expect(item(list).closest('[data-catalog="open-todos"]')).toBeTruthy();
  });

  it('edits a list: its name and items, with Save', async () => {
    item(list).querySelector('.todo-item__edit').click();
    const editor = item(list).querySelector('.list-editor');
    expect(document.activeElement).toBe(editor.querySelector('.list-editor__input'));
    expect([...editor.querySelectorAll('.checklist-field__input')].map((f) => f.value)).toEqual(['Milk', 'Eggs']);

    editor.querySelector('.list-editor__input').value = 'Shopping';
    editor.querySelectorAll('.checklist-field__input')[1].value = 'Free-range eggs';
    editor.querySelector('.list-editor__add-item').click();
    editor.querySelectorAll('.checklist-field__input')[2].value = 'Bread';
    editor.querySelectorAll('.checklist-field__remove')[0].click();
    await submit(editor.querySelector('form'));

    const saved = await stored(list.id);
    expect(saved.text).toBe('Shopping');
    expect(saved.items.map((i) => [i.text, i.done])).toEqual([['Free-range eggs', false], ['Bread', false]]);
    expect(item(list).querySelector('.list-editor')).toBeFalsy();
    expect(document.activeElement).toBe(item(list).querySelector('.todo-item__edit'));
  });

  it('cancels a list edit with Cancel or Escape, and keeps one in progress across a tab switch', async () => {
    item(list).querySelector('.todo-item__edit').click();
    item(list).querySelector('.list-editor__input').value = 'Half-edited';
    $('#scope-tab-site').click();
    $('#scope-tab-page').click();
    expect(item(list).querySelector('.list-editor__input').value).toBe('Half-edited');
    expect(item(list).querySelector('.list-editor__restored').textContent).toBe('Unsaved changes restored.');

    keydown(item(list).querySelector('.list-editor__input'), 'Escape');
    expect(item(list).querySelector('.list-editor')).toBeFalsy();
    expect((await stored(list.id)).text).toBe('Groceries');
    item(list).querySelector('.todo-item__edit').click();
    item(list).querySelector('.list-editor__cancel').click();
    expect(item(list).querySelector('.list-editor')).toBeFalsy();
  });

  it('turns a single to-do into a list on edit, and a list back into a single one', async () => {
    item(single).querySelector('.todo-item__edit').click();
    const editor = () => item(single).querySelector('.list-editor');
    expect(editor().querySelectorAll('.checklist-field__input').length).toBe(0);
    expect(editor().querySelector('.list-editor__field a11y-label').textContent).toBe('To-do');
    expect(editor().querySelector('.checklist-fields__caption')).toBeFalsy();
    editor().querySelector('.list-editor__add-item').click();
    expect(editor().querySelector('.list-editor__field a11y-label').textContent).toBe('List name');
    const caption = editor().querySelector('.checklist-fields__caption');
    expect(caption.textContent).toBe('Items');
    expect(editor().querySelector('.list-editor__items').getAttribute('aria-labelledby')).toBe(caption.id);
    editor().querySelector('.checklist-field__input').value = 'Ask about the invoice';
    await submit(editor().querySelector('form'));

    expect((await stored(single.id)).items.map((i) => i.text)).toEqual(['Ask about the invoice']);
    expect(item(single).querySelector('.todo-item__title').textContent).toBe('Call back · 0 of 1 done');

    item(list).querySelector('.todo-item__edit').click();
    item(list).querySelectorAll('.checklist-field__remove')[1].click();
    item(list).querySelectorAll('.checklist-field__remove')[0].click();
    expect(document.activeElement).toBe(item(list).querySelector('.list-editor__add-item'));
    await submit(item(list).querySelector('.list-editor form'));
    const saved = await stored(list.id);
    expect(saved.items).toBeUndefined();
    expect(saved.done).toBe(false);
    expect(item(list).querySelector('.todo-item__checkbox')).toBeTruthy();
  });

  it('takes items out of a list: once saved, single to-dos right after it, as they were', async () => {
    const after = await scopeStoreService.addTodo('page', KEYS.page, 'After');
    await settle();
    item(list).querySelector('.todo-item__edit').click();
    const editor = () => item(list).querySelector('.list-editor');
    expect(editor().querySelector('.checklist-field__take-out').getAttribute('aria-label')).toBe('Take out item 1');
    editor().querySelectorAll('.checklist-field__take-out')[0].click();
    expect([...editor().querySelectorAll('.list-editor__taken-out-text')].map((el) => el.textContent)).toEqual(['Milk']);
    expect([...editor().querySelectorAll('.checklist-field__input')].map((f) => f.value)).toEqual(['Eggs']);

    // Put back, then taken out again (both now).
    editor().querySelector('.list-editor__put-back').click();
    expect([...editor().querySelectorAll('.checklist-field__input')].map((f) => f.value)).toEqual(['Eggs', 'Milk']);
    expect(editor().querySelector('.list-editor__taken-out')).toBeFalsy();
    editor().querySelector('.list-editor__add-item').click();
    editor().querySelectorAll('.checklist-field__input')[2].value = 'Bread';
    editor().querySelectorAll('.checklist-field__take-out')[0].click();
    editor().querySelectorAll('.checklist-field__take-out')[0].click();
    expect([...editor().querySelectorAll('.list-editor__taken-out-text')].map((el) => el.textContent)).toEqual(['Eggs', 'Milk']);
    await submit(editor().querySelector('form'));

    const todos = (await scopeStoreService.load(KEYS)).page.todos;
    const open = todos.filter((t) => !t.done).sort((a, b) => a.position - b.position).map((t) => t.text);
    expect(open).toEqual(['Groceries', 'Eggs', 'Call back', 'After']);
    // "Milk" was checked: a done to-do now.
    expect(todos.find((t) => t.text === 'Milk').done).toBe(true);
    expect((await stored(list.id)).items.map((i) => i.text)).toEqual(['Bread']);
    expect(after.id).toBeDefined();
  });

  it('a list whose last item is taken out becomes a single to-do', async () => {
    item(list).querySelector('.todo-item__edit').click();
    item(list).querySelectorAll('.checklist-field__take-out')[0].click();
    item(list).querySelectorAll('.checklist-field__take-out')[0].click();
    await submit(item(list).querySelector('.list-editor form'));
    const saved = await stored(list.id);
    expect(saved.items).toBeUndefined();
    expect(saved.text).toBe('Groceries');
  });

  it('moves a single to-do into a list, picked in a popup, with Undo', async () => {
    const menu = document.getElementById(`todo-${single.id}-menu`);
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((m) => m.textContent)).toEqual(['Move into a list…', 'Move to this site']);
    expect(document.getElementById(`todo-${list.id}-menu`)?.querySelector('[data-action="move-into-list"]')).toBeFalsy();

    menu.querySelector('[data-action="move-into-list"]').click();
    const dialog = $('#confirm-dialog');
    expect(dialog.querySelector('.confirm-dialog__title').textContent).toBe('Move “Call back” into a list');
    expect([...dialog.querySelectorAll('.confirm-dialog__choice')].map((b) => b.textContent)).toEqual(['Groceries · 1 of 2 done']);
    expect(document.activeElement).toBe(dialog.querySelector('.confirm-dialog__choice'));
    dialog.querySelector('.confirm-dialog__choice').click();
    await settle();

    const todos = (await scopeStoreService.load(KEYS)).page.todos;
    expect(todos.map((t) => t.text)).toEqual(['Groceries']);
    expect(todos[0].items.map((i) => [i.text, i.done])).toEqual([['Milk', true], ['Eggs', false], ['Call back', false]]);
    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('Moved into Groceries.');

    toast.onAction();
    await settle();
    const restored = (await scopeStoreService.load(KEYS)).page.todos;
    expect(restored.map((t) => t.text).sort()).toEqual(['Call back', 'Groceries']);
    expect(restored.find((t) => t.id === list.id).items.length).toBe(2);
  });

  it('leaves the to-do where it is when the popup is cancelled', async () => {
    document.getElementById(`todo-${single.id}-menu`).querySelector('[data-action="move-into-list"]').click();
    $('#confirm-dialog .confirm-dialog__cancel').click();
    await settle();
    expect((await scopeStoreService.load(KEYS)).page.todos.length).toBe(2);
  });

  it('opens the list\'s editor on a click on an item\'s text; its checkbox and the add field don\'t', async () => {
    item(list).querySelector('.todo-item__add-item-input').click();
    await checkItem(list, 'b');
    expect(item(list).querySelector('.list-editor')).toBeFalsy();

    const box = item(list).querySelector('[data-item-id="b"] .checklist-item__checkbox');
    box.checked = false;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    expect(item(list).querySelector('[data-item-id="a"] .checklist-item__checkbox').getAttribute('aria-labelledby')).toBe('item-a-text');
    item(list).querySelector('[data-item-id="a"] .checklist-item__text').click();
    expect(item(list).querySelector('.list-editor')).toBeTruthy();
    expect((await stored(list.id)).items.map((i) => i.done)).toEqual([true, false]);
  });

  it('focuses the clicked item\'s field in the editor, caret at the end', () => {
    item(list).querySelector('[data-item-id="b"] .checklist-item__text').click();
    const field = item(list).querySelector('.list-editor [data-item-id="b"] .checklist-field__input');
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('Eggs');
    expect(field.selectionStart).toBe('Eggs'.length);
  });

  it('focuses the name when the click is outside the items, as Edit does', () => {
    item(list).querySelector('.todo-item__title').click();
    expect(document.activeElement).toBe(item(list).querySelector('.list-editor__input'));
    item(list).querySelector('.list-editor__cancel').click();

    item(list).querySelector('.todo-item__checklist').click();
    expect(document.activeElement).toBe(item(list).querySelector('.list-editor__input'));
    item(list).querySelector('.list-editor__cancel').click();

    item(list).querySelector('.todo-item__edit').click();
    expect(document.activeElement).toBe(item(list).querySelector('.list-editor__input'));
  });

  it('folds a list down to its name and progress, not a single to-do', async () => {
    expect(item(single).querySelector('.todo-item__toggle')).toBeFalsy();
    const toggle = () => item(list).querySelector('.todo-item__toggle');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe(item(list).querySelector('.todo-item__checklist').id);

    toggle().click();
    expect(document.activeElement).toBe(toggle());
    await settle();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(item(list).querySelector('.todo-item__checklist')).toBeFalsy();
    expect(item(list).querySelector('.todo-item__add-item')).toBeFalsy();
    expect(item(list).querySelector('.todo-item__title').textContent).toBe('Groceries · 1 of 2 done');
    expect(document.activeElement).toBe(toggle());
    const saved = await stored(list.id);
    expect(saved.collapsed).toBe(true);
    expect(saved.updatedAt).toBe(list.updatedAt);

    // A click on it still opens the editor, with every item.
    item(list).querySelector('.todo-item__title').click();
    expect(item(list).querySelectorAll('.checklist-field__input').length).toBe(2);
    item(list).querySelector('.list-editor__cancel').click();

    toggle().click();
    await settle();
    expect(itemLabels(list)).toEqual(['Milk', 'Eggs']);
    expect((await stored(list.id)).collapsed).toBeUndefined();
  });

  it('folds a done list too', async () => {
    await settingsService.setDoneExpanded(true);
    await checkItem(list, 'b');
    item(list).querySelector('.todo-item__toggle').click();
    await settle();
    expect(item(list).closest('[data-catalog="done-todos"]')).toBeTruthy();
    expect(item(list).querySelector('.todo-item__checklist')).toBeFalsy();
  });
});
