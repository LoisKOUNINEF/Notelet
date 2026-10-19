import { Component, html } from '../../../core/index.js';
import { getDraft, setDraft } from '../../lib/drafts.js';
import { errorMessage } from '../../lib/errors.js';
import { clearRequestedFocus, requestFocus } from '../../lib/focus.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';

export interface ITodoComposerConfig {
  scope: NoteScope;
  key: string;
}

interface ITodoComposerView {
  label: string;
  draft: string;
}

const templateFn = ({ label, draft }: ITodoComposerView) => html`__TEMPLATE_PLACEHOLDER__`;

// One-line quick add, always shown under the to-dos: Enter (the form's submit) adds.
export class TodoComposerComponent extends Component<HTMLElement, ITodoComposerView> {
  private _scope: NoteScope;
  private _key: string;

  constructor(mountTarget: HTMLElement, { scope, key }: ITodoComposerConfig) {
    super({
      templateFn,
      mountTarget,
      config: {
        label: scope === 'page' ? 'Add a to-do for this page' : 'Add a to-do for this site',
        draft: getDraft(draftId(scope, key)),
      },
    });
    this._scope = scope;
    this._key = key;
  }

  // Always rendered by the template.
  private get input(): HTMLInputElement {
    return this.element.querySelector<HTMLInputElement>('.todo-composer__input')!;
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    const input = this.input;
    const onInput = () => setDraft(draftId(this._scope, this._key), input.value);
    input.addEventListener('input', onInput);
    this.eventListeners.push([input, 'input', onInput]);
  }

  private async _add(): Promise<void> {
    const input = this.input;
    const text = input.value.trim();
    if (!text) return;

    // Ready for the next one right away; restored if the save fails.
    input.value = '';
    setDraft(draftId(this._scope, this._key), '');
    requestFocus('.todo-composer__input');
    try {
      await scopeStoreService.addTodo(this._scope, this._key, text);
    } catch (error) {
      // The focus stays here; a later re-render mustn't bring it back here from elsewhere.
      clearRequestedFocus();
      input.value = text;
      setDraft(draftId(this._scope, this._key), text);
      notifierService.error(`Couldn't add the to-do. ${errorMessage(error)}`);
    }
  }
}

function draftId(scope: NoteScope, key: string): string {
  return `todo:${scope}:${key}`;
}
