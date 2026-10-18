import { NoteComposerComponent } from '#root/dist/src/app/components/note-composer/note-composer.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, settle, startPanel, typeInto } from '../../testing/panel.js';

describe('NoteComposerComponent', () => {
  let panel;
  let composer;

  const mount = (scope) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    composer = new NoteComposerComponent(placeholder, { scope, key: KEYS[scope] });
    composer.render();
  };
  const input = () => $('.note-composer__input');

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    composer.destroy();
    await panel.stop();
  });

  it('labels the field with its scope', () => {
    mount('site');
    expect($('a11y-label').textContent).toBe('New note for this site');
    expect(input().required).toBe(true);
  });

  it('adds the trimmed note to its scope', async () => {
    mount('site');
    typeInto(input(), '\n  Site-wide  \n');
    $('button[type="submit"]').click();
    await settle();

    expect((await scopeStoreService.load(KEYS)).site.notes.map((n) => n.text)).toEqual(['Site-wide']);
  });

  it('gives the text back and explains when the note can\'t be saved', async () => {
    mount('page');
    typeInto(input(), 'Keep me');
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    $('button[type="submit"]').click();
    await settle();

    expect(input().value).toBe('Keep me');
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t add the note. Quota exceeded.', type: 'error', duration: 6000 });
  });

  it('starts from the draft left on the same scope and page', () => {
    mount('page');
    typeInto(input(), 'Unsent');
    composer.destroy();

    mount('page');
    expect(input().value).toBe('Unsent');
    typeInto(input(), '');
  });
});
