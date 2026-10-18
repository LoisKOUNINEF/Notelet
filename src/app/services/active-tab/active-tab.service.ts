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

  public async init(): Promise<void> {
    this._keys = null;
    this.registerCleanup(chromeApiService.onTabsChanged(() => void this.refresh()));
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    const refreshId = ++this._refreshId;
    const keys = getScopeKeys(await chromeApiService.getActiveTabUrl());
    if (refreshId !== this._refreshId || keys?.page === this._keys?.page) return;

    this._keys = keys;
    AppEventBus.emit('active-scope-changed', { keys });
  }
}

export const activeTabService = ActiveTabService.getInstance();
