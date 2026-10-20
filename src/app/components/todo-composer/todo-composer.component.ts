import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { requireElement } from '../../lib/dom.js';
import { getDraft, getJsonDraft, setDraft, setJsonDraft } from '../../lib/drafts.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { ChecklistFieldsComponent } from '../checklist-fields/checklist-fields.component.js';

export interface ITodoComposerConfig {
  scope: NoteScope;
  key: string;
}

interface ITodoComposerView {
  scope: NoteScope;
  draft: string;
  // A to-do list being written: the field is its name, its items are fields below.
  listMode: boolean;
}

const templateFn = ({ scope, draft, listMode }: ITodoComposerView) => html`__TEMPLATE_PLACEHOLDER__`;

// Its text field: where the focus goes once a to-do leaves the list.
export const TODO_COMPOSER_INPUT = '.todo-composer__input';

/**
 * The quick add, on top of the to-dos. A single to-do: one line, Enter adds it. "List" turns it
 * into a to-do list: the line becomes its name, with one field per item below (Enter adds the
 * next one; Ctrl/Cmd+Enter or "Add" adds the list). Removing every item makes it single again.
 * What's typed is kept as drafts.
 */
export class TodoComposerComponent extends Component<HTMLElement, ITodoComposerView> {
  private _scope: NoteScope;
  private _key: string;
  private _items: IChecklistItem[];
  private _checklist: ChecklistFieldsComponent | null = null;

  constructor(mountTarget: HTMLElement, { scope, key }: ITodoComposerConfig) {
    const draftItems = getJsonDraft<IChecklistItem[]>(itemsDraftId(scope, key));
    const items = Array.isArray(draftItems) ? draftItems : [];
    super({ templateFn, mountTarget, config: { scope, draft: getDraft(draftId(scope, key)), listMode: items.length > 0 } });
    this._scope = scope;
    this._key = key;
    this._items = items;
  }

  private get input(): HTMLInputElement {
    return requireElement(this.element, TODO_COMPOSER_INPUT);
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return [{
      selector: 'checklist-fields',
      factory: (el) => (this._checklist = new ChecklistFieldsComponent(el, {
        items: this._items,
        label: 'List items',
        className: 'todo-composer__items',
        onEscape: () => this.input.focus(),
        onLastRemoved: () => {
          this.setListMode(false);
          requireElement(this.element, '.todo-composer__list').focus();
        },
        onChange: () => this.saveItemsDraft(),
      })),
      keep: 'fields',
    }];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    const input = this.input;
    const onInput = () => setDraft(draftId(this._scope, this._key), input.value);
    input.addEventListener('input', onInput);
    this.eventListeners.push([input, 'input', onInput]);
    // In list mode Enter in an item adds the next one: Ctrl/Cmd+Enter adds the list from anywhere.
    const form = requireElement<HTMLFormElement>(this.element, 'form');
    const onKeydown = (event: Event) => {
      const { key, ctrlKey, metaKey } = event as KeyboardEvent;
      if (key !== 'Enter' || !(ctrlKey || metaKey)) return;
      event.preventDefault();
      form.requestSubmit();
    };
    form.addEventListener('keydown', onKeydown);
    this.eventListeners.push([form, 'keydown', onKeydown]);
  }

  // Items typed but not added yet survive a tab switch, like the name.
  protected override onBeforeDestroy(): void {
    this.saveItemsDraft();
    super.onBeforeDestroy();
  }

  // "List", then "Add item": one more field, focused once the list has a name (else the name is).
  private _addListItem(): void {
    if (!this.config.listMode) this.setListMode(true);
    const named = this.input.value.trim() !== '';
    this.checklist.add(undefined, named);
    if (!named) this.input.focus();
  }

  private async _add(): Promise<void> {
    const input = this.input;
    const text = input.value.trim();
    if (!text) return;
    const checklist = this.checklist;
    const fields = checklist.values();
    // Items left empty are dropped: none left, it's a single to-do.
    const items = fields.map((field) => ({ ...field, text: field.text.trim() })).filter((field) => field.text);

    // Ready for the next one right away; restored if the save fails.
    input.value = '';
    setDraft(draftId(this._scope, this._key), '');
    checklist.reset([]);
    this.setListMode(false);
    await runAction('Couldn\'t add the to-do.', () => scopeStoreService.addTodo(this._scope, this._key, text, items), {
      focus: [TODO_COMPOSER_INPUT],
      onError: () => {
        setDraft(draftId(this._scope, this._key), text);
        if (fields.length > 0) this.setListMode(true);
        checklist.reset(fields);
        this.input.value = text;
      },
    });
  }

  // Re-rendered with the other label, placeholder and buttons; what's typed comes back from its draft.
  private setListMode(listMode: boolean): void {
    if (listMode === this.config.listMode) return;
    this.config = { ...this.config, draft: this.input.value, listMode };
    this.render();
  }

  // Created with the first render (see registerChildren), kept across the others.
  private get checklist(): ChecklistFieldsComponent {
    if (!this._checklist) throw new Error('The checklist fields are rendered with the composer.');
    return this._checklist;
  }

  private saveItemsDraft(): void {
    const items = this._checklist?.values() ?? [];
    setJsonDraft(itemsDraftId(this._scope, this._key), items.length > 0 ? items : null);
  }
}

function draftId(scope: NoteScope, key: string): string {
  return `todo:${scope}:${key}`;
}

function itemsDraftId(scope: NoteScope, key: string): string {
  return `todo-items:${scope}:${key}`;
}
