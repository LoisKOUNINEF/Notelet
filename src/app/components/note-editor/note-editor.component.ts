import { Component, html } from '../../../core/index.js';
import { announce } from '../../lib/announce.js';
import { setEditDraft } from '../../lib/drafts.js';
import { parseChecklist, withIds } from '../../lib/checklist.js';
import { ChecklistFieldsComponent } from '../checklist-fields/checklist-fields.component.js';

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
  restored: boolean;
}

const templateFn = ({ text, restored }: INoteEditorView) => html`__TEMPLATE_PLACEHOLDER__`;

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
  private _checklist: ChecklistFieldsComponent | null = null;

  constructor(mountTarget: HTMLElement, { note, draft, onSave, onCancel }: INoteEditorConfig) {
    const text = draft?.text ?? note.text;
    const fields = draft?.items ?? note.items ?? [];
    super({ templateFn, mountTarget, config: { text, restored: !!draft } });
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
    return [{
      selector: 'checklist-fields',
      factory: (el) => (this._checklist = new ChecklistFieldsComponent(el, {
        items: this._fields,
        label: 'Checklist items',
        className: 'note-editor__items',
        onEscape: () => this._cancel(),
        onLastRemoved: () => this.element.querySelector<HTMLElement>('.note-editor__add-item')!.focus(),
      })),
      keep: 'fields',
    }];
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
    this._checklist!.add();
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

  // What's been typed, back into the state.
  private collect(): void {
    this._text = this.textarea.value;
    this._fields = this._checklist!.values();
  }
}

function sameFields(a: IChecklistItem[], b: IChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]!.id && item.text === b[i]!.text);
}
