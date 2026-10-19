import { Component, html, raw } from '../../../core/index.js';
import { getEditDraft } from '../../lib/drafts.js';
import { errorMessage } from '../../lib/errors.js';
import { byData, clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { delegateActions, removeOverlays } from '../../lib/overlays.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { ChecklistItemComponent } from '../checklist-item/checklist-item.component.js';
import { ListEditorComponent, type IListEditDraft } from '../list-editor/list-editor.component.js';

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
  canMoveIntoList: boolean;
  reorderable: boolean;
  grabbed: boolean;
  moveTarget: string;
}

const templateFn = ({ todo, items, doneCount, editing, canMoveIntoList, reorderable, grabbed, moveTarget }: ITodoItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One to-do: a checkbox labelled by its text, and its actions (a done one only offers Delete).
 * Checking it moves it below the open ones; focus follows it there.
 *
 * A to-do list has no checkbox of its own: its name, then its items, checked one by one; it's done
 * once they all are (see ScopeStoreService.updateWith).
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
        canMoveIntoList: !todo.done && items.length === 0 && options.hasLists,
        reorderable: options.reorderable,
        grabbed: options.grabbedId === todo.id,
        moveTarget: todo.scope === 'page' ? 'this site' : 'this page',
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
    return this.createCatalogComponents({
      items: this.config.items,
      selector: 'checklist',
      elementName: 'checklist-item',
      elementTag: 'li',
      component: ChecklistItemComponent,
      props: { todo: this._todo },
    });
  }

  // The "⋯" menu is an overlay on <body> (see lib/overlays.ts).
  protected override onBeforeRender(): void {
    removeOverlays(this.element, '.todo-item__overlays');
    super.onBeforeRender();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    const menu = delegateActions(`todo-${this._todo.id}-menu`, (action) => {
      if (action === 'move') void this.move();
      else if (action === 'move-into-list') void this.moveIntoList();
    });
    if (menu) this.eventListeners.push(menu);
  }

  protected override onBeforeDestroy(): void {
    removeOverlays(this.element, '.todo-item__overlays');
    super.onBeforeDestroy();
  }

  private async _toggle(done: boolean): Promise<void> {
    // Checked into a collapsed "Done" group, it disappears: focus stays among the open ones.
    const hidden = done && !settingsService.doneExpanded;
    if (hidden) this.requestFocusAfterLeaving();
    else requestFocus(`${byData('todo-id', this._todo.id)} .todo-item__checkbox`);
    try {
      const updated = await scopeStoreService.update('todos', this._todo, { done });
      if (hidden) {
        notifierService.undoable('Marked as done.', () => scopeStoreService.update('todos', updated, { done: false }), `Couldn't update the to-do.`, 'success');
      }
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't update the to-do. ${errorMessage(error)}`);
      this.render();
    }
  }

  private _edit(): void {
    this.setEditing(true);
    this._editor?.focus();
  }

  private async save(text: string, items: IChecklistItem[], takenOut: IChecklistItem[]): Promise<void> {
    if (text === this._todo.text && sameItems(items, this._todo.items ?? []) && takenOut.length === 0) {
      this.cancel();
      return;
    }
    // Comes back through `scope-content-changed` as a new list item, in view mode: this one goes
    // away with no draft to keep.
    this._editor?.close();
    requestFocus(`${byData('todo-id', this._todo.id)} .todo-item__edit`, `${byData('todo-id', this._todo.id)} .todo-item__delete`);
    try {
      await scopeStoreService.editList(this._todo, text, items, takenOut);
    } catch (error) {
      this._editor?.reopen();
      clearRequestedFocus();
      notifierService.error(`Couldn't save the to-do. ${errorMessage(error)}`);
    }
  }

  private cancel(): void {
    this._editor?.close();
    this.setEditing(false);
    this.element.querySelector<HTMLElement>('.todo-item__edit')?.focus();
  }

  private async _addItem(): Promise<void> {
    const input = this.element.querySelector<HTMLInputElement>('.todo-item__add-item-input')!;
    const text = input.value.trim();
    if (!text) return;

    // The list comes back with the item as a new list item: focus the field again there.
    requestFocus(`${byData('todo-id', this._todo.id)} .todo-item__add-item-input`);
    try {
      await scopeStoreService.updateWith('todos', this._todo, (current) => ({
        items: [...(current.items ?? []), { id: crypto.randomUUID(), text, done: false }],
      }));
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't add the item. ${errorMessage(error)}`);
    }
  }

  // "Move into a list…": a single to-do becomes the last item of a list picked in a popup.
  private async moveIntoList(): Promise<void> {
    const lists = this._options.lists();
    const listId = await confirmService.choose({
      title: `Move “${this._todo.text}” into a list`,
      message: 'It becomes the list\'s last item.',
      choices: lists.map((list) => ({
        value: list.id,
        label: `${list.text} · ${list.items!.filter((item) => item.done).length} of ${list.items!.length} done`,
      })),
    });
    const list = lists.find(({ id }) => id === listId);
    if (!list) return;

    this.requestFocusAfterLeaving();
    try {
      const moved = await scopeStoreService.moveIntoList(this._todo, list);
      if (!moved) {
        clearRequestedFocus();
        return;
      }
      notifierService.undoable(`Moved into ${list.text}.`, () => scopeStoreService.restoreMany('todos', moved.before), `Couldn't move it back.`);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't move the to-do. ${errorMessage(error)}`);
    }
  }

  private async _delete(): Promise<void> {
    const todo = this._todo;
    this.requestFocusAfterLeaving();
    try {
      await scopeStoreService.remove('todos', todo);
      notifierService.undoable('To-do deleted.', () => scopeStoreService.restore('todos', todo), `Couldn't restore the to-do.`);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't delete the to-do. ${errorMessage(error)}`);
    }
  }

  private async move(): Promise<void> {
    const target = this._todo.scope === 'page' ? 'site' : 'page';
    this.requestFocusAfterLeaving();
    try {
      await scopeStoreService.move('todos', this._todo, this._options.keys);
      notifierService.success(`Moved to this ${target}'s to-dos.`);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't move the to-do. ${errorMessage(error)}`);
    }
  }

  // Once this to-do leaves its group, the next one there takes its index; else the previous one,
  // else the quick add. Each group is its own catalog, with its own indexes. A to-do's first
  // control is its checkbox, a list's its first item's.
  private requestFocusAfterLeaving(): void {
    const group = `[data-catalog="${this._group}-todos"]`;
    const first = ':is(.todo-item__checkbox, .checklist-item__checkbox)';
    requestFocus(
      `${group} > [data-index="${this._index}"] ${first}`,
      `${group} > [data-index="${this._index - 1}"] ${first}`,
      '.todo-composer__input',
    );
  }

  private setEditing(editing: boolean): void {
    this._editor = null;
    this.config = { ...this.config, editing };
    this.render();
  }
}

function sameItems(a: IChecklistItem[], b: IChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]!.id && item.text === b[i]!.text && item.done === b[i]!.done);
}
