import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { AppEventBus } from '#root/dist/src/core/index.js';
import { installFakeChrome, uninstallFakeChrome } from '../../testing/fake-chrome.js';

describe('SettingsService', () => {
  let fake;
  let areaEvents;
  const onArea = ({ area }) => areaEvents.push(area);

  beforeEach(() => {
    fake = installFakeChrome();
    areaEvents = [];
    AppEventBus.subscribe('storage-area-changed', onArea);
  });

  afterEach(() => {
    AppEventBus.off('storage-area-changed', onArea);
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('keeps notes in local storage by default', async () => {
    await settingsService.init();
    expect(settingsService.storageArea).toBe('local');
  });

  it('loads the saved storage area', async () => {
    fake.storage.local.data.set('settings', { storageArea: 'sync' });
    await settingsService.init();
    expect(settingsService.storageArea).toBe('sync');
  });

  it('saves the storage area in local storage and emits storage-area-changed', async () => {
    await settingsService.init();
    await settingsService.setStorageArea('sync');

    expect(settingsService.storageArea).toBe('sync');
    expect(fake.storage.local.data.get('settings')).toEqual({ storageArea: 'sync' });
    expect(fake.storage.sync.data.size).toBe(0);
    expect(areaEvents).toEqual(['sync']);
  });

  it('does not emit when the area stays the same', async () => {
    await settingsService.init();
    await settingsService.setStorageArea('local');
    expect(areaEvents).toEqual([]);
  });

  it('follows a change made in another window', async () => {
    await settingsService.init();
    await fake.storage.local.set({ settings: { storageArea: 'sync' } });

    expect(settingsService.storageArea).toBe('sync');
    expect(areaEvents).toEqual(['sync']);
  });

  it('stops listening once disposed', async () => {
    await settingsService.init();
    settingsService.dispose();
    expect(fake.storage.onChanged.hasListeners()).toBe(false);
  });
});
