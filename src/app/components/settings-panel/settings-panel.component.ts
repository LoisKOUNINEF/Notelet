import { Component, html, raw } from '../../../core/index.js';
import { chromeApiService } from '../../services/chrome-api/chrome-api.service.js';
import { notesStoreService } from '../../services/notes-store/notes-store.service.js';
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
}

const templateFn = ({ areas, busy }: ISettingsPanelView) => html`__TEMPLATE_PLACEHOLDER__`;

const AREAS: Omit<IAreaOption, 'checked'>[] = [
  { value: 'local', label: 'On this device', hint: 'Up to 10 MB of notes.' },
  { value: 'sync', label: 'Synced with your Chrome profile', hint: 'On every computer you sign in to. Up to about 100 KB of notes.' },
];

const SUCCESS: Record<StorageAreaName, string> = {
  local: 'Your notes are now kept on this device.',
  sync: 'Your notes now sync with your Chrome profile.',
};

export class SettingsPanelComponent extends Component<HTMLElement, ISettingsPanelView> {
  constructor(mountTarget: HTMLElement) {
    super({ templateFn, mountTarget, config: SettingsPanelComponent.view(false) });
    // Also follows a change made in another window.
    this.listen('storage-area-changed', () => this.setBusy(false));
  }

  private static view(busy: boolean): ISettingsPanelView {
    return {
      busy,
      areas: AREAS.map((area) => ({ ...area, checked: area.value === settingsService.storageArea })),
    };
  }

  private async _setArea(value: string): Promise<void> {
    const area = AREAS.find((option) => option.value === value)?.value;
    if (!area || area === settingsService.storageArea) return;

    this.setBusy(true);
    try {
      await notesStoreService.migrateTo(area);
      notifierService.success(SUCCESS[area]);
    } catch (error) {
      notifierService.error(error instanceof Error ? error.message : String(error));
    } finally {
      // Back to the area actually in use, whether the move worked or not.
      this.setBusy(false);
      this.element.querySelector<HTMLInputElement>(`input[value="${settingsService.storageArea}"]`)?.focus();
    }
  }

  private async _openChromeSettings(url: string): Promise<void> {
    await chromeApiService.openTab(url);
  }

  private setBusy(busy: boolean): void {
    this.config = SettingsPanelComponent.view(busy);
    this.render();
  }
}
