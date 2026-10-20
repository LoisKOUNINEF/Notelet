import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { requireElement } from '../../lib/dom.js';
import { getDraft, setDraft } from '../../lib/drafts.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';

export interface INoteComposerConfig {
  scope: NoteScope;
  key: string;
}

interface INoteComposerView {
  label: string;
  draft: string;
}

const templateFn = ({ label, draft }: INoteComposerView) => html`__TEMPLATE_PLACEHOLDER__`;

// Its text field: where the focus goes once a note leaves the list.
export const NOTE_COMPOSER_INPUT = '.note-composer__input';

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

  private get input(): HTMLTextAreaElement {
    return requireElement(this.element, NOTE_COMPOSER_INPUT);
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
      requireElement<HTMLFormElement>(this.element, 'form').requestSubmit();
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
    await runAction('Couldn\'t add the note.', () => scopeStoreService.addNote(this._scope, this._key, text), {
      focus: [NOTE_COMPOSER_INPUT],
      onError: () => {
        input.value = typed;
        setDraft(draftId(this._scope, this._key), typed);
      },
    });
  }
}

function draftId(scope: NoteScope, key: string): string {
  return `note:${scope}:${key}`;
}
