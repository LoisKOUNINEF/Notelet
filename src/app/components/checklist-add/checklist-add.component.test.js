import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, settle, startPanel } from '../../testing/panel.js';

describe('ChecklistAddComponent', () => {
  let panel;
  let sidebar;

  const input = () => $('.checklist-add__input');
  const add = async (text) => {
    input().value = text;
    $('.checklist-add').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };
  const storedItems = async () => (await scopeStoreService.load(KEYS)).page.todos[0].items;

  beforeEach(async () => {
    panel = await startPanel({ settings: { contentKind: 'todos' } });
    await scopeStoreService.addTodo('page', KEYS.page, 'Trip', [{ id: 'a', text: 'Passport', done: false }]);
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('names the list it adds to', () => {
    expect($('.checklist-add a11y-label').textContent).toBe('Add an item to Trip');
  });

  it('adds an item last, unchecked, and focuses the field again', async () => {
    input().focus();
    await add('  Tickets ');
    const items = await storedItems();
    expect(items.map(({ text, done }) => [text, done])).toEqual([['Passport', false], ['Tickets', false]]);
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe('');
  });

  it('adds nothing for blank text', async () => {
    await add('   ');
    expect((await storedItems()).length).toBe(1);
  });

  it('gives the typed text back when the save fails', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota');
    await add('Tickets');
    expect(input().value).toBe('Tickets');
    expect(panel.toasts.some(({ message }) => message.startsWith('Couldn\'t add the item.'))).toBe(true);
  });
});
