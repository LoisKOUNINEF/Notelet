import { html, raw } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { downloadFile } from '../../lib/download.js';
import { failureMessage } from '../../lib/errors.js';
import { renderKeepingFocus } from '../../lib/focus.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { MAX_BACKUP_SIZE, TOO_LARGE } from '../../services/scope-store/backup.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { InvalidBackupError } from '../../services/scope-store/store-errors.js';
import { AppComponent } from '../base/app-component.js';
import { countText } from '../delete-data/delete-data.component.js';

interface IBackupDataView {
  // Exporting or importing, or the notes moving between storage areas: the buttons are disabled.
  busy: boolean;
}

const templateFn = ({ busy }: IBackupDataView) => html`__TEMPLATE_PLACEHOLDER__`;

const IMPORT_FAILED = 'Couldn\'t import that file.';

// The controls whose focus survives a re-render (busy or not), in fallback order.
const FOCUSABLE = ['.backup-data__export', '.backup-data__import'];

export class BackupDataComponent extends AppComponent<HTMLElement, IBackupDataView> {
  // Disabled from outside: the settings moving the notes to another storage area.
  private _blocked = false;
  private _working = false;
  private _download: typeof downloadFile = downloadFile;

  constructor(mountTarget: HTMLElement) {
    super({ templateFn, mountTarget, config: { busy: false } });
  }

  public update({ busy }: { busy: boolean }): void {
    if (busy === this._blocked) return;
    this._blocked = busy;
    this.refresh();
  }

  private async _export(): Promise<void> {
    await this.work(async () => {
      const backup = await runAction('Couldn\'t export your notes.', () => scopeStoreService.exportAll());
      if (!backup) return;
      const lists = Object.entries(backup.lists);
      const counted = (kind: ScopeContentKind) => lists.filter(([key]) => key.startsWith(`${kind}:`)).reduce((sum, [, items]) => sum + items.length, 0);
      const counts = { notes: counted('notes'), todos: counted('todos') };
      if (counts.notes + counts.todos === 0) {
        notifierService.info('No notes or to-dos to export yet.');
        return;
      }
      this._download(`notelet-${localDate(new Date())}.json`, JSON.stringify(backup, null, 2), 'application/json');
      notifierService.success(`${countText(counts)} exported.`);
    });
  }

  // The visible button opens the file picker: a styled <input type="file"> reads poorly.
  private _pickFile(): void {
    this.element.querySelector<HTMLInputElement>('.backup-data__file')?.click();
  }

  private async _import(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Picking the same file again must fire `change` again.
    input.value = '';
    if (!file) return;
    // Refused before it's read: a huge file would freeze the panel.
    if (file.size > MAX_BACKUP_SIZE) {
      notifierService.error(failureMessage(IMPORT_FAILED, new InvalidBackupError(TOO_LARGE)));
      return;
    }

    const confirmed = await confirmService.ask({
      title: `Import “${file.name}”?`,
      message: 'Its notes and to-dos are added to yours. Where one is in both, the copy edited last is kept. Nothing is deleted.',
      confirmLabel: 'Import',
    });
    if (!confirmed) return;

    await this.work(async () => {
      const imported = await runAction(IMPORT_FAILED, async () => scopeStoreService.importAll(await file.text()));
      if (!imported) return;
      if (imported.notes + imported.todos === 0) notifierService.info('Nothing new to import: everything in that file is already here.');
      else notifierService.success(`${countText(imported)} imported.`);
    });
  }

  // Runs `task` with the buttons disabled, once at a time.
  private async work(task: () => Promise<void>): Promise<void> {
    if (this._working || this._blocked) return;
    this._working = true;
    this.refresh();
    try {
      await task();
    } finally {
      this._working = false;
      this.refresh();
    }
  }

  private refresh(): void {
    renderKeepingFocus(this.element, FOCUSABLE, () => this.rerender({ busy: this._working || this._blocked }));
  }
}

// In the user's time zone.
function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
