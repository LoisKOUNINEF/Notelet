import { Component, html, raw } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';
import { applyRequestedFocus, requestFocus } from '../../lib/focus.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { TodoComposerComponent } from '../todo-composer/todo-composer.component.js';
import { TodoItemComponent, type ITodoItemOptions } from '../todo-item/todo-item.component.js';

export interface ITodoListConfig {
  scope: NoteScope;
  key: string;
  todos: ITodo[];
}

interface ITodoListView {
  open: ITodo[];
  done: ITodo[];
  expanded: boolean;
  label: string;
}

const templateFn = ({ open, done, expanded, label }: ITodoListView) => html`__TEMPLATE_PLACEHOLDER__`;

// One object per group for every render: items are only kept while their options are unchanged.
const ITEM_OPTIONS: Record<ITodoItemOptions['group'], ITodoItemOptions> = {
  open: { group: 'open' },
  done: { group: 'done' },
};

/**
 * One scope's to-dos: the open ones, its quick add, then the done ones in a "Done (n)" group,
 * collapsed or not as last left (a setting shared by every page). Like the note list, the
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
    return {
      open: todos.filter((todo) => !todo.done),
      done: todos.filter((todo) => todo.done),
      expanded: settingsService.doneExpanded,
      label: scope === 'page' ? 'To-dos for this page' : 'To-dos for this site',
    };
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    const { open, done } = this.config;
    const catalog = (group: ITodoItemOptions['group'], items: ITodo[]) => this.createCatalogComponents({
      items,
      selector: `${group}-todos`,
      elementName: `${group}-todo`,
      elementTag: 'li',
      component: TodoItemComponent,
      props: ITEM_OPTIONS[group],
      // An unchanged to-do keeps its item (and an edit in progress); a changed one has a new updatedAt.
      keepBy: (todo: ITodo) => todo.id,
    });

    return [
      ...catalog('open', open),
      ...catalog('done', done),
      { selector: 'todo-composer', factory: (el) => new TodoComposerComponent(el, { scope: this._scope, key: this._key }), keep: 'composer' },
    ];
  }

  public update(todos: ITodo[]): void {
    if (todos === this._todos) return;
    this._todos = todos;
    this.refresh();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    applyRequestedFocus(this.element);
  }

  private async _toggleDone(): Promise<void> {
    requestFocus('.todo-list__done-toggle');
    await settingsService.setDoneExpanded(!settingsService.doneExpanded);
    this.refresh();
  }

  private async _clearDone(): Promise<void> {
    const done = this.config.done;
    // The group goes away with its last to-do.
    requestFocus('.todo-composer__input');
    try {
      await scopeStoreService.removeMany('todos', done);
      notifierService.info(`${done.length} completed ${done.length === 1 ? 'to-do' : 'to-dos'} cleared.`, {
        label: 'Undo',
        run: () => void scopeStoreService.restoreMany('todos', done).catch((error) => {
          notifierService.error(`Couldn't restore the to-dos. ${errorMessage(error)}`);
        }),
      });
    } catch (error) {
      notifierService.error(`Couldn't clear the completed to-dos. ${errorMessage(error)}`);
    }
  }

  private refresh(): void {
    this.config = TodoListComponent.view(this._scope, this._todos);
    this.render();
  }
}
