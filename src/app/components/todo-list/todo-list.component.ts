import {
  html,
  // @ts-ignore : function used in HTML template
  raw,
} from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { revealDoneGroup } from '../../lib/done-group.js';
import { plural } from '../../lib/plural.js';
import { inOrder } from '../../lib/unchanged.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { isChecklist, settingItems } from '../../services/scope-store/scope-items.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { ItemOptionsCache, ReorderableList, SELECT_BUTTON } from '../base/reorderable-list.js';
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
  selecting: boolean;
  label: string;
  emptyText: string;
}

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ open, done, expanded, selecting, label, emptyText }: ITodoListView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One scope's to-dos: its quick add on top, the open ones, then the done ones in a "Done (n)" group.
 * "Done (n)" group collapsed or not as last left (a setting shared by every page).
 * Unchanged items and the quick add's text are kept as new to-dos come in.
 * Open to-dos are reordered by their handles (see ReorderableList).
 */
export class TodoListComponent extends ReorderableList<ITodo, ITodoListView> {
  private readonly _scope: NoteScope;
  private readonly _key: string;
  private readonly _keys: IScopeKeys;
  private readonly _itemOptions = new ItemOptionsCache<ITodoItemOptions>();

  constructor(mountTarget: HTMLElement, { scope, keys, todos }: ITodoListConfig) {
    super({ templateFn, mountTarget, config: TodoListComponent.viewOf(scope, todos, null, false) }, todos, {
      kind: 'todos',
      scope,
      key: keys[scope],
      listSelector: todoCatalog('open'),
      handleSelector: '.todo-item__handle',
      idAttribute: 'todo-id',
      draggingClass: 'todo-list__item--dragging',
      failure: 'Couldn\'t reorder the to-dos.',
      keys,
      noun: 'to-do',
      composerInput: TODO_COMPOSER_INPUT,
      moveBlockedHint: 'Done to-dos can\'t be moved.',
    });
    this._scope = scope;
    this._key = keys[scope];
    this._keys = keys;
    // Opened or closed in another window: follow it.
    this.listen('settings-changed', () => {
      if (this.config.expanded !== settingsService.doneExpanded && !this.reorder.active) this.refresh();
    });
  }

  private static viewOf(scope: NoteScope, todos: ITodo[], order: string[] | null, selecting: boolean): ITodoListView {
    const open = todos.filter((todo) => !todo.done);
    return {
      // While a to-do is picked up, the order it's being moved through.
      open: order ? inOrder(open, order) : open,
      done: todos.filter((todo) => todo.done),
      // Shown while selecting (done ones can be deleted too), without changing the setting.
      expanded: settingsService.doneExpanded || selecting,
      selecting,
      label: scope === 'page' ? 'To-dos for this page' : 'To-dos for this site',
      emptyText: scope === 'page' ? 'No to-dos for this page yet.' : 'No to-dos for this site yet.',
    };
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    const { open, done, selecting } = this.config;
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
      ...catalog('open', open, this.itemOptions('open', open.length > 1 && !selecting, selecting, this.reorder.grabbedId)),
      ...catalog('done', done, this.itemOptions('done', false, selecting, null)),
      { selector: 'todo-composer', factory: (el) => new TodoComposerComponent(el, { scope: this._scope, key: this._key }), keep: 'composer' },
      this.selectionBarChild(),
    ];
  }

  protected view(): ITodoListView {
    return TodoListComponent.viewOf(this._scope, this.items, this.reorder.previewOrder, this.selecting);
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

  // Done to-dos cannot be reordered.
  protected override selectionMovable(todos: ITodo[]): boolean {
    return todos.every((todo) => !todo.done);
  }

  // Some are still open: those get marked (done ones selected with them are left as they are).
  protected override selectionMarkable(todos: ITodo[]): boolean {
    return todos.some((todo) => !todo.done);
  }

  // The selection bar's "Mark as done": single to-dos checked, checklists with all their items
  // checked, in one write. Undo unchecks only what wasn't checked yet.
  protected override markSelectedDone = async (): Promise<void> => {
    const open = this.selectedItems().filter((todo) => !todo.done);
    if (open.length === 0) return;
    const ids = new Set(this.selectedItems().map((todo) => todo.id));
    const unchecked = new Set(open.flatMap((todo) => (todo.items ?? []).filter((item) => !item.done).map((item) => item.id)));
    // "Done" unfolds to show them there, as for a single one.
    await revealDoneGroup();
    if (this.isDestroyed) return;
    this.stopSelecting();
    const updated = await runAction('Couldn\'t mark the to-dos as done.', () => scopeStoreService.updateManyWith(
      'todos', open, (current) => (isChecklist(current) ? settingItems(() => true)(current) : { done: true })
    ), {
      focus: [SELECT_BUTTON, TODO_COMPOSER_INPUT],
      onError: () => this.resumeSelecting(ids, '[data-focus="selection-done"]'),
    });
    if (updated && updated.length > 0) {
      notifierService.undoable(
        `${plural(updated.length, 'to-do')} marked as done.`,
        () => scopeStoreService.updateManyWith('todos', updated, (current) => (isChecklist(current)
          ? settingItems((item) => (unchecked.has(item.id) ? false : item.done))(current)
          : { done: false })),
        'Couldn\'t update the to-dos.',
        'success'
      );
    }
  };

  private itemOptions(group: ITodoItemOptions['group'], reorderable: boolean, selecting: boolean, grabbedId: string | null): ITodoItemOptions {
    // Whether there are checklists to move a to-do into: items are rebuilt only when that flips.
    const hasChecklists = this.openChecklists().length > 0;
    return this._itemOptions.get([group, reorderable, hasChecklists, selecting], grabbedId, () => ({
      group, reorderable, grabbedId, keys: this._keys, hasChecklists, checklists: () => this.openChecklists(),
      selecting, isSelected: this.isSelected, onSelect: this.onSelect,
    }));
  }

  // The open checklists, the ones "Move into a checklist…" offers.
  private openChecklists(): IChecklist[] {
    return this.items.filter((todo): todo is IChecklist => !todo.done && isChecklist(todo));
  }

  // @ts-ignore : function used in HTML template
  private async _toggleDone(): Promise<void> {
    // Re-rendered by `settings-changed`, as in every other window.
    await runAction('Couldn\'t save that setting.', () => settingsService.setDoneExpanded(!settingsService.doneExpanded), {
      focus: [DONE_TOGGLE],
    });
  }

  // @ts-ignore : function used in HTML template
  // No confirmation: it can be undone.
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

  // @ts-ignore : function used in HTML template
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
