import { Component, html } from '../../../core/index.js';
import { announce } from '../../lib/announce.js';
import { setEditDraft } from '../../lib/drafts.js';
import { byData } from '../../lib/focus.js';
import { parseChecklist, withIds } from '../../lib/checklist.js';
import { ChecklistFieldComponent, type IChecklistFieldOptions } from '../checklist-field/checklist-field.component.js';

// What an edit in progress holds, kept as a draft if the editor goes away unsaved.
export interface INoteEditDraft {
  text: string;
  items: IChecklistItem[];
}

export interface INoteEditorConfig {
  note: INote;
  // An earlier, unsaved edit of this note to start from.
  draft?: INoteEditDraft | null;
  onSave: (text: string, items: IChecklistItem[]) => void;
  onCancel: () => void;
}

interface INoteEditorView {
  text: string;
  hasItems: boolean;
  restored: boolean;
}

const templateFn = ({ text, hasItems, restored }: INoteEditorView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * A note in edit mode: its text, and one field per checklist item (rename, remove, add).
 * Checklist lines typed in the text ("- [ ] item") become items too when it's saved.
 */
export class NoteEditorComponent extends Component<HTMLElement, INoteEditorView> {
  private _text: string;
  private _fields: IChecklistItem[];
  private _onSave: INoteEditorConfig['onSave'];
  private _onCancel: INoteEditorConfig['onCancel'];
  private readonly _note: INote;
  private readonly _restored: boolean;
  private _announced = false;
  // Saved or cancelled: nothing to keep when the editor goes away.
  private _closed = false;
  private readonly _fieldOptions: IChecklistFieldOptions = {
    onEnter: (id) => this.insertFieldAfter(id),
    onRemove: (id) => this.removeField(id),
    onEscape: () => this._cancel(),
  };

  constructor(mountTarget: HTMLElement, { note, draft, onSave, onCancel }: INoteEditorConfig) {
    const text = draft?.text ?? note.text;
    const fields = draft?.items ?? note.items ?? [];
    super({ templateFn, mountTarget, config: { text, hasItems: fields.length > 0, restored: !!draft } });
    this._note = note;
    this._restored = !!draft;
    this._text = text;
    this._fields = fields;
    this._onSave = onSave;
    this._onCancel = onCancel;
  }

  // The note item closes the editor itself (save, cancel): from then on there's no draft to keep.
  public close(): void {
    this._closed = true;
    setEditDraft('note', this._note.id, null);
  }

  // A save that failed: the edit is still open, and kept again if the editor goes away.
  public reopen(): void {
    this._closed = false;
  }

  protected override onBeforeDestroy(): void {
    if (!this._closed) {
      this.collect();
      const unchanged = this._text === this._note.text && sameFields(this._fields, this._note.items ?? []);
      setEditDraft('note', this._note.id, unchanged ? null : { text: this._text, items: this._fields });
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
    // Rebuilt from _fields on every render (each one's number changes as fields come and go).
    return this.createCatalogComponents({
      items: this._fields,
      selector: 'fields',
      elementName: 'field',
      elementTag: 'li',
      component: ChecklistFieldComponent,
      props: this._fieldOptions,
    });
  }

  // Focuses the text, caret at the end, where one usually continues a note.
  public focus(): void {
    const input = this.textarea;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private get textarea(): HTMLTextAreaElement {
    return this.element.querySelector<HTMLTextAreaElement>('.note-editor__input')!;
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.element.querySelector('form')!.requestSubmit();
    } else if (event.key === 'Escape') {
      // Don't let Escape also reach the panel (it would close an open overlay).
      event.stopPropagation();
      this._cancel();
    }
  }

  private _addField(): void {
    this.collect();
    const field = newField();
    this._fields = [...this._fields, field];
    this.refresh();
    this.focusField(field.id);
  }

  private insertFieldAfter(id: string): void {
    this.collect();
    const field = newField();
    const index = this._fields.findIndex((f) => f.id === id);
    this._fields = [...this._fields.slice(0, index + 1), field, ...this._fields.slice(index + 1)];
    this.refresh();
    this.focusField(field.id);
  }

  private removeField(id: string): void {
    this.collect();
    const index = this._fields.findIndex((f) => f.id === id);
    this._fields = this._fields.filter((f) => f.id !== id);
    this.refresh();
    const previous = this._fields[Math.max(0, index - 1)];
    if (previous) this.focusField(previous.id);
    else this.element.querySelector<HTMLElement>('.note-editor__add-item')!.focus();
  }

  private _save(): void {
    this.collect();
    const parsed = parseChecklist(this._text);
    const items = [
      ...this._fields.map((f) => ({ ...f, text: f.text.trim() })).filter((f) => f.text),
      ...withIds(parsed.items),
    ];
    // Nothing left to keep: deleting a note is its own action.
    if (!parsed.text && items.length === 0) return;
    this._onSave(parsed.text, items);
  }

  private _cancel(): void {
    this._onCancel();
  }

  // What's been typed, back into the state, before a render rebuilds the fields.
  private collect(): void {
    this._text = this.textarea.value;
    this._fields = this._fields.map((field) => ({
      ...field,
      // Every field is rendered.
      text: this.element.querySelector<HTMLInputElement>(`${byData('item-id', field.id)} .checklist-field__input`)!.value,
    }));
  }

  private refresh(): void {
    this.config = { text: this._text, hasItems: this._fields.length > 0, restored: this._restored };
    this.render();
  }

  private focusField(id: string): void {
    this.element.querySelector<HTMLInputElement>(`${byData('item-id', id)} .checklist-field__input`)!.focus();
  }
}

function sameFields(a: IChecklistItem[], b: IChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]!.id && item.text === b[i]!.text);
}

function newField(): IChecklistItem {
  return { id: crypto.randomUUID(), text: '', done: false };
}
