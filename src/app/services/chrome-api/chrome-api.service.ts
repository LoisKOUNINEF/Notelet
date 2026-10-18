import { Service } from '../../../core/index.js';

type Unsubscribe = () => void;
type StorageItems = Record<string, unknown>;

// chrome.storage.sync's documented limits, used if the API doesn't expose them.
const SYNC_QUOTA_BYTES = 102400;
const SYNC_QUOTA_BYTES_PER_ITEM = 8192;

/**
 * The only place that touches `chrome.*`: a thin, typed surface over the few extension APIs
 * the app uses. `chrome` is read on every call, so tests can install a fake global
 * (see testing/fake-chrome.js), and a Firefox port only has to change this file.
 */
export class ChromeApiService extends Service<ChromeApiService> {
  constructor() {
    super();
  }

  public async storageGet(area: StorageAreaName, keys: string[] | null): Promise<StorageItems> {
    return chrome.storage[area].get(keys);
  }

  public async storageSet(area: StorageAreaName, items: StorageItems): Promise<void> {
    await chrome.storage[area].set(items);
  }

  public async storageRemove(area: StorageAreaName, keys: string[]): Promise<void> {
    if (keys.length > 0) await chrome.storage[area].remove(keys);
  }

  public onStorageChanged(
    callback: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  ): Unsubscribe {
    chrome.storage.onChanged.addListener(callback);
    return () => chrome.storage.onChanged.removeListener(callback);
  }

  public syncQuota(): { total: number; perItem: number } {
    return {
      total: chrome.storage.sync.QUOTA_BYTES ?? SYNC_QUOTA_BYTES,
      perItem: chrome.storage.sync.QUOTA_BYTES_PER_ITEM ?? SYNC_QUOTA_BYTES_PER_ITEM,
    };
  }

  // The side panel's own window: `currentWindow` is the window the panel is open in.
  public async getActiveTabUrl(): Promise<string | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url ?? null;
  }

  // Fires when another tab is activated, or when a tab's URL changes.
  public onTabsChanged(callback: () => void): Unsubscribe {
    const onUpdated = (_tabId: number, changeInfo: { url?: string }) => {
      if (changeInfo.url) callback();
    };
    chrome.tabs.onActivated.addListener(callback);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(callback);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }

  public async openTab(url: string): Promise<void> {
    await chrome.tabs.create({ url });
  }
}

export const chromeApiService = ChromeApiService.getInstance();
