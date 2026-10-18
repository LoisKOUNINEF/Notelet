import { TodoComposerComponent } from '#root/dist/src/app/components/todo-composer/todo-composer.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, settle, startPanel, typeInto } from '../../testing/panel.js';

describe('TodoComposerComponent', () => {
  let panel;
  let composer;

  const mount = (scope) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    composer = new TodoComposerComponent(placeholder, { scope, key: KEYS[scope] });
    composer.render();
  };
  const input = () => $('.todo-composer__input');
  // Enter in a one-field form submits it.
  const submit = async () => {
    $('.todo-composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };
  const stored = async (scope) => (await scopeStoreService.load(KEYS))[scope].todos.map((t) => t.text);

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    composer.destroy();
    await panel.stop();
  });

  it('labels the field with its scope, and names its button', () => {
    mount('site');
    expect($('a11y-label').textContent).toBe('Add a to-do for this site');
    expect($('.todo-composer__submit').textContent).toBe('Add to-do');
  });

  it('adds the trimmed to-do to its scope and clears the field', async () => {
    mount('site');
    typeInto(input(), '  Renew the certificate  ');
    await submit();

    expect(await stored('site')).toEqual(['Renew the certificate']);
    expect(input().value).toBe('');
  });

  it('ignores an empty or blank to-do', async () => {
    mount('page');
    typeInto(input(), '   ');
    await submit();
    expect(await stored('page')).toEqual([]);
  });

  it('gives the text back and explains when the to-do can\'t be saved', async () => {
    mount('page');
    typeInto(input(), 'Keep me');
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    await submit();

    expect(input().value).toBe('Keep me');
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t add the to-do. Quota exceeded.', type: 'error', duration: 6000 });
  });

  it('starts from the text left on the same scope and page, apart from the note composer\'s', () => {
    mount('page');
    typeInto(input(), 'Unsent');
    composer.destroy();

    mount('page');
    expect(input().value).toBe('Unsent');
    typeInto(input(), '');
  });
});
