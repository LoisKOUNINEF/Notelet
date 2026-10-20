import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { requireElement } from '../../lib/dom.js';
import { byData } from '../../lib/focus.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';

interface IChecklistAddView {
  name: string;
}

const templateFn = ({ name }: IChecklistAddView) => html`__TEMPLATE_PLACEHOLDER__`;

// Its field: where the focus goes back once the list comes back with the item.
export const CHECKLIST_ADD_INPUT = '.checklist-add__input';

// "Add an item…" under an open to-do list: the item goes last, unchecked.
export class ChecklistAddComponent extends Component<HTMLElement, IChecklistAddView> {
  private readonly _list: ITodo;

  constructor(mountTarget: HTMLElement, list: ITodo) {
    super({ templateFn, mountTarget, config: { name: list.text } });
    this._list = list;
  }

  private async _add(): Promise<void> {
    const input = requireElement<HTMLInputElement>(this.element, CHECKLIST_ADD_INPUT);
    const typed = input.value;
    const text = typed.trim();
    if (!text) return;

    // Emptied right away (a second Enter before the save ends adds nothing); restored if it fails.
    input.value = '';
    await runAction('Couldn\'t add the item.', () => scopeStoreService.updateWith('todos', this._list, (current) => ({
      items: [...(current.items ?? []), { id: crypto.randomUUID(), text, done: false }],
    })), {
      // The list comes back with the item as a new list item: focus the field again there.
      focus: [`${byData('todo-id', this._list.id)} ${CHECKLIST_ADD_INPUT}`],
      onError: () => { input.value = typed; },
    });
  }
}
