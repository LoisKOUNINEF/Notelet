import { DeleteDataComponent, countText } from '#root/dist/src/app/components/delete-data/delete-data.component.js';
import { AppEventBus } from '#root/dist/src/core/index.js';
import { confirmService } from '#root/dist/src/app/services/confirm/confirm.service.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, settle, startPanel } from '../../testing/panel.js';

const DAY = 24 * 60 * 60 * 1000;

describe('DeleteDataComponent', () => {
  let panel;
  let component;
  let asked;
  let answer;
  let detach;

  const mount = async () => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    component = new DeleteDataComponent(placeholder);
    component.render();
    await settle();
  };
  // Adds an item last edited `days` ago.
  const addOld = async (days, add) => {
    const now = spyOn(Date, 'now').andReturn(Date.now() - days * DAY);
    try {
      return await add();
    } finally {
      now.restore();
    }
  };
  const olderText = () => $('#delete-data-older-text').textContent;
  const allText = () => $('#delete-data-all-text').textContent;
  const olderButton = () => $('.delete-data__older-button');
  const allButton = () => $('.delete-data__all-button');
  const pickAge = (value) => {
    $('.delete-data__select').value = value;
    $('.delete-data__select').dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const texts = async () => {
    const content = await scopeStoreService.load(KEYS);
    return [...content.page.notes, ...content.page.todos, ...content.site.notes, ...content.site.todos].map((i) => i.text).sort();
  };

  beforeEach(async () => {
    panel = await startPanel();
    asked = [];
    answer = true;
    detach = confirmService.attach({ ask: async (options) => { asked.push(options); return answer; } });
  });

  afterEach(async () => {
    detach();
    component.destroy();
    await panel.stop();
  });

  it('says when there\'s nothing to delete, with both buttons disabled', async () => {
    await mount();
    expect(olderText()).toBe('Nothing older than 1 month.');
    expect(allText()).toBe('No notes or to-dos yet.');
    expect(olderButton().disabled).toBe(true);
    expect(allButton().disabled).toBe(true);
    expect(olderButton().getAttribute('aria-describedby')).toBe('delete-data-older-text');
  });

  it('offers 1 week to 12 months, 1 month first, and counts what each would delete', async () => {
    await addOld(40, () => scopeStoreService.addNote('page', KEYS.page, 'Old note'));
    await addOld(10, () => scopeStoreService.addTodo('site', KEYS.site, 'Ten days old'));
    await scopeStoreService.addNote('page', KEYS.page, 'Fresh');
    await mount();

    expect($$('.delete-data__select option').map((o) => o.textContent)).toEqual(['1 week', '2 weeks', '3 weeks', '1 month', '2 months', '3 months', '6 months', '12 months']);
    expect($('.delete-data__select').value).toBe('1m');
    expect(olderText()).toBe('1 note not edited in the last month.');
    expect(allText()).toBe('2 notes and 1 to-do, on every page and site.');
    expect(olderButton().disabled).toBe(false);

    pickAge('1w');
    expect(olderText()).toBe('1 note and 1 to-do not edited in the last week.');
    pickAge('2m');
    expect(olderText()).toBe('Nothing older than 2 months.');
    expect(olderButton().disabled).toBe(true);
  });

  it('asks with the count, deletes only the old ones, and can undo it', async () => {
    await addOld(40, () => scopeStoreService.addNote('page', KEYS.page, 'Old note'));
    await addOld(40, () => scopeStoreService.addTodo('site', KEYS.site, 'Old to-do'));
    await scopeStoreService.addNote('page', KEYS.page, 'Fresh');
    await mount();

    olderButton().click();
    await settle();
    expect(asked).toEqual([{
      title: 'Delete what\'s older than 1 month?',
      message: '1 note and 1 to-do not edited in the last month, on every page and site.',
      confirmLabel: 'Delete',
    }]);
    expect(await texts()).toEqual(['Fresh']);
    expect(olderText()).toBe('Nothing older than 1 month.');
    expect(allText()).toBe('1 note, on every page and site.');

    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('1 note and 1 to-do deleted.');
    toast.onAction();
    await settle();
    expect(await texts()).toEqual(['Fresh', 'Old note', 'Old to-do']);
  });

  it('deletes nothing when cancelled', async () => {
    await addOld(40, () => scopeStoreService.addNote('page', KEYS.page, 'Old note'));
    await mount();
    answer = false;
    olderButton().click();
    allButton().click();
    await settle();
    expect(asked.length).toBe(2);
    expect(await texts()).toEqual(['Old note']);
  });

  it('counts everything in the "delete all" question, and warns about sync', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'A');
    await scopeStoreService.addTodo('site', KEYS.site, 'B');
    await scopeStoreService.addTodo('site', KEYS.site, 'C');
    await mount();

    allButton().click();
    await settle();
    expect(asked[0]).toEqual({
      title: 'Delete all your notes and to-dos?',
      message: '1 note and 2 to-dos, on every page and site. This can\'t be undone.',
      confirmLabel: 'Delete everything',
    });
    expect(await texts()).toEqual([]);
    expect(panel.toasts.at(-1)).toEqual({ message: 'All your notes and to-dos were deleted.', type: 'success' });
    expect(allButton().disabled).toBe(true);
  });

  it('adds the sync warning when notes are synced', async () => {
    await panel.stop();
    panel = await startPanel({ settings: { storageArea: 'sync' } });
    await scopeStoreService.addNote('page', KEYS.page, 'Synced');
    await mount();
    allButton().click();
    await settle();
    expect(asked[0].message).toBe('1 note, on every page and site. This can\'t be undone. They\'ll also be removed from your other computers.');
  });

  it('follows changes made elsewhere', async () => {
    await mount();
    await scopeStoreService.addNote('page', KEYS.page, 'Just added');
    await settle();
    expect(allText()).toBe('1 note, on every page and site.');
    expect(allButton().disabled).toBe(false);
  });

  it('keeps focus on the age while the counts change, and moves it off a button just disabled', async () => {
    await addOld(40, () => scopeStoreService.addNote('page', KEYS.page, 'Old note'));
    await mount();
    $('.delete-data__select').focus();
    AppEventBus.emit('minute-tick');
    expect(document.activeElement).toBe($('.delete-data__select'));

    olderButton().focus();
    pickAge('2m');
    expect(olderButton().disabled).toBe(true);
    expect(document.activeElement).toBe(allButton());
  });

  it('reports a failed count, keeping both buttons usable', async () => {
    const get = spyOn(panel.fake.storage.local, 'get').andCallFake(async () => { throw new Error('Nope.'); });
    await mount();
    get.restore();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t count your notes. Nope.');
    expect(olderButton().disabled).toBe(false);
    expect(allButton().disabled).toBe(false);

    answer = false;
    olderButton().click();
    allButton().click();
    await settle();
    expect(asked[0].message).toBe('Every note and to-do not edited in the last month, on every page and site.');
    expect(asked[1].message).toBe('Every note and to-do, on every page and site. This can\'t be undone.');
  });

  it('reports failed deletes and a failed undo', async () => {
    await addOld(40, () => scopeStoreService.addNote('page', KEYS.page, 'Old note'));
    await mount();
    const remove = spyOn(panel.fake.storage.local, 'remove').andCallFake(async () => { throw new Error('Nope.'); });
    olderButton().click();
    await settle();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t delete the older notes. Nope.');
    allButton().click();
    await settle();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t delete your notes. Nope.');
    remove.restore();

    olderButton().click();
    await settle();
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    panel.toasts.at(-1).onAction();
    await settle();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t restore them. Quota exceeded.');
  });
});

describe('countText', () => {
  it('names only the kinds there are, singular or plural', () => {
    expect(countText({ notes: 1, todos: 0 })).toBe('1 note');
    expect(countText({ notes: 0, todos: 3 })).toBe('3 to-dos');
    expect(countText({ notes: 2, todos: 1 })).toBe('2 notes and 1 to-do');
  });
});
