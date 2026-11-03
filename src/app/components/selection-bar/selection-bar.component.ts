import { Component, html } from '../../../core/index.js';
import { plural } from '../../lib/plural.js';

export interface ISelectionBarConfig {
  // "note" or "to-do": names what's selected ("2 notes selected").
  noun: string;
  // Where Move sends the items: "site" or "page".
  target: NoteScope;
  // Shown under the actions while Move is unavailable, e.g. "Done to-dos can't be moved."
  moveBlockedHint: string;
  onDelete: () => void;
  onMove: () => void;
  onCancel: () => void;
}

interface ISelectionBarView {
  target: NoteScope;
  count: string;
  moveBlockedHint: string;
}

const templateFn = ({ target, count, moveBlockedHint }: ISelectionBarView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * What a list's footer shows while items are being selected: how many, and what to do with them
 * (Delete, Move to the tab's other scope, Cancel). The list keeps it while selecting and hands it
 * each new count through update(), which patches it in place: the focus stays on the checkbox
 * that was just toggled.
 */
export class SelectionBarComponent extends Component<HTMLElement, ISelectionBarView> {
  private readonly _bar: ISelectionBarConfig;

  constructor(mountTarget: HTMLElement, bar: ISelectionBarConfig) {
    super({
      templateFn,
      mountTarget,
      props: { className: 'selection-bar' },
      config: { target: bar.target, count: countText(0, bar.noun), moveBlockedHint: bar.moveBlockedHint },
    });
    this._bar = bar;
  }

  // The list calls it on every change and once it's rendered: a re-created bar shows the state too.
  public update(count: number, moveBlocked: boolean): void {
    const countEl = this.element.querySelector('.selection-bar__count');
    if (countEl) countEl.textContent = countText(count, this._bar.noun);
    this.element.querySelector('.selection-bar__delete')?.toggleAttribute('disabled', count === 0);
    this.element.querySelector('.selection-bar__move')?.toggleAttribute('disabled', count === 0 || moveBlocked);
    const hint = this.element.querySelector<HTMLElement>('.selection-bar__hint');
    if (hint) hint.hidden = !moveBlocked;
  }

  private _delete(): void {
    this._bar.onDelete();
  }

  private _move(): void {
    this._bar.onMove();
  }

  private _cancel(): void {
    this._bar.onCancel();
  }
}

export function countText(count: number, noun: string): string {
  return `${plural(count, noun)} selected`;
}
