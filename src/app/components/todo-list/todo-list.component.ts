import { html, raw } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { plural } from '../../lib/plural.js';
import { inOrder } from '../../lib/unchanged.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { ItemOptionsCache, ReorderableList } from '../base/reorderable-list.js';
import { TODO_COMPOSER_INPUT, TodoComposerComponent } from '../todo-composer/todo-composer.component.js';
import { TodoItemComponent, type ITodoItemOptions } from '../todo-item/todo-item.component.js';
import { DONE_TOGGLE, todoCatalog } from './todo-list.selectors.js';

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
  emptyText: string;
}

const templateFn = ({ open, done, expanded, label, emptyText }: ITodoListView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One scope's to-dos: its quick add on top (like the note composer), the open ones, then the
 * done ones in a "Done (n)" group, collapsed or not as last left (a setting shared by every
 * page). Unchanged items and the quick add's text are kept as new to-dos come in; open to-dos are
 * reordered by their handles (see ReorderableList).
 */
export class TodoListComponent extends ReorderableList<ITodo, ITodoListView> {
  private readonly _scope: NoteScope;
  private readonly _key: string;
  private readonly _keys: IScopeKeys;
  private readonly _itemOptions = new ItemOptionsCache<ITodoItemOptions>();

  constructor(mountTarget: HTMLElement, { scope, keys, todos }: ITodoListConfig) {
    super({ templateFn, mountTarget, config: TodoListComponent.viewOf(scope, todos, null) }, todos, {
      kind: 'todos',
      scope,
      key: keys[scope],
      listSelector: todoCatalog('open'),
      handleSelector: '.todo-item__handle',
      idAttribute: 'todo-id',
      draggingClass: 'todo-list__item--dragging',
      failure: 'Couldn\'t reorder the to-dos.',
    });
    this._scope = scope;
    this._key = keys[scope];
    this._keys = keys;
    // Opened or closed in another window: follow it.
    this.listen('settings-changed', () => {
      if (this.config.expanded !== settingsService.doneExpanded && !this.reorder.active) this.refresh();
    });
  }

  private static viewOf(scope: NoteScope, todos: ITodo[], order: string[] | null): ITodoListView {
    const open = todos.filter((todo) => !todo.done);
    return {
      // While a to-do is picked up, the order it's being moved through.
      open: order ? inOrder(open, order) : open,
      done: todos.filter((todo) => todo.done),
      expanded: settingsService.doneExpanded,
      label: scope === 'page' ? 'To-dos for this page' : 'To-dos for this site',
      emptyText: scope === 'page' ? 'No to-dos for this page yet.' : 'No to-dos for this site yet.',
    };
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    const { open, done } = this.config;
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
      ...catalog('open', open, this.itemOptions('open', open.length > 1, this.reorder.grabbedId)),
      ...catalog('done', done, this.itemOptions('done', false, null)),
      { selector: 'todo-composer', factory: (el) => new TodoComposerComponent(el, { scope: this._scope, key: this._key }), keep: 'composer' },
    ];
  }

  protected view(): ITodoListView {
    return TodoListComponent.viewOf(this._scope, this.items, this.reorder.previewOrder);
  }

  protected shownIds(): string[] {
    return this.config.open.map((todo) => todo.id);
  }

  protected labelOf(todo: ITodo): string {
    return todo.text;
  }

  // The open ones numbered in their new order, the done ones as they were.
  protected reordered(todos: ITodo[], order: string[]): ITodo[] {
    return [
      ...inOrder(todos, order).map((todo, position) => ({ ...todo, position })),
      ...todos.filter((todo) => todo.done),
    ];
  }

  private itemOptions(group: ITodoItemOptions['group'], reorderable: boolean, grabbedId: string | null): ITodoItemOptions {
    // Whether there are lists to move a to-do into: items are rebuilt only when that flips.
    const hasLists = this.openLists().length > 0;
    return this._itemOptions.get([group, reorderable, hasLists], grabbedId, () => ({
      group, reorderable, grabbedId, keys: this._keys, hasLists, lists: () => this.openLists(),
    }));
  }

  // The open to-do lists, the ones "Move into a list…" offers.
  private openLists(): ITodo[] {
    return this.items.filter((todo) => !todo.done && (todo.items?.length ?? 0) > 0);
  }

  private async _toggleDone(): Promise<void> {
    // Re-rendered by `settings-changed`, as in every other window.
    await runAction('Couldn\'t save that setting.', () => settingsService.setDoneExpanded(!settingsService.doneExpanded), {
      focus: [DONE_TOGGLE],
    });
  }

  // No confirmation: it can be undone, like deleting a single to-do.
  private async _deleteDone(): Promise<void> {
    const done = this.config.done;
    // The group goes away with its last to-do.
    const deleted = await runAction('Couldn\'t delete the done to-dos.', async () => {
      await scopeStoreService.removeMany('todos', done);
      return true;
    }, { focus: [TODO_COMPOSER_INPUT] });
    if (deleted) {
      notifierService.undoable(`${plural(done.length, 'done to-do')} deleted.`, () => scopeStoreService.restoreMany('todos', done), 'Couldn\'t restore the to-dos.');
    }
  }

  private async _deleteAll(): Promise<void> {
    const confirmed = await confirmService.ask({
      title: `Delete all to-dos for this ${this._scope}?`,
      message: `${plural(this.items.length, 'to-do')}, done ones included.`,
      confirmLabel: 'Delete all',
    });
    if (!confirmed) return;

    const removed = await runAction('Couldn\'t delete the to-dos.', () => scopeStoreService.removeAll('todos', this._scope, this._key), {
      focus: [TODO_COMPOSER_INPUT],
    });
    if (removed) {
      notifierService.undoable(`${plural(removed.length, 'to-do')} deleted.`, () => scopeStoreService.restoreMany('todos', removed), 'Couldn\'t restore the to-dos.');
    }
  }
}
