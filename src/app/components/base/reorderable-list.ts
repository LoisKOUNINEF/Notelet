import { runAction } from '../../lib/actions.js';
import { applyRequestedFocus, byData } from '../../lib/focus.js';
import { ListReorder } from '../../lib/list-reorder.js';
import { keepUnchanged } from '../../lib/unchanged.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { AppComponent } from './app-component.js';

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
 * until it ends.
 */
export abstract class ReorderableList<T extends IScopeItem, V> extends AppComponent<HTMLElement, V> {
  protected items: T[];
  protected readonly reorder: ListReorder;
  private readonly _settings: IReorderableListSettings;
  // Handed over by update() while a gesture runs, applied once it ends.
  private _held: T[] | null = null;

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
    this.refresh();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // Delegated from the handles (inside the items): Nutin unbinds them with its own on re-render.
    for (const [type, listener] of this.reorder.listeners()) {
      this.element.addEventListener(type, listener);
      this.eventListeners.push([this.element, type, listener]);
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
