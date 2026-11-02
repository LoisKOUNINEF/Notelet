import { html, raw } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { requireElement } from '../../lib/dom.js';
import { failureMessage } from '../../lib/errors.js';
import { chromeApiService } from '../../services/chrome-api/chrome-api.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { BackupDataComponent } from '../backup-data/backup-data.component.js';
import { AppComponent } from '../base/app-component.js';
import { DeleteDataComponent } from '../delete-data/delete-data.component.js';

interface IAreaOption {
  value: StorageAreaName;
  label: string;
  hint: string;
  checked: boolean;
}

interface ISettingsPanelView {
  areas: IAreaOption[];
  busy: boolean;
  // The option picked but not applied yet.
  pending: StorageAreaName | null;
  browser: BrowserName;
  syncedWith: string;
}

const templateFn = ({ areas, busy, pending, browser, syncedWith }: ISettingsPanelView) => html`__TEMPLATE_PLACEHOLDER__`;

// Where the focus goes when the settings open, and back from "Manage by site".
export const SETTINGS_TITLE = '#settings-title';
export const MANAGE_SITES_BUTTON = '.settings-panel__manage-sites';

const SYNCED_WITH: Record<BrowserName, string> = {
  chrome: 'your Chrome profile',
  firefox: 'your Firefox account',
};

const SYNC_HINT: Record<BrowserName, string> = {
  chrome: 'On every computer you sign in to. Up to about 100 KB of notes.',
  firefox: 'On every computer you sign in to, with Add-ons on in Firefox sync. Up to about 100 KB of notes.',
};

const AREA_VALUES: StorageAreaName[] = ['local', 'sync'];

function areaOptions(browser: BrowserName): Omit<IAreaOption, 'checked'>[] {
  return [
    { value: 'local', label: 'On this device', hint: 'Up to 10 MB of notes.' },
    { value: 'sync', label: `Synced with ${SYNCED_WITH[browser]}`, hint: SYNC_HINT[browser] },
  ];
}

function success(area: StorageAreaName): string {
  return area === 'local'
    ? 'Your notes are now kept on this device.'
    : `Your notes now sync with ${SYNCED_WITH[chromeApiService.browser()]}.`;
}

export interface ISettingsPanelOptions {
  // "Manage by site": the sidebar shows that page instead.
  onManageSites?: () => void;
}

export class SettingsPanelComponent extends AppComponent<HTMLElement, ISettingsPanelView> {
  private _deleteData: DeleteDataComponent | null = null;
  private _backupData: BackupDataComponent | null = null;
  private _onManageSites: () => void;

  constructor(mountTarget: HTMLElement, { onManageSites = () => {} }: ISettingsPanelOptions = {}) {
    super({ templateFn, mountTarget, config: SettingsPanelComponent.viewOf(false, null) });
    this._onManageSites = onManageSites;
    // Also follows a change made in another window.
    this.listen('storage-area-changed', () => this.setBusy(false));
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return [
      { selector: 'delete-data', factory: (el) => (this._deleteData = new DeleteDataComponent(el)), keep: 'delete-data' },
      { selector: 'backup-data', factory: (el) => (this._backupData = new BackupDataComponent(el)), keep: 'backup-data' },
    ];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    this._deleteData?.update({ busy: this.config.busy });
    this._backupData?.update({ busy: this.config.busy });
  }

  private static viewOf(busy: boolean, pending: StorageAreaName | null): ISettingsPanelView {
    // While asking, the choice just made stays shown.
    const selected = pending ?? settingsService.storageArea;
    const browser = chromeApiService.browser();
    return {
      busy,
      pending,
      browser,
      syncedWith: SYNCED_WITH[browser],
      areas: areaOptions(browser).map((area) => ({ ...area, checked: area.value === selected })),
    };
  }

  private _setArea(value: string): void {
    const area = AREA_VALUES.find((option) => option === value);
    if (!area) return;
    this.rerender(SettingsPanelComponent.viewOf(false, area === settingsService.storageArea ? null : area));
    this.areaRadio(area).focus();
  }

  private async _apply(): Promise<void> {
    if (this.config.pending) await this.migrate(this.config.pending);
  }

  private _cancel(): void {
    this.setBusy(false);
    this.areaRadio(settingsService.storageArea).focus();
  }

  private async migrate(area: StorageAreaName): Promise<void> {
    this.setBusy(true);
    try {
      await scopeStoreService.migrateTo(area);
      notifierService.success(success(area));
    } catch (error) {
      notifierService.error(failureMessage('Couldn\'t move your notes and to-dos.', error));
    } finally {
      // Back to the area actually in use, whether the move worked or not.
      this.setBusy(false);
      if (!this.isDestroyed) this.areaRadio(settingsService.storageArea).focus();
    }
  }

  private _manageSites(): void {
    this._onManageSites();
  }

  private async _openChromeSettings(url: string): Promise<void> {
    await runAction('Couldn\'t open Chrome\'s settings.', () => chromeApiService.openTab(url));
  }

  private setBusy(busy: boolean): void {
    this.rerender(SettingsPanelComponent.viewOf(busy, null));
  }

  private areaRadio(area: StorageAreaName): HTMLInputElement {
    return requireElement(this.element, `input[name="storage-area"][value="${area}"]`);
  }
}
