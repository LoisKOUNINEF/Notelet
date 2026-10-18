import { Component, html, raw } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';
import { clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';

// What the to-do list passes to each item, besides the to-do (see createCatalogComponents).
export interface ITodoItemOptions {
  group: 'open' | 'done';
  // Shows the grab handle (open to-dos, when there are at least two). The list runs the gestures.
  reorderable: boolean;
  // The to-do picked up with the keyboard, if any.
  grabbedId: string | null;
}

interface ITodoItemView {
  todo: ITodo;
  editing: boolean;
  reorderable: boolean;
  grabbed: boolean;
}

const templateFn = ({ todo, editing, reorderable, grabbed }: ITodoItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One to-do: a checkbox labelled by its text, and its actions. Edit mode swaps them for a
 * one-line field in place. Checking it moves it below the open ones; focus follows it there.
 */
export class TodoItemComponent extends Component<HTMLElement, ITodoItemView> {
  private _todo: ITodo;
  private _index: number;
  private _group: ITodoItemOptions['group'];

  constructor(mountTarget: HTMLElement, config: ITodo & { index: number }, options: ITodoItemOptions) {
    const { index, ...todo } = config;
    // The item's own root, directly inside the catalog's <li>.
    super({
      templateFn,
      mountTarget,
      props: { className: todo.done ? 'todo-item todo-item--done' : 'todo-item' },
      config: { todo, editing: false, reorderable: options.reorderable, grabbed: options.grabbedId === todo.id },
    });
    // Lets the list find this to-do's controls again after it re-renders (see requestFocus).
    this.element.dataset.todoId = todo.id;
    this._todo = todo;
    this._index = index;
    this._group = options.group;
  }

  private async _toggle(done: boolean): Promise<void> {
    // Checked into a collapsed "Done" group, it disappears: focus stays among the open ones.
    const hidden = done && !settingsService.doneExpanded;
    if (hidden) this.requestFocusAfterLeaving();
    else requestFocus(`[data-todo-id="${this._todo.id}"] .todo-item__checkbox`);
    try {
      const updated = await scopeStoreService.update('todos', this._todo, { done });
      if (hidden) {
        notifierService.success('Marked as done.', {
          label: 'Undo',
          run: () => void scopeStoreService.update('todos', updated, { done: false }).catch((error) => {
            notifierService.error(`Couldn't update the to-do. ${errorMessage(error)}`);
          }),
        });
      }
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't update the to-do. ${errorMessage(error)}`);
      this.render();
    }
  }

  private _edit(): void {
    this.setEditing(true);
    // Rendered by setEditing(true) just above.
    const input = this.element.querySelector<HTMLInputElement>('.todo-item__input')!;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private _cancel(): void {
    this.setEditing(false);
    this.element.querySelector<HTMLElement>('.todo-item__edit')?.focus();
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this._cancel();
  }

  private async _save(): Promise<void> {
    const text = this.element.querySelector<HTMLInputElement>('.todo-item__input')!.value.trim();
    if (!text) return;
    if (text === this._todo.text) {
      this._cancel();
      return;
    }

    // The saved to-do comes back through `scope-content-changed` as a new list item, in view mode.
    requestFocus(`[data-todo-id="${this._todo.id}"] .todo-item__edit`);
    try {
      await scopeStoreService.update('todos', this._todo, { text });
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't save the to-do. ${errorMessage(error)}`);
    }
  }

  private async _delete(): Promise<void> {
    const todo = this._todo;
    this.requestFocusAfterLeaving();
    try {
      await scopeStoreService.remove('todos', todo);
      notifierService.info('To-do deleted.', {
        label: 'Undo',
        run: () => void scopeStoreService.restore('todos', todo).catch((error) => {
          notifierService.error(`Couldn't restore the to-do. ${errorMessage(error)}`);
        }),
      });
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't delete the to-do. ${errorMessage(error)}`);
    }
  }

  // Once this to-do leaves its group, the next one there takes its index; else the previous one,
  // else the quick add. Each group is its own catalog, with its own indexes.
  private requestFocusAfterLeaving(): void {
    const group = `[data-catalog="${this._group}-todos"]`;
    requestFocus(
      `${group} > [data-index="${this._index}"] .todo-item__checkbox`,
      `${group} > [data-index="${this._index - 1}"] .todo-item__checkbox`,
      '.todo-composer__input',
    );
  }

  private setEditing(editing: boolean): void {
    this.config = { ...this.config, editing };
    this.render();
  }
}
