import { NoteComposerComponent } from '#root/dist/src/app/components/note-composer/note-composer.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { setDraft } from '#root/dist/src/app/lib/drafts.js';
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
  const fields = () => $$('.checklist-field__input');
  const values = () => fields().map((f) => f.value);
  const notes = async (scope = 'page') => (await scopeStoreService.load(KEYS))[scope].notes;

  it('starts a checklist with "Checklist": a focused item field, then "Add item"', () => {
    mount('page');
    expect(toggle().textContent).toBe('Checklist');
    expect($('.note-composer__items')).toBeFalsy();

    toggle().click();
    expect(fields().length).toBe(1);
    expect(document.activeElement).toBe(fields()[0]);
    expect($('.note-composer__items').getAttribute('aria-label')).toBe('Checklist items');
    expect(toggle().textContent).toBe('Add item');

    toggle().click();
    expect(fields().length).toBe(2);
    expect(document.activeElement).toBe(fields()[1]);
  });

  it('adds the next item with Enter, without touching the text being written', () => {
    mount('page');
    typeInto(input(), 'Packing');
    toggle().click();
    fields()[0].value = 'Passport';
    keydown(fields()[0], 'Enter');

    expect(values()).toEqual(['Passport', '']);
    expect(document.activeElement).toBe(fields()[1]);
    expect(input().value).toBe('Packing');
  });

  it('removes items, then gives the focus back to "Checklist"', () => {
    mount('page');
    toggle().click();
    toggle().click();
    $$('.checklist-field__remove')[1].click();
    expect(document.activeElement).toBe(fields()[0]);

    $$('.checklist-field__remove')[0].click();
    expect(fields()).toEqual([]);
    expect(toggle().textContent).toBe('Checklist');
    expect(document.activeElement).toBe(toggle());
  });

  it('goes back to the text with Escape from an item', () => {
    mount('page');
    toggle().click();
    keydown(fields()[0], 'Escape');
    expect(document.activeElement).toBe(input());
  });

  it('adds a line on plain Enter in the text, even after an item line', () => {
    mount('page');
    typeInto(input(), '- [ ] Typed by hand');
    keydown(input(), 'Enter');
    expect(input().value).toBe('- [ ] Typed by hand');
    expect(fields()).toEqual([]);
  });

  it('adds a note with its items and typed "- [ ]" lines, then starts afresh', async () => {
    mount('page');
    typeInto(input(), 'Trip\n- [x] Visa');
    toggle().click();
    fields()[0].value = '  Passport ';
    toggle().click();
    keydown(input(), 'Enter', { ctrlKey: true });
    await settle();

    const [note] = await notes();
    expect(note.text).toBe('Trip');
    expect(note.items.map((i) => [i.text, i.done])).toEqual([['Passport', false], ['Visa', true]]);
    expect(fields()).toEqual([]);
    expect(toggle().textContent).toBe('Checklist');
    expect(input().value).toBe('');
  });

  it('adds an items-only note, which doesn\'t need text, but not empty items', async () => {
    mount('page');
    expect(input().required).toBe(true);
    toggle().click();
    expect(input().required).toBe(false);
    $('button[type="submit"]').click();
    await settle();
    expect(await notes()).toEqual([]);

    fields()[0].value = 'Only item';
    $('button[type="submit"]').click();
    await settle();
    const [note] = await notes();
    expect(note.text).toBe('');
    expect(note.items.map((i) => i.text)).toEqual(['Only item']);
    expect(input().required).toBe(true);
  });

  it('keeps the items being written as a draft, and gives them back when adding fails', async () => {
    mount('site');
    toggle().click();
    fields()[0].value = 'Draft item';
    composer.destroy();
    mount('site');
    expect(values()).toEqual(['Draft item']);
    expect(toggle().textContent).toBe('Add item');

    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    $('button[type="submit"]').click();
    await settle();
    expect(values()).toEqual(['Draft item']);
    expect(toggle().textContent).toBe('Add item');
    $$('.checklist-field__remove')[0].click();
  });

  it('reads a checklist draft left by an older version as no items', () => {
    setDraft(`note-checklist:page:${KEYS.page}`, 'on');
    mount('page');
    expect(fields()).toEqual([]);
    expect(toggle().textContent).toBe('Checklist');
  });
});
