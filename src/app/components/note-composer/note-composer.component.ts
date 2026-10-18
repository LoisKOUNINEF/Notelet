import { Component, html } from '../../../core/index.js';
import { requestFocus } from '../../lib/focus.js';
import { continueChecklist, parseChecklist, startChecklistLine, withIds } from '../../lib/checklist.js';
import { getDraft, setDraft } from '../../lib/drafts.js';
import { errorMessage } from '../../lib/errors.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';

export interface INoteComposerConfig {
  scope: NoteScope;
  key: string;
}

interface INoteComposerView {
  label: string;
  draft: string;
  // Checklist mode: Enter on a "- [ ] " line starts the next one.
  checklist: boolean;
}

const templateFn = ({ label, draft, checklist }: INoteComposerView) => html`__TEMPLATE_PLACEHOLDER__`;

export class NoteComposerComponent extends Component<HTMLElement, INoteComposerView> {
  private _scope: NoteScope;
  private _key: string;
  private _checklist: boolean;

  constructor(mountTarget: HTMLElement, { scope, key }: INoteComposerConfig) {
    super({
      templateFn,
      mountTarget,
      config: {
        label: scope === 'page' ? 'New note for this page' : 'New note for this site',
        draft: getDraft(draftId(scope, key)),
        checklist: getDraft(checklistDraftId(scope, key)) === 'on',
      },
    });
    this._scope = scope;
    this._key = key;
    this._checklist = this.config.checklist;
  }

  // Always rendered by the template.
  private get input(): HTMLTextAreaElement {
    return this.element.querySelector<HTMLTextAreaElement>('.note-composer__input')!;
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // `input` is the only event left to the textarea: data-event already holds its keydown.
    const input = this.input;
    const onInput = () => setDraft(draftId(this._scope, this._key), input.value);
    input.addEventListener('input', onInput);
    this.eventListeners.push([input, 'input', onInput]);
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.element.querySelector('form')!.requestSubmit();
      return;
    }
    const input = this.input;
    const next = this._checklist ? continueChecklist(input.value, input.selectionStart, input.selectionEnd) : null;
    if (!next) return;
    event.preventDefault();
    this.setText(next.value, next.caret);
  }

  private _toggleChecklist(): void {
    this.setChecklist(!this._checklist);
    const input = this.input;
    if (this._checklist) {
      const next = startChecklistLine(input.value, input.selectionStart);
      this.setText(next.value, next.caret);
    }
    input.focus();
  }

  private async _add(): Promise<void> {
    const input = this.input;
    const typed = input.value;
    // "- [ ] item" lines become the note's checklist.
    const { text, items } = parseChecklist(typed);
    if (!text && items.length === 0) return;

    // Ready for the next note right away; restored if the save fails.
    const checklist = this._checklist;
    input.value = '';
    setDraft(draftId(this._scope, this._key), '');
    this.setChecklist(false);
    requestFocus('.note-composer__input');
    try {
      await scopeStoreService.addNote(this._scope, this._key, text, withIds(items));
    } catch (error) {
      input.value = typed;
      setDraft(draftId(this._scope, this._key), typed);
      this.setChecklist(checklist);
      notifierService.error(`Couldn't add the note. ${errorMessage(error)}`);
    }
  }

  // Typed into the field by code, so kept as a draft by hand (no input event fires).
  private setText(value: string, caret: number): void {
    const input = this.input;
    input.value = value;
    input.setSelectionRange(caret, caret);
    setDraft(draftId(this._scope, this._key), value);
  }

  // Only its own button changes: a render would rebuild the field being typed in.
  private setChecklist(on: boolean): void {
    this._checklist = on;
    this.element.querySelector('.note-composer__checklist')!.setAttribute('aria-pressed', String(on));
    setDraft(checklistDraftId(this._scope, this._key), on ? 'on' : '');
  }
}

function draftId(scope: NoteScope, key: string): string {
  return `note:${scope}:${key}`;
}

function checklistDraftId(scope: NoteScope, key: string): string {
  return `note-checklist:${scope}:${key}`;
}
