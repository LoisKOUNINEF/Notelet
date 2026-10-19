import { Component, html } from '../../../core/index.js';
import { byData, clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { errorMessage } from '../../lib/errors.js';
import { delegateActions, removeOverlays } from '../../lib/overlays.js';
import { formatTimeAgo } from '../../lib/pipes.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { ChecklistItemComponent } from '../checklist-item/checklist-item.component.js';
import { NoteEditorComponent, type INoteEditDraft } from '../note-editor/note-editor.component.js';
import { getEditDraft } from '../../lib/drafts.js';

interface INoteItemView {
  note: INote;
  items: IChecklistItem[];
  editing: boolean;
  // "Add checklist" was used: the "Add an item" field shows before the first item exists.
  addingItem: boolean;
  edited: boolean;
  moveTarget: string;
  reorderable: boolean;
  grabbed: boolean;
  // How the handle and the "⋯" trigger name this note: its text, else its first item.
  name: string;
}

// What the note list passes to each item, besides the note (see createCatalogComponents).
export interface INoteItemOptions {
  // Where "Move to this site/page" sends it.
  keys: IScopeKeys;
  // Shows the grab handle (when there are at least two notes). The list runs the gestures.
  reorderable: boolean;
  // The note picked up with the keyboard, if any.
  grabbedId: string | null;
}

const templateFn = ({ note, items, editing, addingItem, edited, moveTarget, reorderable, grabbed, name }: INoteItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One note: its text, its checklist if it has one (checked and added to right here), when it
 * was last edited, and its actions (Edit, Delete, and the rest in a "⋯" menu). Edit mode swaps all
 * that for the note editor in place; the list then keeps it as-is while other notes change.
 */
export class NoteItemComponent extends Component<HTMLElement, INoteItemView> {
  private _note: INote;
  private _index: number;
  private _options: INoteItemOptions;
  private _editor: NoteEditorComponent | null = null;

  constructor(mountTarget: HTMLElement, config: INote & { index: number }, options: INoteItemOptions) {
    const { index, ...note } = config;
    // The item's own root is the <article>, directly inside the catalog's <li>.
    super({
      templateFn,
      mountTarget,
      tagName: 'article',
      props: { className: 'note-item' },
      // An edit left open when this note last went away comes back, still open.
      config: NoteItemComponent.view(note, options, getEditDraft('note', note.id) !== null, false),
    });
    // Lets the list find this note's controls again after it re-renders (see requestFocus).
    this.element.dataset.noteId = note.id;
    this._note = note;
    this._index = index;
    this._options = options;
    // Only its own <time> changes: an edit in progress isn't re-rendered away.
    this.listen('minute-tick', () => {
      const time = this.element.querySelector('.note-item__meta time');
      if (time) time.textContent = formatTimeAgo(this._note.updatedAt);
    });
  }

  private static view(note: INote, options: INoteItemOptions, editing: boolean, addingItem: boolean): INoteItemView {
    return {
      note,
      items: note.items ?? [],
      editing,
      addingItem,
      edited: note.updatedAt !== note.createdAt,
      moveTarget: note.scope === 'page' ? 'this site' : 'this page',
      reorderable: options.reorderable,
      grabbed: options.grabbedId === note.id,
      name: noteLabel(note),
    };
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    if (this.config.editing) {
      return [{
        selector: 'note-editor',
        factory: (el) => (this._editor = new NoteEditorComponent(el, {
          note: this._note,
          draft: getEditDraft<INoteEditDraft>('note', this._note.id),
          onSave: (text, items) => void this.save(text, items),
          onCancel: () => this.cancel(),
        })),
      }];
    }
    return this.createCatalogComponents({
      items: this.config.items,
      selector: 'checklist',
      elementName: 'checklist-item',
      elementTag: 'li',
      component: ChecklistItemComponent,
      props: { note: this._note },
    });
  }

  // The "⋯" menu is an overlay on <body> (see lib/overlays.ts).
  protected override onBeforeRender(): void {
    removeOverlays(this.element, '.note-item__overlays');
    super.onBeforeRender();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    const menu = delegateActions(`note-${this._note.id}-menu`, (action) => {
      if (action === 'move') void this.move();
      else if (action === 'add-checklist') this.addChecklist();
    });
    if (menu) this.eventListeners.push(menu);
  }

  protected override onBeforeDestroy(): void {
    removeOverlays(this.element, '.note-item__overlays');
    super.onBeforeDestroy();
  }

  private _edit(): void {
    this.setView(true, false);
    this._editor?.focus();
  }

  private cancel(): void {
    this._editor?.close();
    this.setView(false, false);
    this.element.querySelector<HTMLElement>('.note-item__edit')!.focus();
  }

  private addChecklist(): void {
    this.setView(false, true);
    this.element.querySelector<HTMLInputElement>('.note-item__add-item-input')!.focus();
  }

  private async _addItem(): Promise<void> {
    const input = this.element.querySelector<HTMLInputElement>('.note-item__add-item-input')!;
    const text = input.value.trim();
    if (!text) return;

    // The note comes back with the item as a new list item: focus the field again there.
    requestFocus(`${byData('note-id', this._note.id)} .note-item__add-item-input`);
    try {
      await scopeStoreService.updateWith('notes', this._note, (current) => ({
        items: [...(current.items ?? []), { id: crypto.randomUUID(), text, done: false }],
      }));
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't add the item. ${errorMessage(error)}`);
    }
  }

  private async save(text: string, items: IChecklistItem[]): Promise<void> {
    if (text === this._note.text && sameItems(items, this._note.items ?? [])) {
      this.cancel();
      return;
    }

    // The saved note comes back through `scope-content-changed` as a new list item, in view mode:
    // this one goes away with no draft to keep.
    this._editor?.close();
    requestFocus(`${byData('note-id', this._note.id)} .note-item__edit`);
    try {
      await scopeStoreService.update('notes', this._note, { text, items });
    } catch (error) {
      this._editor?.reopen();
      clearRequestedFocus();
      notifierService.error(`Couldn't save the note. ${errorMessage(error)}`);
    }
  }

  private async move(): Promise<void> {
    const target = this._note.scope === 'page' ? 'site' : 'page';
    this.requestFocusAfterLeaving();
    try {
      await scopeStoreService.move('notes', this._note, this._options.keys);
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
      await scopeStoreService.remove('notes', note);
      notifierService.undoable('Note deleted.', () => scopeStoreService.restore('notes', note), `Couldn't restore the note.`);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't delete the note. ${errorMessage(error)}`);
    }
  }

  // Once this note leaves the list, the next one takes its index (applied once the list has
  // re-rendered); else the previous one, else the composer.
  private requestFocusAfterLeaving(): void {
    requestFocus(
      `[data-index="${this._index}"] .note-item__edit`,
      `[data-index="${this._index - 1}"] .note-item__edit`,
      '.note-composer__input',
    );
  }

  private setView(editing: boolean, addingItem: boolean): void {
    this._editor = null;
    this.config = NoteItemComponent.view(this._note, this._options, editing, addingItem);
    this.render();
  }
}

function sameItems(a: IChecklistItem[], b: IChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]!.id && item.text === b[i]!.text && item.done === b[i]!.done);
}

// Longest name read out for a note: a long note would otherwise be read in full on every control.
const LABEL_LENGTH = 60;

/**
 * How a note is named by its controls (Edit/Delete descriptions, the handle, the "⋯" trigger)
 * and while it's moved: its text's first line, else its first item, cut to a readable length.
 */
export function noteLabel(note: INote): string {
  const label = ((note.text ?? '').split('\n').find((line) => line.trim()) ?? note.items?.[0]?.text ?? '').trim() || 'Note';
  return label.length > LABEL_LENGTH ? `${label.slice(0, LABEL_LENGTH - 1).trimEnd()}…` : label;
}
