import { SettingsPanelComponent } from '#root/dist/src/app/components/settings-panel/settings-panel.component.js';
import { notesStoreService } from '#root/dist/src/app/services/notes-store/notes-store.service.js';
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
    await notesStoreService.add('page', KEYS.page, 'A');
    await choose('sync');

    expect(settingsService.storageArea).toBe('sync');
    expect(panel.fake.storage.sync.data.size).toBe(1);
    expect(radio('sync').checked).toBe(true);
    expect(document.activeElement).toBe(radio('sync'));
    expect(panel.toasts.at(-1)).toEqual({ message: 'Your notes now sync with your Chrome profile.', type: 'success' });
  });

  it('explains a refusal and goes back to the area in use', async () => {
    await notesStoreService.add('page', KEYS.page, 'x'.repeat(9000));
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
});
