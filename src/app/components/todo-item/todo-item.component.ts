import { Component, html, raw } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';
import { clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';

interface ITodoItemView {
  todo: ITodo;
  editing: boolean;
}

const templateFn = ({ todo, editing }: ITodoItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One to-do: a checkbox labelled by its text, and its actions. Edit mode swaps them for a
 * one-line field in place. Checking it moves it below the open ones; focus follows it there.
 */
export class TodoItemComponent extends Component<HTMLElement, ITodoItemView> {
  private _todo: ITodo;
  private _index: number;

  constructor(mountTarget: HTMLElement, config: ITodo & { index: number }) {
    const { index, ...todo } = config;
    // The item's own root, directly inside the catalog's <li>.
    super({
      templateFn,
      mountTarget,
      props: { className: todo.done ? 'todo-item todo-item--done' : 'todo-item' },
      config: { todo, editing: false },
    });
    // Lets the list find this to-do's controls again after it re-renders (see requestFocus).
    this.element.dataset.todoId = todo.id;
    this._todo = todo;
    this._index = index;
  }

  private async _toggle(done: boolean): Promise<void> {
    requestFocus(`[data-todo-id="${this._todo.id}"] .todo-item__checkbox`);
    try {
      await scopeStoreService.update('todos', this._todo, { done });
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't update the to-do. ${errorMessage(error)}`);
      this.render();
    }
  }

  private _edit(): void {
    this.setEditing(true);
    const input = this.element.querySelector<HTMLInputElement>('.todo-item__input');
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
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
    const text = this.element.querySelector<HTMLInputElement>('.todo-item__input')?.value.trim() ?? '';
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
    // Once this to-do leaves the list, the next one takes its index; else the previous one, else the quick add.
    requestFocus(
      `[data-index="${this._index}"] .todo-item__checkbox`,
      `[data-index="${this._index - 1}"] .todo-item__checkbox`,
      '.todo-composer__input',
    );
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

  private setEditing(editing: boolean): void {
    this.config = { todo: this._todo, editing };
    this.render();
  }
}
