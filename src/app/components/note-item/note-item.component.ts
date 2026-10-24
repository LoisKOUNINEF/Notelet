import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { editOnClick } from '../../lib/card-click.js';
import { requireElement } from '../../lib/dom.js';
import { getEditDraft } from '../../lib/drafts.js';
import { byData } from '../../lib/focus.js';
import { formatDateTime, formatTimeAgo } from '../../lib/pipes.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { ItemMenuComponent } from '../item-menu/item-menu.component.js';
import { NOTE_COMPOSER_INPUT } from '../note-composer/note-composer.component.js';
import { NoteEditorComponent, type INoteEditDraft } from '../note-editor/note-editor.component.js';

interface INoteItemView {
  note: INote;
  editing: boolean;
  edited: boolean;
  reorderable: boolean;
  grabbed: boolean;
  // How the handle and the "⋯" trigger name this note (see noteLabel).
  name: string;
  // Folding would hide something (its text under a name, or lines after the first).
  canCollapse: boolean;
  collapsed: boolean;
  // Its text's first line: all an unnamed note shows when folded.
  summary: string;
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

const templateFn = ({ note, editing, edited, reorderable, grabbed, name, canCollapse, collapsed, summary }: INoteItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One note: its name if it has one, its text, when it was last edited, and its actions (Edit,
 * Delete, and the rest in a "⋯" menu). A click on it opens it for editing too, like Edit. Its arrow
 * folds it down to its name, or its first line (saved on the note). Edit mode swaps all that for
 * the note editor in place; the list then keeps it as-is while other notes change.
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
      config: NoteItemComponent.viewOf(note, options, getEditDraft('note', note.id) !== null),
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

  private static viewOf(note: INote, options: INoteItemOptions, editing: boolean): INoteItemView {
    const lines = note.text.split('\n').filter((line) => line.trim());
    const canCollapse = note.name ? lines.length > 0 : lines.length > 1;
    return {
      canCollapse,
      collapsed: canCollapse && !!note.collapsed,
      summary: (lines[0] ?? '').trim(),
      note,
      editing,
      edited: note.updatedAt !== note.createdAt,
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
          onSave: (text, name) => void this.save(text, name),
          onCancel: () => this.cancel(),
        })),
      }];
    }
    return [{
      selector: 'item-menu',
      factory: (el) => new ItemMenuComponent(el, {
        id: `note-${this._note.id}`,
        name: this.config.name,
        actions: [{ value: 'move', label: `Move to this ${this._note.scope === 'page' ? 'site' : 'page'}` }],
        onAction: () => void this.move(),
      }),
    }];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    if (!this.config.editing) this.eventListeners.push(editOnClick(this.element, () => this._edit()));
  }

  private _edit(): void {
    this.setView(true);
    this._editor?.focus();
  }

  private cancel(): void {
    this._editor?.close();
    this.setView(false);
    requireElement(this.element, '.note-item__edit').focus();
  }

  // Folded right away; the stored note then comes back as a new list item, focus on its arrow.
  private async _toggleCollapsed(): Promise<void> {
    const collapsed = !this.config.collapsed;
    this.config = { ...this.config, collapsed };
    this.render();
    this.element.querySelector<HTMLElement>('.note-item__toggle')?.focus();
    await runAction('Couldn\'t update the note.', () => scopeStoreService.setCollapsed('notes', this._note, collapsed), {
      focus: [this.own('.note-item__toggle')],
      onError: () => {
        this.config = { ...this.config, collapsed: !collapsed };
        this.render();
      },
    });
  }

  private async save(text: string, name: string): Promise<void> {
    if (text === this._note.text && name === (this._note.name ?? '')) {
      this.cancel();
      return;
    }

    // The saved note comes back through `scope-content-changed` as a new list item, in view mode:
    // this one goes away with no draft to keep.
    this._editor?.close();
    // No name: none stored (storage drops `undefined`).
    await runAction('Couldn\'t save the note.', () => scopeStoreService.update('notes', this._note, { text, name: name || undefined }), {
      focus: [this.own('.note-item__edit')],
      onError: () => this._editor?.reopen(),
    });
  }

  private async move(): Promise<void> {
    const note = this._note;
    const target = note.scope === 'page' ? 'site' : 'page';
    const moved = await runAction('Couldn\'t move the note.', () => scopeStoreService.move('notes', note, this._options.keys), {
      focus: this.focusAfterLeaving(),
    });
    if (moved) {
      notifierService.undoable(`Moved to this ${target}'s notes.`, () => scopeStoreService.moveBack('notes', moved, note), 'Couldn\'t move the note back.', 'success');
    }
  }

  private async _delete(): Promise<void> {
    const note = this._note;
    const deleted = await runAction('Couldn\'t delete the note.', async () => {
      await scopeStoreService.remove('notes', note);
      return true;
    }, { focus: this.focusAfterLeaving() });
    if (deleted) notifierService.undoable('Note deleted.', () => scopeStoreService.restore('notes', note), 'Couldn\'t restore the note.');
  }

  // One of this note's controls, found again once the list has re-rendered it.
  private own(control: string): string {
    return `${byData('note-id', this._note.id)} ${control}`;
  }

  // Once this note leaves the list, the next one takes its index (applied once the list has
  // re-rendered); else the previous one, else the composer.
  private focusAfterLeaving(): string[] {
    return [
      `[data-index="${this._index}"] .note-item__edit`,
      `[data-index="${this._index - 1}"] .note-item__edit`,
      NOTE_COMPOSER_INPUT,
    ];
  }

  private setView(editing: boolean): void {
    this._editor = null;
    this.config = NoteItemComponent.viewOf(this._note, this._options, editing);
    this.render();
  }
}

// Longest name read out for a note: a long note would otherwise be read in full on every control.
const LABEL_LENGTH = 60;

/**
 * How a note is named by its controls (Edit/Delete descriptions, the handle, the "⋯" trigger)
 * and while it's moved: its name if it has one, else its text's first line, cut to a readable length.
 */
export function noteLabel(note: INote): string {
  const label = note.name || ((note.text ?? '').split('\n').find((line) => line.trim()) ?? '').trim() || 'Note';
  return label.length > LABEL_LENGTH ? `${label.slice(0, LABEL_LENGTH - 1).trimEnd()}…` : label;
}
