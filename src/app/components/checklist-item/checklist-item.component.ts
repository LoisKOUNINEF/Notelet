import { Component, html, raw } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';
import { clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';

// What the note passes to each of its checklist items (see createCatalogComponents).
export interface IChecklistItemOptions {
  note: INote;
}

interface IChecklistItemView {
  item: IChecklistItem;
}

const templateFn = ({ item }: IChecklistItemView) => html`__TEMPLATE_PLACEHOLDER__`;

// One item of a note's checklist, checked right from the note. Checked items stay in place.
export class ChecklistItemComponent extends Component<HTMLElement, IChecklistItemView> {
  private _item: IChecklistItem;
  private _note: INote;

  constructor(mountTarget: HTMLElement, config: IChecklistItem & { index: number }, options: IChecklistItemOptions) {
    const { index: _index, ...item } = config;
    super({
      templateFn,
      mountTarget,
      props: { className: item.done ? 'checklist-item checklist-item--done' : 'checklist-item' },
      config: { item },
    });
    // Lets the note find this item's checkbox again after it re-renders (see requestFocus).
    this.element.dataset.itemId = item.id;
    this._item = item;
    this._note = options.note;
  }

  private async _toggle(done: boolean): Promise<void> {
    const id = this._item.id;
    requestFocus(`[data-note-id="${this._note.id}"] [data-item-id="${id}"] .checklist-item__checkbox`);
    try {
      // From the stored note: another item checked a moment ago isn't overwritten.
      await scopeStoreService.updateWith('notes', this._note, (current) => ({
        items: (current.items ?? []).map((item) => (item.id === id ? { ...item, done } : item)),
      }));
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't update the item. ${errorMessage(error)}`);
      this.render();
    }
  }
}
