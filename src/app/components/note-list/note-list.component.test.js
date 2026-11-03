import { NoteListComponent } from '#root/dist/src/app/components/note-list/note-list.component.js';
import { hasRequestedFocus } from '#root/dist/src/app/lib/focus.js';
import { confirmService } from '#root/dist/src/app/services/confirm/confirm.service.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { busListenerCounts, deferred, keydown, KEYS, layOut as layOutItems, pointer, settle, spoken, startPanel } from '../../testing/panel.js';

// The gestures themselves are covered with the to-dos (TodoListComponent - reordering):
// this checks the notes list wires them up the same way.
describe('NoteListComponent - reordering', () => {
  let panel;
  let list;
  let notes;

  const handle = (note) => $(`[data-note-id="${note.id}"] .note-item__handle`);
  const shown = () => $$('[data-catalog="notes"] .note-item__text').map((el) => el.textContent);
  const stored = async () => (await scopeStoreService.load(KEYS)).page.notes.map((n) => n.text);
  const mount = (items = notes) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    list = new NoteListComponent(placeholder, { scope: 'page', keys: KEYS, notes: items });
    list.render();
  };
  // Each note is 80px tall.
  const layOut = () => layOutItems('[data-catalog="notes"] > li', 80);

  beforeEach(async () => {
    panel = await startPanel();
    const now = spyOn(Date, 'now');
    // Shown newest first: C, B, A.
    for (const [i, text] of ['A', 'B', 'C'].entries()) {
      now.andReturn(1000 + i);
      await scopeStoreService.addNote('page', KEYS.page, text);
    }
    now.restore();
    notes = (await scopeStoreService.load(KEYS)).page.notes;
    mount();
    useFakeTimers();
  });

  afterEach(async () => {
    useRealTimers();
    list.destroy();
    document.getElementById('app-announcer')?.remove();
    await panel.stop();
  });

  it('gives each note a labelled handle, explained by the hidden help', () => {
    expect(handle(notes[0]).getAttribute('aria-label')).toBe('Reorder: C');
    expect(handle(notes[0]).getAttribute('aria-describedby')).toBe('note-reorder-help');
    expect(handle(notes[0]).getAttribute('aria-pressed')).toBe('false');
    expect($('#note-reorder-help').textContent).toContain('Press Space to pick up');
  });

  it('shows no handle with a single note', () => {
    list.destroy();
    mount([notes[0]]);
    expect($('.note-item__handle')).toBeFalsy();
    expect($('#note-reorder-help')).toBeFalsy();
  });

  it('moves a note with the keyboard and saves the order', async () => {
    handle(notes[0]).focus();
    keydown(handle(notes[0]), ' ');
    expect(handle(notes[0]).getAttribute('aria-pressed')).toBe('true');
    expect(await spoken()).toBe('Picked up C. Position 1 of 3.');

    keydown(handle(notes[0]), 'End');
    expect(shown()).toEqual(['B', 'A', 'C']);
    expect(document.activeElement).toBe(handle(notes[0]));

    keydown(handle(notes[0]), ' ');
    await settle();
    expect(await stored()).toEqual(['B', 'A', 'C']);
    expect(document.activeElement).toBe(handle(notes[0]));
  });

  it('puts everything back with Escape', async () => {
    handle(notes[0]).focus();
    keydown(handle(notes[0]), ' ');
    keydown(handle(notes[0]), 'ArrowDown');
    keydown(handle(notes[0]), 'Escape');
    expect(shown()).toEqual(['C', 'B', 'A']);
    expect(await stored()).toEqual(['C', 'B', 'A']);
  });

  it('reorders by dragging a handle', async () => {
    layOut();
    const items = () => $$('[data-catalog="notes"] > li');
    pointer('pointerdown', handle(notes[0]), 40);
    expect(items()[0].classList.contains('note-list__item--dragging')).toBe(true);
    pointer('pointermove', handle(notes[0]), 130);
    pointer('pointerup', handle(notes[0]), 130);
    await settle();

    expect(await stored()).toEqual(['B', 'C', 'A']);
    expect(shown()).toEqual(['B', 'C', 'A']);
  });

  it('holds updates from elsewhere until the note is dropped', async () => {
    handle(notes[0]).focus();
    keydown(handle(notes[0]), ' ');
    const added = await scopeStoreService.addNote('page', KEYS.page, 'D');
    list.update([added, ...notes]);
    expect(shown()).toEqual(['C', 'B', 'A']);

    keydown(handle(notes[0]), 'Escape');
    expect(shown()).toEqual(['D', 'C', 'B', 'A']);
  });

  it('stays gone when a save fails after the list went away', async () => {
    const held = deferred();
    const set = spyOn(panel.fake.storage.local, 'set').andCallFake(() => held.promise);
    handle(notes[0]).focus();
    keydown(handle(notes[0]), ' ');
    keydown(handle(notes[0]), 'ArrowDown');
    keydown(handle(notes[0]), ' ');
    await settle();

    list.destroy();
    const left = busListenerCounts();
    held.reject(new Error('Quota exceeded.'));
    await settle();
    set.restore();

    // Re-rendering the destroyed list would recreate its notes, each listening for minute ticks.
    expect(busListenerCounts()).toEqual(left);
    mount();
  });

  it('reports a failed save and shows the order as it still is', async () => {
    handle(notes[0]).focus();
    keydown(handle(notes[0]), ' ');
    keydown(handle(notes[0]), 'ArrowDown');
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    keydown(handle(notes[0]), ' ');
    await settle();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t reorder the notes. Quota exceeded.', type: 'error', duration: 6000 });
    expect(shown()).toEqual(['C', 'B', 'A']);
  });
});

describe('NoteListComponent - delete all', () => {
  let panel;
  let list;
  let asked;
  let answer;
  let detach;

  const mount = (notes) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    list = new NoteListComponent(placeholder, { scope: 'site', keys: KEYS, notes });
    list.render();
  };
  const stored = async () => (await scopeStoreService.load(KEYS)).site.notes.map((n) => n.text);

  beforeEach(async () => {
    panel = await startPanel();
    asked = [];
    answer = true;
    detach = confirmService.attach({ ask: async (options) => { asked.push(options); return answer; } });
  });

  afterEach(async () => {
    detach();
    list.destroy();
    await panel.stop();
  });

  it('offers "Delete all notes" under the notes, only when there are some', async () => {
    mount([]);
    expect($('.note-list__delete-all')).toBeFalsy();
    list.destroy();
    await scopeStoreService.addNote('site', KEYS.site, 'A');
    mount((await scopeStoreService.load(KEYS)).site.notes);
    expect($('.note-list__delete-all').textContent).toBe('Delete all notes');
  });

  it('asks first, and deletes nothing when cancelled', async () => {
    await scopeStoreService.addNote('site', KEYS.site, 'A');
    await scopeStoreService.addNote('site', KEYS.site, 'B');
    mount((await scopeStoreService.load(KEYS)).site.notes);
    answer = false;
    $('.note-list__delete-all').click();
    await settle();

    expect(asked).toEqual([{ title: 'Delete all notes for this site?', message: '2 notes. You can undo this right after.', confirmLabel: 'Delete all' }]);
    expect((await stored()).length).toBe(2);
  });

  it('deletes every note once confirmed, with an undo', async () => {
    const only = await scopeStoreService.addNote('site', KEYS.site, 'Only');
    await scopeStoreService.addNote('page', KEYS.page, 'Other list');
    mount((await scopeStoreService.load(KEYS)).site.notes);

    $('.note-list__delete-all').click();
    await settle();
    expect(asked[0].message).toBe('1 note. You can undo this right after.');
    expect(await stored()).toEqual([]);
    expect((await scopeStoreService.load(KEYS)).page.notes.length).toBe(1);

    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('1 note deleted.');
    toast.onAction();
    await settle();
    expect((await scopeStoreService.load(KEYS)).site.notes).toEqual([only]);
  });

  it('reports a failed delete', async () => {
    await scopeStoreService.addNote('site', KEYS.site, 'Stuck');
    mount((await scopeStoreService.load(KEYS)).site.notes);
    const remove = spyOn(panel.fake.storage.local, 'remove').andCallFake(async () => { throw new Error('Nope.'); });
    $('.note-list__delete-all').click();
    await settle();
    remove.restore();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t delete the notes. Nope.', type: 'error', duration: 6000 });
    expect(hasRequestedFocus()).toBe(false);
  });
});

describe('NoteListComponent - selecting', () => {
  let panel;
  let list;
  let notes;

  const mount = (items) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    list = new NoteListComponent(placeholder, { scope: 'page', keys: KEYS, notes: items });
    list.render();
  };
  const stored = async (scope = 'page') => (await scopeStoreService.load(KEYS))[scope].notes;
  const storedTexts = async (scope) => (await stored(scope)).map((n) => n.text);
  // What the panel does once the store says the notes changed.
  const reload = async () => list.update(await stored());
  const box = (note) => $(`[data-note-id="${note.id}"] .note-item__select-box`);
  const count = () => $('.selection-bar__count').textContent;

  beforeEach(async () => {
    panel = await startPanel();
    const now = spyOn(Date, 'now');
    // Shown newest first: C, B, A.
    for (const [i, text] of ['A', 'B', 'C'].entries()) {
      now.andReturn(1000 + i);
      await scopeStoreService.addNote('page', KEYS.page, text);
    }
    now.restore();
    notes = await stored();
    mount(notes);
    useFakeTimers();
  });

  afterEach(async () => {
    useRealTimers();
    list.destroy();
    document.getElementById('app-announcer')?.remove();
    await panel.stop();
  });

  it('offers "Select" next to "Delete all notes", only when there are notes', () => {
    expect($('.note-list__select').textContent).toBe('Select');
    expect($('.note-item__select-box')).toBeFalsy();
    list.destroy();
    mount([]);
    expect($('.note-list__select')).toBeFalsy();
  });

  it('gives each note a labelled checkbox in place of its actions, focus on the first', () => {
    $('.note-list__select').click();

    expect($$('.note-item__select-box').length).toBe(3);
    expect(box(notes[0]).getAttribute('aria-label')).toBe('Select: C');
    expect(document.activeElement).toBe(box(notes[0]));
    expect($('.note-item__edit')).toBeFalsy();
    expect($('.note-item__delete')).toBeFalsy();
    expect($('.item-menu__trigger')).toBeFalsy();
    expect($('.note-item__handle')).toBeFalsy();
    expect($('.note-list__delete-all')).toBeFalsy();
    expect(count()).toBe('0 notes selected');
    expect($('.selection-bar__delete').disabled).toBe(true);
    expect($('.selection-bar__move').disabled).toBe(true);
    expect($('.selection-bar__move').textContent).toBe('Move to this site');
  });

  it('counts the selected notes in place, without re-rendering them', async () => {
    $('.note-list__select').click();
    const checkbox = box(notes[1]);
    checkbox.click();

    expect(box(notes[1])).toBe(checkbox);
    expect(checkbox.checked).toBe(true);
    expect($(`[data-note-id="${notes[1].id}"]`).classList.contains('note-item--selected')).toBe(true);
    expect(count()).toBe('1 note selected');
    expect(await spoken()).toBe('1 note selected');
    expect($('.selection-bar__delete').disabled).toBe(false);
    expect($('.selection-bar__move').disabled).toBe(false);

    checkbox.click();
    expect(count()).toBe('0 notes selected');
    expect($('.selection-bar__delete').disabled).toBe(true);
  });

  it('selects a note with a click anywhere on it, not opening it', () => {
    $('.note-list__select').click();
    $(`[data-note-id="${notes[2].id}"] .note-item__text`).click();
    expect(box(notes[2]).checked).toBe(true);
    expect($('.note-editor')).toBeFalsy();
    expect(count()).toBe('1 note selected');
  });

  it('deletes the selected notes in one go, with an undo', async () => {
    $('.note-list__select').click();
    box(notes[0]).click();
    box(notes[2]).click();
    $('.selection-bar__delete').click();
    await settle();

    expect($('.selection-bar')).toBeFalsy();
    expect(await storedTexts()).toEqual(['B']);
    await reload();
    expect(document.activeElement).toBe($('.note-list__select'));

    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('2 notes deleted.');
    toast.onAction();
    await settle();
    expect(await storedTexts()).toEqual(['C', 'B', 'A']);
  });

  it('moves the selected notes to this site, with an undo', async () => {
    $('.note-list__select').click();
    box(notes[1]).click();
    $('.selection-bar__move').click();
    await settle();

    expect(await storedTexts('site')).toEqual(['B']);
    expect(await storedTexts('page')).toEqual(['C', 'A']);
    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('Moved 1 note to this site.');
    expect(toast.type).toBe('success');
    toast.onAction();
    await settle();
    expect(await storedTexts('page')).toEqual(['C', 'B', 'A']);
    expect(await storedTexts('site')).toEqual([]);
  });

  it('stops with Cancel or Escape, focus back on Select, forgetting what was selected', () => {
    $('.note-list__select').click();
    box(notes[0]).click();
    $('.selection-bar__cancel').click();
    expect($('.note-item__select-box')).toBeFalsy();
    expect($('.note-item__edit')).toBeTruthy();
    expect(document.activeElement).toBe($('.note-list__select'));

    $('.note-list__select').click();
    expect(box(notes[0]).checked).toBe(false);
    expect(count()).toBe('0 notes selected');
    keydown(box(notes[0]), 'Escape');
    expect($('.note-item__select-box')).toBeFalsy();
    expect(document.activeElement).toBe($('.note-list__select'));
  });

  it('forgets notes deleted meanwhile, and keeps the rest selected across updates', async () => {
    $('.note-list__select').click();
    box(notes[0]).click();
    box(notes[1]).click();
    await scopeStoreService.remove('notes', notes[0]);
    await reload();

    expect(count()).toBe('1 note selected');
    expect(box(notes[1]).checked).toBe(true);
  });

  it('reports a failed delete and keeps the selection', async () => {
    $('.note-list__select').click();
    box(notes[0]).click();
    const set = spyOn(panel.fake.storage.local, 'set').andCallFake(async () => { throw new Error('Nope.'); });
    $('.selection-bar__delete').click();
    await settle();
    set.restore();

    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t delete the notes. Nope.', type: 'error', duration: 6000 });
    expect(box(notes[0]).checked).toBe(true);
    expect(count()).toBe('1 note selected');
    expect(document.activeElement).toBe($('.selection-bar__delete'));
    expect(hasRequestedFocus()).toBe(false);
    expect((await stored()).length).toBe(3);
  });
});
