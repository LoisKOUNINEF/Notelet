import { Service } from '../../../core/index.js';

export interface IConfirmOptions {
  title: string;
  message: string;
  // The confirm button's text, e.g. "Delete all".
  confirmLabel: string;
}

// What asks the question on screen (see ConfirmDialogComponent).
export interface IConfirmDialog {
  ask(options: IConfirmOptions): Promise<boolean>;
}

/**
 * Asks the user to confirm before something that can't easily be taken back, through the
 * confirmation dialog the sidebar mounts. Without one, the answer is "no": nothing is ever
 * done unconfirmed.
 */
export class ConfirmService extends Service<ConfirmService> {
  private _dialog: IConfirmDialog | null = null;

  constructor() {
    super();
  }

  // Returns a function that detaches it (only if it's still the one attached).
  public attach(dialog: IConfirmDialog): () => void {
    this._dialog = dialog;
    return () => {
      if (this._dialog === dialog) this._dialog = null;
    };
  }

  public ask(options: IConfirmOptions): Promise<boolean> {
    return this._dialog ? this._dialog.ask(options) : Promise.resolve(false);
  }
}

export const confirmService = ConfirmService.getInstance();
