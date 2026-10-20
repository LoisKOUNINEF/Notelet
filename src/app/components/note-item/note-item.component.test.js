import { formatTimeAgo } from '#root/dist/src/app/lib/pipes.js';
import { SidebarComponent } from '#root/dist/src/app/components/sidebar/sidebar.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, keydown, settle, startPanel } from '../../testing/panel.js';

// A note's item in the page.
const item = (note) => $(`[data-note-id="${note.id}"]`);

// Items are tested in their list, in the panel: their actions go through the store and come back as a new list.
describe('NoteItemComponent', () => {
  let panel;
  let sidebar;
  let notes;

  const menuItem = (note, action) => document.getElementById(`note-${note.id}-menu`)?.querySelector(`[data-action="${action}"]`);
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
    el.querySelectorAll('.note-item__actions button:not(.item-menu__trigger)').forEach((button) => expect(button.getAttribute('aria-describedby')).toBe(textId));
    expect(el.querySelector('.item-menu__trigger').getAttribute('aria-label')).toBe('More actions for: First');
    expect(menuItem(notes[0], 'move').textContent).toBe('Move to this site');
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

    const input = item(notes[0]).querySelector('.note-editor__input');
    expect(input.value).toBe('First');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(5);
  });

  it('saves an edit, then shows it as edited with the focus back on Edit', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-editor__input').value = 'First, revised';
    item(notes[0]).querySelector('button[type="submit"]').click();
    await settle();

    expect((await stored()).page.notes.find((n) => n.id === notes[0].id).text).toBe('First, revised');
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('First, revised');
    expect(item(notes[0]).querySelector('.note-item__meta').textContent).toContain('Edited');
    expect(document.activeElement).toBe(item(notes[0]).querySelector('.note-item__edit'));
  });

  it('saves with Ctrl+Enter', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    const input = item(notes[0]).querySelector('.note-editor__input');
    input.value = 'Quick';
    keydown(input, 'Enter', { ctrlKey: true });
    await settle();
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('Quick');
  });

  it('cancels with Escape or Cancel, without saving', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-editor__input').value = 'Discarded';
    keydown(item(notes[0]).querySelector('.note-editor__input'), 'Escape');
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('First');
    expect(document.activeElement).toBe(item(notes[0]).querySelector('.note-item__edit'));

    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('[data-event="click:_cancel"]').click();
    await settle();
    expect((await stored()).page.notes.find((n) => n.id === notes[0].id).text).toBe('First');
  });

  it('keeps an edit in progress while another note is deleted', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-editor__input').value = 'Still typing';

    item(notes[2]).querySelector('.note-item__delete').click();
    await settle();

    expect(item(notes[2])).toBeFalsy();
    expect(item(notes[0]).querySelector('.note-editor__input').value).toBe('Still typing');
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
    menuItem(notes[2], 'move').click();
    await settle();

    expect(texts()).toEqual(['Second', 'First']);
    expect((await stored()).site.notes.map((n) => n.id)).toEqual([notes[2].id]);
    expect(panel.toasts.at(-1)).toEqual({ message: 'Moved to this site\'s notes.', type: 'success' });

    $('#scope-tab-site').click();
    expect(menuItem(notes[2], 'move').textContent).toBe('Move to this page');
  });

  it('reports a failed save and stays in edit mode', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    item(notes[0]).querySelector('.note-editor__input').value = 'Too long for sync';
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    item(notes[0]).querySelector('button[type="submit"]').click();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t save the note. Quota exceeded.', type: 'error', duration: 6000 });
    expect(item(notes[0]).querySelector('.note-editor__input').value).toBe('Too long for sync');
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
    item(notes[0]).querySelector('.note-editor__input').value = '  \n ';
    item(notes[0]).querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect((await stored()).page.notes.find((n) => n.id === notes[0].id).text).toBe('First');
    expect(item(notes[0]).querySelector('.note-editor__input')).toBeTruthy();
  });

  it('saves with Cmd+Enter, but plain Enter only adds a line', async () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    const input = item(notes[0]).querySelector('.note-editor__input');
    input.value = 'Two\nlines';
    keydown(input, 'Enter');
    await settle();
    expect(item(notes[0]).querySelector('.note-editor__input')).toBe(input);

    keydown(input, 'Enter', { metaKey: true });
    await settle();
    expect(item(notes[0]).querySelector('.note-item__text').textContent).toBe('Two\nlines');
  });

  it('keeps Escape from reaching the rest of the panel', () => {
    item(notes[0]).querySelector('.note-item__edit').click();
    let reached = false;
    const onKeydown = () => { reached = true; };
    document.addEventListener('keydown', onKeydown);
    keydown(item(notes[0]).querySelector('.note-editor__input'), 'Escape');
    document.removeEventListener('keydown', onKeydown);
    expect(reached).toBe(false);
  });

  it('moves a site note to the page notes', async () => {
    const siteNote = await scopeStoreService.addNote('site', KEYS.site, 'Only this page, after all');
    await settle();
    $('#scope-tab-site').click();

    menuItem(siteNote, 'move').click();
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Moved to this page\'s notes.', type: 'success' });
    expect((await stored()).page.notes.map((n) => n.id)).toContain(siteNote.id);
    expect((await stored()).site.notes).toEqual([]);
  });

  it('reports a failed move and keeps the note where it was', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    menuItem(notes[0], 'move').click();
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

  it('opens the editor on a click on the card or its text, focused in its field', () => {
    item(notes[1]).querySelector('.note-item__text').click();
    expect(item(notes[1]).querySelector('.note-editor')).toBeTruthy();
    expect(document.activeElement).toBe(item(notes[1]).querySelector('.note-editor__input'));

    item(notes[0]).querySelector('.note-item__footer').click();
    expect(item(notes[0]).querySelector('.note-editor')).toBeTruthy();
  });

  it('doesn\'t open the editor from its buttons, nor when text in it is selected', async () => {
    item(notes[1]).querySelector('.item-menu__trigger').click();
    item(notes[1]).querySelector('.note-item__handle').click();
    expect(item(notes[1]).querySelector('.note-editor')).toBeFalsy();

    const text = item(notes[1]).querySelector('.note-item__text');
    document.getSelection().selectAllChildren(text);
    text.click();
    expect(item(notes[1]).querySelector('.note-editor')).toBeFalsy();
    document.getSelection().removeAllRanges();
  });

  it('shows a name as a heading above the text, naming the note in its controls', async () => {
    await scopeStoreService.update('notes', notes[1], { name: 'Ideas' });
    await settle();
    const el = item(notes[1]);
    const heading = el.querySelector('.note-item__name');
    expect(heading.tagName).toBe('H2');
    expect(heading.textContent).toBe('Ideas');
    expect(el.querySelector('.note-item__edit').getAttribute('aria-describedby')).toBe(heading.id);
    expect(el.querySelector('.item-menu__trigger').getAttribute('aria-label')).toBe('More actions for: Ideas');
    expect(item(notes[0]).querySelector('.note-item__name')).toBeFalsy();

    heading.click();
    expect(item(notes[1]).querySelector('.note-editor')).toBeTruthy();
  });

  it('saves a name alone, the text unchanged', async () => {
    item(notes[1]).querySelector('.note-item__edit').click();
    item(notes[1]).querySelector('.note-editor__name').value = 'Ideas';
    item(notes[1]).querySelector('button[type="submit"]').click();
    await settle();
    const saved = (await stored()).page.notes.find((n) => n.id === notes[1].id);
    expect(saved.name).toBe('Ideas');
    expect(saved.text).toBe('Second');
    expect(item(notes[1]).querySelector('.note-item__name').textContent).toBe('Ideas');
  });

});

describe('NoteItemComponent - naming and time', () => {
  let panel;
  let sidebar;

  const mount = async () => {
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  };

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('names a long note by its first line, cut to a readable length', async () => {
    const long = `${'A very long first line '.repeat(5)}\nSecond line`;
    const note = await scopeStoreService.addNote('page', KEYS.page, long);
    await scopeStoreService.addNote('page', KEYS.page, '\n  Starts after a blank line\nMore');
    await mount();

    const label = item(note).querySelector('.item-menu__trigger').getAttribute('aria-label');
    expect(label.startsWith('More actions for: A very long first line')).toBe(true);
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBe('More actions for: '.length + 60);
    expect($$('.item-menu__trigger').map((b) => b.getAttribute('aria-label'))).toContain('More actions for: Starts after a blank line');
  });

  it('keeps its relative time true as minutes pass, without re-rendering', async () => {
    const note = await scopeStoreService.addNote('page', KEYS.page, 'Timed');
    await mount();
    const time = item(note).querySelector('time');
    const now = spyOn(Date, 'now').andReturn(note.updatedAt + 5 * 60_000);
    panel.bus.emit('minute-tick');
    now.restore();

    expect(item(note).querySelector('time')).toBe(time);
    expect(time.textContent).toBe(formatTimeAgo(note.updatedAt, note.updatedAt + 5 * 60_000));
  });
});

describe('NoteItemComponent - actions menu', () => {
  let panel;
  let sidebar;
  let note;

  const item = () => $(`[data-note-id="${note.id}"]`);
  const menu = () => document.getElementById(`note-${note.id}-menu`);
  const actions = () => [...menu().querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);

  beforeEach(async () => {
    panel = await startPanel();
    note = await scopeStoreService.addNote('page', KEYS.page, 'Plain');
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('shows Edit, Delete and a "More actions" trigger opening the other actions', () => {
    expect([...item().querySelectorAll('.note-item__actions button')].map((b) => b.textContent)).toEqual(['Edit', 'Delete', '⋯']);
    const trigger = item().querySelector('.item-menu__trigger');
    expect(trigger.getAttribute('aria-label')).toBe('More actions for: Plain');
    expect(menu().getAttribute('anchor')).toBe(trigger.id);
    expect(actions()).toEqual(['Move to this site']);
  });

  it('removes its menu with the note, and with edit mode', async () => {
    item().querySelector('.note-item__edit').click();
    expect(menu()).toBeFalsy();
    item().querySelector('.note-editor button[type="button"]').click();
    expect(menu()).toBeTruthy();

    await scopeStoreService.remove('notes', note);
    await settle();
    expect(menu()).toBeFalsy();
  });

  it('ignores clicks in the menu outside its items', async () => {
    const set = spyOn(panel.fake.storage.local, 'set');
    menu().click();
    await settle();
    expect(set.callCount).toBe(0);
    set.restore();
  });
});

describe('NoteItemComponent - folding', () => {
  let panel;
  let sidebar;
  let oneLine;
  let lines;
  let named;

  const toggle = (note) => item(note).querySelector('.note-item__toggle');
  const stored = async (note) => (await scopeStoreService.load(KEYS)).page.notes.find((n) => n.id === note.id);

  beforeEach(async () => {
    panel = await startPanel();
    oneLine = await scopeStoreService.addNote('page', KEYS.page, 'Just this');
    lines = await scopeStoreService.addNote('page', KEYS.page, '\nFirst line\nSecond line');
    named = await scopeStoreService.update('notes', await scopeStoreService.addNote('page', KEYS.page, 'Body text'), { name: 'Ideas' });
    sidebar = new SidebarComponent('#app');
    sidebar.render();
    await settle();
  });

  afterEach(async () => {
    sidebar.destroy();
    await panel.stop();
  });

  it('offers to fold only when it would hide something', () => {
    expect(toggle(oneLine)).toBeFalsy();
    expect(toggle(lines).getAttribute('aria-expanded')).toBe('true');
    expect(toggle(lines).getAttribute('aria-label')).toBe('Details: First line');
    expect(toggle(lines).getAttribute('aria-controls')).toBe(item(lines).querySelector('.note-item__content').id);
    expect(toggle(named).getAttribute('aria-label')).toBe('Details: Ideas');
  });

  it('folds an unnamed note down to its first line, saved without counting as an edit', async () => {
    toggle(lines).click();
    expect(document.activeElement).toBe(toggle(lines));
    await settle();

    expect(toggle(lines).getAttribute('aria-expanded')).toBe('false');
    expect(item(lines).querySelector('.note-item__text')).toBeFalsy();
    const summary = item(lines).querySelector('.note-item__summary');
    expect(summary.textContent).toBe('First line');
    expect(item(lines).querySelector('.note-item__edit').getAttribute('aria-describedby')).toBe(summary.id);
    expect(document.activeElement).toBe(toggle(lines));
    const saved = await stored(lines);
    expect(saved.collapsed).toBe(true);
    expect(saved.updatedAt).toBe(lines.updatedAt);
    expect(item(lines).querySelector('.note-item__meta').textContent).not.toContain('Edited');

    toggle(lines).click();
    await settle();
    expect(item(lines).querySelector('.note-item__text').textContent).toBe('\nFirst line\nSecond line');
    expect((await stored(lines)).collapsed).toBeUndefined();
  });

  it('folds a named note down to its name, its actions still there, a click still editing it', async () => {
    toggle(named).click();
    await settle();
    expect(item(named).querySelector('.note-item__name').textContent).toBe('Ideas');
    expect(item(named).querySelector('.note-item__text')).toBeFalsy();
    expect(item(named).querySelector('.note-item__summary')).toBeFalsy();
    expect(item(named).querySelector('.note-item__edit')).toBeTruthy();

    item(named).querySelector('.note-item__name').click();
    expect(item(named).querySelector('.note-editor__input').value).toBe('Body text');
  });

  it('shows a note folded in another window folded here too', async () => {
    await scopeStoreService.setCollapsed('notes', named, true);
    await settle();
    expect(item(named).querySelector('.note-item__text')).toBeFalsy();
  });

  it('unfolds it again and reports a fold that couldn\'t be saved', async () => {
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    toggle(named).click();
    await settle();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t update the note. Quota exceeded.');
    expect(toggle(named).getAttribute('aria-expanded')).toBe('true');
    expect(item(named).querySelector('.note-item__text')).toBeTruthy();
  });
});
