import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { useEventBus } from '#root/dist/src/core/index.js';
import { MockEventBus } from '#root/tools/testin-nutin/mocks/mock-event-bus.js';
import { installFakeChrome, uninstallFakeChrome } from '../../testing/fake-chrome.js';

// The app's events go through this mock (see useEventBus), a new one for each test.
let bus;

describe('SettingsService', () => {
  let fake;
  let areaEvents;
  const onArea = ({ area }) => areaEvents.push(area);

  beforeEach(() => {
    bus = new MockEventBus();
    useEventBus(bus);
    fake = installFakeChrome();
    areaEvents = [];
    bus.subscribe('storage-area-changed', onArea);
  });

  afterEach(() => {
    useEventBus(null);
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
    expect(fake.storage.local.data.get('settings')).toEqual({ storageArea: 'sync', doneExpanded: false, contentKind: 'notes', sitesOrder: 'recent' });
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

  it('keeps the "Done" group collapsed by default, and remembers when it\'s opened', async () => {
    await settingsService.init();
    expect(settingsService.doneExpanded).toBe(false);

    await settingsService.setDoneExpanded(true);
    expect(settingsService.doneExpanded).toBe(true);
    expect(fake.storage.local.data.get('settings')).toEqual({ storageArea: 'local', doneExpanded: true, contentKind: 'notes', sitesOrder: 'recent' });
    expect(areaEvents).toEqual([]);

    settingsService.dispose();
    await settingsService.init();
    expect(settingsService.doneExpanded).toBe(true);
  });

  it('reads settings saved before doneExpanded existed', async () => {
    fake.storage.local.data.set('settings', { storageArea: 'sync' });
    await settingsService.init();
    expect(settingsService.doneExpanded).toBe(false);
    expect(settingsService.storageArea).toBe('sync');
  });

  it('shows notes first by default, and remembers the tab last picked', async () => {
    await settingsService.init();
    expect(settingsService.contentKind).toBe('notes');

    await settingsService.setContentKind('todos');
    expect(fake.storage.local.data.get('settings').contentKind).toBe('todos');

    settingsService.dispose();
    await settingsService.init();
    expect(settingsService.contentKind).toBe('todos');
  });

  it('follows the tab picked in another window', async () => {
    await settingsService.init();
    let changes = 0;
    const onChange = () => changes++;
    bus.subscribe('settings-changed', onChange);
    await fake.storage.local.set({ settings: { storageArea: 'local', doneExpanded: false, contentKind: 'todos' } });

    expect(settingsService.contentKind).toBe('todos');
    expect(changes).toBe(1);
    expect(areaEvents).toEqual([]);
  });

  it('orders "Manage by site" by recent edits first, and remembers the order picked', async () => {
    await settingsService.init();
    expect(settingsService.sitesOrder).toBe('recent');
    await settingsService.setSitesOrder('az');
    settingsService.dispose();
    await settingsService.init();
    expect(settingsService.sitesOrder).toBe('az');
  });
});
