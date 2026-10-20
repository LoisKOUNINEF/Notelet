import { AppEventBus, Service } from '../../../core/index.js';
import { getScopeKeys } from '../../lib/scope-keys.js';
import { chromeApiService } from '../chrome-api/chrome-api.service.js';

/**
 * Follows the tab shown next to the side panel and emits `active-scope-changed` when its
 * notes keys change: another tab activated, or a navigation in the same tab
 * (a hash change alone keeps the same page, so it doesn't emit).
 */
export class ActiveTabService extends Service<ActiveTabService> {
  private _keys: IScopeKeys | null = null;
  // Each refresh's result is only kept if no newer one started meanwhile.
  private _refreshId = 0;

  constructor() {
    super();
  }

  public get keys(): IScopeKeys | null {
    return this._keys;
  }

  // A failed first read rejects, so the panel says so (rather than "not available on this page");
  // the next tab switch or navigation tries again.
  public async init(): Promise<void> {
    this._keys = null;
    this.registerCleanup(chromeApiService.onTabsChanged(() => void this.refresh()));
    await this.read(true);
  }

  // A failed read (the extension being reloaded under the panel...) keeps the last keys.
  public refresh(): Promise<void> {
    return this.read(false);
  }

  private async read(rethrow: boolean): Promise<void> {
    const refreshId = ++this._refreshId;
    let url: string | null;
    try {
      url = await chromeApiService.getActiveTabUrl();
    } catch (error) {
      if (rethrow) throw error;
      return;
    }
    const keys = getScopeKeys(url);
    if (refreshId !== this._refreshId || keys?.page === this._keys?.page) return;

    this._keys = keys;
    AppEventBus.emit('active-scope-changed', { keys });
  }
}

export const activeTabService = ActiveTabService.getInstance();
