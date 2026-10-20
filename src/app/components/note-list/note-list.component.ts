import { html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { plural } from '../../lib/plural.js';
import { inOrder } from '../../lib/unchanged.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { ItemOptionsCache, ReorderableList } from '../base/reorderable-list.js';
import { NOTE_COMPOSER_INPUT } from '../note-composer/note-composer.component.js';
import { NoteItemComponent, noteLabel, type INoteItemOptions } from '../note-item/note-item.component.js';

export interface INoteListConfig {
  scope: NoteScope;
  keys: IScopeKeys;
  notes: INote[];
}

interface INoteListView {
  notes: INote[];
  reorderable: boolean;
  label: string;
  emptyText: string;
}

const templateFn = ({ notes, reorderable, label, emptyText }: INoteListView) => html`__TEMPLATE_PLACEHOLDER__`;

const EMPTY_TEXT: Record<NoteScope, string> = {
  page: 'No notes for this page yet.',
  site: 'No notes for this site yet.',
};

/**
 * The notes of one scope. Only the notes that changed are re-created when new ones come in, so a
 * note being edited keeps its draft while another one is added or deleted (see ReorderableList).
 */
export class NoteListComponent extends ReorderableList<INote, INoteListView> {
  private readonly _scope: NoteScope;
  private readonly _key: string;
  private readonly _keys: IScopeKeys;
  private readonly _itemOptions = new ItemOptionsCache<INoteItemOptions>();

  constructor(mountTarget: HTMLElement, { scope, keys, notes }: INoteListConfig) {
    super({ templateFn, mountTarget, config: NoteListComponent.viewOf(scope, notes, null) }, notes, {
      kind: 'notes',
      scope,
      key: keys[scope],
      listSelector: '[data-catalog="notes"]',
      handleSelector: '.note-item__handle',
      idAttribute: 'note-id',
      draggingClass: 'note-list__item--dragging',
      failure: 'Couldn\'t reorder the notes.',
    });
    this._scope = scope;
    this._key = keys[scope];
    this._keys = keys;
  }

  private static viewOf(scope: NoteScope, notes: INote[], order: string[] | null): INoteListView {
    return {
      // While a note is picked up, the order it's being moved through.
      notes: order ? inOrder(notes, order) : notes,
      reorderable: notes.length > 1,
      label: scope === 'page' ? 'Notes for this page' : 'Notes for this site',
      emptyText: EMPTY_TEXT[scope],
    };
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    const { reorderable } = this.config;
    const grabbedId = this.reorder.grabbedId;
    return this.createCatalogComponents({
      items: this.config.notes,
      selector: 'notes',
      elementName: 'note',
      elementTag: 'li',
      component: NoteItemComponent,
      props: this._itemOptions.get([reorderable], grabbedId, () => ({ keys: this._keys, reorderable, grabbedId })),
      // An unchanged note keeps its item (and an edit in progress); an edited one has a new updatedAt.
      keepBy: (note: INote) => note.id,
    });
  }

  protected view(): INoteListView {
    return NoteListComponent.viewOf(this._scope, this.items, this.reorder.previewOrder);
  }

  protected shownIds(): string[] {
    return this.config.notes.map((note) => note.id);
  }

  protected labelOf(note: INote): string {
    return noteLabel(note);
  }

  protected reordered(notes: INote[], order: string[]): INote[] {
    return inOrder(notes, order);
  }

  private async _deleteAll(): Promise<void> {
    const confirmed = await confirmService.ask({
      title: `Delete all notes for this ${this._scope}?`,
      message: `${plural(this.items.length, 'note')}. You can undo this right after.`,
      confirmLabel: 'Delete all',
    });
    if (!confirmed) return;

    const removed = await runAction('Couldn\'t delete the notes.', () => scopeStoreService.removeAll('notes', this._scope, this._key), {
      focus: [NOTE_COMPOSER_INPUT],
    });
    if (removed) {
      notifierService.undoable(`${plural(removed.length, 'note')} deleted.`, () => scopeStoreService.restoreMany('notes', removed), 'Couldn\'t restore the notes.');
    }
  }
}
