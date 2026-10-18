import { Component, html } from '../../../core/index.js';
import { applyRequestedFocus } from '../../lib/focus.js';
import { TodoComposerComponent } from '../todo-composer/todo-composer.component.js';
import { TodoItemComponent } from '../todo-item/todo-item.component.js';

export interface ITodoListConfig {
  scope: NoteScope;
  key: string;
  todos: ITodo[];
}

interface ITodoListView {
  todos: ITodo[];
  label: string;
}

const templateFn = ({ todos, label }: ITodoListView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One scope's to-dos (open first, then done) and its quick add. Like the note list, the
 * sidebar keeps it across renders and hands it new to-dos through update(): unchanged items
 * and the quick add's text are kept.
 */
export class TodoListComponent extends Component<HTMLElement, ITodoListView> {
  private _scope: NoteScope;
  private _key: string;
  private _todos: ITodo[];

  constructor(mountTarget: HTMLElement, { scope, key, todos }: ITodoListConfig) {
    super({ templateFn, mountTarget, config: TodoListComponent.view(scope, todos) });
    this._scope = scope;
    this._key = key;
    this._todos = todos;
  }

  private static view(scope: NoteScope, todos: ITodo[]): ITodoListView {
    return { todos, label: scope === 'page' ? 'To-dos for this page' : 'To-dos for this site' };
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return [
      ...this.createCatalogComponents({
        items: this._todos,
        selector: 'todos',
        elementName: 'todo',
        elementTag: 'li',
        component: TodoItemComponent,
        // An unchanged to-do keeps its item (and an edit in progress); a changed one has a new updatedAt.
        keepBy: (todo: ITodo) => todo.id,
      }),
      { selector: 'todo-composer', factory: (el) => new TodoComposerComponent(el, { scope: this._scope, key: this._key }), keep: 'composer' },
    ];
  }

  public update(todos: ITodo[]): void {
    if (todos === this._todos) return;
    this._todos = todos;
    this.config = TodoListComponent.view(this._scope, todos);
    this.render();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    applyRequestedFocus(this.element);
  }
}
