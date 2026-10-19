import { Component, html, raw } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';
import { ListReorder } from '../../lib/list-reorder.js';
import { applyRequestedFocus, byData, clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { TodoComposerComponent } from '../todo-composer/todo-composer.component.js';
import { TodoItemComponent, type ITodoItemOptions } from '../todo-item/todo-item.component.js';

export interface ITodoListConfig {
  scope: NoteScope;
  keys: IScopeKeys;
  todos: ITodo[];
}

interface ITodoListView {
  open: ITodo[];
  done: ITodo[];
  expanded: boolean;
  label: string;
}

const templateFn = ({ open, done, expanded, label }: ITodoListView) => html`__TEMPLATE_PLACEHOLDER__`;


/**
 * One scope's to-dos: its quick add on top (like the note composer), the open ones, then the
 * done ones in a "Done (n)" group, collapsed or not as last left (a setting shared by every
 * page). Like the note list, the
 * sidebar keeps it across renders and hands it new to-dos through update(): unchanged items
 * and the quick add's text are kept. Open to-dos are reordered by their handles (see ListReorder).
 */
export class TodoListComponent extends Component<HTMLElement, ITodoListView> {
  private _scope: NoteScope;
  private _key: string;
  private _keys: IScopeKeys;
  private _todos: ITodo[];
  // One options object per combination, reused across renders: items are only kept while their
  // options are unchanged (picking a to-do up changes them: the open ones are rebuilt with its state).
  private readonly _itemOptions = new Map<string, ITodoItemOptions>();
  // Handed over by update() while a reorder gesture runs, applied once it ends.
  private _held: ITodo[] | null = null;
  private readonly _reorder = new ListReorder({
    root: this.element,
    listSelector: '[data-catalog="open-todos"]',
    handleSelector: '.todo-item__handle',
    idAttribute: 'todo-id',
    draggingClass: 'todo-list__item--dragging',
    ids: () => this.config.open.map((todo) => todo.id),
    // Only ever asked about the to-dos it shows.
    textOf: (id) => this._todos.find((todo) => todo.id === id)!.text,
    preview: () => this.refresh(),
    commit: (order, movedId) => this.saveOrder(order, movedId),
    settle: (saved) => this.applyHeld(saved),
  });

  constructor(mountTarget: HTMLElement, { scope, keys, todos }: ITodoListConfig) {
    super({ templateFn, mountTarget, config: TodoListComponent.view(scope, todos, null) });
    this._scope = scope;
    this._key = keys[scope];
    this._keys = keys;
    this._todos = todos;
    // Opened or closed in another window: follow it.
    this.listen('settings-changed', () => {
      if (this.config.expanded !== settingsService.doneExpanded && !this._reorder.active) this.refresh();
    });
  }

  private itemOptions(group: ITodoItemOptions['group'], reorderable: boolean, grabbedId: string | null): ITodoItemOptions {
    const id = `${group}|${reorderable}|${grabbedId}`;
    let options = this._itemOptions.get(id);
    if (!options) {
      // Kept: the stable combinations, and the current grab's (an earlier grab's would pile up).
      for (const cached of this._itemOptions.keys()) {
        if (!cached.endsWith('|null')) this._itemOptions.delete(cached);
      }
      options = { group, reorderable, grabbedId, keys: this._keys };
      this._itemOptions.set(id, options);
    }
    return options;
  }

  private static view(scope: NoteScope, todos: ITodo[], order: string[] | null): ITodoListView {
    const open = todos.filter((todo) => !todo.done);
    return {
      // While a to-do is picked up, the order it's being moved through.
      open: order ? order.map((id) => open.find((todo) => todo.id === id)!) : open,
      done: todos.filter((todo) => todo.done),
      expanded: settingsService.doneExpanded,
      label: scope === 'page' ? 'To-dos for this page' : 'To-dos for this site',
    };
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    const { open, done } = this.config;
    const reorderable = open.length > 1;
    const catalog = (group: ITodoItemOptions['group'], items: ITodo[], options: ITodoItemOptions) => this.createCatalogComponents({
      items,
      selector: `${group}-todos`,
      elementName: `${group}-todo`,
      elementTag: 'li',
      component: TodoItemComponent,
      props: options,
      // An unchanged to-do keeps its item (and an edit in progress); a changed one has a new updatedAt.
      keepBy: (todo: ITodo) => todo.id,
    });

    return [
      ...catalog('open', open, this.itemOptions('open', reorderable, this._reorder.grabbedId)),
      ...catalog('done', done, this.itemOptions('done', false, null)),
      { selector: 'todo-composer', factory: (el) => new TodoComposerComponent(el, { scope: this._scope, key: this._key }), keep: 'composer' },
    ];
  }

  public update(todos: ITodo[]): void {
    if (this._reorder.active) {
      this._held = todos;
      return;
    }
    if (todos === this._todos) return;
    this._todos = todos;
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

  private async saveOrder(order: string[], movedId: string): Promise<boolean> {
    // Shown right away in the new order; the stored list then comes back the same.
    const previous = this._todos;
    this._todos = [
      ...order.map((id, position) => ({ ...previous.find((todo) => todo.id === id)!, position })),
      ...previous.filter((todo) => todo.done),
    ];
    requestFocus(`${byData('todo-id', movedId)} .todo-item__handle`);
    this.refresh();
    try {
      await scopeStoreService.reorder('todos', this._scope, this._key, order);
      return true;
    } catch (error) {
      this._todos = previous;
      this.refresh();
      notifierService.error(`Couldn't reorder the to-dos. ${errorMessage(error)}`);
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

  private async _toggleDone(): Promise<void> {
    requestFocus('.todo-list__done-toggle');
    try {
      // Re-rendered by `settings-changed`, as in every other window.
      await settingsService.setDoneExpanded(!settingsService.doneExpanded);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't save that setting. ${errorMessage(error)}`);
    }
  }

  // No confirmation: it can be undone, like deleting a single to-do.
  private async _deleteDone(): Promise<void> {
    const done = this.config.done;
    // The group goes away with its last to-do.
    requestFocus('.todo-composer__input');
    try {
      await scopeStoreService.removeMany('todos', done);
      notifierService.info(`${done.length} done ${done.length === 1 ? 'to-do' : 'to-dos'} deleted.`, {
        label: 'Undo',
        run: () => void scopeStoreService.restoreMany('todos', done).catch((error) => {
          notifierService.error(`Couldn't restore the to-dos. ${errorMessage(error)}`);
        }),
      });
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't delete the done to-dos. ${errorMessage(error)}`);
    }
  }

  private async _deleteAll(): Promise<void> {
    const count = this._todos.length;
    const confirmed = await confirmService.ask({
      title: `Delete all to-dos for this ${this._scope}?`,
      message: `${count} ${count === 1 ? 'to-do' : 'to-dos'}, done ones included.`,
      confirmLabel: 'Delete all',
    });
    if (!confirmed) return;

    requestFocus('.todo-composer__input');
    try {
      const removed = await scopeStoreService.removeAll('todos', this._scope, this._key);
      notifierService.info(`${removed.length} ${removed.length === 1 ? 'to-do' : 'to-dos'} deleted.`, {
        label: 'Undo',
        run: () => void scopeStoreService.restoreMany('todos', removed).catch((error) => {
          notifierService.error(`Couldn't restore the to-dos. ${errorMessage(error)}`);
        }),
      });
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't delete the to-dos. ${errorMessage(error)}`);
    }
  }

  private refresh(): void {
    this.config = TodoListComponent.view(this._scope, this._todos, this._reorder.previewOrder);
    this.render();
  }
}
