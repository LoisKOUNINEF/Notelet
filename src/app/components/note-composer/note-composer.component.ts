import { Component, html, raw } from '../../../core/index.js';
import { clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { parseChecklist, withIds } from '../../lib/checklist.js';
import { getDraft, getJsonDraft, setDraft, setJsonDraft } from '../../lib/drafts.js';
import { errorMessage } from '../../lib/errors.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { ChecklistFieldsComponent } from '../checklist-fields/checklist-fields.component.js';

export interface INoteComposerConfig {
  scope: NoteScope;
  key: string;
}

interface INoteComposerView {
  label: string;
  draft: string;
  // The checklist being written has items: its button adds more, and the text is optional.
  hasItems: boolean;
}

const templateFn = ({ label, draft, hasItems }: INoteComposerView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * A new note: its text, and its checklist written one field per item ("Checklist" adds the
 * first). "- [ ] item" lines typed in the text become items too. Both are kept as drafts.
 */
export class NoteComposerComponent extends Component<HTMLElement, INoteComposerView> {
  private _scope: NoteScope;
  private _key: string;
  private _items: IChecklistItem[];
  private _checklist: ChecklistFieldsComponent | null = null;

  constructor(mountTarget: HTMLElement, { scope, key }: INoteComposerConfig) {
    // A draft from before checklist fields (the old toggle's 'on') reads as no items.
    const draftItems = getJsonDraft<unknown>(checklistDraftId(scope, key));
    const items = Array.isArray(draftItems) ? (draftItems as IChecklistItem[]) : [];
    super({
      templateFn,
      mountTarget,
      config: {
        label: scope === 'page' ? 'New note for this page' : 'New note for this site',
        draft: getDraft(draftId(scope, key)),
        hasItems: items.length > 0,
      },
    });
    this._scope = scope;
    this._key = key;
    this._items = items;
  }

  // Always rendered by the template.
  private get input(): HTMLTextAreaElement {
    return this.element.querySelector<HTMLTextAreaElement>('.note-composer__input')!;
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return [{
      selector: 'checklist-fields',
      factory: (el) => (this._checklist = new ChecklistFieldsComponent(el, {
        items: this._items,
        label: 'Checklist items',
        className: 'note-composer__items',
        onEscape: () => this.input.focus(),
        onLastRemoved: () => this.element.querySelector<HTMLElement>('.note-composer__checklist')!.focus(),
        onChange: () => this.onItemsChanged(),
      })),
      keep: 'fields',
    }];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // `input` is the only event left to the textarea: data-event already holds its keydown.
    const input = this.input;
    const onInput = () => setDraft(draftId(this._scope, this._key), input.value);
    input.addEventListener('input', onInput);
    this.eventListeners.push([input, 'input', onInput]);
  }

  // Items typed but not added yet survive a tab switch, like the text.
  protected override onBeforeDestroy(): void {
    this.saveItemsDraft();
    super.onBeforeDestroy();
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.element.querySelector('form')!.requestSubmit();
    }
  }

  private _addChecklistItem(): void {
    this._checklist!.add();
  }

  private async _add(): Promise<void> {
    const input = this.input;
    const typed = input.value;
    const fields = this._checklist!.values();
    // Field items first, then "- [ ] item" lines typed in the text.
    const { text, items: typedItems } = parseChecklist(typed);
    const items = [
      ...fields.map((field) => ({ ...field, text: field.text.trim() })).filter((field) => field.text),
      ...withIds(typedItems),
    ];
    if (!text && items.length === 0) return;

    // Ready for the next note right away; restored if the save fails.
    input.value = '';
    setDraft(draftId(this._scope, this._key), '');
    this._checklist!.reset([]);
    requestFocus('.note-composer__input');
    try {
      await scopeStoreService.addNote(this._scope, this._key, text, items);
    } catch (error) {
      // The focus stays here; a later re-render mustn't bring it back here from elsewhere.
      clearRequestedFocus();
      input.value = typed;
      setDraft(draftId(this._scope, this._key), typed);
      this._checklist!.reset(fields);
      notifierService.error(`Couldn't add the note. ${errorMessage(error)}`);
    }
  }

  // Only the button and the field's `required` change: a render would rebuild the text being typed.
  private onItemsChanged(): void {
    const hasItems = this._checklist!.count > 0;
    this.config = { ...this.config, hasItems };
    this.element.querySelector('.note-composer__checklist')!.textContent = buttonLabel(hasItems);
    // An items-only note has no text: the browser mustn't refuse to submit it.
    this.input.required = !hasItems;
    this.saveItemsDraft();
  }

  private saveItemsDraft(): void {
    const items = this._checklist?.values() ?? [];
    setJsonDraft(checklistDraftId(this._scope, this._key), items.length > 0 ? items : null);
  }
}

function buttonLabel(hasItems: boolean): string {
  return hasItems ? 'Add item' : 'Checklist';
}

function draftId(scope: NoteScope, key: string): string {
  return `note:${scope}:${key}`;
}

function checklistDraftId(scope: NoteScope, key: string): string {
  return `note-checklist:${scope}:${key}`;
}
