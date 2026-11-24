import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, keydown, settle, startPanel } from '../../testing/panel.js';
import { refusesBlank } from '../../testing/fields.js';

// Opened from its note's Edit button, in the panel.
describe('NoteEditorComponent', () => {
  let panel;
  let sidebar;
  let note;

  const editor = () => $('.note-editor');
  const textarea = () => $('.note-editor__input');
  const save = async () => {
    $('.note-editor button[type="submit"]').click();
    await settle();
  };
  const stored = async () => (await scopeStoreService.load(KEYS)).page.notes[0];

  beforeEach(async () => {
    panel = await startPanel();
    note = await scopeStoreService.addNote('page', KEYS.page, 'Trip');
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('opens with the text focused, and no checklist', () => {
    expect(document.activeElement).toBe(textarea());
    expect(textarea().value).toBe('Trip');
    expect($('.checklist-field__input')).toBeFalsy();
    expect($$('.note-editor button').map((b) => b.textContent)).toEqual(['Save', 'Cancel']);
  });

  it('saves the trimmed text', async () => {
    textarea().value = '  Trip to Lisbon  ';
    await save();
    expect((await stored()).text).toBe('Trip to Lisbon');
    expect(editor()).toBeFalsy();
  });

  it('refuses to save an empty note and stays in edit mode', async () => {
    expect(refusesBlank(textarea())).toBe(true);
    textarea().value = '   ';
    await save();
    expect(editor()).toBeTruthy();
    expect((await stored()).text).toBe('Trip');
  });

  it('cancels with Escape, without saving', async () => {
    textarea().value = 'Discarded';
    keydown(textarea(), 'Escape');
    expect(editor()).toBeFalsy();
    expect(document.activeElement).toBe($(`[data-note-id="${note.id}"] .note-item__edit`));
    expect((await stored()).text).toBe('Trip');
  });

  it('has an optional name field above the text, empty for an unnamed note', () => {
    const nameField = $('.note-editor__name');
    expect(nameField.value).toBe('');
    expect($('.note-editor__name-field a11y-label').textContent).toBe('Name (optional)');
    expect(nameField.compareDocumentPosition(textarea()) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('goes on to the text with Enter in the name, and saves both with Ctrl+Enter', async () => {
    const nameField = $('.note-editor__name');
    nameField.value = '  Packing  ';
    keydown(nameField, 'Enter');
    expect(document.activeElement).toBe(textarea());
    expect(editor()).toBeTruthy();

    keydown(nameField, 'Enter', { ctrlKey: true });
    await settle();
    const saved = await stored();
    expect(saved.name).toBe('Packing');
    expect(saved.text).toBe('Trip');
  });

  it('cancels with Escape in the name', async () => {
    $('.note-editor__name').value = 'Discarded';
    keydown($('.note-editor__name'), 'Escape');
    await settle();
    expect(editor()).toBeFalsy();
    expect((await stored()).name).toBeUndefined();
  });

  it('takes a name of any length, wrapping like a checklist\'s name (no line breaks)', async () => {
    const nameField = $('.note-editor__name');
    expect(nameField.tagName).toBe('TEXTAREA');
    expect(nameField.closest('a11y-textarea').classList.contains('line-field')).toBe(true);
    expect(nameField.hasAttribute('maxlength')).toBe(false);

    nameField.value = 'Packing\nlist';
    nameField.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(nameField.value).toBe('Packing list');

    const long = 'A long name '.repeat(20).trim();
    nameField.value = long;
    await save();
    expect((await stored()).name).toBe(long);
  });

  it('leaves Shift+Enter in the name alone (no line, no move)', () => {
    const nameField = $('.note-editor__name');
    nameField.focus();
    keydown(nameField, 'Enter', { shiftKey: true });
    expect(document.activeElement).toBe(nameField);
  });

  it('saves with Ctrl+Enter and cancels with Escape from its buttons too', async () => {
    const button = (label) => $$('.note-editor button').find((b) => b.textContent === label);
    textarea().value = 'Trip to Porto';
    keydown(button('Save'), 'Enter', { ctrlKey: true });
    await settle();
    expect((await stored()).text).toBe('Trip to Porto');
    expect(editor()).toBeFalsy();

    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
    textarea().value = 'Discarded';
    keydown(button('Cancel'), 'Escape');
    await settle();
    expect(editor()).toBeFalsy();
    expect((await stored()).text).toBe('Trip to Porto');
  });

  it('removes the name when it\'s left blank', async () => {
    await scopeStoreService.update('notes', note, { name: 'Packing' });
    await settle();
    $(`[data-note-id="${note.id}"] .note-item__edit`).click();
    expect($('.note-editor__name').value).toBe('Packing');
    $('.note-editor__name').value = '   ';
    await save();
    expect((await stored()).name).toBeFalsy();
    expect($('.note-item__name')).toBeFalsy();
  });

  it('keeps an unsaved name as a draft across a tab switch', () => {
    $('.note-editor__name').value = 'Half-named';
    $('#scope-tab-site').click();
    $('#scope-tab-page').click();
    expect($('.note-editor__name').value).toBe('Half-named');
    expect(textarea().value).toBe('Trip');
  });
});
