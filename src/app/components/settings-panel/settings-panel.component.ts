import { Component, html, raw } from '../../../core/index.js';
import { chromeApiService } from '../../services/chrome-api/chrome-api.service.js';
import { errorMessage } from '../../lib/errors.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
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
  // Leaving sync removes the synced copy on every device: asked first.
  confirming: boolean;
}

const templateFn = ({ areas, busy, confirming }: ISettingsPanelView) => html`__TEMPLATE_PLACEHOLDER__`;

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
    super({ templateFn, mountTarget, config: SettingsPanelComponent.view(false, false) });
    // Also follows a change made in another window.
    this.listen('storage-area-changed', () => this.setBusy(false));
  }

  private static view(busy: boolean, confirming: boolean): ISettingsPanelView {
    // While asking, the choice just made stays shown.
    const selected = confirming ? 'local' : settingsService.storageArea;
    return {
      busy,
      confirming,
      areas: AREAS.map((area) => ({ ...area, checked: area.value === selected })),
    };
  }

  private async _setArea(value: string): Promise<void> {
    const area = AREAS.find((option) => option.value === value)?.value;
    if (!area || area === settingsService.storageArea) return;
    if (area === 'local') {
      this.config = SettingsPanelComponent.view(false, true);
      this.render();
      this.element.querySelector<HTMLElement>('.settings-panel__confirm')!.focus();
      return;
    }
    await this.migrate(area);
  }

  private async _confirmLocal(): Promise<void> {
    await this.migrate('local');
  }

  private _cancelLocal(): void {
    this.setBusy(false);
    this.element.querySelector<HTMLInputElement>('input[value="sync"]')!.focus();
  }

  private async migrate(area: StorageAreaName): Promise<void> {
    this.setBusy(true);
    try {
      await scopeStoreService.migrateTo(area);
      notifierService.success(SUCCESS[area]);
    } catch (error) {
      notifierService.error(errorMessage(error));
    } finally {
      // Back to the area actually in use, whether the move worked or not.
      this.setBusy(false);
      this.element.querySelector<HTMLInputElement>(`input[value="${settingsService.storageArea}"]`)?.focus();
    }
  }

  private async _deleteEverything(): Promise<void> {
    const synced = settingsService.storageArea === 'sync';
    const confirmed = await confirmService.ask({
      title: 'Delete all your notes and to-dos?',
      message: `This can't be undone.${synced ? ' They\'ll also be removed from your other computers.' : ''}`,
      confirmLabel: 'Delete everything',
    });
    if (!confirmed) return;

    try {
      await scopeStoreService.clearEverything();
      notifierService.success('All your notes and to-dos were deleted.');
    } catch (error) {
      notifierService.error(`Couldn't delete your notes. ${errorMessage(error)}`);
    }
  }

  private async _openChromeSettings(url: string): Promise<void> {
    try {
      await chromeApiService.openTab(url);
    } catch (error) {
      notifierService.error(`Couldn't open Chrome's settings. ${errorMessage(error)}`);
    }
  }

  private setBusy(busy: boolean): void {
    this.config = SettingsPanelComponent.view(busy, false);
    this.render();
  }
}
