import { removeOverlaysWithin } from 'a11y-elements/core';
import { Component, html } from '../../../core/index.js';
import { confirmService, type IConfirmDialog, type IConfirmOptions } from '../../services/confirm/confirm.service.js';

const templateFn = ({ title, message, confirmLabel }: IConfirmOptions) => html`__TEMPLATE_PLACEHOLDER__`;

const MODAL_ID = 'confirm-dialog';

/**
 * The confirmation popup behind confirmService.ask(): an <a11y-modal> with Cancel (focused
 * first, so a stray Enter cancels) and a confirm button. Closing it any other way (Escape, a click
 * outside, its ×) is a Cancel too.
 *
 * Like the "⋯" menus, the modal moves itself to <body> once connected: it's removed with this
 * component's own wrapper, found again by id, and its clicks are delegated from it.
 */
export class ConfirmDialogComponent extends Component<HTMLElement, IConfirmOptions> implements IConfirmDialog {
  // The answer of the question being asked, if one is.
  private _answer: ((confirmed: boolean) => void) | null = null;
  private readonly _detach: () => void;

  constructor(mountTarget: HTMLElement) {
    super({ templateFn, mountTarget, config: { title: '', message: '', confirmLabel: '' } });
    this._detach = confirmService.attach(this);
  }

  public ask(options: IConfirmOptions): Promise<boolean> {
    // A question still open is dropped: cancelled.
    this.answer(false);
    this.config = options;
    this.render();
    const modal = this.modal!;
    return new Promise((resolve) => {
      this._answer = resolve;
      modal.open = true;
      modal.querySelector<HTMLElement>('.confirm-dialog__cancel')!.focus();
    });
  }

  protected override onBeforeRender(): void {
    this.removeOwnOverlays();
    super.onBeforeRender();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    const modal = this.modal;
    if (!modal) return;
    const onClick = (event: Event) => {
      const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'confirm') this.close(true);
      else if (action === 'cancel') this.close(false);
    };
    // Escape, the backdrop, the ×: the modal closed itself, without an answer.
    const onOverlayClose = () => {
      if (!modal.open) this.answer(false);
    };
    modal.addEventListener('click', onClick);
    document.addEventListener('a11y-overlay-close', onOverlayClose);
    this.eventListeners.push([modal, 'click', onClick], [document, 'a11y-overlay-close', onOverlayClose]);
  }

  protected override onBeforeDestroy(): void {
    this.answer(false);
    this._detach();
    this.removeOwnOverlays();
    super.onBeforeDestroy();
  }

  private get modal(): (HTMLElement & { open: boolean }) | null {
    return document.getElementById(MODAL_ID) as (HTMLElement & { open: boolean }) | null;
  }

  // Answers first: the close event that follows then finds nothing left to cancel.
  private close(confirmed: boolean): void {
    this.answer(confirmed);
    const modal = this.modal;
    if (modal) modal.open = false;
  }

  private answer(confirmed: boolean): void {
    const answer = this._answer;
    this._answer = null;
    answer?.(confirmed);
  }

  private removeOwnOverlays(): void {
    const own = this.element.querySelector('.confirm-dialog__overlays');
    if (own) removeOverlaysWithin(own);
  }
}
