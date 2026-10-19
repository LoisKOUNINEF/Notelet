import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, settle, startPanel } from '../../testing/panel.js';

// Checked from the to-do list, in the panel. <a11y-checkbox> isn't upgraded in jsdom: its text is its `label`.
describe('ChecklistItemComponent', () => {
  let panel;
  let sidebar;
  let list;

  const row = (id) => $(`[data-item-id="${id}"]`);
  const box = (id) => row(id).querySelector('.checklist-item__checkbox');
  const labels = () => $$('.checklist-item a11y-checkbox').map((el) => el.getAttribute('label'));
  const check = async (id, checked = true) => {
    box(id).checked = checked;
    box(id).dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };
  const storedItems = async () => (await scopeStoreService.load(KEYS)).page.todos[0].items;

  beforeEach(async () => {
    panel = await startPanel({ settings: { contentKind: 'todos' } });
    list = await scopeStoreService.addTodo('page', KEYS.page, 'Trip', [
      { id: 'a', text: 'Passport', done: false },
      { id: 'b', text: 'Tickets', done: false },
      { id: 'c', text: 'Charger', done: true },
    ]);
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('lists the items as labelled checkboxes, in their order, checked ones struck', () => {
    expect(labels()).toEqual(['Passport', 'Tickets', 'Charger']);
    expect(row('a').parentElement.tagName).toBe('LI');
    expect(row('c').classList.contains('checklist-item--done')).toBe(true);
    expect(box('c').checked).toBe(true);
  });

  it('checks an item, which stays in place, with focus on its checkbox', async () => {
    box('a').focus();
    await check('a');

    expect((await storedItems()).map((i) => i.done)).toEqual([true, false, true]);
    expect(labels()).toEqual(['Passport', 'Tickets', 'Charger']);
    expect(row('a').classList.contains('checklist-item--done')).toBe(true);
    expect(document.activeElement).toBe(box('a'));
  });

  it('unchecks an item', async () => {
    await check('c', false);
    expect((await storedItems()).map((i) => i.done)).toEqual([false, false, false]);
  });

  it('keeps both of two quick checks', async () => {
    box('a').checked = true;
    box('a').dispatchEvent(new window.Event('change', { bubbles: true }));
    box('b').checked = true;
    box('b').dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();

    expect((await storedItems()).map((i) => i.done)).toEqual([true, true, true]);
  });

  it('reports a failed check and shows the item as it still is', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    await check('a');

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t update the item. Quota exceeded.', type: 'error', duration: 6000 });
    expect(box('a').checked).toBe(false);
    expect(list.items.length).toBe(3);
  });

  it('changes nothing when the list\'s items were removed meanwhile (another window)', async () => {
    const [stored] = (await scopeStoreService.load(KEYS)).page.todos;
    panel.fake.storage.local.data.set(`todos:page:${KEYS.page}`, [{ ...stored, items: undefined }]);
    await check('a');
    expect((await scopeStoreService.load(KEYS)).page.todos[0].items).toEqual([]);
  });

  it('moves the list to "Done" once its last item is checked, and back when one is unchecked', async () => {
    await check('a');
    expect($('.todo-list__done-toggle')).toBeFalsy();
    await check('b');
    expect($('.todo-list__done-toggle').textContent.trim()).toBe('Done (1)');
    // "Done" is collapsed: the list left the view, the focus went to the group's toggle.
    expect(document.activeElement).toBe($('.todo-list__done-toggle'));
    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('List done.');

    // Undo unchecks the item just checked: open again.
    toast.onAction();
    await settle();
    expect($('.todo-list__done-toggle')).toBeFalsy();
    expect((await storedItems()).map((i) => i.done)).toEqual([true, false, true]);
  });
});
