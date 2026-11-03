import { runAction } from '../../lib/actions.js';
import { announce } from '../../lib/announce.js';
import { applyRequestedFocus, byData, requestFocus } from '../../lib/focus.js';
import { ListReorder } from '../../lib/list-reorder.js';
import { plural } from '../../lib/plural.js';
import { keepUnchanged } from '../../lib/unchanged.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { countText, SelectionBarComponent } from '../selection-bar/selection-bar.component.js';
import { AppComponent } from './app-component.js';

// The footer's "Select" button, and each item's selection checkbox (see the items' templates).
export const SELECT_BUTTON = '[data-focus="select"]';
export const SELECT_BOX = '[data-select]';

// What a list tells its base about itself (see ReorderableList).
export interface IReorderableListSettings {
  kind: ScopeContentKind;
  scope: NoteScope;
  // The scope's key: where the order is saved.
  key: string;
  // The reorderable items' catalog, their grab handle, and the data attribute holding their id
  // (`note-id` for `data-note-id`).
  listSelector: string;
  handleSelector: string;
  idAttribute: string;
  draggingClass: string;
  // "Couldn't reorder the notes."
  failure: string;
  // Where "Move to this site/page" sends selected items.
  keys: IScopeKeys;
  // How an item is named in messages: "note", "to-do".
  noun: string;
  // Where the focus goes once the list has no items left: its composer's input.
  composerInput: string;
  // Why "Move" is unavailable, shown while selectionMovable() says so.
  moveBlockedHint?: string;
}

/**
 * One options object per combination, reused across renders: a catalog keeps an item only while
 * its options are the same object. Picking an item up changes them (the items are rebuilt with
 * its state): the stable combinations are kept, and the current grab's alone.
 */
export class ItemOptionsCache<O> {
  private readonly _cache = new Map<string, O>();

  // How many are kept (they mustn't pile up as items are picked up).
  public get size(): number {
    return this._cache.size;
  }

  public get(parts: Array<string | boolean>, grabbedId: string | null, create: () => O): O {
    const key = `${parts.join('|')}|${grabbedId}`;
    let options = this._cache.get(key);
    if (!options) {
      for (const cached of this._cache.keys()) {
        if (!cached.endsWith('|null')) this._cache.delete(cached);
      }
      options = create();
      this._cache.set(key, options);
    }
    return options;
  }
}

/**
 * A scope's notes or to-dos, kept by the sidebar across its renders and handed new items through
 * update(): the items that didn't change are kept (and an edit in progress with them). Its items
 * are reordered by their handles (see ListReorder); updates arriving during a gesture are held
 * until it ends. Its "Select" button lets several items be picked, then deleted or moved to the
 * tab's other scope at once (see SelectionBarComponent); reordering is off meanwhile.
 */
export abstract class ReorderableList<T extends IScopeItem, V> extends AppComponent<HTMLElement, V> {
  protected items: T[];
  protected readonly reorder: ListReorder;
  private readonly _settings: IReorderableListSettings;
  // Handed over by update() while a gesture runs, applied once it ends.
  private _held: T[] | null = null;
  // Multi-select: the ids picked, null while not selecting. The items read it through isSelected()
  // and report changes through onSelect(), which patch the bar without re-rendering.
  protected selection: Set<string> | null = null;
  private _selectionBar: SelectionBarComponent | null = null;
  // A new bar each time selecting starts (a kept one would show the previous round's state).
  private _selectionRound = 0;

  constructor(options: Nutin.ComponentOptions, items: T[], settings: IReorderableListSettings) {
    super(options);
    this.items = items;
    this._settings = settings;
    this.reorder = new ListReorder({
      root: this.element,
      listSelector: settings.listSelector,
      handleSelector: settings.handleSelector,
      idAttribute: settings.idAttribute,
      draggingClass: settings.draggingClass,
      ids: () => this.shownIds(),
      textOf: (id) => {
        const item = this.items.find((candidate) => candidate.id === id);
        return item ? this.labelOf(item) : '';
      },
      preview: () => this.refresh(),
      commit: (order, movedId) => this.saveOrder(order, movedId),
      settle: (saved) => this.applyHeld(saved),
    });
  }

  // The view to render: the items, in the order a grab in progress shows (reorder.previewOrder).
  protected abstract view(): V;
  // The reorderable items' ids, in the order shown.
  protected abstract shownIds(): string[];
  // How an item is named while it's moved.
  protected abstract labelOf(item: T): string;
  // The items as they'll come back once `order` (the reorderable ones' ids) is saved.
  protected abstract reordered(items: T[], order: string[]): T[];

  public update(items: T[]): void {
    if (this.reorder.active) {
      this._held = items;
      return;
    }
    if (items === this.items) return;
    this.items = keepUnchanged(this.items, items);
    // Deleted or moved meanwhile (in another window too): no longer selected.
    if (this.selection) {
      const ids = new Set(this.items.map((item) => item.id));
      for (const id of this.selection) if (!ids.has(id)) this.selection.delete(id);
    }
    this.refresh();
  }

  protected get selecting(): boolean {
    return this.selection !== null;
  }

  // Handed to the items: the same functions on every render, so the catalog keeps them.
  protected readonly isSelected = (id: string): boolean => this.selection?.has(id) ?? false;

  protected readonly onSelect = (id: string, checked: boolean): void => {
    if (!this.selection) return;
    if (checked) this.selection.add(id);
    else this.selection.delete(id);
    this.syncSelectionBar();
    announce(countText(this.selection.size, this._settings.noun));
  };

  // Whether the selected items can be moved (Move is disabled otherwise, with moveBlockedHint).
  protected selectionMovable(_items: T[]): boolean {
    return true;
  }

  // The bar shown in the footer while selecting.
  protected selectionBarChild(): Nutin.ComponentConfig {
    const { noun, moveBlockedHint, scope } = this._settings;
    return {
      selector: 'selection-bar',
      factory: (el) => (this._selectionBar = new SelectionBarComponent(el, {
        noun,
        target: scope === 'page' ? 'site' : 'page',
        moveBlockedHint: moveBlockedHint ?? '',
        onDelete: () => void this.deleteSelected(),
        onMove: () => void this.moveSelected(),
        onCancel: () => this.stopSelecting([SELECT_BUTTON]),
      })),
      keep: `selection-${this._selectionRound}`,
    };
  }

  // The footer's "Select" button: each item gets a checkbox, the first one focused.
  protected _select(): void {
    this.selection = new Set();
    this._selectionRound++;
    requestFocus(SELECT_BOX);
    this.refresh();
  }

  private stopSelecting(focus: string[] = []): void {
    this.selection = null;
    this._selectionBar = null;
    if (focus.length > 0) requestFocus(...focus);
    this.refresh();
  }

  // Back to what was selected, after a delete or a move that failed.
  private resumeSelecting(ids: Set<string>, focus: string): void {
    if (this.isDestroyed) return;
    this.selection = new Set(this.items.filter((item) => ids.has(item.id)).map((item) => item.id));
    this._selectionRound++;
    requestFocus(focus, SELECT_BOX);
    this.refresh();
  }

  private selectedItems(): T[] {
    const selection = this.selection;
    return selection ? this.items.filter((item) => selection.has(item.id)) : [];
  }

  // Left right away (the bar goes), then saved: the list re-renders without them, focus on Select.
  private async deleteSelected(): Promise<void> {
    const { kind, noun, composerInput } = this._settings;
    const picked = this.selectedItems();
    if (picked.length === 0) return;
    const ids = new Set(picked.map((item) => item.id));
    this.stopSelecting();
    const deleted = await runAction(`Couldn't delete the ${noun}s.`, async () => {
      await scopeStoreService.removeMany(kind, picked);
      return true;
    }, {
      focus: [SELECT_BUTTON, composerInput],
      onError: () => this.resumeSelecting(ids, '[data-focus="selection-delete"]'),
    });
    if (deleted) {
      notifierService.undoable(`${plural(picked.length, noun)} deleted.`, () => scopeStoreService.restoreMany(kind, picked), `Couldn't restore the ${noun}s.`);
    }
  }

  private async moveSelected(): Promise<void> {
    const { kind, noun, keys, scope, composerInput } = this._settings;
    const picked = this.selectedItems();
    if (picked.length === 0 || !this.selectionMovable(picked)) return;
    const ids = new Set(picked.map((item) => item.id));
    const target = scope === 'page' ? 'site' : 'page';
    this.stopSelecting();
    const moved = await runAction(`Couldn't move the ${noun}s.`, () => scopeStoreService.moveMany(kind, picked, keys), {
      focus: [SELECT_BUTTON, composerInput],
      onError: () => this.resumeSelecting(ids, '[data-focus="selection-move"]'),
    });
    if (moved && moved.length > 0) {
      notifierService.undoable(
        `Moved ${plural(moved.length, noun)} to this ${target}.`,
        () => scopeStoreService.moveManyBack(kind, moved, picked),
        `Couldn't move the ${noun}s back.`,
        'success'
      );
    }
  }

  private syncSelectionBar(): void {
    if (!this.selection || !this._selectionBar) return;
    const picked = this.selectedItems();
    this._selectionBar.update(picked.length, picked.length > 0 && !this.selectionMovable(picked));
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // Delegated from the handles (inside the items): Nutin unbinds them with its own on re-render.
    for (const [type, listener] of this.reorder.listeners()) {
      this.element.addEventListener(type, listener);
      this.eventListeners.push([this.element, type, listener]);
    }
    if (this.selection) {
      // Before the focus is applied: the bar's buttons are disabled until it runs.
      this.syncSelectionBar();
      const onKeydown: EventListener = (event) => {
        const { key, target, defaultPrevented } = event as KeyboardEvent;
        // Left to editors and fields (Escape cancels an edit there).
        if (key !== 'Escape' || defaultPrevented || (target as Element).closest('textarea, input:not([type="checkbox"])')) return;
        event.preventDefault();
        this.stopSelecting([SELECT_BUTTON]);
      };
      this.element.addEventListener('keydown', onKeydown);
      this.eventListeners.push([this.element, 'keydown', onKeydown]);
    }
    applyRequestedFocus(this.element);
  }

  protected override onBeforeDestroy(): void {
    this.reorder.dispose();
    super.onBeforeDestroy();
  }

  protected refresh(): void {
    this.rerender(this.view());
  }

  // Shown right away in the new order (the stored list then comes back the same), focus on the
  // moved item's handle; put back if the save fails.
  private async saveOrder(order: string[], movedId: string): Promise<boolean> {
    const { kind, scope, key, idAttribute, handleSelector, failure } = this._settings;
    const previous = this.items;
    const saved = await runAction(failure, async () => {
      this.items = this.reordered(previous, order);
      this.refresh();
      await scopeStoreService.reorder(kind, scope, key, order);
      return true;
    }, {
      focus: [`${byData(idAttribute, movedId)} ${handleSelector}`],
      onError: () => {
        this.items = previous;
        this.refresh();
      },
    });
    return saved ?? false;
  }

  // After a saved reorder, what was held predates it: the reload our write triggers brings the
  // stored list (other windows' changes included). Otherwise the held update is the latest.
  private applyHeld(saved: boolean): void {
    const held = this._held;
    this._held = null;
    if (held && !saved) this.update(held);
  }
}
