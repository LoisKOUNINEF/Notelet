import { Component, html } from '../../../core/index.js';
import { clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { notesStoreService } from '../../services/notes-store/notes-store.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';

interface INoteItemView {
  note: INote;
  editing: boolean;
  edited: boolean;
  moveTarget: string;
}

// What the note list passes to each item, besides the note (see createCatalogComponents).
export interface INoteItemOptions {
  keys: IScopeKeys;
}

const templateFn = ({ note, editing, edited, moveTarget }: INoteItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One note: its text, when it was last edited, and its actions. Edit mode swaps the text
 * for a textarea in place; the list then keeps it as-is while other notes change.
 */
export class NoteItemComponent extends Component<HTMLElement, INoteItemView> {
  private _note: INote;
  private _index: number;
  private _keys: IScopeKeys;

  constructor(mountTarget: HTMLElement, config: INote & { index: number }, options: INoteItemOptions) {
    const { index, ...note } = config;
    // The item's own root is the <article>, directly inside the catalog's <li>.
    super({
      templateFn,
      mountTarget,
      tagName: 'article',
      props: { className: 'note-item' },
      config: NoteItemComponent.view(note, false),
    });
    // Lets the list find this note's controls again after it re-renders (see requestFocus).
    this.element.dataset.noteId = note.id;
    this._note = note;
    this._index = index;
    this._keys = options.keys;
  }

  private static view(note: INote, editing: boolean): INoteItemView {
    return {
      note,
      editing,
      edited: note.updatedAt !== note.createdAt,
      moveTarget: note.scope === 'page' ? 'this site' : 'this page',
    };
  }

  private _edit(): void {
    this.setEditing(true);
    const input = this.element.querySelector<HTMLTextAreaElement>('.note-item__input');
    input?.focus();
    // Caret at the end, where one usually continues a note.
    input?.setSelectionRange(input.value.length, input.value.length);
  }

  private _cancel(): void {
    this.setEditing(false);
    this.element.querySelector<HTMLElement>('.note-item__edit')?.focus();
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.element.querySelector('form')?.requestSubmit();
    } else if (event.key === 'Escape') {
      // Don't let Escape also reach the panel (it would close an open overlay).
      event.stopPropagation();
      this._cancel();
    }
  }

  private async _save(): Promise<void> {
    const text = this.element.querySelector<HTMLTextAreaElement>('.note-item__input')?.value.trim() ?? '';
    if (!text) return;
    if (text === this._note.text) {
      this._cancel();
      return;
    }

    // The saved note comes back through `notes-changed` as a new list item, in view mode.
    requestFocus(`[data-note-id="${this._note.id}"] .note-item__edit`);
    try {
      await notesStoreService.update(this._note, text);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't save the note. ${errorMessage(error)}`);
    }
  }

  private async _move(): Promise<void> {
    const target = this._note.scope === 'page' ? 'site' : 'page';
    this.requestFocusAfterLeaving();
    try {
      await notesStoreService.move(this._note, this._keys);
      notifierService.success(`Moved to this ${target}'s notes.`);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't move the note. ${errorMessage(error)}`);
    }
  }

  private async _delete(): Promise<void> {
    const note = this._note;
    this.requestFocusAfterLeaving();
    try {
      await notesStoreService.remove(note);
      notifierService.info('Note deleted.', {
        label: 'Undo',
        run: () => void notesStoreService.restore(note).catch((error) => {
          notifierService.error(`Couldn't restore the note. ${errorMessage(error)}`);
        }),
      });
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't delete the note. ${errorMessage(error)}`);
    }
  }

  // Once this note leaves the list, the next one takes its index (applied once the list has re-rendered); else the previous one, else the composer.
  private requestFocusAfterLeaving(): void {
    requestFocus(
      `[data-index="${this._index}"] .note-item__edit`,
      `[data-index="${this._index - 1}"] .note-item__edit`,
      '.note-composer__input',
    );
  }

  private setEditing(editing: boolean): void {
    this.config = NoteItemComponent.view(this._note, editing);
    this.render();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
