import { Component, html, raw } from '../../../core/index.js';
import { editOnClick } from '../../lib/card-click.js';
import { runAction } from '../../lib/actions.js';
import { getEditDraft } from '../../lib/drafts.js';
import { byData, clearRequestedFocus } from '../../lib/focus.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { ChecklistAddComponent } from '../checklist-add/checklist-add.component.js';
import { ChecklistItemComponent } from '../checklist-item/checklist-item.component.js';
import { ItemMenuComponent, type IMenuAction } from '../item-menu/item-menu.component.js';
import { ListEditorComponent, type IListEditDraft } from '../list-editor/list-editor.component.js';
import { TODO_COMPOSER_INPUT } from '../todo-composer/todo-composer.component.js';
import { todoCatalog } from '../todo-list/todo-list.selectors.js';

// What the to-do list passes to each item, besides the to-do (see createCatalogComponents).
export interface ITodoItemOptions {
  group: 'open' | 'done';
  // Shows the grab handle (open to-dos, when there are at least two). The list runs the gestures.
  reorderable: boolean;
  // The to-do picked up with the keyboard, if any.
  grabbedId: string | null;
  // Where "Move to this site/page" sends it.
  keys: IScopeKeys;
  // There are lists to move a single to-do into ("Move into a list…"), read when it's picked.
  hasLists: boolean;
  lists: () => ITodo[];
}

interface ITodoItemView {
  todo: ITodo;
  // A to-do list: its name, its items (checked right here) and how many are done.
  items: IChecklistItem[];
  doneCount: number;
  editing: boolean;
  // A list folded down to its name and progress (see _toggleCollapsed).
  collapsed: boolean;
  reorderable: boolean;
  grabbed: boolean;
}

type TodoMenuAction = 'move' | 'move-into-list';

const templateFn = ({ todo, items, doneCount, editing, collapsed, reorderable, grabbed }: ITodoItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One to-do: a checkbox labelled by its text, and its actions (a done one only offers Delete).
 * Only the box checks it: a click on its text or elsewhere on it opens the editor, like Edit.
 * Checking it moves it below the open ones; focus follows it there.
 *
 * A to-do list has no checkbox of its own: its name, then its items, checked one by one; it's done
 * once they all are (see ScopeStoreService.updateWith). Its arrow folds it down to its name and
 * progress (saved on the to-do).
 *
 * Every to-do is edited in the list editor, in place: adding items to a single one makes it a list,
 * removing them all makes a list single, and items taken out become single to-dos after it.
 */
export class TodoItemComponent extends Component<HTMLElement, ITodoItemView> {
  private _todo: ITodo;
  private _index: number;
  private _group: ITodoItemOptions['group'];
  private _options: ITodoItemOptions;
  private _editor: ListEditorComponent | null = null;

  constructor(mountTarget: HTMLElement, config: ITodo & { index: number }, options: ITodoItemOptions) {
    const { index, ...todo } = config;
    const items = todo.items ?? [];
    // The item's own root, directly inside the catalog's <li>.
    super({
      templateFn,
      mountTarget,
      props: { className: todo.done ? 'todo-item todo-item--done' : 'todo-item' },
      config: {
        todo,
        items,
        doneCount: items.filter((item) => item.done).length,
        // An edit left open when this to-do last went away comes back, still open.
        editing: getEditDraft<IListEditDraft>('todo', todo.id) !== null,
        collapsed: items.length > 0 && !!todo.collapsed,
        reorderable: options.reorderable,
        grabbed: options.grabbedId === todo.id,
      },
    });
    // Lets the list find this to-do's controls again after it re-renders (see requestFocus).
    this.element.dataset.todoId = todo.id;
    this._todo = todo;
    this._index = index;
    this._group = options.group;
    this._options = options;
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    if (this.config.editing) {
      return [{
        selector: 'list-editor',
        factory: (el) => (this._editor = new ListEditorComponent(el, {
          todo: this._todo,
          draft: getEditDraft<IListEditDraft>('todo', this._todo.id),
          onSave: (text, items, takenOut) => void this.save(text, items, takenOut),
          onCancel: () => this.cancel(),
        })),
      }];
    }
    return [
      ...this.createCatalogComponents({
        items: this.config.collapsed ? [] : this.config.items,
        selector: 'checklist',
        elementName: 'checklist-item',
        elementTag: 'li',
        component: ChecklistItemComponent,
        props: { todo: this._todo },
      }),
      { selector: 'checklist-add', factory: (el) => new ChecklistAddComponent(el, this._todo) },
      {
        selector: 'item-menu',
        factory: (el) => new ItemMenuComponent<TodoMenuAction>(el, {
          id: `todo-${this._todo.id}`,
          name: this._todo.text,
          actions: this.menuActions(),
          onAction: (action) => void (action === 'move' ? this.move() : this.moveIntoList()),
        }),
      },
    ];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // A list's items are checked by their checkboxes only: their text opens the list's editor too,
    // focused on that item's field (elsewhere on the list: on its name).
    if (!this.config.editing && !this._todo.done) {
      this.eventListeners.push(editOnClick(this.element, (target) => this.edit(target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId)));
    }
  }

  // A single to-do can go into a list, when there's one; any to-do to the tab's other scope.
  private menuActions(): IMenuAction<TodoMenuAction>[] {
    const single = (this._todo.items ?? []).length === 0;
    return [
      ...(single && this._options.hasLists ? [{ value: 'move-into-list' as const, label: 'Move into a list…' }] : []),
      { value: 'move', label: `Move to this ${this._todo.scope === 'page' ? 'site' : 'page'}` },
    ];
  }

  private async _toggle(done: boolean): Promise<void> {
    // Checked into a collapsed "Done" group, it disappears: focus stays among the open ones.
    const hidden = done && !settingsService.doneExpanded;
    const updated = await runAction('Couldn\'t update the to-do.', () => scopeStoreService.update('todos', this._todo, { done }), {
      focus: hidden ? this.focusAfterLeaving() : [this.own('.todo-item__checkbox')],
      // The checkbox shows what's stored again.
      onError: () => this.render(),
    });
    if (updated && hidden) {
      notifierService.undoable('Marked as done.', () => scopeStoreService.update('todos', updated, { done: false }), 'Couldn\'t update the to-do.', 'success');
    }
  }

  // Folded right away; the stored list then comes back as a new list item, focus on its arrow.
  private async _toggleCollapsed(): Promise<void> {
    const collapsed = !this.config.collapsed;
    this.config = { ...this.config, collapsed };
    this.render();
    this.element.querySelector<HTMLElement>('.todo-item__toggle')?.focus();
    await runAction('Couldn\'t update the list.', () => scopeStoreService.setCollapsed('todos', this._todo, collapsed), {
      focus: [this.own('.todo-item__toggle')],
      onError: () => {
        this.config = { ...this.config, collapsed: !collapsed };
        this.render();
      },
    });
  }

  private _edit(): void {
    this.edit();
  }

  // Focused on that item's field, if given (and still in the list), else on the name.
  private edit(itemId?: string): void {
    this.setEditing(true);
    this._editor?.focus(itemId);
  }

  private async save(text: string, items: IChecklistItem[], takenOut: IChecklistItem[]): Promise<void> {
    if (text === this._todo.text && sameItems(items, this._todo.items ?? []) && takenOut.length === 0) {
      this.cancel();
      return;
    }
    // Comes back through `scope-content-changed` as a new list item, in view mode: this one goes
    // away with no draft to keep.
    this._editor?.close();
    await runAction('Couldn\'t save the to-do.', () => scopeStoreService.editList(this._todo, text, items, takenOut), {
      focus: [this.own('.todo-item__edit'), this.own('.todo-item__delete')],
      onError: () => this._editor?.reopen(),
    });
  }

  private cancel(): void {
    this._editor?.close();
    this.setEditing(false);
    this.element.querySelector<HTMLElement>('.todo-item__edit')?.focus();
  }

  // "Move into a list…": a single to-do becomes the last item of a list picked in a popup.
  private async moveIntoList(): Promise<void> {
    const lists = this._options.lists();
    const listId = await confirmService.choose({
      title: `Move “${this._todo.text}” into a list`,
      message: 'It becomes the list\'s last item.',
      choices: lists.map((list) => {
        const items = list.items ?? [];
        return { value: list.id, label: `${list.text} · ${items.filter((item) => item.done).length} of ${items.length} done` };
      }),
    });
    const list = lists.find(({ id }) => id === listId);
    if (!list) return;

    const moved = await runAction('Couldn\'t move the to-do.', () => scopeStoreService.moveIntoList(this._todo, list), {
      focus: this.focusAfterLeaving(),
    });
    if (!moved) {
      // Nothing moved (either is gone): nothing re-renders to take the focus.
      clearRequestedFocus();
      return;
    }
    notifierService.undoable(`Moved into ${list.text}.`, () => scopeStoreService.moveOutOfList(this._todo, list, moved.itemId), 'Couldn\'t move it back.');
  }

  private async _delete(): Promise<void> {
    const todo = this._todo;
    const deleted = await runAction('Couldn\'t delete the to-do.', async () => {
      await scopeStoreService.remove('todos', todo);
      return true;
    }, { focus: this.focusAfterLeaving() });
    if (deleted) notifierService.undoable('To-do deleted.', () => scopeStoreService.restore('todos', todo), 'Couldn\'t restore the to-do.');
  }

  private async move(): Promise<void> {
    const todo = this._todo;
    const target = todo.scope === 'page' ? 'site' : 'page';
    const moved = await runAction('Couldn\'t move the to-do.', () => scopeStoreService.move('todos', todo, this._options.keys), {
      focus: this.focusAfterLeaving(),
    });
    if (moved) {
      notifierService.undoable(`Moved to this ${target}'s to-dos.`, () => scopeStoreService.moveBack('todos', moved, todo), 'Couldn\'t move the to-do back.', 'success');
    }
  }

  // One of this to-do's controls, found again once the list has re-rendered it.
  private own(control: string): string {
    return `${byData('todo-id', this._todo.id)} ${control}`;
  }

  // Once this to-do leaves its group, the next one there takes its index; else the previous one,
  // else the quick add. A to-do's first control is its checkbox, a list's its first item's.
  private focusAfterLeaving(): string[] {
    const group = todoCatalog(this._group);
    const first = ':is(.todo-item__checkbox, .checklist-item__checkbox)';
    return [
      `${group} > [data-index="${this._index}"] ${first}`,
      `${group} > [data-index="${this._index - 1}"] ${first}`,
      TODO_COMPOSER_INPUT,
    ];
  }

  private setEditing(editing: boolean): void {
    this._editor = null;
    this.config = { ...this.config, editing };
    this.render();
  }
}

function sameItems(a: IChecklistItem[], b: IChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]?.id && item.text === b[i]?.text && item.done === b[i]?.done);
}
