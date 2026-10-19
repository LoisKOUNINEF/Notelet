import { Component, html } from '../../../core/index.js';
import { delegateActions, removeOverlays } from '../../lib/overlays.js';
import { confirmService, type IChoice, type IChooseOptions, type IConfirmDialog, type IConfirmOptions } from '../../services/confirm/confirm.service.js';

// A question to confirm (no choices), or one to choose from (no confirm button).
interface IConfirmDialogView {
  title: string;
  message: string;
  confirmLabel: string;
  choices: IChoice[];
}

const templateFn = ({ title, message, confirmLabel, choices }: IConfirmDialogView) => html`__TEMPLATE_PLACEHOLDER__`;

const MODAL_ID = 'confirm-dialog';

/**
 * The confirmation popup behind confirmService.ask(): an <a11y-modal> with Cancel (focused
 * first, so a stray Enter cancels) and a confirm button. Closing it any other way (Escape, a click
 * outside, its ×) is a Cancel too. confirmService.choose() shows a list of choices instead of the
 * confirm button, the first one focused.
 *
 * Like the "⋯" menus, the modal is an overlay on <body> (see lib/overlays.ts).
 */
export class ConfirmDialogComponent extends Component<HTMLElement, IConfirmDialogView> implements IConfirmDialog {
  // The answer of the question being asked, if one is: what was picked ('confirm' or a choice's
  // value), or null.
  private _answer: ((value: string | null) => void) | null = null;
  private readonly _detach: () => void;

  constructor(mountTarget: HTMLElement) {
    super({ templateFn, mountTarget, config: { title: '', message: '', confirmLabel: '', choices: [] } });
    this._detach = confirmService.attach(this);
  }

  public async ask(options: IConfirmOptions): Promise<boolean> {
    return (await this.open({ ...options, choices: [] }, '.confirm-dialog__cancel')) === 'confirm';
  }

  public choose(options: IChooseOptions): Promise<string | null> {
    return this.open({ ...options, confirmLabel: '' }, '.confirm-dialog__choice');
  }

  private open(view: IConfirmDialogView, focused: string): Promise<string | null> {
    // A question still open is dropped: cancelled.
    this.answer(null);
    this.config = view;
    this.render();
    const modal = this.modal!;
    return new Promise((resolve) => {
      this._answer = resolve;
      modal.open = true;
      modal.querySelector<HTMLElement>(focused)!.focus();
    });
  }

  protected override onBeforeRender(): void {
    removeOverlays(this.element, '.confirm-dialog__overlays');
    super.onBeforeRender();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    const modal = this.modal;
    const buttons = delegateActions(MODAL_ID, (action) => {
      if (action === 'cancel') this.close(null);
      else this.close(action.startsWith('choice:') ? action.slice('choice:'.length) : action);
    });
    if (!modal || !buttons) return;
    // Escape, the backdrop, the ×: the modal closed itself, without an answer.
    const onOverlayClose = () => {
      if (!modal.open) this.answer(null);
    };
    document.addEventListener('a11y-overlay-close', onOverlayClose);
    this.eventListeners.push(buttons, [document, 'a11y-overlay-close', onOverlayClose]);
  }

  protected override onBeforeDestroy(): void {
    this.answer(null);
    this._detach();
    removeOverlays(this.element, '.confirm-dialog__overlays');
    super.onBeforeDestroy();
  }

  private get modal(): (HTMLElement & { open: boolean }) | null {
    return document.getElementById(MODAL_ID) as (HTMLElement & { open: boolean }) | null;
  }

  // Answers first: the close event that follows then finds nothing left to cancel.
  private close(value: string | null): void {
    this.answer(value);
    const modal = this.modal;
    if (modal) modal.open = false;
  }

  private answer(value: string | null): void {
    const answer = this._answer;
    this._answer = null;
    answer?.(value);
  }
}
