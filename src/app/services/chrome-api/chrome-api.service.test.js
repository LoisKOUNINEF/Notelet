import { chromeApiService } from '#root/dist/src/app/services/chrome-api/chrome-api.service.js';
import { installFakeChrome, uninstallFakeChrome } from '../../testing/fake-chrome.js';

describe('ChromeApiService', () => {
  let fake;

  beforeEach(() => {
    fake = installFakeChrome({ url: 'https://example.com/a' });
  });

  afterEach(() => uninstallFakeChrome());

  it('reads, writes and removes items in the given storage area', async () => {
    await chromeApiService.storageSet('sync', { a: 1, b: 2 });
    expect(await chromeApiService.storageGet('sync', ['a'])).toEqual({ a: 1 });
    expect(await chromeApiService.storageGet('local', ['a'])).toEqual({});

    await chromeApiService.storageRemove('sync', ['a']);
    expect(await chromeApiService.storageGet('sync', null)).toEqual({ b: 2 });
  });

  it('skips removing an empty list of keys', async () => {
    const remove = spyOn(fake.storage.local, 'remove');
    await chromeApiService.storageRemove('local', []);
    expect(remove).not.toHaveBeenCalled();
    remove.restore();
  });

  it('returns an unsubscribe function for storage changes', async () => {
    const seen = [];
    const off = chromeApiService.onStorageChanged((changes, area) => seen.push([Object.keys(changes), area]));
    await chromeApiService.storageSet('local', { a: 1 });
    off();
    await chromeApiService.storageSet('local', { a: 2 });
    expect(seen).toEqual([[['a'], 'local']]);
  });

  it('falls back to the documented sync quotas', () => {
    expect(chromeApiService.syncQuota()).toEqual({ total: 102400, perItem: 8192, items: 512 });
    delete fake.storage.sync.QUOTA_BYTES;
    delete fake.storage.sync.QUOTA_BYTES_PER_ITEM;
    delete fake.storage.sync.MAX_ITEMS;
    expect(chromeApiService.syncQuota()).toEqual({ total: 102400, perItem: 8192, items: 512 });
  });

  it('reads the active tab\'s URL', async () => {
    expect(await chromeApiService.getActiveTabUrl()).toBe('https://example.com/a');
  });

  it('reports tab switches and URL changes, but not other tab updates', () => {
    let calls = 0;
    const off = chromeApiService.onTabsChanged(() => calls++);

    fake.tabs.onActivated.dispatch({ tabId: 1, windowId: 1 });
    fake.tabs.onUpdated.dispatch(1, { status: 'loading' }, {});
    fake.tabs.onUpdated.dispatch(1, { url: 'https://example.com/b' }, {});
    expect(calls).toBe(2);

    off();
    expect(fake.tabs.onActivated.hasListeners()).toBe(false);
    expect(fake.tabs.onUpdated.hasListeners()).toBe(false);
  });

  it('opens a tab', async () => {
    await chromeApiService.openTab('chrome://settings/appearance');
    expect(fake.tabs.created).toEqual([{ url: 'chrome://settings/appearance' }]);
  });

  it('has no active tab URL when no tab is found', async () => {
    const query = spyOn(fake.tabs, 'query').andCallFake(async () => []);
    expect(await chromeApiService.getActiveTabUrl()).toBe(null);
    query.restore();
  });
});
