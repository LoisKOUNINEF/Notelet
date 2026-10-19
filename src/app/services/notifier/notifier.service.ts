import { notify, type NotifyOptions } from 'a11y-elements/overlays/snackbar';
import { Service } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';

export interface INotifyAction {
  label: string;
  run: () => void;
}

/**
 * Toasts in an <a11y-snackbar> region: announced to screen readers, dismissed on their own,
 * paused while hovered or focused. Errors use role="alert".
 */
export class NotifierService extends Service<NotifierService> {
  // a11y-elements' notify(), behind a field tests can replace (jsdom doesn't upgrade the snackbar there).
  private _notify: typeof notify = notify;

  constructor() {
    super();
  }

  public info(message: string, action?: INotifyAction): void {
    this.show(message, { type: 'info' }, action);
  }

  public success(message: string, action?: INotifyAction): void {
    this.show(message, { type: 'success' }, action);
  }

  /**
   * What was just done, with an "Undo" running `undo`. If that fails, an error says so:
   * `failure` ("Couldn't restore the note.") followed by the reason.
   */
  public undoable(message: string, undo: () => Promise<unknown>, failure: string, type: 'info' | 'success' = 'info'): void {
    this.show(message, { type }, {
      label: 'Undo',
      run: () => void undo().catch((error: unknown) => this.error(`${failure} ${errorMessage(error)}`)),
    });
  }

  public error(message: string): void {
    this.show(message, { type: 'error', duration: 6000 });
  }

  private show(message: string, options: NotifyOptions, action?: INotifyAction): void {
    this._notify(message, action ? { ...options, actionText: action.label, onAction: action.run } : options);
  }
}

export const notifierService = NotifierService.getInstance();
