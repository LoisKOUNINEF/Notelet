import { Component, html } from '../../../core/index.js';
import { requestFocus } from '../../lib/focus.js';
import { notesStoreService } from '../../services/notes-store/notes-store.service.js';
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

// Unsent text per scope key, for this panel's lifetime: switching tabs or pages doesn't lose it.
const drafts = new Map<string, string>();

export class NoteComposerComponent extends Component<HTMLElement, INoteComposerView> {
  private _scope: NoteScope;
  private _key: string;

  constructor(mountTarget: HTMLElement, { scope, key }: INoteComposerConfig) {
    super({
      templateFn,
      mountTarget,
      config: {
        label: scope === 'page' ? 'New note for this page' : 'New note for this site',
        draft: drafts.get(draftKey(scope, key)) ?? '',
      },
    });
    this._scope = scope;
    this._key = key;
  }

  private get input(): HTMLTextAreaElement | null {
    return this.element.querySelector<HTMLTextAreaElement>('.note-composer__input');
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // `input` is the only event left to the textarea: data-event already holds its keydown.
    const input = this.input;
    if (!input) return;
    const onInput = () => drafts.set(draftKey(this._scope, this._key), input.value);
    input.addEventListener('input', onInput);
    this.eventListeners.push([input, 'input', onInput]);
  }

  private _onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.element.querySelector('form')?.requestSubmit();
    }
  }

  private async _add(): Promise<void> {
    const input = this.input;
    const text = input?.value.trim() ?? '';
    if (!input || !text) return;

    // Ready for the next note right away; restored if the save fails.
    input.value = '';
    drafts.delete(draftKey(this._scope, this._key));
    requestFocus('.note-composer__input');
    try {
      await notesStoreService.add(this._scope, this._key, text);
    } catch (error) {
      input.value = text;
      drafts.set(draftKey(this._scope, this._key), text);
      notifierService.error(`Couldn't add the note. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function draftKey(scope: NoteScope, key: string): string {
  return `${scope}:${key}`;
}
