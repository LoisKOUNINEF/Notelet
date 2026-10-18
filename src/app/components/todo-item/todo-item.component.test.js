import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, keydown, settle, startPanel } from '../../testing/panel.js';

// Items are tested in their list, in the panel: their actions go through the store and come back as a new list.
// <a11y-checkbox> isn't upgraded in jsdom: its text is checked through its `label` attribute.
describe('TodoItemComponent', () => {
  let panel;
  let sidebar;
  let todos;

  const item = (todo) => $(`[data-todo-id="${todo.id}"]`);
  const checkbox = (todo) => item(todo).querySelector('.todo-item__checkbox');
  const labels = () => $$('.todo-item a11y-checkbox').map((el) => el.getAttribute('label'));
  const stored = async () => (await scopeStoreService.load(KEYS)).page.todos;
  const check = async (todo, checked = true) => {
    checkbox(todo).checked = checked;
    checkbox(todo).dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };

  beforeEach(async () => {
    panel = await startPanel();
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

    const checkId = el.querySelector('a11y-checkbox').id;
    el.querySelectorAll('button').forEach((button) => expect(button.getAttribute('aria-describedby')).toBe(checkId));
  });

  it('checks a to-do, moves it below the open ones and keeps focus on its checkbox', async () => {
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
    const input = item(todos[1]).querySelector('.todo-item__input');
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Second');

    input.value = 'Second, revised';
    item(todos[1]).querySelector('button[type="submit"]').click();
    await settle();

    expect((await stored()).find((t) => t.id === todos[1].id).text).toBe('Second, revised');
    expect(item(todos[1]).querySelector('a11y-checkbox').getAttribute('label')).toBe('Second, revised');
    expect(document.activeElement).toBe(item(todos[1]).querySelector('.todo-item__edit'));
  });

  it('cancels an edit with Escape, without saving', async () => {
    item(todos[1]).querySelector('.todo-item__edit').click();
    item(todos[1]).querySelector('.todo-item__input').value = 'Discarded';
    keydown(item(todos[1]).querySelector('.todo-item__input'), 'Escape');
    await settle();

    expect(labels()).toEqual(['First', 'Second', 'Third']);
    expect(document.activeElement).toBe(item(todos[1]).querySelector('.todo-item__edit'));
  });

  it('refuses to save an empty to-do', async () => {
    item(todos[1]).querySelector('.todo-item__edit').click();
    item(todos[1]).querySelector('.todo-item__input').value = '   ';
    item(todos[1]).querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect((await stored()).find((t) => t.id === todos[1].id).text).toBe('Second');
    expect(item(todos[1]).querySelector('.todo-item__input')).toBeTruthy();
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
});
