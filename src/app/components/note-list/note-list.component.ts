import { Component, html } from '../../../core/index.js';
import { applyRequestedFocus } from '../../lib/focus.js';
import { NoteItemComponent, type INoteItemOptions } from '../note-item/note-item.component.js';

export interface INoteListConfig {
  scope: NoteScope;
  keys: IScopeKeys;
  notes: INote[];
}

interface INoteListView {
  notes: INote[];
  label: string;
  emptyText: string;
}

const templateFn = ({ notes, label, emptyText }: INoteListView) => html`__TEMPLATE_PLACEHOLDER__`;

const EMPTY_TEXT: Record<NoteScope, string> = {
  page: 'No notes for this page yet.',
  site: 'No notes for this site yet.',
};

/**
 * The notes of one scope. The sidebar keeps this list across its own renders and hands it
 * new notes through update(): only the notes that changed are re-created, so a note being
 * edited keeps its draft while another one is added or deleted.
 */
export class NoteListComponent extends Component<HTMLElement, INoteListView> {
  private _scope: NoteScope;
  private _notes: INote[];
  private readonly _itemOptions: INoteItemOptions;

  constructor(mountTarget: HTMLElement, { scope, keys, notes }: INoteListConfig) {
    super({ templateFn, mountTarget, config: NoteListComponent.view(scope, notes) });
    this._scope = scope;
    this._notes = notes;
    // One object for every render: items are only kept while their options are unchanged.
    this._itemOptions = { keys };
  }

  private static view(scope: NoteScope, notes: INote[]): INoteListView {
    return {
      notes,
      label: scope === 'page' ? 'Notes for this page' : 'Notes for this site',
      emptyText: EMPTY_TEXT[scope],
    };
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return this.createCatalogComponents({
      items: this._notes,
      selector: 'notes',
      elementName: 'note',
      elementTag: 'li',
      component: NoteItemComponent,
      props: this._itemOptions,
      // An unchanged note keeps its item (and an edit in progress); an edited one has a new updatedAt.
      keepBy: (note: INote) => note.id,
    });
  }

  public update(notes: INote[]): void {
    if (notes === this._notes) return;
    // Every change to a note gives it a new updatedAt. An unchanged one keeps its previous object, so
    // the catalog (which compares items shallowly, and a note holds its checklist array) keeps it.
    const previous = new Map(this._notes.map((note) => [note.id, note]));
    this._notes = notes.map((note) => {
      const kept = previous.get(note.id);
      return kept && kept.updatedAt === note.updatedAt ? kept : note;
    });
    this.config = NoteListComponent.view(this._scope, notes);
    this.render();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    applyRequestedFocus(this.element);
  }
}
