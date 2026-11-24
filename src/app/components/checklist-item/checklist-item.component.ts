import {
  Component,
  html,
  // @ts-ignore : function used in HTML template
  raw,
} from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { onWidthChange, overflowsOneLine } from '../../lib/dom.js';
import { revealDoneGroup } from '../../lib/done-group.js';
import { byData } from '../../lib/focus.js';
import { quoted, sentence, todoRef } from '../../lib/labels.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { DONE_TOGGLE } from '../todo-list/todo-list.selectors.js';

export interface IChecklistItemOptions {
  todo: ITodo;
}

interface IChecklistItemView {
  item: IChecklistItem;
  // Folded down to its first line (see _toggleCollapsed).
  collapsed: boolean;
}

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ item, collapsed }: IChecklistItemView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One item of a checklist, checked right from the checklist.
 * Checked items stay in place; checking the last one moves the whole checklist to "Done".
 * A text too long for one line gets an arrow beside its checkbox, folding it down to its first
 * line (saved on the item).
 */
export class ChecklistItemComponent extends Component<HTMLElement, IChecklistItemView> {
  private _item: IChecklistItem;
  private _todo: ITodo;
  private _stopWatching: (() => void) | null = null;

  constructor(mountTarget: HTMLElement, config: IChecklistItem & { index: number }, options: IChecklistItemOptions) {
    const { index: _index, ...item } = config;
    super({
      templateFn,
      mountTarget,
      props: { className: item.done ? 'checklist-item checklist-item--done' : 'checklist-item' },
      config: { item, collapsed: !!item.collapsed },
    });
    // Lets the checklist find this item's checkbox again after it re-renders (see requestFocus).
    this.element.dataset.itemId = item.id;
    this._item = item;
    this._todo = options.todo;
  }

  protected override onBeforeRender(): void {
    this.stopWatching();
    super.onBeforeRender();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    this.fitArrow();
    this._stopWatching = onWidthChange(this.element, () => this.fitArrow());
  }

  protected override onBeforeDestroy(): void {
    this.stopWatching();
    super.onBeforeDestroy();
  }

  private stopWatching(): void {
    this._stopWatching?.();
    this._stopWatching = null;
  }

  // The arrow shows only while the text doesn't fit on one line (wrapped, or cut when folded).
  private fitArrow(): void {
    const toggle = this.element.querySelector<HTMLElement>('.checklist-item__toggle');
    const text = this.element.querySelector<HTMLElement>('.checklist-item__text');
    if (toggle && text) toggle.hidden = !overflowsOneLine(text);
  }

  // @ts-ignore : function used in HTML template
  // Folded right away; the stored checklist then comes back as a new list item, focus on this arrow.
  private async _toggleCollapsed(): Promise<void> {
    const collapsed = !this.config.collapsed;
    const toggle = `${byData('todo-id', this._todo.id)} ${byData('item-id', this._item.id)} .checklist-item__toggle`;
    this.config = { ...this.config, collapsed };
    this.render();
    this.element.querySelector<HTMLElement>('.checklist-item__toggle')?.focus();
    await runAction(`Couldn't update ${quoted(this._item.text)}.`, () => scopeStoreService.setItemCollapsed(this._todo, this._item.id, collapsed), {
      focus: [toggle],
      onError: () => {
        this.config = { ...this.config, collapsed: !collapsed };
        this.render();
      },
    });
  }

  // @ts-ignore : function used in HTML template
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
    // Unchecking an item of a done checklist moves it back among the open ones: Undo checks it again.
    if (updated && !updated.done && this._todo.done) {
      notifierService.undoable(`${sentence(todoRef(updated))} marked as undone.`, () => scopeStoreService.updateWith('todos', updated, checking(id, true)), `Couldn't update ${todoRef(updated)}.`, 'success');
    }
  }
}

// The change that checks (or unchecks) item `id`, applied to the checklist as stored.
function checking(id: string, done: boolean): (current: ITodo) => Pick<ITodo, 'items'> {
  return (current) => ({ items: (current.items ?? []).map((item) => (item.id === id ? { ...item, done } : item)) });
}
