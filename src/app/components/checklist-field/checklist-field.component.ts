import { Component, html } from '../../../core/index.js';

// What the note editor passes to each field (see createCatalogComponents).
export interface IChecklistFieldOptions {
  onEnter: (id: string) => void;
  onRemove: (id: string) => void;
  onEscape: () => void;
}

interface IChecklistFieldView {
  item: IChecklistItem;
  number: number;
}

const templateFn = ({ item, number }: IChecklistFieldView) => html`__TEMPLATE_PLACEHOLDER__`;

// One checklist item while its note is edited: its text, and a way to remove it.
export class ChecklistFieldComponent extends Component<HTMLElement, IChecklistFieldView> {
  private _id: string;
  private _options: IChecklistFieldOptions;

  constructor(mountTarget: HTMLElement, config: IChecklistItem & { index: number }, options: IChecklistFieldOptions) {
    const { index, ...item } = config;
    super({ templateFn, mountTarget, props: { className: 'checklist-field' }, config: { item, number: index + 1 } });
    // Lets the editor read this field back, and focus it (see NoteEditorComponent).
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
}
