import { notify, type NotifyOptions } from 'a11y-elements/overlays/snackbar';
import { Service } from '../../../core/index.js';

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

  public error(message: string): void {
    this.show(message, { type: 'error', duration: 6000 });
  }

  private show(message: string, options: NotifyOptions, action?: INotifyAction): void {
    this._notify(message, action ? { ...options, actionText: action.label, onAction: action.run } : options);
  }
}

export const notifierService = NotifierService.getInstance();
