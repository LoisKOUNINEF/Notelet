import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { fitHeight, lineField, requireElement, requireText } from '../../lib/dom.js';
import { byData } from '../../lib/focus.js';
import { quoted, todoRef } from '../../lib/labels.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';

interface IChecklistAddView {
  name: string;
}

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ name }: IChecklistAddView) => html`__TEMPLATE_PLACEHOLDER__`;

// Its field: where the focus goes back once the checklist comes back with the item.
export const CHECKLIST_ADD_INPUT = '.checklist-add__input';

// "Add an item…" under an open checklist: the item goes last, unchecked.
export class ChecklistAddComponent extends Component<HTMLElement, IChecklistAddView> {
  private readonly _checklist: IChecklist;

  constructor(mountTarget: HTMLElement, checklist: IChecklist) {
    super({ templateFn, mountTarget, config: { name: checklist.text } });
    this._checklist = checklist;
  }

  // Enter adds the item, as in a one-line field. A blank item is highlighted instead.
  protected override onAfterRender(): void {
    super.onAfterRender();
    const input = requireElement<HTMLTextAreaElement>(this.element, CHECKLIST_ADD_INPUT);
    requireText(input);
    this.eventListeners.push(...lineField(input));
  }

  // @ts-ignore : function used in HTML template
  private async _add(): Promise<void> {
    const input = requireElement<HTMLTextAreaElement>(this.element, CHECKLIST_ADD_INPUT);
    const typed = input.value;
    const text = typed.trim();
    if (!text) return;

    // Emptied right away (a second Enter before the save ends adds nothing); restored if it fails.
    input.value = '';
    fitHeight(input);
    await runAction(`Couldn't add ${quoted(text)} to ${todoRef(this._checklist)}.`, () => scopeStoreService.updateWith('todos', this._checklist, (current) => ({
      items: [...(current.items ?? []), { id: crypto.randomUUID(), text, done: false }],
    })), {
      // The checklist comes back with the item as a new list item: focus the field again there.
      focus: [`${byData('todo-id', this._checklist.id)} ${CHECKLIST_ADD_INPUT}`],
      onError: () => {
        input.value = typed;
        fitHeight(input);
      },
    });
  }
}
