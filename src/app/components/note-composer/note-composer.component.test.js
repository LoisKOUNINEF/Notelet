import { NoteComposerComponent } from '#root/dist/src/app/components/note-composer/note-composer.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, keydown, settle, startPanel, typeInto } from '../../testing/panel.js';

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

  it('adds a line on plain Enter, only Ctrl/Cmd+Enter adds the note', async () => {
    mount('page');
    typeInto(input(), 'Line one');
    keydown(input(), 'Enter');
    await settle();
    expect((await scopeStoreService.load(KEYS)).page.notes).toEqual([]);
    expect(input().value).toBe('Line one');
    typeInto(input(), '');
  });

  const toggle = () => $('.note-composer__checklist');
  const caretAtEnd = () => input().setSelectionRange(input().value.length, input().value.length);
  const notes = async (scope = 'page') => (await scopeStoreService.load(KEYS))[scope].notes;

  it('starts a checklist line with the toggle, which shows it is on', () => {
    mount('page');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');

    toggle().click();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(input().value).toBe('- [ ] ');
    expect(document.activeElement).toBe(input());

    toggle().click();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(input().value).toBe('- [ ] ');
    typeInto(input(), '');
  });

  it('continues the list on Enter while on, and ends it on an empty item', () => {
    mount('page');
    typeInto(input(), 'Packing');
    caretAtEnd();
    toggle().click();
    typeInto(input(), `${input().value}Passport`);
    caretAtEnd();

    keydown(input(), 'Enter');
    expect(input().value).toBe('Packing\n- [ ] Passport\n- [ ] ');
    keydown(input(), 'Enter');
    expect(input().value).toBe('Packing\n- [ ] Passport\n');
    typeInto(input(), '');
  });

  it('leaves Enter alone when off, and on lines that aren\'t items', () => {
    mount('page');
    typeInto(input(), '- [ ] Typed by hand');
    caretAtEnd();
    keydown(input(), 'Enter');
    expect(input().value).toBe('- [ ] Typed by hand');

    toggle().click();
    toggle().click();
    toggle().click();
    typeInto(input(), 'Plain line');
    caretAtEnd();
    keydown(input(), 'Enter');
    expect(input().value).toBe('Plain line');
    typeInto(input(), '');
  });

  it('adds a note with its checklist, and turns the toggle off', async () => {
    mount('page');
    typeInto(input(), 'Trip\n- [ ] Passport\n- [x] Visa');
    toggle().click();
    keydown(input(), 'Enter', { ctrlKey: true });
    await settle();

    const [note] = await notes();
    expect(note.text).toBe('Trip');
    expect(note.items.map((i) => [i.text, i.done])).toEqual([['Passport', false], ['Visa', true]]);
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('adds an items-only note, but not an empty checklist', async () => {
    mount('page');
    typeInto(input(), '- [ ] ');
    $('button[type="submit"]').click();
    await settle();
    expect(await notes()).toEqual([]);

    typeInto(input(), '- [ ] Only item');
    $('button[type="submit"]').click();
    await settle();
    expect((await notes())[0].text).toBe('');
  });

  it('keeps the toggle on with the draft, and gives both back when adding fails', async () => {
    mount('site');
    toggle().click();
    typeInto(input(), '- [ ] Draft item');
    composer.destroy();
    mount('site');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');

    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    $('button[type="submit"]').click();
    await settle();
    expect(input().value).toBe('- [ ] Draft item');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    typeInto(input(), '');
    toggle().click();
  });

  it('ignores keys other than Enter', () => {
    mount('page');
    toggle().click();
    keydown(input(), 'a');
    expect(input().value).toBe('- [ ] ');
    toggle().click();
    typeInto(input(), '');
  });
});

