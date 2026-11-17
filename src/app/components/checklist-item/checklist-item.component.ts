import { Component, html, raw } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { revealDoneGroup } from '../../lib/done-group.js';
import { byData } from '../../lib/focus.js';
import { quoted, sentence, todoRef } from '../../lib/labels.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { DONE_TOGGLE } from '../todo-list/todo-list.selectors.js';

// What a checklist passes to each of its items (see createCatalogComponents).
export interface IChecklistItemOptions {
  todo: ITodo;
}

interface IChecklistItemView {
  item: IChecklistItem;
}

const templateFn = ({ item }: IChecklistItemView) => html`__TEMPLATE_PLACEHOLDER__`;

// One item of a checklist, checked right from the checklist. Checked items stay in place; checking
// the last one moves the whole checklist to "Done" (see ScopeStoreService.updateWith).
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
    // Lets the checklist find this item's checkbox again after it re-renders (see requestFocus).
    this.element.dataset.itemId = item.id;
    this._item = item;
    this._todo = options.todo;
  }

  private async _toggle(done: boolean): Promise<void> {
    const id = this._item.id;
    // Checking the last open item moves the checklist to "Done": it unfolds first, to show it there.
    if (done && (this._todo.items ?? []).every((item) => item.done || item.id === id)) await revealDoneGroup();
    const updated = await runAction(`Couldn't update ${quoted(this._item.text)}.`, () => scopeStoreService.updateWith('todos', this._todo, checking(id, done)), {
      // If "Done" couldn't be unfolded, the checklist leaves the view: the focus goes to the group's toggle.
      focus: [`${byData('todo-id', this._todo.id)} ${byData('item-id', id)} .checklist-item__checkbox`, DONE_TOGGLE],
      // The checkbox shows what's stored again.
      onError: () => this.render(),
    });
    if (updated?.done && !this._todo.done && !settingsService.doneExpanded) {
      notifierService.undoable(`${sentence(todoRef(updated))} done.`, () => scopeStoreService.updateWith('todos', updated, checking(id, false)), `Couldn't update ${todoRef(updated)}.`, 'success');
    }
  }
}

// The change that checks (or unchecks) item `id`, applied to the checklist as stored: another item
// checked a moment ago isn't overwritten.
function checking(id: string, done: boolean): (current: ITodo) => Pick<ITodo, 'items'> {
  return (current) => ({ items: (current.items ?? []).map((item) => (item.id === id ? { ...item, done } : item)) });
}
