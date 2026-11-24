import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { confirmService } from '#root/dist/src/app/services/confirm/confirm.service.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, settle, startPanel } from '../../testing/panel.js';

// In the panel, on the site tab: its actions go through the store, and the list comes back.
describe('SitePageRowComponent', () => {
  let panel;
  let sidebar;
  let asked;
  let answer;
  let detach;

  const BLOG = 'https://example.com/blog';
  const row = (url) => $$('.site-page-row').find((el) => el.querySelector('.site-page-row__page').title === url);
  const labels = () => $$('.site-page-row__label').map((el) => el.textContent);
  const menuItem = (url, action = 'move') => document.getElementById(`site-page-${url}-menu`).querySelector(`[data-action="${action}"]`);
  const content = () => scopeStoreService.load(KEYS);
  const open = async (kind = 'notes') => {
    panel = await startPanel({ settings: { contentKind: kind } });
    await scopeStoreService.addNote('page', KEYS.page, 'Docs note');
    await scopeStoreService.addNote('page', BLOG, 'Blog note 1');
    await scopeStoreService.addNote('page', BLOG, 'Blog note 2');
    await scopeStoreService.addTodo('page', BLOG, 'Blog to-do');
    await scopeStoreService.addNote('site', KEYS.site, 'Site note');
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    // After the sidebar's own dialog.
    detach = confirmService.attach({ ask: async (options) => { asked.push(options); return answer; } });
    await settle();
    $('#scope-tab-site').click();
    await settle();
    $('.site-pages__toggle').click();
  };

  beforeEach(() => {
    asked = [];
    answer = true;
  });

  afterEach(async () => {
    detach();
    sidebar.destroy();
    await panel.stop();
  });

  it('moves all of a page\'s notes to the site, its to-dos staying, and can undo it', async () => {
    await open();
    menuItem(BLOG).click();
    await settle();

    const moved = await content();
    expect(moved.site.notes.map((n) => n.text).sort()).toEqual(['Blog note 1', 'Blog note 2', 'Site note']);
    expect((await scopeStoreService.listSitePages(KEYS.site)).find((p) => p.key === BLOG)).toEqual({ key: BLOG, label: '/blog', notes: 0, todos: 1, openTodos: 1 });
    expect(labels()).toEqual(['/docs']);
    // The next row takes the moved one's place, and the focus.
    expect(document.activeElement).toBe(row(KEYS.page).querySelector('.site-page-row__delete'));

    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('2 notes moved to this site from /blog.');
    expect(toast.type).toBe('success');
    toast.onAction();
    await settle();
    expect((await content()).site.notes.map((n) => n.text)).toEqual(['Site note']);
    expect(labels()).toEqual(['/blog', '/docs']);
  });

  it('names a long page by its shortened path in the confirmation and the toast, which keeps its Undo', async () => {
    const LONG = 'https://example.com/docs/guides/getting-started/install';
    await open();
    await scopeStoreService.addNote('page', LONG, 'Install note');
    await settle();
    row(LONG).querySelector('.site-page-row__delete').click();
    await settle();

    expect(asked.at(-1).title).toBe('Delete 1 note on /docs/guides/…/install?');
    expect(asked.at(-1).message).toBe(`Every note on ${LONG}.`);
    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('/docs/guides/…/install: 1 note deleted.');
    expect(toast.actionText).toBe('Undo');
    toast.onAction();
    await settle();
    expect(labels()).toContain('/docs/guides/getting-started/install');
  });

  it('hands the focus to the previous row when the last one leaves', async () => {
    await open();
    row(KEYS.page).querySelector('.site-page-row__delete').click();
    await settle();
    expect(labels()).toEqual(['/blog']);
    expect(document.activeElement).toBe(row(BLOG).querySelector('.site-page-row__delete'));
  });

  it('opens another page in a new tab behind the current one, the panel staying on its page', async () => {
    await open();
    menuItem(BLOG, 'open-tab').click();
    await settle();
    expect(panel.fake.tabs.created).toEqual([{ url: BLOG, active: false }]);
    expect(panel.fake.tabs.updated).toEqual([]);
    expect($('.site-page-row__page--current .site-page-row__label').textContent).toBe('/docs');
    // The announcer speaks a moment later (see lib/announce.ts).
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect($('#app-announcer').textContent).toBe('/blog opened in a new tab.');
  });

  it('reports a page that couldn\'t be opened in a new tab', async () => {
    await open();
    const create = spyOn(panel.fake.tabs, 'create').andCallFake(async () => { throw new Error('Too many tabs.'); });
    menuItem(BLOG, 'open-tab').click();
    await settle();
    create.restore();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t open the page. Too many tabs.');
  });

  it('moves the to-dos on the To-dos tab', async () => {
    await open('todos');
    expect(labels()).toEqual(['/blog']);
    menuItem(BLOG).click();
    await settle();
    expect((await content()).site.todos.map((t) => t.text)).toEqual(['Blog to-do']);
    expect(panel.toasts.at(-1).message).toBe('1 to-do moved to this site from /blog.');
    // No row left: the list goes, the focus to the kind tab.
    expect($('.site-pages')).toBeFalsy();
    expect(document.activeElement).toBe($('#kind-tab-todos'));
  });

  it('deletes all of a page\'s notes once confirmed, and can undo it', async () => {
    await open();
    row(BLOG).querySelector('.site-page-row__delete').click();
    await settle();

    expect(asked).toEqual([{ title: 'Delete 2 notes on /blog?', message: `Every note on ${BLOG}.`, confirmLabel: 'Delete' }]);
    expect(labels()).toEqual(['/docs']);
    expect((await scopeStoreService.listSitePages(KEYS.site)).find((p) => p.key === BLOG).todos).toBe(1);
    expect(document.activeElement).toBe(row(KEYS.page).querySelector('.site-page-row__delete'));

    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('/blog: 2 notes deleted.');
    toast.onAction();
    await settle();
    expect(labels()).toEqual(['/blog', '/docs']);
  });

  it('deletes nothing when cancelled, and reports a failed delete', async () => {
    await open();
    answer = false;
    row(BLOG).querySelector('.site-page-row__delete').click();
    await settle();
    expect(labels()).toEqual(['/blog', '/docs']);

    answer = true;
    // An emptied list is removed from storage.
    const remove = spyOn(panel.fake.storage.local, 'remove').andCallFake(async () => { throw new Error('Nope.'); });
    row(BLOG).querySelector('.site-page-row__delete').click();
    await settle();
    remove.restore();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t delete 2 notes. Nope.');
    expect(labels()).toEqual(['/blog', '/docs']);
  });

  it('asks about the to-dos, done ones included, on the To-dos tab', async () => {
    await open('todos');
    row(BLOG).querySelector('.site-page-row__delete').click();
    await settle();
    expect(asked[0]).toEqual({ title: 'Delete 1 to-do on /blog?', message: `Every to-do on ${BLOG}, done ones included.`, confirmLabel: 'Delete' });
  });
});
