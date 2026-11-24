import { Component, html } from '../../../core/index.js';
import { announce } from '../../lib/announce.js';
import { formKeys, lineField, requireElement } from '../../lib/dom.js';
import { keepDraftsOf, setEditDraft } from '../../lib/drafts.js';
import { submitShortcut } from '../../lib/platform.js';
import { ChecklistFieldsComponent } from '../checklist-fields/checklist-fields.component.js';

// What an edit in progress holds, kept as a draft if the editor goes away unsaved.
export interface ITodoEditDraft {
  text: string;
  items: IChecklistItem[];
  // Items taken out of the checklist: single to-dos once saved.
  takenOut?: IChecklistItem[];
}

export interface ITodoEditorConfig {
  todo: ITodo;
  // An earlier, unsaved edit of this to-do to start from.
  draft?: ITodoEditDraft | null;
  // Items left empty are dropped; with none left, it's a single to-do again.
  // The ones taken out become single to-dos.
  onSave: (text: string, items: IChecklistItem[], takenOut: IChecklistItem[]) => void;
  onCancel: () => void;
}

interface ITodoEditorView {
  text: string;
  restored: boolean;
  // Has items: the name is a checklist's.
  hasItems: boolean;
  takenOut: IChecklistItem[];
}

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ text, restored, hasItems, takenOut }: ITodoEditorView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * A to-do in edit mode, single or checklist: its name, and one field per item
 * Adding an item to a single to-do makes it a checklist on save
 * Removing them all makes a checklist single.
 */
export class TodoEditorComponent extends Component<HTMLElement, ITodoEditorView> {
  private _text: string;
  private _fields: IChecklistItem[];
  private _takenOut: IChecklistItem[];
  private _onSave: ITodoEditorConfig['onSave'];
  private _onCancel: ITodoEditorConfig['onCancel'];
  private readonly _todo: ITodo;
  private readonly _restored: boolean;
  private _announced = false;
  // Saved or cancelled: nothing to keep when the editor goes away.
  private _closed = false;
  // Also kept when the panel closes (see keepDraftsOf).
  private readonly _stopKeeping = keepDraftsOf(() => this.saveDraft());
  private _checklist: ChecklistFieldsComponent | null = null;

  constructor(mountTarget: HTMLElement, { todo, draft, onSave, onCancel }: ITodoEditorConfig) {
    const text = draft?.text ?? todo.text;
    const fields = draft?.items ?? todo.items ?? [];
    const takenOut = draft?.takenOut ?? [];
    super({
      templateFn,
      mountTarget,
      props: { className: 'todo-editor' },
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

  // The to-do item closes the editor itself (save, cancel): no draft to keep.
  public close(): void {
    this._closed = true;
    setEditDraft('todo', this._todo.id, null);
  }

  // A save that failed: the edit is still open, and kept if the editor goes away.
  public reopen(): void {
    this._closed = false;
  }

  // Focuses the name, caret at the end.
  public focus(itemId?: string): void {
    const input = (itemId && this._checklist?.fieldOf(itemId)) || this.input;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  protected override onBeforeDestroy(): void {
    this._stopKeeping();
    this.saveDraft();
    super.onBeforeDestroy();
  }

  // The edit as a draft, unless closed (saved or cancelled), unchanged, or not rendered yet.
  private saveDraft(): void {
    if (this._closed || !this.element.querySelector('.todo-editor__input')) return;
    this.collect();
    const unchanged = this._text === this._todo.text && sameFields(this._fields, this._todo.items ?? []) && this._takenOut.length === 0;
    setEditDraft('todo', this._todo.id, unchanged ? null : { text: this._text, items: this._fields, takenOut: this._takenOut });
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // Enter in the name saves, as in a one-line field. Ctrl/Cmd+Enter saves and Escape cancels
    // from anywhere in the editor, buttons included.
    this.eventListeners.push(
      ...lineField(this.input),
      ...formKeys(requireElement<HTMLFormElement>(this.element, 'form'), { onEscape: () => this._cancel() }),
    );
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
        className: 'todo-editor__items',
        onEscape: () => this._cancel(),
        onLastRemoved: () => requireElement(this.element, '.todo-editor__add-item').focus(),
        onTakeOut: (item) => {
          this._takenOut = [...this._takenOut, item];
          this.refresh();
        },
        // The name's label says whether it's a checklist's.
        onChange: () => {
          if ((this.checklist.count > 0) !== this.config.hasItems) this.refresh();
        },
      })),
      keep: 'fields',
    }];
  }

  private get input(): HTMLTextAreaElement {
    return requireElement(this.element, '.todo-editor__input');
  }

  // Created with the first render, kept across the others.
  private get checklist(): ChecklistFieldsComponent {
    if (!this._checklist) throw new Error('The checklist fields are rendered with the editor.');
    return this._checklist;
  }

  // @ts-ignore : function used in HTML template
  private _addField(): void {
    this.checklist.add();
  }

  // @ts-ignore : function used in HTML template
  // "Put back": a taken-out item returns to the end of the fields.
  private _putBack(id: string): void {
    const item = this._takenOut.find((taken) => taken.id === id);
    if (!item) return;
    this._takenOut = this._takenOut.filter((taken) => taken.id !== id);
    this.refresh();
    this.checklist.add(item);
  }

  // @ts-ignore : function used in HTML template
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

  // Re-renders, with what's been typed in the name.
  // Items' fields are kept
  private refresh(): void {
    this.collect();
    this.config = { ...this.config, text: this._text, hasItems: this._fields.length > 0, takenOut: this._takenOut };
    this.render();
  }
}

function sameFields(a: IChecklistItem[], b: IChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]?.id && item.text === b[i]?.text);
}
