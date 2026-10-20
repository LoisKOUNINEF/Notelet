import { Component, html, raw } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { byData } from '../../lib/focus.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { DONE_TOGGLE } from '../todo-list/todo-list.selectors.js';

// What a to-do list passes to each of its items (see createCatalogComponents).
export interface IChecklistItemOptions {
  todo: ITodo;
}

interface IChecklistItemView {
  item: IChecklistItem;
}

const templateFn = ({ item }: IChecklistItemView) => html`__TEMPLATE_PLACEHOLDER__`;

// One item of a to-do list, checked right from the list. Checked items stay in place; checking
// the last one moves the whole list to "Done" (see ScopeStoreService.updateWith).
export class ChecklistItemComponent extends Component<HTMLElement, IChecklistItemView> {
  private _item: IChecklistItem;
  private _todo: ITodo;

  constructor(mountTarget: HTMLElement, config: IChecklistItem & { index: number }, options: IChecklistItemOptions) {
    const { index: _index, ...item } = config;
    super({
      templateFn,
      mountTarget,
      props: { className: item.done ? 'checklist-item checklist-item--done' : 'checklist-item' },
      config: { item },
    });
    // Lets the list find this item's checkbox again after it re-renders (see requestFocus).
    this.element.dataset.itemId = item.id;
    this._item = item;
    this._todo = options.todo;
  }

  private async _toggle(done: boolean): Promise<void> {
    const id = this._item.id;
    const updated = await runAction('Couldn\'t update the item.', () => scopeStoreService.updateWith('todos', this._todo, checking(id, done)), {
      // Checking the last item moves the list to "Done": if that group is collapsed, the list
      // leaves the view, and the focus goes to the group's toggle.
      focus: [`${byData('todo-id', this._todo.id)} ${byData('item-id', id)} .checklist-item__checkbox`, DONE_TOGGLE],
      // The checkbox shows what's stored again.
      onError: () => this.render(),
    });
    if (updated?.done && !this._todo.done && !settingsService.doneExpanded) {
      notifierService.undoable('List done.', () => scopeStoreService.updateWith('todos', updated, checking(id, false)), 'Couldn\'t update the list.', 'success');
    }
  }
}

// The change that checks (or unchecks) item `id`, applied to the list as stored: another item
// checked a moment ago isn't overwritten.
function checking(id: string, done: boolean): (current: ITodo) => Pick<ITodo, 'items'> {
  return (current) => ({ items: (current.items ?? []).map((item) => (item.id === id ? { ...item, done } : item)) });
}
