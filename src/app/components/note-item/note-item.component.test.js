import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, keydown, settle, startPanel } from '../../testing/panel.js';

// Items are tested in their list, in the panel: their actions go through the store and come back as a new list.
describe('NoteItemComponent', () => {
  let panel;
  let sidebar;
  let notes;

  const item = (note) => $(`[data-note-id="${note.id}"]`);
  const texts = () => $$('.note-item__text').map((el) => el.textContent);
  const stored = async () => scopeStoreService.load(KEYS);

  beforeEach(async () => {
    panel = await startPanel();
    const now = spyOn(Date, 'now');
    notes = [];
    // Oldest first, shown newest first: notes[2] is at the top.
    for (const [i, text] of ['First', 'Second', 'Third'].entries()) {
      now.andReturn(1_000_000 + i);
      notes.push(await scopeStoreService.addNote('page', KEYS.page, text));
    }
    now.restore();
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('shows the text, when it was written, and actions named after the note', () => {
    const el = item(notes[0]);
    expect(texts()).toEqual(['Third', 'Second', 'First']);
    expect(el.querySelector('time').getAttribute('datetime')).toBe(new Date(notes[0].updatedAt).toISOString());
    expect(el.querySelector('time').textContent).not.toBe(String(notes[0].updatedAt));
    expect(el.querySelector('.note-item__meta').textContent).not.toContain('Edited');

    const textId = el.querySelector('.note-item__text').id;
    el.querySelectorAll('button').forEach((button) => expect(button.getAttribute('aria-describedby')).toBe(textId));
    expect(el.querySelector('.note-item__move').textContent).toBe('Move to this site');
  });

  it('is an <article class="note-item"> directly inside its list item', () => {
    const el = item(notes[0]);
    expect(el.tagName).toBe('ARTICLE');
    expect(el.classList.contains('note-item')).toBe(true);
    expect(el.parentElement.tagName).toBe('LI');
    expect(el.parentElement.parentElement.classList.contains('note-list__items')).toBe(true);
  });

  it('edits in place, with the caret at the end', () => {
    item(notes[0]).querySelector('.note-item__edit').click();

    const input = item(notes[0]).querySelector('.note-item__input');
    expect(input.value).toBe('First');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(5);
  });

  it('saves an edit, then shows it as edited with the focus back on Edit', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-item__input').value = 'First, revised';
    item(notes[0]).querySelector('button[type="submit"]').click();
    await settle();

    expect((await stored()).page.notes.find((n) => n.id === notes[0].id).text).toBe('First, revised');
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('First, revised');
    expect(item(notes[0]).querySelector('.note-item__meta').textContent).toContain('Edited');
    expect(document.activeElement).toBe(item(notes[0]).querySelector('.note-item__edit'));
  });

  it('saves with Ctrl+Enter', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    const input = item(notes[0]).querySelector('.note-item__input');
    input.value = 'Quick';
    keydown(input, 'Enter', { ctrlKey: true });
    await settle();
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('Quick');
  });

  it('cancels with Escape or Cancel, without saving', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-item__input').value = 'Discarded';
    keydown(item(notes[0]).querySelector('.note-item__input'), 'Escape');
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('First');
    expect(document.activeElement).toBe(item(notes[0]).querySelector('.note-item__edit'));

    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('[data-event="click:_cancel"]').click();
    await settle();
    expect((await stored()).page.notes.find((n) => n.id === notes[0].id).text).toBe('First');
  });

  it('keeps an edit in progress while another note is deleted', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-item__input').value = 'Still typing';

    item(notes[2]).querySelector('.note-item__delete').click();
    await settle();

    expect(item(notes[2])).toBeFalsy();
    expect(item(notes[0]).querySelector('.note-item__input').value).toBe('Still typing');
  });

  it('deletes a note, offers to undo it, and moves focus to the next one', async () => {
    // The middle one: "Second".
    item(notes[1]).querySelector('.note-item__delete').click();
    await settle();

    expect(texts()).toEqual(['Third', 'First']);
    expect(document.activeElement).toBe(item(notes[0]).querySelector('.note-item__edit'));
    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('Note deleted.');
    expect(toast.actionText).toBe('Undo');

    toast.onAction();
    await settle();
    expect(texts()).toEqual(['Third', 'Second', 'First']);
  });

  it('moves focus to the previous note, then to the composer, as the list empties', async () => {
    item(notes[0]).querySelector('.note-item__delete').click();
    await settle();
    expect(document.activeElement).toBe(item(notes[1]).querySelector('.note-item__edit'));

    item(notes[1]).querySelector('.note-item__delete').click();
    await settle();
    item(notes[2]).querySelector('.note-item__delete').click();
    await settle();
    expect(document.activeElement).toBe($('.note-composer__input'));
    expect($('.note-list__empty')).toBeTruthy();
  });

  it('moves a note to the site notes', async () => {
    item(notes[2]).querySelector('.note-item__move').click();
    await settle();

    expect(texts()).toEqual(['Second', 'First']);
    expect((await stored()).site.notes.map((n) => n.id)).toEqual([notes[2].id]);
    expect(panel.toasts.at(-1)).toEqual({ message: 'Moved to this site\'s notes.', type: 'success' });

    $('#scope-tab-site').click();
    expect(item(notes[2]).querySelector('.note-item__move').textContent).toBe('Move to this page');
  });

  it('reports a failed save and stays in edit mode', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-item__input').value = 'Too long for sync';
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    item(notes[0]).querySelector('button[type="submit"]').click();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t save the note. Quota exceeded.', type: 'error', duration: 6000 });
    expect(item(notes[0]).querySelector('.note-item__input').value).toBe('Too long for sync');
  });

  it('leaves edit mode without saving when the text is unchanged', async () => {
    const set = spyOn(panel.fake.storage.local, 'set');
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('button[type="submit"]').click();
    await settle();

    expect(set.callCount).toBe(0);
    set.restore();
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('First');
    expect(document.activeElement).toBe(item(notes[0]).querySelector('.note-item__edit'));
  });

  it('refuses to save an empty note and stays in edit mode', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-item__input').value = '  \n ';
    item(notes[0]).querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect((await stored()).page.notes.find((n) => n.id === notes[0].id).text).toBe('First');
    expect(item(notes[0]).querySelector('.note-item__input')).toBeTruthy();
  });

  it('saves with Cmd+Enter, but plain Enter only adds a line', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    const input = item(notes[0]).querySelector('.note-item__input');
    input.value = 'Two\nlines';
    keydown(input, 'Enter');
    await settle();
    expect(item(notes[0]).querySelector('.note-item__input')).toBe(input);

    keydown(input, 'Enter', { metaKey: true });
    await settle();
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('Two\nlines');
  });

  it('keeps Escape from reaching the rest of the panel', () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    let reached = false;
    const onKeydown = () => { reached = true; };
    document.addEventListener('keydown', onKeydown);
    keydown(item(notes[0]).querySelector('.note-item__input'), 'Escape');
    document.removeEventListener('keydown', onKeydown);
    expect(reached).toBe(false);
  });

  it('moves a site note to the page notes', async () => {
    const siteNote = await scopeStoreService.addNote('site', KEYS.site, 'Only this page, after all');
    await settle();
    $('#scope-tab-site').click();

    item(siteNote).querySelector('.note-item__move').click();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Moved to this page\'s notes.', type: 'success' });
    expect((await stored()).page.notes.map((n) => n.id)).toContain(siteNote.id);
    expect((await stored()).site.notes).toEqual([]);
  });

  it('reports a failed move and keeps the note where it was', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    item(notes[0]).querySelector('.note-item__move').click();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t move the note. Quota exceeded.', type: 'error', duration: 6000 });
    expect(texts()).toEqual(['Third', 'Second', 'First']);
  });

  it('reports a failed delete and keeps the note', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    item(notes[1]).querySelector('.note-item__delete').click();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t delete the note. Quota exceeded.', type: 'error', duration: 6000 });
    expect(texts()).toEqual(['Third', 'Second', 'First']);
  });

  it('reports a failed undo', async () => {
    item(notes[1]).querySelector('.note-item__delete').click();
    await settle();
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    panel.toasts.at(-1).onAction();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t restore the note. Quota exceeded.', type: 'error', duration: 6000 });
    expect(texts()).toEqual(['Third', 'First']);
  });
});
