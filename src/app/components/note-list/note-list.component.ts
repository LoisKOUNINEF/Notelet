import { Component, html } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';
import { applyRequestedFocus, byData, clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { ListReorder } from '../../lib/list-reorder.js';
import { plural } from '../../lib/plural.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
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
 * The notes of one scope. The sidebar keeps this list across its own renders and hands it
 * new notes through update(): only the notes that changed are re-created, so a note being
 * edited keeps its draft while another one is added or deleted. Notes are reordered by their
 * handles, like the open to-dos (see ListReorder).
 */
export class NoteListComponent extends Component<HTMLElement, INoteListView> {
  private _scope: NoteScope;
  private _key: string;
  private _keys: IScopeKeys;
  private _notes: INote[];
  // One options object per combination, reused across renders: items are only kept while their
  // options are unchanged (picking a note up changes them: the notes are rebuilt with its state).
  private readonly _itemOptions = new Map<string, INoteItemOptions>();
  // Handed over by update() while a reorder gesture runs, applied once it ends.
  private _held: INote[] | null = null;
  // Destroyed: async work finishing later (a save, a held update) mustn't re-render it.
  private _destroyed = false;
  private readonly _reorder = new ListReorder({
    root: this.element,
    listSelector: '[data-catalog="notes"]',
    handleSelector: '.note-item__handle',
    idAttribute: 'note-id',
    draggingClass: 'note-list__item--dragging',
    ids: () => this.config.notes.map((note) => note.id),
    // Only ever asked about the notes it shows.
    textOf: (id) => noteLabel(this._notes.find((note) => note.id === id)!),
    preview: () => this.refresh(),
    commit: (order, movedId) => this.saveOrder(order, movedId),
    settle: (saved) => this.applyHeld(saved),
  });

  constructor(mountTarget: HTMLElement, { scope, keys, notes }: INoteListConfig) {
    super({ templateFn, mountTarget, config: NoteListComponent.view(scope, notes, null) });
    this._scope = scope;
    this._key = keys[scope];
    this._keys = keys;
    this._notes = notes;
  }

  private static view(scope: NoteScope, notes: INote[], order: string[] | null): INoteListView {
    return {
      // While a note is picked up, the order it's being moved through.
      notes: order ? order.map((id) => notes.find((note) => note.id === id)!) : notes,
      reorderable: notes.length > 1,
      label: scope === 'page' ? 'Notes for this page' : 'Notes for this site',
      emptyText: EMPTY_TEXT[scope],
    };
  }

  private itemOptions(reorderable: boolean, grabbedId: string | null): INoteItemOptions {
    const id = `${reorderable}|${grabbedId}`;
    let options = this._itemOptions.get(id);
    if (!options) {
      // Kept: the stable combinations, and the current grab's (an earlier grab's would pile up).
      for (const cached of this._itemOptions.keys()) {
        if (!cached.endsWith('|null')) this._itemOptions.delete(cached);
      }
      options = { keys: this._keys, reorderable, grabbedId };
      this._itemOptions.set(id, options);
    }
    return options;
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return this.createCatalogComponents({
      items: this.config.notes,
      selector: 'notes',
      elementName: 'note',
      elementTag: 'li',
      component: NoteItemComponent,
      props: this.itemOptions(this.config.reorderable, this._reorder.grabbedId),
      // An unchanged note keeps its item (and an edit in progress); an edited one has a new updatedAt.
      keepBy: (note: INote) => note.id,
    });
  }

  public update(notes: INote[]): void {
    if (this._reorder.active) {
      this._held = notes;
      return;
    }
    if (notes === this._notes) return;
    // Every change to a note gives it a new updatedAt. An unchanged one keeps its previous object, so
    // the catalog (which compares items shallowly) keeps it.
    // Its position doesn't count: reordering alone keeps every item (and an edit in progress).
    const previous = new Map(this._notes.map((note) => [note.id, note]));
    this._notes = notes.map((note) => {
      const kept = previous.get(note.id);
      return kept && kept.updatedAt === note.updatedAt ? kept : note;
    });
    this.refresh();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // Delegated from the handles (inside the items): Nutin unbinds them with its own on re-render.
    for (const [type, listener] of this._reorder.listeners()) {
      this.element.addEventListener(type, listener);
      this.eventListeners.push([this.element, type, listener]);
    }
    applyRequestedFocus(this.element);
  }

  private async _deleteAll(): Promise<void> {
    const count = this._notes.length;
    const confirmed = await confirmService.ask({
      title: `Delete all notes for this ${this._scope}?`,
      message: `${plural(count, 'note')}. You can undo this right after.`,
      confirmLabel: 'Delete all',
    });
    if (!confirmed) return;

    requestFocus('.note-composer__input');
    try {
      const removed = await scopeStoreService.removeAll('notes', this._scope, this._key);
      notifierService.undoable(`${plural(removed.length, 'note')} deleted.`, () => scopeStoreService.restoreMany('notes', removed), `Couldn't restore the notes.`);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't delete the notes. ${errorMessage(error)}`);
    }
  }

  private async saveOrder(order: string[], movedId: string): Promise<boolean> {
    // Shown right away in the new order; the stored list then comes back the same.
    const previous = this._notes;
    this._notes = order.map((id) => previous.find((note) => note.id === id)!);
    requestFocus(`${byData('note-id', movedId)} .note-item__handle`);
    this.refresh();
    try {
      await scopeStoreService.reorder('notes', this._scope, this._key, order);
      return true;
    } catch (error) {
      this._notes = previous;
      this.refresh();
      notifierService.error(`Couldn't reorder the notes. ${errorMessage(error)}`);
      return false;
    }
  }

  // After a saved reorder, what was held predates it: the reload our write triggers brings the
  // stored list (other windows' changes included). Otherwise the held update is the latest.
  private applyHeld(saved: boolean): void {
    const held = this._held;
    this._held = null;
    if (held && !saved) this.update(held);
  }

  protected override onBeforeDestroy(): void {
    this._destroyed = true;
    this._reorder.dispose();
    super.onBeforeDestroy();
  }

  // A destroyed component would rebuild its items, which nothing would then ever destroy.
  private refresh(): void {
    if (this._destroyed) return;
    this.config = NoteListComponent.view(this._scope, this._notes, this._reorder.previewOrder);
    this.render();
  }
}

