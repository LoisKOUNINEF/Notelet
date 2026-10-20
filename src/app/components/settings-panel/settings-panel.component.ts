import { Component, html, raw } from '../../../core/index.js';
import { chromeApiService } from '../../services/chrome-api/chrome-api.service.js';
import { errorMessage } from '../../lib/errors.js';
import { DeleteDataComponent } from '../delete-data/delete-data.component.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { settingsService } from '../../services/settings/settings.service.js';

interface IAreaOption {
  value: StorageAreaName;
  label: string;
  hint: string;
  checked: boolean;
}

interface ISettingsPanelView {
  areas: IAreaOption[];
  busy: boolean;
  // The option picked but not applied yet: the arrow keys check radios as they move, so picking
  // only previews; Apply (or "Remove synced copy", when leaving sync) moves the notes.
  pending: StorageAreaName | null;
  // Says "Chrome profile" or "Firefox account", and where each browser's settings are.
  browser: BrowserName;
  syncedWith: string;
}

const templateFn = ({ areas, busy, pending, browser, syncedWith }: ISettingsPanelView) => html`__TEMPLATE_PLACEHOLDER__`;

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

export class SettingsPanelComponent extends Component<HTMLElement, ISettingsPanelView> {
  private _deleteData: DeleteDataComponent | null = null;
  private _onManageSites: () => void;
  // Closed (destroyed): a move between storage areas ending later mustn't re-render it.
  private _destroyed = false;

  constructor(mountTarget: HTMLElement, { onManageSites = () => {} }: ISettingsPanelOptions = {}) {
    super({ templateFn, mountTarget, config: SettingsPanelComponent.view(false, null) });
    this._onManageSites = onManageSites;
    // Also follows a change made in another window.
    this.listen('storage-area-changed', () => this.setBusy(false));
  }

  // Kept across this panel's renders (the storage-area switch): its age and counts stay.
  public override registerChildren(): Nutin.ComponentConfig[] {
    return [{ selector: 'delete-data', factory: (el) => (this._deleteData = new DeleteDataComponent(el)), keep: 'delete-data' }];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    this._deleteData?.update({ busy: this.config.busy });
  }

  private static view(busy: boolean, pending: StorageAreaName | null): ISettingsPanelView {
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

  // Picked (by click or with the arrows): shown, with the step that applies it below; focus stays
  // on the radio so the arrows keep working. The area in use picked again: nothing pending.
  private _setArea(value: string): void {
    const area = AREA_VALUES.find((option) => option === value);
    if (!area) return;
    this.config = SettingsPanelComponent.view(false, area === settingsService.storageArea ? null : area);
    this.render();
    this.element.querySelector<HTMLInputElement>(`input[value="${area}"]`)!.focus();
  }

  private async _apply(): Promise<void> {
    if (this.config.pending) await this.migrate(this.config.pending);
  }

  private _cancel(): void {
    this.setBusy(false);
    this.element.querySelector<HTMLInputElement>(`input[value="${settingsService.storageArea}"]`)!.focus();
  }

  private async migrate(area: StorageAreaName): Promise<void> {
    this.setBusy(true);
    try {
      await scopeStoreService.migrateTo(area);
      notifierService.success(success(area));
    } catch (error) {
      notifierService.error(errorMessage(error));
    } finally {
      // Back to the area actually in use, whether the move worked or not.
      this.setBusy(false);
      this.element.querySelector<HTMLInputElement>(`input[value="${settingsService.storageArea}"]`)?.focus();
    }
  }

  private _manageSites(): void {
    this._onManageSites();
  }

  private async _openChromeSettings(url: string): Promise<void> {
    try {
      await chromeApiService.openTab(url);
    } catch (error) {
      notifierService.error(`Couldn't open Chrome's settings. ${errorMessage(error)}`);
    }
  }

  protected override onBeforeDestroy(): void {
    this._destroyed = true;
    super.onBeforeDestroy();
  }

  // A destroyed panel would recreate its delete section, which nothing would then ever destroy.
  private setBusy(busy: boolean): void {
    if (this._destroyed) return;
    this.config = SettingsPanelComponent.view(busy, null);
    this.render();
  }
}
