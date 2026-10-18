import { AppEventBus, Service } from '../../../core/index.js';
import { chromeApiService } from '../chrome-api/chrome-api.service.js';

interface ISettings {
  storageArea: StorageAreaName;
}

// Settings always live on this device: they say where the notes are.
const SETTINGS_AREA: StorageAreaName = 'local';
const SETTINGS_KEY = 'settings';
const DEFAULTS: ISettings = { storageArea: 'local' };

export class SettingsService extends Service<SettingsService> {
  private _settings: ISettings = { ...DEFAULTS };

  constructor() {
    super();
  }

  public get storageArea(): StorageAreaName {
    return this._settings.storageArea;
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

  public async setStorageArea(storageArea: StorageAreaName): Promise<void> {
    const settings = { ...this._settings, storageArea };
    await chromeApiService.storageSet(SETTINGS_AREA, { [SETTINGS_KEY]: settings });
    this.apply(settings);
  }

  private apply(settings: ISettings): void {
    const areaChanged = settings.storageArea !== this._settings.storageArea;
    this._settings = settings;
    if (areaChanged) AppEventBus.emit('storage-area-changed', { area: settings.storageArea });
  }
}

export const settingsService = SettingsService.getInstance();
