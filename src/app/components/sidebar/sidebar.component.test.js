import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { busListenerCounts, deferred, KEYS, keydown, settle, startPanel, typeInto } from '../../testing/panel.js';

describe('SidebarComponent', () => {
  let panel;
  let sidebar;

  const mount = async () => {
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  };
  const texts = (selector) => $$(selector).map((el) => el.textContent.trim());
  const tab = (scope) => $(`#scope-tab-${scope}`);
  const kindTab = (kind) => $(`#kind-tab-${kind}`);

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    sidebar?.destroy();
    sidebar = null;
    await panel.stop();
  });

  it('shows the current page, both tabs and an empty list', async () => {
    await mount();

    expect($('.sidebar__location-text').textContent).toBe('/docs');
    expect($('h1').textContent).toBe('Ticknote');
    expect(tab('page').getAttribute('aria-selected')).toBe('true');
    expect(tab('site').getAttribute('aria-selected')).toBe('false');
    expect($('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('scope-tab-page');
    expect($('.note-list__empty').textContent).toBe('No notes for this page yet.');
  });

  it('loads the page and site notes, with their counts on the tabs', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'About this page');
    await scopeStoreService.addNote('site', KEYS.site, 'About the site');
    await scopeStoreService.addNote('site', KEYS.site, 'More about the site');
    await mount();

    expect(texts('.note-item__text')).toEqual(['About this page']);
    expect(tab('page').querySelector('.a11y-visually-hidden').textContent).toBe(', 1 note');
    expect(tab('site').querySelector('.a11y-visually-hidden').textContent).toBe(', 2 notes');
  });

  it('shows the notes first, behind To-dos / Notes tabs inside the scope\'s panel', async () => {
    await mount();

    // Both tab rows sit together, in one shaded block above the panels.
    expect($$('.sidebar__tabs [role="tablist"]').map((el) => el.getAttribute('aria-label'))).toEqual(['Show notes for', 'Show']);
    // The scope tabs open into a card holding the To-dos / Notes tabs.
    expect($('.sidebar__tabs > div > .tabs').classList.contains('tabs--folder')).toBe(true);
    expect($('.sidebar__tabs-card [role="tablist"]').getAttribute('aria-label')).toBe('Show');
    expect($$('.sidebar__tabs [role="tab"]').map((el) => el.id)).toEqual(['scope-tab-page', 'scope-tab-site', 'kind-tab-notes', 'kind-tab-todos']);
    expect(kindTab('notes').getAttribute('aria-selected')).toBe('true');
    expect(kindTab('todos').getAttribute('aria-controls')).toBe('sidebar-kind-panel');
    expect($('#sidebar-kind-panel').getAttribute('aria-labelledby')).toBe('kind-tab-notes');
    expect($('#sidebar-kind-panel .note-composer__input')).toBeTruthy();
    expect($('.todo-composer__input')).toBeFalsy();
  });

  it('switches to the to-dos, and remembers it for the next panel', async () => {
    await mount();
    kindTab('todos').click();

    expect(kindTab('todos').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(kindTab('todos'));
    expect($('#sidebar-kind-panel').getAttribute('aria-labelledby')).toBe('kind-tab-todos');
    expect($('.todo-composer__input')).toBeTruthy();
    expect($('.note-composer__input')).toBeFalsy();
    await settle();
    expect(panel.fake.storage.local.data.get('settings').contentKind).toBe('todos');

    sidebar.destroy();
    await mount();
    expect(kindTab('todos').getAttribute('aria-selected')).toBe('true');
  });

  it('counts each kind of the shown scope on its tab', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'Page note');
    const done = await scopeStoreService.addTodo('page', KEYS.page, 'Done task');
    await scopeStoreService.update('todos', done, { done: true });
    await scopeStoreService.addTodo('site', KEYS.site, 'Site task');
    await mount();

    expect(kindTab('todos').querySelector('.tabs__count').textContent).toBe('0');
    expect(kindTab('todos').querySelector('.a11y-visually-hidden').textContent).toBe(', none open');
    expect(kindTab('notes').querySelector('.a11y-visually-hidden').textContent).toBe(', 1');

    tab('site').click();
    expect(kindTab('todos').querySelector('.a11y-visually-hidden').textContent).toBe(', 1 open');
    expect(kindTab('notes').querySelector('.a11y-visually-hidden').textContent).toBe(', none');
  });

  it('moves between the kind tabs with the arrow keys, keeping focus on the selected one', async () => {
    await mount();
    kindTab('notes').focus();
    keydown(kindTab('notes'), 'ArrowRight');
    expect(kindTab('todos').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(kindTab('todos'));
  });

  it('follows the kind picked in another window', async () => {
    await mount();
    await panel.fake.storage.local.set({ settings: { storageArea: 'local', doneExpanded: false, contentKind: 'todos' } });
    await settle();
    expect(kindTab('todos').getAttribute('aria-selected')).toBe('true');
    expect($('.todo-composer__input')).toBeTruthy();
  });

  it('keeps the tab switched when it can\'t be saved, and says so', async () => {
    await mount();
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    kindTab('todos').click();
    await settle();

    expect(panel.toasts.at(-1).message).toBe('Couldn\'t save that setting. Quota exceeded.');
    expect(kindTab('todos').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps what was being written when switching kinds and back', async () => {
    await mount();
    typeInto($('.note-composer__input'), 'Half a note');
    kindTab('todos').click();
    typeInto($('.todo-composer__input'), 'Half a to-do');
    kindTab('notes').click();
    expect($('.note-composer__input').value).toBe('Half a note');
    kindTab('todos').click();
    expect($('.todo-composer__input').value).toBe('Half a to-do');
  });

  it('shows each tab\'s own to-dos and counts them with its notes', async () => {
    await scopeStoreService.addTodo('page', KEYS.page, 'Page task');
    await scopeStoreService.addTodo('site', KEYS.site, 'Site task');
    await scopeStoreService.addNote('site', KEYS.site, 'Site note');
    await mount();
    kindTab('todos').click();
    const todoLabels = () => $$('.todo-item a11y-checkbox').map((el) => el.getAttribute('label'));

    expect(todoLabels()).toEqual(['Page task']);
    expect(tab('site').querySelector('.tabs__count').textContent).toBe('2');
    expect(tab('site').querySelector('.a11y-visually-hidden').textContent).toBe(', 1 note, 1 to-do');

    tab('site').click();
    expect(todoLabels()).toEqual(['Site task']);
  });

  it('adds a to-do from the quick add and keeps the focus there', async () => {
    await mount();
    kindTab('todos').click();
    typeInto($('.todo-composer__input'), 'Ship it');
    $('.todo-composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect($$('.todo-item a11y-checkbox').map((el) => el.getAttribute('label'))).toEqual(['Ship it']);
    expect(document.activeElement).toBe($('.todo-composer__input'));
  });

  it('switches to the site notes from its tab, reading only the site\'s pages list', async () => {
    await scopeStoreService.addNote('site', KEYS.site, 'About the site');
    await mount();
    const get = spyOn(panel.fake.storage.local, 'get');

    tab('site').click();
    await settle();

    // The notes were loaded with the page's: only the "Pages on this site" list is read (all of it).
    expect(get.calls).toEqual([[null]]);
    get.restore();
    expect(tab('site').getAttribute('aria-selected')).toBe('true');
    expect($('.sidebar__location-text').textContent).toBe('example.com');
    expect(texts('.note-item__text')).toEqual(['About the site']);
    expect($('.note-composer label, .note-composer a11y-label').textContent).toContain('this site');
  });

  it('moves between tabs with the arrow keys and keeps focus on the selected tab', async () => {
    await mount();
    tab('page').focus();

    keydown(tab('page'), 'ArrowRight');
    expect(tab('site').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('site'));
    expect(tab('site').tabIndex).toBe(0);
    expect(tab('page').tabIndex).toBe(-1);

    keydown(tab('site'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('page'));

    keydown(tab('page'), 'End');
    expect(document.activeElement).toBe(tab('site'));
    keydown(tab('site'), 'Home');
    expect(document.activeElement).toBe(tab('page'));
  });

  it('adds a note from the composer and keeps the focus there', async () => {
    await mount();
    const input = $('.note-composer__input');
    typeInto(input, '  Remember this  ');

    $('.note-composer button[type="submit"]').click();
    await settle();

    expect(texts('.note-item__text')).toEqual(['Remember this']);
    expect($('.note-composer__input').value).toBe('');
    expect(document.activeElement).toBe($('.note-composer__input'));
    expect(tab('page').querySelector('.a11y-visually-hidden').textContent).toBe(', 1 note');
  });

  it('adds a note with Ctrl+Enter or Cmd+Enter', async () => {
    await mount();
    typeInto($('.note-composer__input'), 'With Ctrl');
    keydown($('.note-composer__input'), 'Enter', { ctrlKey: true });
    await settle();
    typeInto($('.note-composer__input'), 'With Cmd');
    keydown($('.note-composer__input'), 'Enter', { metaKey: true });
    await settle();

    expect(texts('.note-item__text').sort()).toEqual(['With Cmd', 'With Ctrl']);
  });

  it('ignores an empty note', async () => {
    await mount();
    typeInto($('.note-composer__input'), '   ');
    keydown($('.note-composer__input'), 'Enter', { ctrlKey: true });
    await settle();
    expect($('.note-list__empty')).toBeTruthy();
  });

  it('keeps an unsent draft when switching tabs and back', async () => {
    await mount();
    typeInto($('.note-composer__input'), 'Half-written');

    tab('site').click();
    expect($('.note-composer__input').value).toBe('');
    tab('page').click();
    expect($('.note-composer__input').value).toBe('Half-written');
  });

  it('keeps the draft and the list items when the notes change elsewhere', async () => {
    const note = await scopeStoreService.addNote('page', KEYS.page, 'Unchanged');
    await mount();
    typeInto($('.note-composer__input'), 'Typing…');
    const item = $(`[data-note-id="${note.id}"]`);

    // Another window adds a site note.
    await scopeStoreService.addNote('site', KEYS.site, 'From elsewhere');
    await settle();

    expect($('.note-composer__input').value).toBe('Typing…');
    expect($(`[data-note-id="${note.id}"]`)).toBe(item);
    expect(tab('site').querySelector('.a11y-visually-hidden').textContent).toBe(', 1 note');
  });

  it('follows the active tab to another page', async () => {
    await scopeStoreService.addNote('page', 'https://other.org/x', 'Other page note');
    await mount();

    panel.fake.activateTab('https://other.org/x');
    await settle();

    expect($('.sidebar__location-text').textContent).toBe('/x');
    expect(texts('.note-item__text')).toEqual(['Other page note']);
  });

  it('lists the site\'s pages with notes on the site tab only, and opens one in the tab', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'This page');
    await scopeStoreService.addNote('page', 'https://example.com/blog', 'Another page');
    await scopeStoreService.addNote('page', 'https://other.org/x', 'Another site');
    await mount();
    expect($('.site-pages')).toBeFalsy();

    tab('site').click();
    await settle();
    $('.site-pages__toggle').click();
    expect(texts('.site-pages__label')).toEqual(['/blog', '/docs']);
    expect($('.site-pages__page--current .site-pages__label').textContent).toBe('/docs');

    $('[data-url="https://example.com/blog"]').click();
    await settle();

    expect(panel.fake.tabs.updated).toEqual([{ tabId: 1, url: 'https://example.com/blog' }]);
    expect(tab('site').getAttribute('aria-selected')).toBe('true');
    // Still open, now with the other page as the current one.
    expect($('.site-pages__toggle').getAttribute('aria-expanded')).toBe('true');
    expect($('.site-pages__page--current .site-pages__label').textContent).toBe('/blog');
  });

  it('only lists the site\'s pages (a read of all storage) on the site tab', async () => {
    await scopeStoreService.addNote('page', 'https://example.com/blog', 'Another page');
    const get = spyOn(panel.fake.storage.local, 'get');
    const wholeReads = () => get.calls.filter(([keys]) => keys === null).length;
    await mount();
    await scopeStoreService.addNote('page', KEYS.page, 'Changes on the page tab');
    await settle();
    expect(wholeReads()).toBe(0);

    tab('site').click();
    await settle();
    expect(wholeReads()).toBe(1);
    // A change while it shows: listed again.
    await scopeStoreService.addNote('page', 'https://example.com/new', 'New page');
    await settle();
    expect(wholeReads()).toBe(2);
    get.restore();
    $('.site-pages__toggle').click();
    expect(texts('.site-pages__label')).toEqual(['/blog', '/docs', '/new']);
  });

  it('shows a spinner while first listing the site\'s pages, not when listing them again', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'A note');
    await mount();
    const storage = panel.fake.storage.local;
    const realGet = storage.get.bind(storage);
    let held = null;
    const get = spyOn(storage, 'get').andCallFake((keys) => {
      if (keys !== null) return realGet(keys);
      held = deferred();
      return held.promise.then(() => realGet(keys));
    });

    tab('site').click();
    await settle();
    expect($('.site-pages__loading a11y-spinner').getAttribute('label')).toBe('Loading this site\'s pages');
    expect($('.site-pages__toggle')).toBeFalsy();
    held.resolve();
    await settle();
    expect($('.site-pages__loading')).toBeFalsy();
    expect($('.site-pages__toggle').textContent.trim()).toBe('Pages on this site (1)');

    // Listed again after a change: the list stays meanwhile.
    await scopeStoreService.addNote('page', 'https://example.com/b', 'B');
    await settle();
    expect($('.site-pages__loading')).toBeFalsy();
    expect($('.site-pages__toggle')).toBeTruthy();
    held.resolve();
    await settle();
    get.restore();
    expect($('.site-pages__toggle').textContent.trim()).toBe('Pages on this site (2)');
  });

  it('says so when the site\'s pages can\'t be listed, without a spinner left turning', async () => {
    await mount();
    const storage = panel.fake.storage.local;
    const realGet = storage.get.bind(storage);
    const get = spyOn(storage, 'get').andCallFake(async (keys) => {
      if (keys === null) throw new Error('Nope.');
      return realGet(keys);
    });
    tab('site').click();
    await settle();
    get.restore();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t list this site\'s pages. Nope.');
    expect($('.site-pages__loading')).toBeFalsy();
  });

  it('adds a page to the site\'s list once it has notes', async () => {
    await mount();
    tab('site').click();
    await settle();
    expect($('.site-pages')).toBeFalsy();

    await scopeStoreService.addTodo('page', KEYS.page, 'First to-do');
    await settle();
    expect($('.site-pages__toggle').textContent.trim()).toBe('Pages on this site (1)');
  });

  it('explains when the page can\'t have notes', async () => {
    await mount();
    panel.fake.navigate('chrome://extensions');
    await settle();

    expect($('.sidebar__unavailable').textContent).toContain('Notes aren\'t available on this page.');
    expect($('[role="tablist"]')).toBeFalsy();
    expect($('.note-composer')).toBeFalsy();
  });

  it('opens and closes the settings, moving focus with them', async () => {
    await mount();
    const toggle = () => $('.sidebar__settings-toggle');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect($('#sidebar-settings .settings-panel')).toBeTruthy();
    expect($('[role="tablist"]')).toBeFalsy();
    expect(document.activeElement).toBe($('#settings-title'));

    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect($('[role="tablist"]')).toBeTruthy();
    expect(document.activeElement).toBe(toggle());
  });

  it('opens "Manage by site" from the settings, and goes back, moving focus with it', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'A note');
    await mount();
    $('.sidebar__settings-toggle').click();
    $('.settings-panel__manage-sites').click();
    expect(document.activeElement).toBe($('#site-manager-title'));
    expect($('.settings-panel')).toBeFalsy();
    expect($('.sidebar__settings-toggle').textContent).toBe('Back to notes');
    await settle();
    expect(texts('.site-row__name')).toEqual(['example.com (current)']);

    $('.site-manager__back').click();
    expect($('.site-manager')).toBeFalsy();
    expect(document.activeElement).toBe($('.settings-panel__manage-sites'));

    // From the page, the header's button goes straight back to the notes.
    $('.settings-panel__manage-sites').click();
    $('.sidebar__settings-toggle').click();
    expect($('.site-manager')).toBeFalsy();
    expect(texts('.note-item__text')).toEqual(['A note']);
    expect(document.activeElement).toBe($('.sidebar__settings-toggle'));
  });

  it('reloads the notes from the new storage area once switched', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'Travels along');
    await mount();
    $('.sidebar__settings-toggle').click();

    $('input[value="sync"]').checked = true;
    $('input[value="sync"]').dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    $('.sidebar__settings-toggle').click();

    expect(panel.fake.storage.sync.data.size).toBe(1);
    expect(texts('.note-item__text')).toEqual(['Travels along']);
  });

  it('shows the latest tab\'s content when an older load finishes last', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'Old page note');
    await scopeStoreService.addNote('page', 'https://other.org/x', 'New page note');
    await mount();

    // Hold the panel's next load of this page (a 4-item read), let the other tab's through.
    const storage = panel.fake.storage.local;
    const realGet = storage.get.bind(storage);
    let releaseOld = null;
    const get = spyOn(storage, 'get').andCallFake((keys) => {
      if (!releaseOld && keys?.length === 4 && keys.includes(`notes:page:${KEYS.page}`)) {
        return new Promise((resolve) => { releaseOld = () => resolve(realGet(keys)); });
      }
      return realGet(keys);
    });

    panel.bus.emit('scope-content-changed');
    panel.fake.activateTab('https://other.org/x');
    await settle();
    releaseOld();
    await settle();
    get.restore();

    expect($('.sidebar__location-text').textContent).toBe('/x');
    expect(texts('.note-item__text')).toEqual(['New page note']);
  });

  it('keeps focus on a tab, or on the Settings toggle, through a reload from elsewhere', async () => {
    await mount();
    tab('site').click();
    tab('site').focus();
    await scopeStoreService.addNote('site', KEYS.site, 'From another window');
    await settle();
    expect(document.activeElement).toBe(tab('site'));

    $('.sidebar__settings-toggle').focus();
    await scopeStoreService.addNote('page', KEYS.page, 'Another one');
    await settle();
    expect(document.activeElement).toBe($('.sidebar__settings-toggle'));
  });

  it('lets an action\'s own focus request win over keeping focus', async () => {
    await mount();
    tab('page').focus();
    keydown(tab('page'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('site'));
  });

  it('keeps a note edit through a tab switch and back, until it\'s saved', async () => {
    const note = await scopeStoreService.addNote('page', KEYS.page, 'Original');
    await mount();
    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
    $('.note-editor__input').value = 'Half-edited';

    tab('site').click();
    tab('page').click();

    expect($('.note-editor__input').value).toBe('Half-edited');
    expect($('.note-editor__restored').textContent).toBe('Unsaved changes restored.');
    $('.note-editor button[type="submit"]').click();
    await settle();
    expect((await scopeStoreService.load(KEYS)).page.notes[0].text).toBe('Half-edited');

    // Saved: nothing restored any more.
    tab('site').click();
    tab('page').click();
    expect($('.note-editor')).toBeFalsy();
  });

  it('forgets a note edit that was cancelled, or left unchanged', async () => {
    const note = await scopeStoreService.addNote('page', KEYS.page, 'Original');
    await mount();
    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
    $('.note-editor__input').value = 'Discarded';
    keydown($('.note-editor__input'), 'Escape');
    tab('site').click();
    tab('page').click();
    expect($('.note-editor')).toBeFalsy();

    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
    tab('site').click();
    tab('page').click();
    expect($('.note-editor')).toBeFalsy();
  });

  it('keeps a note edit when another window saves that same note', async () => {
    const note = await scopeStoreService.addNote('page', KEYS.page, 'Original');
    await mount();
    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
    $('.note-editor__input').value = 'Mine, unsaved';

    await scopeStoreService.update('notes', note, { text: 'Theirs' });
    await settle();

    expect($('.note-editor__input').value).toBe('Mine, unsaved');
  });

  it('keeps a to-do edit through a tab switch and back, until it\'s saved or cancelled', async () => {
    const todo = await scopeStoreService.addTodo('page', KEYS.page, 'Original');
    await mount();
    kindTab('todos').click();
    $(`[data-todo-id="${todo.id}"] .todo-item__edit`).click();
    $('.list-editor__input').value = 'Half-edited';

    tab('site').click();
    tab('page').click();
    expect($('.list-editor__input').value).toBe('Half-edited');
    expect($(`[data-todo-id="${todo.id}"] .list-editor__restored`).textContent).toBe('Unsaved changes restored.');

    keydown($('.list-editor__input'), 'Escape');
    tab('site').click();
    tab('page').click();
    expect($('.list-editor__input')).toBeFalsy();
  });

  it('forgets a to-do edit once saved, or when nothing changed', async () => {
    const todo = await scopeStoreService.addTodo('page', KEYS.page, 'Original');
    await mount();
    kindTab('todos').click();
    $(`[data-todo-id="${todo.id}"] .todo-item__edit`).click();
    tab('site').click();
    tab('page').click();
    expect($('.list-editor__input')).toBeFalsy();

    $(`[data-todo-id="${todo.id}"] .todo-item__edit`).click();
    $('.list-editor__input').value = 'Saved';
    $(`[data-todo-id="${todo.id}"] button[type="submit"]`).click();
    await settle();
    tab('site').click();
    tab('page').click();
    expect($('.list-editor__input')).toBeFalsy();
  });

  it('keeps the panel usable when loading fails, and says so', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'Shown before');
    await mount();
    const get = spyOn(panel.fake.storage.local, 'get').andCallFake(async () => { throw new Error('Extension context invalidated.'); });
    await scopeStoreService.addNote('site', KEYS.site, 'Triggers a reload').catch(() => {});
    panel.bus.emit('scope-content-changed');
    await settle();
    get.restore();

    expect(panel.toasts.at(-1).message).toBe('Couldn\'t load your notes. Extension context invalidated.');
    expect(texts('.note-item__text')).toEqual(['Shown before']);
  });

  it('shows empty lists when the very first load fails', async () => {
    const get = spyOn(panel.fake.storage.local, 'get').andCallFake(async () => { throw new Error('Nope.'); });
    await mount();
    get.restore();
    expect($('.note-list__empty')).toBeTruthy();
    kindTab('todos').click();
    expect($('.todo-composer__input')).toBeTruthy();
  });

  it('ignores a failed load that a newer one already replaced', async () => {
    await scopeStoreService.addNote('page', 'https://other.org/x', 'Newer tab');
    await mount();
    const storage = panel.fake.storage.local;
    const realGet = storage.get.bind(storage);
    let failOld = null;
    const get = spyOn(storage, 'get').andCallFake((keys) => {
      if (!failOld && keys?.includes(`notes:page:${KEYS.page}`)) {
        return new Promise((_, reject) => { failOld = () => reject(new Error('Too late.')); });
      }
      return realGet(keys);
    });

    panel.bus.emit('scope-content-changed');
    panel.fake.activateTab('https://other.org/x');
    await settle();
    failOld();
    await settle();
    get.restore();

    expect(panel.toasts.some((t) => t.message.includes('Too late.'))).toBe(false);
    expect(texts('.note-item__text')).toEqual(['Newer tab']);
  });

  it('keeps no draft for an unchanged edit of a note saved before checklists', async () => {
    panel.fake.storage.local.data.set(`notes:page:${KEYS.page}`, [
      { id: 'old', scope: 'page', key: KEYS.page, text: 'From before', createdAt: 1, updatedAt: 1 },
    ]);
    await mount();
    $('[data-note-id="old"] .note-item__edit').click();
    tab('site').click();
    tab('page').click();
    expect($('.note-editor')).toBeFalsy();
  });

  it('leaves nothing behind once destroyed, however it was used', async () => {
    await scopeStoreService.addNote('page', 'https://example.com/other', 'Elsewhere on the site');
    await scopeStoreService.addTodo('page', KEYS.page, 'First');
    await scopeStoreService.addTodo('page', KEYS.page, 'Second');
    const baseline = busListenerCounts();
    await mount();

    // Notes: write one. To-dos: add one, pick one up and put it back.
    typeInto($('.note-composer__input'), 'A note');
    keydown($('.note-composer__input'), 'Enter', { ctrlKey: true });
    await settle();
    kindTab('todos').click();
    typeInto($('.todo-composer__input'), 'Third');
    $('.todo-composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    $('.todo-item__handle').focus();
    keydown($('.todo-item__handle'), ' ');
    keydown($('.todo-item__handle'), 'Escape');
    // The site, its pages list, then Settings open and closed.
    tab('site').click();
    await settle();
    $('.site-pages__toggle').click();
    $('.sidebar__settings-toggle').click();
    await settle();
    $('.settings-panel__manage-sites').click();
    await settle();
    $('.site-manager__back').click();
    $('.sidebar__settings-toggle').click();
    await settle();

    sidebar.destroy();
    sidebar = null;
    await settle();
    expect(busListenerCounts()).toEqual(baseline);
  });
});
