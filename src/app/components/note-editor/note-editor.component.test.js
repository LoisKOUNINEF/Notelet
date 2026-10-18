import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, keydown, settle, startPanel } from '../../testing/panel.js';

// Opened from its note's Edit button, in the panel.
describe('NoteEditorComponent', () => {
  let panel;
  let sidebar;
  let note;

  const editor = () => $('.note-editor');
  const textarea = () => $('.note-editor__input');
  const fields = () => $$('.checklist-field__input');
  const values = () => fields().map((f) => f.value);
  const save = async () => {
    $('.note-editor button[type="submit"]').click();
    await settle();
  };
  const stored = async () => (await scopeStoreService.load(KEYS)).page.notes[0];

  beforeEach(async () => {
    panel = await startPanel();
    note = await scopeStoreService.addNote('page', KEYS.page, 'Trip', [
      { id: 'a', text: 'Passport', done: true },
      { id: 'b', text: 'Tickets', done: false },
    ]);
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('opens with the text focused and one labelled field per item', () => {
    expect(document.activeElement).toBe(textarea());
    expect(textarea().value).toBe('Trip');
    expect(values()).toEqual(['Passport', 'Tickets']);
    expect($$('.checklist-field a11y-label').map((l) => l.textContent)).toEqual(['Item 1', 'Item 2']);
    expect($$('.checklist-field__remove').map((b) => b.getAttribute('aria-label'))).toEqual(['Remove item 1', 'Remove item 2']);
    expect($('.note-editor__items').getAttribute('aria-label')).toBe('Checklist items');
  });

  it('renames an item, keeping whether it was checked', async () => {
    fields()[0].value = 'Passport + visa';
    await save();
    expect((await stored()).items).toEqual([
      { id: 'a', text: 'Passport + visa', done: true },
      { id: 'b', text: 'Tickets', done: false },
    ]);
  });

  it('removes an item and moves focus to the previous one, then to "Add item"', async () => {
    $$('.checklist-field__remove')[1].click();
    expect(values()).toEqual(['Passport']);
    expect(document.activeElement).toBe(fields()[0]);

    $$('.checklist-field__remove')[0].click();
    expect(fields()).toEqual([]);
    expect($('.note-editor__items')).toBeFalsy();
    expect(document.activeElement).toBe($('.note-editor__add-item'));

    await save();
    expect((await stored()).items).toEqual([]);
  });

  it('adds a field with "Add item", and one after the current field with Enter', () => {
    textarea().value = 'Trip, edited';
    $('.note-editor__add-item').click();
    expect(values()).toEqual(['Passport', 'Tickets', '']);
    expect(document.activeElement).toBe(fields()[2]);
    expect(textarea().value).toBe('Trip, edited');

    fields()[0].value = 'Passport!';
    keydown(fields()[0], 'Enter');
    expect(values()).toEqual(['Passport!', '', 'Tickets', '']);
    expect(document.activeElement).toBe(fields()[1]);
  });

  it('drops empty fields, and adds markdown items typed in the text, on save', async () => {
    $('.note-editor__add-item').click();
    textarea().value = 'Trip\n- [ ] Charger\n- [x] Socks';
    await save();

    const saved = await stored();
    expect(saved.text).toBe('Trip');
    expect(saved.items.map((i) => [i.text, i.done])).toEqual([
      ['Passport', true], ['Tickets', false], ['Charger', false], ['Socks', true],
    ]);
  });

  it('saves an items-only note, but refuses one with nothing left', async () => {
    textarea().value = '';
    await save();
    expect((await stored()).text).toBe('');
    expect($('.note-editor')).toBeFalsy();

    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
    $$('.checklist-field__remove')[1].click();
    $$('.checklist-field__remove')[0].click();
    await save();
    expect(editor()).toBeTruthy();
    expect((await stored()).items.length).toBe(2);
  });

  it('cancels with Escape from the text or from a field', async () => {
    fields()[0].value = 'Discarded';
    keydown(fields()[0], 'Escape');
    expect(editor()).toBeFalsy();
    expect(document.activeElement).toBe($(`[data-note-id="${note.id}"] .note-item__edit`));

    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
    keydown(textarea(), 'Escape');
    expect(editor()).toBeFalsy();
    expect((await stored()).items[0].text).toBe('Passport');
  });

  it('ignores other keys in a field', () => {
    keydown(fields()[0], 'a');
    keydown(fields()[0], 'Enter', { ctrlKey: true });
    expect(values()).toEqual(['Passport', 'Tickets']);
  });
});
