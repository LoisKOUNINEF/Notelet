import { Component, html } from '../../../core/index.js';
import { clearRequestedFocus, requestFocus } from '../../lib/focus.js';
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
}

const templateFn = ({ label, draft }: INoteComposerView) => html`__TEMPLATE_PLACEHOLDER__`;

// A new note: its text, kept as a draft. Ctrl/Cmd+Enter (or "Add note") adds it.
export class NoteComposerComponent extends Component<HTMLElement, INoteComposerView> {
  private _scope: NoteScope;
  private _key: string;

  constructor(mountTarget: HTMLElement, { scope, key }: INoteComposerConfig) {
    super({
      templateFn,
      mountTarget,
      config: {
        label: scope === 'page' ? 'New note for this page' : 'New note for this site',
        draft: getDraft(draftId(scope, key)),
      },
    });
    this._scope = scope;
    this._key = key;
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
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.element.querySelector('form')!.requestSubmit();
    }
  }

  private async _add(): Promise<void> {
    const input = this.input;
    const typed = input.value;
    const text = typed.trim();
    if (!text) return;

    // Ready for the next note right away; restored if the save fails.
    input.value = '';
    setDraft(draftId(this._scope, this._key), '');
    requestFocus('.note-composer__input');
    try {
      await scopeStoreService.addNote(this._scope, this._key, text);
    } catch (error) {
      // The focus stays here; a later re-render mustn't bring it back here from elsewhere.
      clearRequestedFocus();
      input.value = typed;
      setDraft(draftId(this._scope, this._key), typed);
      notifierService.error(`Couldn't add the note. ${errorMessage(error)}`);
    }
  }
}

function draftId(scope: NoteScope, key: string): string {
  return `note:${scope}:${key}`;
}
