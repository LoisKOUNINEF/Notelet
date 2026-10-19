import { SettingsPanelComponent } from '#root/dist/src/app/components/settings-panel/settings-panel.component.js';
import { confirmService } from '#root/dist/src/app/services/confirm/confirm.service.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { KEYS, settle, startPanel } from '../../testing/panel.js';

describe('SettingsPanelComponent', () => {
  let panel;
  let settings;

  const radio = (value) => $(`input[name="storage-area"][value="${value}"]`);
  const choose = async (value) => {
    radio(value).checked = true;
    radio(value).dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };

  beforeEach(async () => {
    panel = await startPanel();
    // An element target is a placeholder the component replaces: give it one inside #app.
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    settings = new SettingsPanelComponent(placeholder);
    settings.render();
  });

  afterEach(async () => {
    settings.destroy();
    await panel.stop();
  });

  it('shows where notes are kept, in a labelled group', () => {
    expect($('a11y-radio-group').getAttribute('legend')).toBe('Where to keep your notes');
    expect(radio('local').checked).toBe(true);
    expect(radio('sync').checked).toBe(false);
  });

  it('moves the notes to sync, confirms it, and keeps the choice focused', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'A');
    await choose('sync');

    expect(settingsService.storageArea).toBe('sync');
    expect(panel.fake.storage.sync.data.size).toBe(1);
    expect(radio('sync').checked).toBe(true);
    expect(document.activeElement).toBe(radio('sync'));
    expect(panel.toasts.at(-1)).toEqual({ message: 'Your notes now sync with your Chrome profile.', type: 'success' });
  });

  it('explains a refusal and goes back to the area in use', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'x'.repeat(9000));
    await choose('sync');

    expect(settingsService.storageArea).toBe('local');
    expect(radio('local').checked).toBe(true);
    expect(panel.toasts.at(-1).type).toBe('error');
    expect(panel.toasts.at(-1).message).toContain('too long to sync');
  });

  it('disables the choice while the notes are moving', async () => {
    radio('sync').checked = true;
    radio('sync').dispatchEvent(new window.Event('change', { bubbles: true }));
    expect($('a11y-radio-group').hasAttribute('disabled')).toBe(true);
    await settle();
    expect($('a11y-radio-group').hasAttribute('disabled')).toBe(false);
  });

  it('follows a change made in another window', async () => {
    await panel.fake.storage.local.set({ settings: { storageArea: 'sync' } });
    expect(radio('sync').checked).toBe(true);
  });

  it('opens Chrome\'s side panel and shortcut settings', async () => {
    const [sideButton, shortcutButton] = $$('.settings-panel__section button');
    sideButton.click();
    shortcutButton.click();
    await settle();

    expect(panel.fake.tabs.created).toEqual([
      { url: 'chrome://settings/appearance' },
      { url: 'chrome://extensions/shortcuts' },
    ]);
  });

  it('does nothing when the area already in use is picked again', async () => {
    const get = spyOn(panel.fake.storage.local, 'get');
    await choose('local');
    expect(get.callCount).toBe(0);
    get.restore();
    expect(panel.toasts).toEqual([]);
  });

  it('asks before leaving sync, since that removes the synced notes on every device', async () => {
    await choose('sync');
    await scopeStoreService.addNote('page', KEYS.page, 'Synced note');
    const set = spyOn(panel.fake.storage.local, 'set');

    await choose('local');

    expect(set.callCount).toBe(0);
    set.restore();
    expect(settingsService.storageArea).toBe('sync');
    const confirm = $('.settings-panel__confirm');
    expect(confirm.getAttribute('role')).toBe('group');
    expect($('#settings-confirm-text').textContent).toContain('from all your devices');
    expect(confirm.getAttribute('aria-labelledby')).toBe('settings-confirm-text');
    expect(document.activeElement).toBe(confirm);
  });

  it('leaves sync once confirmed', async () => {
    await choose('sync');
    await scopeStoreService.addNote('page', KEYS.page, 'Synced note');
    await choose('local');
    $('.settings-panel__confirm-remove').click();
    await settle();

    expect(settingsService.storageArea).toBe('local');
    expect(panel.fake.storage.sync.data.size).toBe(0);
    expect(panel.fake.storage.local.data.has(`notes:page:${KEYS.page}`)).toBe(true);
    expect($('.settings-panel__confirm')).toBeFalsy();
  });

  it('stays on sync when cancelled, with focus back on its choice', async () => {
    await choose('sync');
    await choose('local');
    $('.settings-panel__confirm-cancel').click();

    expect(settingsService.storageArea).toBe('sync');
    expect(radio('sync').checked).toBe(true);
    expect($('.settings-panel__confirm')).toBeFalsy();
    expect(document.activeElement).toBe(radio('sync'));
  });

  it('explains when Chrome\'s settings can\'t be opened', async () => {
    panel.fake.tabs.create = async () => { throw new Error('No tab for you.'); };
    $$('.settings-panel__section button')[0].click();
    await settle();
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t open Chrome\'s settings. No tab for you.', type: 'error', duration: 6000 });
  });

  it('offers help as collapsed questions under a "Help" heading', () => {
    const section = $$('.settings-panel__subtitle').find((h) => h.textContent === 'Help').parentElement;
    const entries = [...section.querySelectorAll('details')];
    expect(entries.length).toBeGreaterThan(5);
    entries.forEach((entry) => {
      expect(entry.open).toBe(false);
      expect(entry.querySelector('summary').textContent.trim()).not.toBe('');
    });
  });
});

describe('SettingsPanelComponent - delete everything', () => {
  let panel;
  let settings;
  let asked;
  let answer;
  let detach;

  const start = async (options) => {
    panel = await startPanel(options);
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    settings = new SettingsPanelComponent(placeholder);
    settings.render();
    await scopeStoreService.addNote('page', KEYS.page, 'A note');
    await scopeStoreService.addTodo('site', KEYS.site, 'A to-do');
  };
  const area = () => panel.fake.storage[settingsService.storageArea];

  beforeEach(() => {
    asked = [];
    answer = true;
    detach = confirmService.attach({ ask: async (options) => { asked.push(options); return answer; } });
  });

  afterEach(async () => {
    detach();
    settings.destroy();
    await panel.stop();
  });

  it('comes right before the help', async () => {
    await start();
    const titles = $$('.settings-panel__subtitle').map((h) => h.textContent);
    expect(titles.indexOf('Delete everything')).toBe(titles.indexOf('Help') - 1);
    expect($('.settings-panel__delete-all').textContent).toBe('Delete all notes and to-dos');
  });

  it('asks first, and keeps everything when cancelled', async () => {
    await start();
    answer = false;
    $('.settings-panel__delete-all').click();
    await settle();

    expect(asked).toEqual([{ title: 'Delete all your notes and to-dos?', message: 'This can\'t be undone.', confirmLabel: 'Delete everything' }]);
    expect(area().data.size).toBe(2);
  });

  it('deletes every page\'s and site\'s notes and to-dos once confirmed, keeping the settings', async () => {
    await start();
    await settingsService.setDoneExpanded(true);
    $('.settings-panel__delete-all').click();
    await settle();

    expect([...area().data.keys()]).toEqual(['settings']);
    expect(panel.toasts.at(-1)).toEqual({ message: 'All your notes and to-dos were deleted.', type: 'success' });
  });

  it('warns that synced notes go from every computer', async () => {
    await start({ settings: { storageArea: 'sync' } });
    $('.settings-panel__delete-all').click();
    await settle();

    expect(asked[0].message).toBe('This can\'t be undone. They\'ll also be removed from your other computers.');
    expect([...panel.fake.storage.sync.data.keys()]).toEqual([]);
  });

  it('reports a failed delete', async () => {
    await start();
    const remove = spyOn(panel.fake.storage.local, 'remove').andCallFake(async () => { throw new Error('Nope.'); });
    $('.settings-panel__delete-all').click();
    await settle();
    remove.restore();
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t delete your notes. Nope.', type: 'error', duration: 6000 });
  });
});
