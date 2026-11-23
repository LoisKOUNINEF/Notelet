import {
  Component,
  html,
  // @ts-ignore : function used in HTML template
  raw,
} from '../../../core/index.js';
import { editOnClick } from '../../lib/card-click.js';
import { runAction } from '../../lib/actions.js';
import { revealDoneGroup } from '../../lib/done-group.js';
import { getEditDraft } from '../../lib/drafts.js';
import { byData, clearRequestedFocus } from '../../lib/focus.js';
import { quoted, sentence, todoRef } from '../../lib/labels.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { isChecklist } from '../../services/scope-store/scope-items.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { ChecklistAddComponent } from '../checklist-add/checklist-add.component.js';
import { ChecklistItemComponent } from '../checklist-item/checklist-item.component.js';
import { ItemMenuComponent, type IMenuAction } from '../item-menu/item-menu.component.js';
import { TodoEditorComponent, type ITodoEditDraft } from '../todo-editor/todo-editor.component.js';
import { TODO_COMPOSER_INPUT } from '../todo-composer/todo-composer.component.js';
import { todoCatalog } from '../todo-list/todo-list.selectors.js';

export interface ITodoItemOptions {
  group: 'open' | 'done';
  // Shows the grab handle (when there are at least two). The list runs the gestures.
  reorderable: boolean;
  // The to-do picked up with the keyboard, if any.
  grabbedId: string | null;
  // Where "Move to this site/page" sends it.
  keys: IScopeKeys;
  // There are checklists to move a single to-do into ("Move into a checklist…"), read when it's picked.
  hasChecklists: boolean;
  checklists: () => IChecklist[];
  // The list is selecting items; whether this one is, and how to tell the list it changed.
  selecting: boolean;
  isSelected: (id: string) => boolean;
  onSelect: (id: string, selected: boolean) => void;
}

interface ITodoItemView {
  todo: ITodo;
  // A checklist: its name, its items and how many are done.
  items: IChecklistItem[];
  doneCount: number;
  editing: boolean;
  // A checklist folded down to its name and progress (see _toggleCollapsed).
  collapsed: boolean;
  reorderable: boolean;
  grabbed: boolean;
  // The list is selecting items: a checkbox replaces the actions (see ReorderableList).
  selecting: boolean;
  selected: boolean;
}

type TodoMenuAction = 'mark-done' | 'mark-all-done' | 'move' | 'move-into-checklist';

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ todo, items, doneCount, editing, collapsed, reorderable, grabbed, selecting, selected }: ITodoItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One to-do: a checkbox labelled by its text, and its actions.
 * Only the box checks it: a click on its text opens the editor, like Edit.
 *
 * A checklist has no checkbox of its own: its name, then its items, checked one by one; it's done
 * once they all are (see ScopeStoreService.updateWith). Its arrow folds it down to its name and progress.
 *
 * Adding items to a single to-do makes it a checklist
 * Removing them all makes a checklist single.
 * Items taken out become single to-dos.
 */
export class TodoItemComponent extends Component<HTMLElement, ITodoItemView> {
  private _todo: ITodo;
  private _index: number;
  private _group: ITodoItemOptions['group'];
  private _options: ITodoItemOptions;
  private _editor: TodoEditorComponent | null = null;

  constructor(mountTarget: HTMLElement, config: ITodo & { index: number }, options: ITodoItemOptions) {
    const { index, ...todo } = config;
    const items = todo.items ?? [];
    const selected = options.selecting && options.isSelected(todo.id);
    // The item's own root, directly inside the catalog's <li>.
    super({
      templateFn,
      mountTarget,
      props: { className: ['todo-item', todo.done ? 'todo-item--done' : '', selected ? 'todo-item--selected' : ''].filter(Boolean).join(' ') },
      config: {
        todo,
        items,
        doneCount: items.filter((item) => item.done).length,
        // An edit left open when this to-do last went away comes back, still open.
        editing: getEditDraft<ITodoEditDraft>('todo', todo.id) !== null,
        collapsed: items.length > 0 && !!todo.collapsed,
        reorderable: options.reorderable,
        grabbed: options.grabbedId === todo.id,
        selecting: options.selecting,
        selected,
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
        selector: 'todo-editor',
        factory: (el) => (this._editor = new TodoEditorComponent(el, {
          todo: this._todo,
          draft: getEditDraft<ITodoEditDraft>('todo', this._todo.id),
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
      // Only in the template for a checklist.
      { selector: 'checklist-add', factory: (el) => new ChecklistAddComponent(el, this._todo as IChecklist) },
      {
        selector: 'item-menu',
        factory: (el) => new ItemMenuComponent<TodoMenuAction>(el, {
          id: `todo-${this._todo.id}`,
          name: this._todo.text,
          actions: this.menuActions(),
          onAction: (action) => this.onMenuAction(action),
        }),
      },
    ];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // A checklist's items are checked by their checkboxes only.
    if (this.config.editing) return;
    // While selecting, a click on it (done or not) checks it instead.
    if (this.config.selecting) {
      this.eventListeners.push(editOnClick(this.element, () => this.element.querySelector<HTMLInputElement>('.todo-item__select-box')?.click()));
    } else if (!this._todo.done) {
      this.eventListeners.push(editOnClick(this.element, (target) => this.edit(target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId)));
    }
  }

  // A to-do can be marked as done (a checklist: all its items at once); a single to-do can go into a
  // checklist, when there's one; any to-do to the tab's other scope.
  private menuActions(): IMenuAction<TodoMenuAction>[] {
    const single = !isChecklist(this._todo);
    return [
      single ? { value: 'mark-done' as const, label: 'Mark as done' } : { value: 'mark-all-done' as const, label: 'Mark all as done' },
      ...(single && this._options.hasChecklists ? [{ value: 'move-into-checklist' as const, label: 'Move into a checklist…' }] : []),
      { value: 'move', label: `Move to this ${this._todo.scope === 'page' ? 'site' : 'page'}` },
    ];
  }

  private onMenuAction(action: TodoMenuAction): void {
    switch (action) {
      case 'mark-done': void this._toggle(true); break;
      case 'mark-all-done': void this.markAllDone(); break;
      case 'move': void this.move(); break;
      case 'move-into-checklist': void this.moveIntoChecklist(); break;
    }
  }

  // @ts-ignore : function used in HTML template
  private _select(selected: boolean): void {
    this.element.classList.toggle('todo-item--selected', selected);
    this._options.onSelect(this._todo.id, selected);
  }

  private async _toggle(done: boolean): Promise<void> {
    // "Done" unfolds to show it there, focus still on its checkbox. If that fails, it disappears into
    // the folded group: focus stays among the open ones.
    if (done) await revealDoneGroup();
    const hidden = done && !settingsService.doneExpanded;
    const ref = todoRef(this._todo);
    const updated = await runAction(`Couldn't update ${ref}.`, () => scopeStoreService.update('todos', this._todo, { done }), {
      focus: hidden ? this.focusAfterLeaving() : [this.own('.todo-item__checkbox')],
      // The checkbox shows what's stored again.
      onError: () => this.render(),
    });
    if (updated && hidden) {
      notifierService.undoable(`${sentence(ref)} marked as done.`, () => scopeStoreService.update('todos', updated, { done: false }), `Couldn't update ${ref}.`, 'success');
    }
    // Back among the open ones, it leaves "Done": Undo puts it back there.
    if (updated && !done) {
      notifierService.undoable(`${sentence(ref)} marked as undone.`, () => scopeStoreService.update('todos', updated, { done: true }), `Couldn't update ${ref}.`, 'success');
    }
  }

  // "Mark all as done": checks every item of a checklist, which moves it to "Done". Undo unchecks only
  // the items that weren't checked yet.
  private async markAllDone(): Promise<void> {
    await revealDoneGroup();
    const hidden = !settingsService.doneExpanded;
    const ref = todoRef(this._todo);
    const unchecked = (this._todo.items ?? []).filter((item) => !item.done).map((item) => item.id);
    const updated = await runAction(`Couldn't update ${ref}.`, () => scopeStoreService.updateWith('todos', this._todo, settingItems(() => true)), {
      focus: hidden ? this.focusAfterLeaving() : [this.own('.checklist-item__checkbox')],
    });
    if (updated) {
      const undo = settingItems((item) => (unchecked.includes(item.id) ? false : item.done));
      notifierService.undoable(`${sentence(ref)} marked as done.`, () => scopeStoreService.updateWith('todos', updated, undo), `Couldn't update ${ref}.`, 'success');
    }
  }

  // @ts-ignore : function used in HTML template
  // "Mark as undone" on a done to-do: unchecked, like from its checkbox. A checklist has all its items
  // unchecked, which moves it back to the open ones; Undo checks them all again, as they were.
  private async _markUndone(): Promise<void> {
    if (!isChecklist(this._todo)) return this._toggle(false);
    const ref = todoRef(this._todo);
    const updated = await runAction(`Couldn't update ${ref}.`, () => scopeStoreService.updateWith('todos', this._todo, settingItems(() => false)), {
      focus: [this.own('.checklist-item__checkbox')],
    });
    if (updated) {
      notifierService.undoable(`${sentence(ref)} marked as undone.`, () => scopeStoreService.updateWith('todos', updated, settingItems(() => true)), `Couldn't update ${ref}.`, 'success');
    }
  }

  // @ts-ignore : function used in HTML template
  // Folded right away; the stored checklist then comes back as a new list item, focus on its arrow.
  private async _toggleCollapsed(): Promise<void> {
    const collapsed = !this.config.collapsed;
    this.config = { ...this.config, collapsed };
    this.render();
    this.element.querySelector<HTMLElement>('.todo-item__toggle')?.focus();
    await runAction(`Couldn't update ${todoRef(this._todo)}.`, () => scopeStoreService.setCollapsed('todos', this._todo, collapsed), {
      focus: [this.own('.todo-item__toggle')],
      onError: () => {
        this.config = { ...this.config, collapsed: !collapsed };
        this.render();
      },
    });
  }

  // @ts-ignore : function used in HTML template
  private _edit(): void {
    this.edit();
  }

  // Focused on that item's field, if given (and still in the checklist), else on the name.
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
    await runAction(`Couldn't save ${todoRef(this._todo)}.`, () => scopeStoreService.editTodo(this._todo, text, items, takenOut), {
      focus: [this.own('.todo-item__edit'), this.own('.todo-item__delete')],
      onError: () => this._editor?.reopen(),
    });
  }

  private cancel(): void {
    this._editor?.close();
    this.setEditing(false);
    this.element.querySelector<HTMLElement>('.todo-item__edit')?.focus();
  }

  // "Move into a checklist…": a single to-do becomes the last item of a checklist picked in a popup.
  private async moveIntoChecklist(): Promise<void> {
    const checklists = this._options.checklists();
    const checklistId = await confirmService.choose({
      title: `Move “${this._todo.text}” into a checklist`,
      message: 'It becomes the checklist\'s last item.',
      choices: checklists.map((checklist) => {
        const { items } = checklist;
        return { value: checklist.id, label: `${checklist.text} · ${items.filter((item) => item.done).length} of ${items.length} done` };
      }),
    });
    const checklist = checklists.find(({ id }) => id === checklistId);
    if (!checklist) return;

    const moved = await runAction(`Couldn't move ${quoted(this._todo.text)} into ${quoted(checklist.text)}.`, () => scopeStoreService.moveIntoChecklist(this._todo, checklist), {
      focus: this.focusAfterLeaving(),
    });
    if (!moved) {
      // Nothing moved (either is gone): nothing re-renders to take the focus.
      clearRequestedFocus();
      return;
    }
    notifierService.undoable(`${quoted(this._todo.text)} moved into ${quoted(checklist.text)}.`, () => scopeStoreService.moveOutOfChecklist(this._todo, checklist, moved.itemId), `Couldn't move ${quoted(this._todo.text)} back.`);
  }

  // @ts-ignore : function used in HTML template
  private async _delete(): Promise<void> {
    const todo = this._todo;
    const deleted = await runAction(`Couldn't delete ${todoRef(todo)}.`, async () => {
      await scopeStoreService.remove('todos', todo);
      return true;
    }, { focus: this.focusAfterLeaving() });
    if (deleted) notifierService.undoable(`${sentence(todoRef(todo))} deleted.`, () => scopeStoreService.restore('todos', todo), `Couldn't restore ${todoRef(todo)}.`);
  }

  private async move(): Promise<void> {
    const todo = this._todo;
    const target = todo.scope === 'page' ? 'site' : 'page';
    const moved = await runAction(`Couldn't move ${todoRef(todo)}.`, () => scopeStoreService.move('todos', todo, this._options.keys), {
      focus: this.focusAfterLeaving(),
    });
    if (moved) {
      notifierService.undoable(`${sentence(todoRef(todo))} moved to this ${target}.`, () => scopeStoreService.moveBack('todos', moved, todo), `Couldn't move ${todoRef(todo)} back.`, 'success');
    }
  }

  // One of this to-do's controls, found again once the list has re-rendered it.
  private own(control: string): string {
    return `${byData('todo-id', this._todo.id)} ${control}`;
  }

  // Once this to-do leaves its group, the next one there takes its index; else the previous one,
  // else the quick add. A to-do's first control is its checkbox, a checklist's its first item's.
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

// The change that sets each item's `done`, applied to the checklist as stored.
function settingItems(done: (item: IChecklistItem) => boolean): (current: ITodo) => Pick<ITodo, 'items'> {
  return (current) => ({ items: (current.items ?? []).map((item) => ({ ...item, done: done(item) })) });
}

function sameItems(a: IChecklistItem[], b: IChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]?.id && item.text === b[i]?.text && item.done === b[i]?.done);
}
