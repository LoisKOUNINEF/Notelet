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

type SettingName = keyof ISettings;

// Settings always live on this device: they say where the notes are.
const SETTINGS_AREA: StorageAreaName = 'local';
// Each setting is its own storage item (`settings:storageArea`...): a window saving one never
// writes back another window's stale copy of the others (the storage area above all).
const KEY_PREFIX = 'settings:';
// Before that, they were all in this one item: read once, then split (see init()).
const LEGACY_KEY = 'settings';
const DEFAULTS: ISettings = { storageArea: 'local', doneExpanded: false, contentKind: 'notes', sitesOrder: 'recent' };
const NAMES = Object.keys(DEFAULTS) as SettingName[];

// What each setting may hold: anything else stored (a hand edit, an older version) is ignored.
const VALID: { [N in SettingName]: (value: unknown) => value is ISettings[N] } = {
  storageArea: (value): value is StorageAreaName => value === 'local' || value === 'sync',
  doneExpanded: (value): value is boolean => typeof value === 'boolean',
  contentKind: (value): value is ScopeContentKind => value === 'notes' || value === 'todos',
  sitesOrder: (value): value is SitesOrder => value === 'recent' || value === 'oldest' || value === 'az' || value === 'za',
};

export class SettingsService extends Service<SettingsService> {
  private _settings: ISettings = { ...DEFAULTS };
  // Saves run one at a time, in the order they were asked.
  private _queue: Promise<unknown> = Promise.resolve();

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
    const stored = await chromeApiService.storageGet(SETTINGS_AREA, [LEGACY_KEY, ...NAMES.map(storageKey)]);
    const legacy = (stored[LEGACY_KEY] ?? {}) as Record<string, unknown>;
    const settings = { ...DEFAULTS };
    const migrated: Record<string, unknown> = {};
    for (const name of NAMES) {
      const value = valid(name, stored[storageKey(name)] ?? legacy[name]);
      if (value === undefined) continue;
      assign(settings, name, value);
      if (stored[storageKey(name)] === undefined) migrated[storageKey(name)] = value;
    }
    this._settings = settings;

    // Another window's panel changed one.
    this.registerCleanup(chromeApiService.onStorageChanged((changes, area) => {
      if (area !== SETTINGS_AREA) return;
      const next = { ...this._settings };
      for (const name of NAMES) {
        const change = changes[storageKey(name)];
        if (!change) continue;
        assign(next, name, valid(name, change.newValue) ?? DEFAULTS[name]);
      }
      this.apply(next);
    }));

    // Best effort: the settings are already read, and a split left halfway is done again next time
    // (a setting's own item wins over the legacy one).
    if (stored[LEGACY_KEY] !== undefined) {
      try {
        await chromeApiService.storageSet(SETTINGS_AREA, migrated);
        await chromeApiService.storageRemove(SETTINGS_AREA, [LEGACY_KEY]);
      } catch {
        // Retried on the next init().
      }
    }
  }

  public setStorageArea(storageArea: StorageAreaName): Promise<void> {
    return this.save('storageArea', storageArea);
  }

  public setDoneExpanded(doneExpanded: boolean): Promise<void> {
    return this.save('doneExpanded', doneExpanded);
  }

  public setContentKind(contentKind: ScopeContentKind): Promise<void> {
    return this.save('contentKind', contentKind);
  }

  public setSitesOrder(sitesOrder: SitesOrder): Promise<void> {
    return this.save('sitesOrder', sitesOrder);
  }

  private save<N extends SettingName>(name: N, value: ISettings[N]): Promise<void> {
    const result = this._queue.then(async () => {
      await chromeApiService.storageSet(SETTINGS_AREA, { [storageKey(name)]: value });
      this.apply({ ...this._settings, [name]: value });
    });
    // A failed save is reported to its caller, but doesn't block the next ones.
    this._queue = result.catch(() => undefined);
    return result;
  }

  // Emits only what changed: a save's own storage change comes back here with nothing new.
  private apply(settings: ISettings): void {
    const changed = NAMES.filter((name) => settings[name] !== this._settings[name]);
    if (changed.length === 0) return;
    this._settings = settings;
    if (changed.includes('storageArea')) AppEventBus.emit('storage-area-changed', { area: settings.storageArea });
    AppEventBus.emit('settings-changed');
  }
}

// `value` if setting `name` can hold it, else undefined.
function valid<N extends SettingName>(name: N, value: unknown): ISettings[N] | undefined {
  const isValid: (value: unknown) => value is ISettings[N] = VALID[name];
  return isValid(value) ? value : undefined;
}

function assign<N extends SettingName>(settings: ISettings, name: N, value: ISettings[N]): void {
  settings[name] = value;
}

function storageKey(name: SettingName): string {
  return `${KEY_PREFIX}${name}`;
}

export const settingsService = SettingsService.getInstance();
