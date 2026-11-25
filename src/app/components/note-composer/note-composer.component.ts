import {
  Component,
  html,
  // @ts-ignore : function used in HTML template
  raw,
} from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { blockForm, formKeys, requireElement, requireText } from '../../lib/dom.js';
import { getDraft, setDraft } from '../../lib/drafts.js';
import { noteRef } from '../../lib/labels.js';
import { submitShortcut } from '../../lib/platform.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';

export interface INoteComposerConfig {
  scope: NoteScope;
  key: string;
}

interface INoteComposerView {
  label: string;
  draft: string;
  // The note list is selecting notes: nothing can be added meanwhile (see setSelecting).
  blocked: boolean;
}

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ label, draft, blocked }: INoteComposerView) => html`__TEMPLATE_PLACEHOLDER__`;

// Its text field: where the focus goes once a note leaves the list.
export const NOTE_COMPOSER_INPUT = '.note-composer__input';

// What the hint says while the list is selecting.
const BLOCKED_HINT = 'Finish or cancel the selection to add a note';

/**
 * A new note: its text, kept as a draft. Ctrl/Cmd+Enter (or "Add note") adds it.
 * Disabled while the note list is selecting notes, the hint saying why (see setSelecting).
 */
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
        blocked: false,
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
    const input = this.input;
    requireText(input);
    const onInput = () => setDraft(draftId(this._scope, this._key), input.value);
    input.addEventListener('input', onInput);
    // Plain Enter adds a line; Ctrl/Cmd+Enter adds the note, from the button too.
    this.eventListeners.push([input, 'input', onInput], ...formKeys(requireElement<HTMLFormElement>(this.element, 'form')));
  }

  // Disabled (its draft kept) while the note list is selecting, and back once it's done: patched in
  // place, what's typed stays as it is.
  public setSelecting(selecting: boolean): void {
    if (this.isDestroyed || selecting === this.config.blocked) return;
    this.config = { ...this.config, blocked: selecting };
    blockForm(this.element, '.note-composer__fieldset', '.note-composer__hint', selecting ? BLOCKED_HINT : `${submitShortcut()} to add`, selecting);
  }

  // @ts-ignore : function used in HTML template
  private async _add(): Promise<void> {
    if (this.config.blocked) return;
    const input = this.input;
    const typed = input.value;
    const text = typed.trim();
    if (!text) return;

    // Ready for the next note right away; restored if the save fails.
    input.value = '';
    setDraft(draftId(this._scope, this._key), '');
    await runAction(`Couldn't add ${noteRef({ text })}.`, () => scopeStoreService.addNote(this._scope, this._key, text), {
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
