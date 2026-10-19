import { AppEventBus, Service } from '../../../core/index.js';
import { chromeApiService } from '../chrome-api/chrome-api.service.js';

interface ISettings {
  storageArea: StorageAreaName;
  // Whether the to-do lists' "Done (n)" group is open, for every page.
  doneExpanded: boolean;
  // The To-dos / Notes tab last picked, shown when the panel opens.
  contentKind: ScopeContentKind;
  // The order last picked in "Manage by site".
  sitesOrder: SitesOrder;
}

// Settings always live on this device: they say where the notes are.
const SETTINGS_AREA: StorageAreaName = 'local';
const SETTINGS_KEY = 'settings';
const DEFAULTS: ISettings = { storageArea: 'local', doneExpanded: false, contentKind: 'notes', sitesOrder: 'recent' };

export class SettingsService extends Service<SettingsService> {
  private _settings: ISettings = { ...DEFAULTS };

  constructor() {
    super();
  }

  public get storageArea(): StorageAreaName {
    return this._settings.storageArea;
  }

  public get doneExpanded(): boolean {
    return this._settings.doneExpanded;
  }

  public get contentKind(): ScopeContentKind {
    return this._settings.contentKind;
  }

  public get sitesOrder(): SitesOrder {
    return this._settings.sitesOrder;
  }

  public async init(): Promise<void> {
    const stored = await chromeApiService.storageGet(SETTINGS_AREA, [SETTINGS_KEY]);
    this._settings = { ...DEFAULTS, ...(stored[SETTINGS_KEY] as Partial<ISettings> | undefined) };

    // Another window's panel changed them.
    this.registerCleanup(chromeApiService.onStorageChanged((changes, area) => {
      const change = changes[SETTINGS_KEY];
      if (area !== SETTINGS_AREA || !change) return;
      this.apply({ ...DEFAULTS, ...(change.newValue as Partial<ISettings> | undefined) });
    }));
  }

  public setStorageArea(storageArea: StorageAreaName): Promise<void> {
    return this.save({ storageArea });
  }

  public setDoneExpanded(doneExpanded: boolean): Promise<void> {
    return this.save({ doneExpanded });
  }

  public setContentKind(contentKind: ScopeContentKind): Promise<void> {
    return this.save({ contentKind });
  }

  public setSitesOrder(sitesOrder: SitesOrder): Promise<void> {
    return this.save({ sitesOrder });
  }

  private async save(changes: Partial<ISettings>): Promise<void> {
    const settings = { ...this._settings, ...changes };
    await chromeApiService.storageSet(SETTINGS_AREA, { [SETTINGS_KEY]: settings });
    this.apply(settings);
  }

  private apply(settings: ISettings): void {
    const areaChanged = settings.storageArea !== this._settings.storageArea;
    this._settings = settings;
    if (areaChanged) AppEventBus.emit('storage-area-changed', { area: settings.storageArea });
    AppEventBus.emit('settings-changed');
  }
}

export const settingsService = SettingsService.getInstance();
