import { Component, html } from '../../../core/index.js';
import { announce } from '../../lib/announce.js';
import { requireElement } from '../../lib/dom.js';
import { setEditDraft } from '../../lib/drafts.js';
import { ChecklistFieldsComponent } from '../checklist-fields/checklist-fields.component.js';

// What an edit in progress holds, kept as a draft if the editor goes away unsaved.
export interface IListEditDraft {
  text: string;
  items: IChecklistItem[];
  // Items taken out of the list: single to-dos once saved.
  takenOut?: IChecklistItem[];
}

export interface IListEditorConfig {
  todo: ITodo;
  // An earlier, unsaved edit of this list to start from.
  draft?: IListEditDraft | null;
  // Items left empty are dropped; with none left, it's a single to-do again. The ones taken out
  // become single to-dos.
  onSave: (text: string, items: IChecklistItem[], takenOut: IChecklistItem[]) => void;
  onCancel: () => void;
}

interface IListEditorView {
  text: string;
  restored: boolean;
  // Has items: the name is a list's.
  hasItems: boolean;
  takenOut: IChecklistItem[];
}

const templateFn = ({ text, restored, hasItems, takenOut }: IListEditorView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * A to-do in edit mode, single or list: its name, and one field per item (rename, remove, add,
 * take out; checked items stay checked). Adding an item to a single to-do makes it a list on save,
 * removing them all makes a list single. The to-do item shows it in place of its view.
 */
export class ListEditorComponent extends Component<HTMLElement, IListEditorView> {
  private _text: string;
  private _fields: IChecklistItem[];
  private _takenOut: IChecklistItem[];
  private _onSave: IListEditorConfig['onSave'];
  private _onCancel: IListEditorConfig['onCancel'];
  private readonly _todo: ITodo;
  private readonly _restored: boolean;
  private _announced = false;
  // Saved or cancelled: nothing to keep when the editor goes away.
  private _closed = false;
  private _checklist: ChecklistFieldsComponent | null = null;

  constructor(mountTarget: HTMLElement, { todo, draft, onSave, onCancel }: IListEditorConfig) {
    const text = draft?.text ?? todo.text;
    const fields = draft?.items ?? todo.items ?? [];
    const takenOut = draft?.takenOut ?? [];
    super({
      templateFn,
      mountTarget,
      props: { className: 'list-editor' },
      config: { text, restored: !!draft, hasItems: fields.length > 0, takenOut },
    });
    this._todo = todo;
    this._restored = !!draft;
    this._text = text;
    this._fields = fields;
    this._takenOut = takenOut;
    this._onSave = onSave;
    this._onCancel = onCancel;
  }

  // The to-do item closes the editor itself (save, cancel): from then on there's no draft to keep.
  public close(): void {
    this._closed = true;
    setEditDraft('todo', this._todo.id, null);
  }

  // A save that failed: the edit is still open, and kept again if the editor goes away.
  public reopen(): void {
    this._closed = false;
  }

  // Focuses the name, caret at the end.
  // On that item's field, if given and there, else on the name; the caret at the end.
  public focus(itemId?: string): void {
    const input = (itemId && this._checklist?.fieldOf(itemId)) || this.input;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  protected override onBeforeDestroy(): void {
    if (!this._closed) {
      this.collect();
      const unchanged = this._text === this._todo.text && sameFields(this._fields, this._todo.items ?? []) && this._takenOut.length === 0;
      setEditDraft('todo', this._todo.id, unchanged ? null : { text: this._text, items: this._fields, takenOut: this._takenOut });
    }
    super.onBeforeDestroy();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    if (this._restored && !this._announced) {
      this._announced = true;
      announce('Unsaved changes restored.');
    }
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return [{
      selector: 'checklist-fields',
      factory: (el) => (this._checklist = new ChecklistFieldsComponent(el, {
        items: this._fields,
        label: 'Items',
        caption: true,
        className: 'list-editor__items',
        onEscape: () => this._cancel(),
        onLastRemoved: () => requireElement(this.element, '.list-editor__add-item').focus(),
        onTakeOut: (item) => {
          this._takenOut = [...this._takenOut, item];
          this.refresh();
        },
        // The name's label says whether it's a list's.
        onChange: () => {
          if ((this.checklist.count > 0) !== this.config.hasItems) this.refresh();
        },
      })),
      keep: 'fields',
    }];
  }

  private get input(): HTMLInputElement {
    return requireElement(this.element, '.list-editor__input');
  }

  // Created with the first render (see registerChildren), kept across the others.
  private get checklist(): ChecklistFieldsComponent {
    if (!this._checklist) throw new Error('The checklist fields are rendered with the editor.');
    return this._checklist;
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    // Don't let Escape also reach the panel (it would close an open overlay).
    event.stopPropagation();
    this._cancel();
  }

  private _addField(): void {
    this.checklist.add();
  }

  // "Put back": a taken-out item returns to the end of the fields.
  private _putBack(id: string): void {
    const item = this._takenOut.find((taken) => taken.id === id);
    if (!item) return;
    this._takenOut = this._takenOut.filter((taken) => taken.id !== id);
    this.refresh();
    this.checklist.add(item);
  }

  private _save(): void {
    this.collect();
    const text = this._text.trim();
    if (!text) return;
    const kept = (items: IChecklistItem[]) => items.map((f) => ({ ...f, text: f.text.trim() })).filter((f) => f.text);
    this._onSave(text, kept(this._fields), kept(this._takenOut));
  }

  private _cancel(): void {
    this._onCancel();
  }

  // What's been typed, back into the state.
  private collect(): void {
    this._text = this.input.value;
    this._fields = this.checklist.values();
  }

  // Re-renders (the items' fields are kept), with what's been typed in the name.
  private refresh(): void {
    this.collect();
    this.config = { ...this.config, text: this._text, hasItems: this._fields.length > 0, takenOut: this._takenOut };
    this.render();
  }
}

function sameFields(a: IChecklistItem[], b: IChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]?.id && item.text === b[i]?.text);
}
