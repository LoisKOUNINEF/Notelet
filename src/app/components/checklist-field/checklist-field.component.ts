import { Component, html } from '../../../core/index.js';

// What the field list passes to each field (see createCatalogComponents).
export interface IChecklistFieldOptions {
  onEnter: (id: string) => void;
  onRemove: (id: string) => void;
  onEscape: () => void;
  // Set when items can be taken out of the list (the list editor): shows "Take out".
  onTakeOut?: (id: string) => void;
}

interface IChecklistFieldView {
  item: IChecklistItem;
  number: number;
  canTakeOut: boolean;
}

const templateFn = ({ item, number, canTakeOut }: IChecklistFieldView) => html`__TEMPLATE_PLACEHOLDER__`;

// One item of a to-do list being written or edited: its text, a way to remove it, and (in the
// list editor) to take it out of the list.
export class ChecklistFieldComponent extends Component<HTMLElement, IChecklistFieldView> {
  private _id: string;
  private _options: IChecklistFieldOptions;

  constructor(mountTarget: HTMLElement, config: IChecklistItem & { index: number }, options: IChecklistFieldOptions) {
    const { index, ...item } = config;
    super({ templateFn, mountTarget, props: { className: 'checklist-field' }, config: { item, number: index + 1, canTakeOut: !!options.onTakeOut } });
    // Lets the field list read this field back, and focus it (see ChecklistFieldsComponent).
    this.element.dataset.itemId = item.id;
    this._id = item.id;
    this._options = options;
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      // Not the form's submit: the next item, like in any list editor.
      event.preventDefault();
      this._options.onEnter(this._id);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this._options.onEscape();
    }
  }

  private _remove(): void {
    this._options.onRemove(this._id);
  }

  private _takeOut(): void {
    this._options.onTakeOut?.(this._id);
  }
}
