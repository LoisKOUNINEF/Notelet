import { Component, html } from '../../../core/index.js';
import { announce } from '../../lib/announce.js';
import { requireElement } from '../../lib/dom.js';
import { setEditDraft } from '../../lib/drafts.js';

// What an edit in progress holds, kept as a draft if the editor goes away unsaved.
export interface INoteEditDraft {
  text: string;
  name: string;
}

export interface INoteEditorConfig {
  note: INote;
  // An earlier, unsaved edit of this note to start from.
  draft?: INoteEditDraft | null;
  // `name` is trimmed: '' for no name.
  onSave: (text: string, name: string) => void;
  onCancel: () => void;
}

interface INoteEditorView {
  text: string;
  name: string;
  restored: boolean;
}

const templateFn = ({ text, name, restored }: INoteEditorView) => html`__TEMPLATE_PLACEHOLDER__`;

// A note in edit mode: its optional name and its text, in place of the note until saved or cancelled.
export class NoteEditorComponent extends Component<HTMLElement, INoteEditorView> {
  private _onSave: INoteEditorConfig['onSave'];
  private _onCancel: INoteEditorConfig['onCancel'];
  private readonly _note: INote;
  private readonly _restored: boolean;
  private _announced = false;
  // Saved or cancelled: nothing to keep when the editor goes away.
  private _closed = false;

  constructor(mountTarget: HTMLElement, { note, draft, onSave, onCancel }: INoteEditorConfig) {
    const text = draft?.text ?? note.text;
    const name = draft?.name ?? note.name ?? '';
    super({ templateFn, mountTarget, config: { text, name, restored: !!draft } });
    this._note = note;
    this._restored = !!draft;
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
      const text = this.textarea.value;
      const name = this.nameInput.value;
      const unchanged = text === this._note.text && name === (this._note.name ?? '');
      setEditDraft('note', this._note.id, unchanged ? null : { text, name });
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

  // Focuses the text, caret at the end, where one usually continues a note.
  public focus(): void {
    const input = this.textarea;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private get textarea(): HTMLTextAreaElement {
    return requireElement(this.element, '.note-editor__input');
  }

  private get nameInput(): HTMLInputElement {
    return requireElement(this.element, '.note-editor__name');
  }

  // In the name, Enter goes on to the text; Ctrl+Enter and Escape work as in the text.
  private _onNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      this.focus();
    } else {
      this._onKeydown(event);
    }
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      requireElement<HTMLFormElement>(this.element, 'form').requestSubmit();
    } else if (event.key === 'Escape') {
      // Don't let Escape also reach the panel (it would close an open overlay).
      event.stopPropagation();
      this._cancel();
    }
  }

  private _save(): void {
    const text = this.textarea.value.trim();
    // Nothing left to keep: deleting a note is its own action.
    if (!text) return;
    this._onSave(text, this.nameInput.value.trim());
  }

  private _cancel(): void {
    this._onCancel();
  }

}
