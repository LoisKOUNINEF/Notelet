import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { notesStoreService } from '#root/dist/src/app/services/notes-store/notes-store.service.js';
import { KEYS, keydown, settle, startPanel, typeInto } from '../../testing/panel.js';

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
    expect($('h1').textContent).toBe('Notes');
    expect(tab('page').getAttribute('aria-selected')).toBe('true');
    expect(tab('site').getAttribute('aria-selected')).toBe('false');
    expect($('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('scope-tab-page');
    expect($('.note-list__empty').textContent).toBe('No notes for this page yet.');
  });

  it('loads the page and site notes, with their counts on the tabs', async () => {
    await notesStoreService.add('page', KEYS.page, 'About this page');
    await notesStoreService.add('site', KEYS.site, 'About the site');
    await notesStoreService.add('site', KEYS.site, 'More about the site');
    await mount();

    expect(texts('.note-item__text')).toEqual(['About this page']);
    expect(tab('page').querySelector('.scope-tabs__count').textContent).toContain('1 note');
    expect(tab('site').querySelector('.scope-tabs__count').textContent).toContain('2 notes');
  });

  it('switches to the site notes from its tab, without reading storage again', async () => {
    await notesStoreService.add('site', KEYS.site, 'About the site');
    await mount();
    const get = spyOn(panel.fake.storage.local, 'get');

    tab('site').click();

    expect(get.callCount).toBe(0);
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
    expect(tab('page').querySelector('.scope-tabs__count').textContent).toContain('1 note');
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
    const note = await notesStoreService.add('page', KEYS.page, 'Unchanged');
    await mount();
    typeInto($('.note-composer__input'), 'Typing…');
    const item = $(`[data-note-id="${note.id}"]`);

    // Another window adds a site note.
    await notesStoreService.add('site', KEYS.site, 'From elsewhere');
    await settle();

    expect($('.note-composer__input').value).toBe('Typing…');
    expect($(`[data-note-id="${note.id}"]`)).toBe(item);
    expect(tab('site').querySelector('.scope-tabs__count').textContent).toContain('1 note');
  });

  it('follows the active tab to another page', async () => {
    await notesStoreService.add('page', 'https://other.org/x', 'Other page note');
    await mount();

    panel.fake.activateTab('https://other.org/x');
    await settle();

    expect($('.sidebar__location-text').textContent).toBe('/x');
    expect(texts('.note-item__text')).toEqual(['Other page note']);
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

  it('reloads the notes from the new storage area once switched', async () => {
    await notesStoreService.add('page', KEYS.page, 'Travels along');
    await mount();
    $('.sidebar__settings-toggle').click();

    $('input[value="sync"]').checked = true;
    $('input[value="sync"]').dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    $('.sidebar__settings-toggle').click();

    expect(panel.fake.storage.sync.data.size).toBe(1);
    expect(texts('.note-item__text')).toEqual(['Travels along']);
  });
});
