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
});
