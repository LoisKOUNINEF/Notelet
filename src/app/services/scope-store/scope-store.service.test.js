import { scopeStoreService, QuotaExceededError } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { AppEventBus } from '#root/dist/src/core/index.js';
import { installFakeChrome, uninstallFakeChrome } from '../../testing/fake-chrome.js';

const keys = {
  page: 'https://example.com/a',
  site: 'example.com',
  pageLabel: '/a',
  siteLabel: 'example.com',
};

describe('ScopeStoreService', () => {
  let fake;
  let changes;
  const onChange = () => changes++;

  beforeEach(async () => {
    fake = installFakeChrome();
    changes = 0;
    await settingsService.init();
    scopeStoreService.init();
    AppEventBus.subscribe('scope-content-changed', onChange);
  });

  afterEach(() => {
    AppEventBus.off('scope-content-changed', onChange);
    scopeStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('loads empty lists for a tab without notes', async () => {
    expect(await scopeStoreService.load(keys)).toEqual({ page: { notes: [], todos: [] }, site: { notes: [], todos: [] } });
  });

  it('adds notes to their own scope, newest first, with timestamps', async () => {
    const now = spyOn(Date, 'now').andReturn(1000);
    const first = await scopeStoreService.addNote('page', keys.page, 'First');
    now.andReturn(2000);
    const second = await scopeStoreService.addNote('page', keys.page, 'Second');
    now.restore();
    await scopeStoreService.addNote('site', keys.site, 'Site-wide');

    const notes = await scopeStoreService.load(keys);
    expect(notes.page.notes.map((n) => n.text)).toEqual(['Second', 'First']);
    expect(notes.site.notes.map((n) => n.text)).toEqual(['Site-wide']);
    expect(typeof first.createdAt).toBe('number');
    expect(first.updatedAt).toBe(first.createdAt);
    expect(first.id).not.toBe(second.id);
  });

  it('stores one item per scope key, in local storage by default', async () => {
    await scopeStoreService.addNote('page', keys.page, 'A');
    await scopeStoreService.addNote('site', keys.site, 'B');
    expect([...fake.storage.local.data.keys()]).toEqual(['notes:page:https://example.com/a', 'notes:site:example.com']);
    expect(fake.storage.sync.data.size).toBe(0);
  });

  it('loads the notes and to-dos of both scopes of a tab in a single read', async () => {
    const get = spyOn(fake.storage.local, 'get');
    await scopeStoreService.load(keys);
    expect(get.callCount).toBe(1);
    expect(get.lastCall).toEqual([[
      'notes:page:https://example.com/a',
      'todos:page:https://example.com/a',
      'notes:site:example.com',
      'todos:site:example.com',
    ]]);
    get.restore();
  });

  it('updates a note\'s text and its updatedAt only', async () => {
    const note = await scopeStoreService.addNote('page', keys.page, 'Draft');
    const updated = await scopeStoreService.update('notes', { ...note, updatedAt: 0 }, { text: 'Final' });
    const [stored] = (await scopeStoreService.load(keys)).page.notes;

    expect(stored.text).toBe('Final');
    expect(stored.createdAt).toBe(note.createdAt);
    expect(stored.updatedAt).toBe(updated.updatedAt);
    expect(updated.updatedAt).toBeGreaterThan(0);
  });

  it('removes a note, and its storage item with the last one', async () => {
    const note = await scopeStoreService.addNote('page', keys.page, 'Bye');
    await scopeStoreService.remove('notes', note);
    expect((await scopeStoreService.load(keys)).page.notes).toEqual([]);
    expect(fake.storage.local.data.size).toBe(0);
  });

  it('restores a removed note as it was', async () => {
    const note = await scopeStoreService.addNote('page', keys.page, 'Back');
    await scopeStoreService.remove('notes', note);
    await scopeStoreService.restore('notes', note);
    expect((await scopeStoreService.load(keys)).page.notes).toEqual([note]);
  });

  it('moves a note between page and site in a single write', async () => {
    const note = await scopeStoreService.addNote('page', keys.page, 'Whole site');
    const set = spyOn(fake.storage.local, 'set');

    const moved = await scopeStoreService.move('notes', note, keys);
    expect(set.callCount).toBe(1);
    set.restore();

    expect(moved.scope).toBe('site');
    expect(moved.key).toBe('example.com');
    let notes = await scopeStoreService.load(keys);
    expect(notes.page.notes).toEqual([]);
    expect(notes.site.notes.map((n) => n.id)).toEqual([note.id]);

    await scopeStoreService.move('notes', moved, keys);
    notes = await scopeStoreService.load(keys);
    expect(notes.page.notes.map((n) => n.id)).toEqual([note.id]);
    expect(notes.site.notes).toEqual([]);
  });

  it('lists the pages of a site that have notes or to-dos, by path, with their counts', async () => {
    await scopeStoreService.addNote('page', 'https://example.com/b', 'One');
    await scopeStoreService.addNote('page', 'https://example.com/b', 'Two');
    const todo = await scopeStoreService.addTodo('page', 'https://example.com/b', 'Open');
    await scopeStoreService.addTodo('page', 'https://example.com/b', 'Still open');
    await scopeStoreService.update('todos', todo, { done: true });
    await scopeStoreService.addTodo('page', 'https://example.com', 'Home');
    // Other sites, site-wide items and other settings aren't pages of this site.
    await scopeStoreService.addNote('page', 'https://example.org/b', 'Elsewhere');
    await scopeStoreService.addNote('page', 'https://sub.example.com/b', 'Subdomain');
    await scopeStoreService.addNote('site', 'example.com', 'Whole site');
    fake.storage.local.data.set('notes:page:not a url', [{ id: 'x', createdAt: 1 }]);

    expect(await scopeStoreService.listSitePages('example.com')).toEqual([
      { key: 'https://example.com', label: '/', notes: 0, todos: 1, openTodos: 1 },
      { key: 'https://example.com/b', label: '/b', notes: 2, todos: 2, openTodos: 1 },
    ]);
    expect(await scopeStoreService.listSitePages('example.net')).toEqual([]);
  });

  it('empties one list in a single write, returning what it held for an undo', async () => {
    const now = spyOn(Date, 'now').andReturn(1000);
    const a = await scopeStoreService.addNote('page', keys.page, 'A');
    now.andReturn(2000);
    const b = await scopeStoreService.addNote('page', keys.page, 'B');
    now.restore();
    await scopeStoreService.addTodo('page', keys.page, 'Stays');
    await scopeStoreService.addNote('site', keys.site, 'Stays too');
    const remove = spyOn(fake.storage.local, 'remove');

    const removed = await scopeStoreService.removeAll('notes', 'page', keys.page);
    expect(remove.callCount).toBe(1);
    remove.restore();
    expect(removed.map((n) => n.id)).toEqual([b.id, a.id]);
    expect(fake.storage.local.data.has(`notes:page:${keys.page}`)).toBe(false);
    let content = await scopeStoreService.load(keys);
    expect(content.page.todos.map((t) => t.text)).toEqual(['Stays']);
    expect(content.site.notes.map((n) => n.text)).toEqual(['Stays too']);

    await scopeStoreService.restoreMany('notes', removed);
    content = await scopeStoreService.load(keys);
    expect(content.page.notes.map((n) => n.id)).toEqual([b.id, a.id]);
  });

  it('clears every note and to-do of the area in use, keeping the settings', async () => {
    await settingsService.setDoneExpanded(true);
    await scopeStoreService.addNote('page', keys.page, 'A');
    await scopeStoreService.addTodo('site', keys.site, 'B');
    await scopeStoreService.addNote('page', 'https://other.org/x', 'C');
    const remove = spyOn(fake.storage.local, 'remove');

    await scopeStoreService.clearEverything();
    expect(remove.callCount).toBe(1);
    remove.restore();
    expect([...fake.storage.local.data.keys()]).toEqual(['settings']);
    expect(settingsService.doneExpanded).toBe(true);
  });

  it('runs writes one at a time, so concurrent adds are all kept', async () => {
    await Promise.all(['a', 'b', 'c'].map((text) => scopeStoreService.addNote('page', keys.page, text)));
    expect((await scopeStoreService.load(keys)).page.notes.length).toBe(3);
  });

  it('reports a failed write to its caller, and still runs the next ones', async () => {
    fake.storage.local.failNextSet = new Error('QUOTA_BYTES quota exceeded');
    let error;
    try {
      await scopeStoreService.addNote('page', keys.page, 'Too big');
    } catch (e) {
      error = e;
    }
    expect(error.message).toContain('quota');

    await scopeStoreService.addNote('page', keys.page, 'Fine');
    expect((await scopeStoreService.load(keys)).page.notes.map((n) => n.text)).toEqual(['Fine']);
  });

  it('emits scope-content-changed when the notes change, here or in another window', async () => {
    await scopeStoreService.addNote('page', keys.page, 'Here');
    expect(changes).toBe(1);

    await fake.storage.local.set({ 'notes:site:other.com': [] });
    expect(changes).toBe(2);
  });

  it('does not emit scope-content-changed for settings or for the area not in use', async () => {
    await fake.storage.local.set({ settings: { storageArea: 'local' } });
    await fake.storage.sync.set({ 'notes:site:example.com': [] });
    expect(changes).toBe(0);
  });

  describe('migrateTo', () => {
    let areaEvents;
    const onArea = ({ area }) => areaEvents.push(area);

    beforeEach(async () => {
      fake = installFakeChrome();
      changes = 0;
      areaEvents = [];
      await settingsService.init();
      scopeStoreService.init();
      AppEventBus.subscribe('scope-content-changed', onChange);
      AppEventBus.subscribe('storage-area-changed', onArea);
    });

    afterEach(() => {
      AppEventBus.off('scope-content-changed', onChange);
      AppEventBus.off('storage-area-changed', onArea);
      scopeStoreService.dispose();
      settingsService.dispose();
      uninstallFakeChrome();
    });

    it('moves every note and to-do to sync, switches the setting and leaves settings in local', async () => {
      await scopeStoreService.addNote('page', keys.page, 'A');
      await scopeStoreService.addNote('site', 'other.com', 'B');
      await scopeStoreService.addTodo('site', keys.site, 'C');

      await scopeStoreService.migrateTo('sync');

      expect(settingsService.storageArea).toBe('sync');
      expect(areaEvents).toEqual(['sync']);
      expect([...fake.storage.sync.data.keys()].sort()).toEqual([
        'notes:page:https://example.com/a',
        'notes:site:other.com',
        'todos:site:example.com',
      ]);
      expect((await scopeStoreService.load(keys)).site.todos.map((t) => t.text)).toEqual(['C']);
      expect([...fake.storage.local.data.keys()]).toEqual(['settings']);
      expect((await scopeStoreService.load(keys)).page.notes.map((n) => n.text)).toEqual(['A']);
    });

    it('moves them back to local', async () => {
      await scopeStoreService.addNote('page', keys.page, 'A');
      await scopeStoreService.migrateTo('sync');
      await scopeStoreService.migrateTo('local');

      expect(settingsService.storageArea).toBe('local');
      expect(fake.storage.sync.data.size).toBe(0);
      expect((await scopeStoreService.load(keys)).page.notes.map((n) => n.text)).toEqual(['A']);
    });

    it('does nothing when already in that area', async () => {
      await scopeStoreService.migrateTo('local');
      expect(areaEvents).toEqual([]);
    });

    it('refuses notes too large for one sync item, and keeps everything in place', async () => {
      await scopeStoreService.addNote('page', keys.page, 'x'.repeat(9000));

      let error;
      try {
        await scopeStoreService.migrateTo('sync');
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(QuotaExceededError);
      expect(settingsService.storageArea).toBe('local');
      expect(fake.storage.sync.data.size).toBe(0);
      expect((await scopeStoreService.load(keys)).page.notes.length).toBe(1);
    });

    it('refuses notes and to-dos too large for sync altogether', async () => {
      fake.storage.sync.QUOTA_BYTES = 1000;
      await scopeStoreService.addNote('page', keys.page, 'x'.repeat(600));
      await scopeStoreService.addTodo('site', keys.site, 'y'.repeat(600));

      let error;
      try {
        await scopeStoreService.migrateTo('sync');
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(QuotaExceededError);
      expect(settingsService.storageArea).toBe('local');
    });
  });
});

// Not nested in the suite above: testin-nutin's describe() replaces the hooks of the suite it's in.
describe('ScopeStoreService - to-dos', () => {
  let fake;
  let changes;
  const onChange = () => changes++;

  beforeEach(async () => {
    fake = installFakeChrome();
    changes = 0;
    await settingsService.init();
    scopeStoreService.init();
    AppEventBus.subscribe('scope-content-changed', onChange);
  });

  afterEach(() => {
    AppEventBus.off('scope-content-changed', onChange);
    scopeStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  const texts = async (scope = 'page') => (await scopeStoreService.load(keys))[scope].todos.map((t) => t.text);

  it('adds open to-dos in their own items, next to the notes', async () => {
    const todo = await scopeStoreService.addTodo('page', keys.page, 'Buy milk');
    await scopeStoreService.addNote('page', keys.page, 'A note');

    expect(todo.done).toBe(false);
    expect(fake.storage.local.data.get('todos:page:https://example.com/a')).toEqual([todo]);
    const content = (await scopeStoreService.load(keys)).page;
    expect(content.todos).toEqual([todo]);
    expect(content.notes.map((n) => n.text)).toEqual(['A note']);
  });

  it('lists open to-dos oldest first, then the done ones in the order they were checked', async () => {
    const now = spyOn(Date, 'now');
    const added = [];
    for (const [i, text] of ['One', 'Two', 'Three', 'Four'].entries()) {
      now.andReturn(1000 + i);
      added.push(await scopeStoreService.addTodo('page', keys.page, text));
    }
    // Checked newest first: creation order would put "One" above "Three".
    now.andReturn(2000);
    await scopeStoreService.update('todos', added[2], { done: true });
    now.andReturn(3000);
    await scopeStoreService.update('todos', added[0], { done: true });
    now.restore();

    expect(await texts()).toEqual(['Two', 'Four', 'Three', 'One']);
  });

  it('records when a to-do is checked, clears it when unchecked, and keeps it through edits', async () => {
    const now = spyOn(Date, 'now').andReturn(1000);
    const todo = await scopeStoreService.addTodo('page', keys.page, 'Task');
    expect(todo.doneAt).toBe(null);

    now.andReturn(2000);
    const done = await scopeStoreService.update('todos', todo, { done: true });
    expect(done.doneAt).toBe(2000);

    now.andReturn(3000);
    const edited = await scopeStoreService.update('todos', done, { text: 'Task, renamed' });
    expect(edited.doneAt).toBe(2000);

    const reopened = await scopeStoreService.update('todos', edited, { done: false });
    expect(reopened.doneAt).toBe(null);
    now.restore();
  });

  it('orders done to-dos stored before doneAt existed by their last update', async () => {
    const legacy = (id, text, updatedAt) => ({ id, scope: 'page', key: keys.page, text, done: true, createdAt: 1, updatedAt });
    fake.storage.local.data.set('todos:page:https://example.com/a', [legacy('a', 'Later', 300), legacy('b', 'Earlier', 200)]);
    const now = spyOn(Date, 'now').andReturn(250);
    const open = await scopeStoreService.addTodo('page', keys.page, 'Open');
    now.andReturn(400);
    await scopeStoreService.update('todos', open, { done: true });
    now.restore();

    expect(await texts()).toEqual(['Earlier', 'Later', 'Open']);
  });

  it('checks, unchecks and edits a to-do, keeping its creation date', async () => {
    const todo = await scopeStoreService.addTodo('site', keys.site, 'Draft');
    const done = await scopeStoreService.update('todos', todo, { done: true });
    const edited = await scopeStoreService.update('todos', done, { text: 'Final', done: false });

    const [stored] = (await scopeStoreService.load(keys)).site.todos;
    expect(stored).toEqual(edited);
    expect(stored.createdAt).toBe(todo.createdAt);
    expect(stored.done).toBe(false);
  });

  it('removes and restores a to-do', async () => {
    const todo = await scopeStoreService.addTodo('page', keys.page, 'Back');
    await scopeStoreService.remove('todos', todo);
    expect(await texts()).toEqual([]);
    expect(fake.storage.local.data.size).toBe(0);

    await scopeStoreService.restore('todos', todo);
    expect(await texts()).toEqual(['Back']);
  });

  it('emits scope-content-changed for to-do changes', async () => {
    await scopeStoreService.addTodo('page', keys.page, 'Here');
    expect(changes).toBe(1);
  });

  it('writes notes and to-dos one at a time', async () => {
    await Promise.all([
      scopeStoreService.addTodo('page', keys.page, 'a'),
      scopeStoreService.addNote('page', keys.page, 'b'),
      scopeStoreService.addTodo('page', keys.page, 'c'),
    ]);
    const content = (await scopeStoreService.load(keys)).page;
    expect(content.todos.length).toBe(2);
    expect(content.notes.length).toBe(1);
  });

  it('removes and restores several to-dos of one list in one write each', async () => {
    const now = spyOn(Date, 'now');
    const added = [];
    for (const [i, text] of ['One', 'Two', 'Three'].entries()) {
      now.andReturn(1000 + i);
      added.push(await scopeStoreService.addTodo('page', keys.page, text));
    }
    now.restore();
    const set = spyOn(fake.storage.local, 'set');

    await scopeStoreService.removeMany('todos', [added[0], added[2]]);
    expect(set.callCount).toBe(1);
    expect(await texts()).toEqual(['Two']);

    await scopeStoreService.restoreMany('todos', [added[0], added[2]]);
    await scopeStoreService.restoreMany('todos', [added[0]]);
    expect(set.callCount).toBe(3);
    set.restore();
    expect(await texts()).toEqual(['One', 'Two', 'Three']);
  });

  it('does nothing for an empty list of to-dos', async () => {
    const set = spyOn(fake.storage.local, 'set');
    await scopeStoreService.removeMany('todos', []);
    await scopeStoreService.restoreMany('todos', []);
    expect(set.callCount).toBe(0);
    set.restore();
  });
});

describe('ScopeStoreService - checklists', () => {
  let fake;
  const keys = { page: 'https://example.com/a', site: 'example.com', pageLabel: '/a', siteLabel: 'example.com' };
  const item = (id, text, done = false) => ({ id, text, done });
  const stored = async () => (await scopeStoreService.load(keys)).page.notes;

  beforeEach(async () => {
    fake = installFakeChrome();
    await settingsService.init();
    scopeStoreService.init();
  });

  afterEach(() => {
    scopeStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('adds a note with its checklist, and plain notes with an empty one', async () => {
    const list = await scopeStoreService.addNote('page', keys.page, 'Trip', [item('a', 'Passport')]);
    const plain = await scopeStoreService.addNote('page', keys.page, 'Plain');
    expect(list.items).toEqual([item('a', 'Passport')]);
    expect(plain.items).toEqual([]);
    expect((await stored()).find((n) => n.id === list.id).items).toEqual([item('a', 'Passport')]);
  });

  it('applies updateWith to the stored note, so quick changes from a stale copy all stick', async () => {
    const note = await scopeStoreService.addNote('page', keys.page, 'Trip', [item('a', 'Passport'), item('b', 'Tickets')]);
    const check = (id) => scopeStoreService.updateWith('notes', note, (current) => ({
      items: current.items.map((i) => (i.id === id ? { ...i, done: true } : i)),
    }));

    // Both from the same, soon stale, `note`.
    await Promise.all([check('a'), check('b')]);

    expect((await stored())[0].items.map((i) => i.done)).toEqual([true, true]);
  });

  it('returns the item unchanged from updateWith when it is gone', async () => {
    const note = await scopeStoreService.addNote('page', keys.page, 'Gone');
    await scopeStoreService.remove('notes', note);
    expect(await scopeStoreService.updateWith('notes', note, () => ({ text: 'x' }))).toBe(note);
  });

  it('records doneAt through updateWith for to-dos too', async () => {
    const now = spyOn(Date, 'now').andReturn(5000);
    const todo = await scopeStoreService.addTodo('page', keys.page, 'Task');
    const done = await scopeStoreService.updateWith('todos', todo, () => ({ done: true }));
    now.restore();
    expect(done.doneAt).toBe(5000);
  });

  it('keeps the checklist when a note is moved, removed and restored', async () => {
    const note = await scopeStoreService.addNote('page', keys.page, 'Trip', [item('a', 'Passport', true)]);
    const moved = await scopeStoreService.move('notes', note, keys);
    expect((await scopeStoreService.load(keys)).site.notes[0].items).toEqual([item('a', 'Passport', true)]);

    await scopeStoreService.remove('notes', moved);
    await scopeStoreService.restore('notes', moved);
    expect((await scopeStoreService.load(keys)).site.notes[0].items).toEqual([item('a', 'Passport', true)]);
  });

  it('counts checklists in the sync quota', async () => {
    fake.storage.sync.QUOTA_BYTES_PER_ITEM = 200;
    await scopeStoreService.addNote('page', keys.page, 'Short', [item('a', 'x'.repeat(300))]);

    let error;
    try {
      await scopeStoreService.migrateTo('sync');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(QuotaExceededError);
  });
});

describe('ScopeStoreService - reordering to-dos', () => {
  const keys = { page: 'https://example.com/a', site: 'example.com', pageLabel: '/a', siteLabel: 'example.com' };
  const texts = async () => (await scopeStoreService.load(keys)).page.todos.map((t) => t.text);
  let fake;
  let todos;

  beforeEach(async () => {
    fake = installFakeChrome();
    await settingsService.init();
    scopeStoreService.init();
    const now = spyOn(Date, 'now');
    todos = [];
    for (const [i, text] of ['A', 'B', 'C'].entries()) {
      now.andReturn(1000 + i);
      todos.push(await scopeStoreService.addTodo('page', keys.page, text));
    }
    now.restore();
  });

  afterEach(() => {
    scopeStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('keeps the creation order until the list is reordered', async () => {
    expect(await texts()).toEqual(['A', 'B', 'C']);
    expect((await scopeStoreService.load(keys)).page.todos[0].position).toBeUndefined();
  });

  it('saves the new order in one write', async () => {
    const set = spyOn(fake.storage.local, 'set');
    await scopeStoreService.reorder('todos', 'page', keys.page, [todos[2].id, todos[0].id, todos[1].id]);
    expect(set.callCount).toBe(1);
    set.restore();

    expect(await texts()).toEqual(['C', 'A', 'B']);
    expect((await scopeStoreService.load(keys)).page.todos.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it('adds new to-dos after the reordered ones', async () => {
    await scopeStoreService.reorder('todos', 'page', keys.page, [todos[2].id, todos[1].id, todos[0].id]);
    await scopeStoreService.addTodo('page', keys.page, 'D');
    expect(await texts()).toEqual(['C', 'B', 'A', 'D']);
  });

  it('puts an unchecked to-do back where it was', async () => {
    await scopeStoreService.reorder('todos', 'page', keys.page, [todos[2].id, todos[0].id, todos[1].id]);
    const [, a] = (await scopeStoreService.load(keys)).page.todos;
    const done = await scopeStoreService.update('todos', a, { done: true });
    expect(await texts()).toEqual(['C', 'B', 'A']);

    await scopeStoreService.update('todos', done, { done: false });
    expect(await texts()).toEqual(['C', 'A', 'B']);
  });

  it('ignores unknown ids, and keeps open to-dos it wasn\'t given after the others', async () => {
    const late = await scopeStoreService.addTodo('page', keys.page, 'Added elsewhere');
    await scopeStoreService.reorder('todos', 'page', keys.page, ['unknown', todos[1].id, todos[0].id]);
    expect(await texts()).toEqual(['B', 'A', 'C', 'Added elsewhere']);
    expect(late.position).toBeUndefined();
  });

  it('leaves the done to-dos and their order alone', async () => {
    const now = spyOn(Date, 'now').andReturn(5000);
    await scopeStoreService.update('todos', todos[0], { done: true });
    now.restore();
    await scopeStoreService.reorder('todos', 'page', keys.page, [todos[2].id, todos[1].id]);

    const stored = (await scopeStoreService.load(keys)).page.todos;
    expect(stored.map((t) => t.text)).toEqual(['C', 'B', 'A']);
    expect(stored[2].position).toBeUndefined();
    expect(stored[2].doneAt).toBe(5000);
  });
});

describe('ScopeStoreService - reordering notes', () => {
  const keys = { page: 'https://example.com/a', site: 'example.com', pageLabel: '/a', siteLabel: 'example.com' };
  let notes;
  const texts = async (scope = 'page') => (await scopeStoreService.load(keys))[scope].notes.map((n) => n.text);

  beforeEach(async () => {
    installFakeChrome();
    await settingsService.init();
    scopeStoreService.init();
    const now = spyOn(Date, 'now');
    notes = [];
    for (const [i, text] of ['A', 'B', 'C'].entries()) {
      now.andReturn(1000 + i);
      notes.push(await scopeStoreService.addNote('page', keys.page, text));
    }
    now.restore();
  });

  afterEach(() => {
    scopeStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('shows the newest first until the list is reordered', async () => {
    expect(await texts()).toEqual(['C', 'B', 'A']);
  });

  it('saves the new order of every note', async () => {
    await scopeStoreService.reorder('notes', 'page', keys.page, [notes[0].id, notes[2].id, notes[1].id]);
    expect(await texts()).toEqual(['A', 'C', 'B']);
    expect((await scopeStoreService.load(keys)).page.notes.map((n) => n.position)).toEqual([0, 1, 2]);
  });

  it('puts notes written since, or not in the given order, on top', async () => {
    const now = spyOn(Date, 'now').andReturn(2000);
    const late = await scopeStoreService.addNote('page', keys.page, 'Added elsewhere');
    await scopeStoreService.reorder('notes', 'page', keys.page, ['unknown', notes[0].id, notes[1].id, notes[2].id]);
    now.andReturn(3000);
    await scopeStoreService.addNote('page', keys.page, 'Newest');
    now.restore();
    expect(await texts()).toEqual(['Newest', 'Added elsewhere', 'A', 'B', 'C']);
    expect(late.position).toBeUndefined();
  });

  it('keeps its place when edited', async () => {
    await scopeStoreService.reorder('notes', 'page', keys.page, [notes[0].id, notes[1].id, notes[2].id]);
    const [a] = (await scopeStoreService.load(keys)).page.notes;
    await scopeStoreService.update('notes', a, { text: 'A, edited' });
    expect(await texts()).toEqual(['A, edited', 'B', 'C']);
  });

  it('moves a reordered note to the top of the other list', async () => {
    const older = await scopeStoreService.addNote('site', keys.site, 'Site note');
    await scopeStoreService.reorder('notes', 'site', keys.site, [older.id]);
    await scopeStoreService.reorder('notes', 'page', keys.page, [notes[0].id, notes[1].id, notes[2].id]);
    const [a] = (await scopeStoreService.load(keys)).page.notes;

    const moved = await scopeStoreService.move('notes', a, keys);
    expect(moved.position).toBeUndefined();
    expect(await texts('site')).toEqual(['A', 'Site note']);
  });
});

describe('ScopeStoreService - moving to-dos', () => {
  const keys = { page: 'https://example.com/a', site: 'example.com', pageLabel: '/a', siteLabel: 'example.com' };
  const siteTexts = async () => (await scopeStoreService.load(keys)).site.todos.map((t) => t.text);
  let fake;

  beforeEach(async () => {
    fake = installFakeChrome();
    await settingsService.init();
    scopeStoreService.init();
  });

  afterEach(() => {
    scopeStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('lands a moved to-do at the top of the other list, in one write', async () => {
    await scopeStoreService.addTodo('site', keys.site, 'Site 1');
    await scopeStoreService.addTodo('site', keys.site, 'Site 2');
    const page = await scopeStoreService.addTodo('page', keys.page, 'From the page');
    const set = spyOn(fake.storage.local, 'set');

    const moved = await scopeStoreService.move('todos', page, keys);
    expect(set.callCount).toBe(1);
    set.restore();

    expect(moved.scope).toBe('site');
    expect(await siteTexts()).toEqual(['From the page', 'Site 1', 'Site 2']);
    expect((await scopeStoreService.load(keys)).page.todos).toEqual([]);
  });

  it('lands above reordered to-dos and above one moved before', async () => {
    const a = await scopeStoreService.addTodo('site', keys.site, 'A');
    const b = await scopeStoreService.addTodo('site', keys.site, 'B');
    await scopeStoreService.reorder('todos', 'site', keys.site, [b.id, a.id]);
    const first = await scopeStoreService.addTodo('page', keys.page, 'Moved first');
    const second = await scopeStoreService.addTodo('page', keys.page, 'Moved second');

    await scopeStoreService.move('todos', first, keys);
    await scopeStoreService.move('todos', second, keys);
    expect(await siteTexts()).toEqual(['Moved second', 'Moved first', 'B', 'A']);
  });

  it('keeps a done to-do done, back at the top once unchecked', async () => {
    await scopeStoreService.addTodo('site', keys.site, 'Open on the site');
    const added = await scopeStoreService.addTodo('page', keys.page, 'Done on the page');
    const done = await scopeStoreService.update('todos', added, { done: true });

    const moved = await scopeStoreService.move('todos', done, keys);
    expect(moved.done).toBe(true);
    expect(await siteTexts()).toEqual(['Open on the site', 'Done on the page']);

    await scopeStoreService.update('todos', moved, { done: false });
    expect(await siteTexts()).toEqual(['Done on the page', 'Open on the site']);
  });
});

describe('ScopeStoreService - stale copies', () => {
  const keys = { page: 'https://example.com/a', site: 'example.com', pageLabel: '/a', siteLabel: 'example.com' };
  const storedTodo = async (scope = 'page') => (await scopeStoreService.load(keys))[scope].todos[0];
  let fake;

  beforeEach(async () => {
    fake = installFakeChrome();
    await settingsService.init();
    scopeStoreService.init();
  });

  afterEach(() => {
    scopeStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('only changes the given fields, keeping what changed elsewhere since the copy was taken', async () => {
    const copy = await scopeStoreService.addTodo('page', keys.page, 'Original');
    // Another window renames it.
    await scopeStoreService.update('todos', copy, { text: 'Renamed elsewhere' });

    await scopeStoreService.update('todos', copy, { done: true });

    const stored = await storedTodo();
    expect(stored.text).toBe('Renamed elsewhere');
    expect(stored.done).toBe(true);
  });

  it('writes nothing for an item deleted meanwhile', async () => {
    const copy = await scopeStoreService.addTodo('page', keys.page, 'Gone');
    await scopeStoreService.remove('todos', copy);
    expect(await scopeStoreService.update('todos', copy, { done: true })).toBe(copy);
    expect(fake.storage.local.data.size).toBe(0);
  });

  it('moves the stored version, and nothing when the item is gone', async () => {
    const copy = await scopeStoreService.addTodo('page', keys.page, 'Original');
    await scopeStoreService.update('todos', copy, { text: 'Renamed elsewhere' });
    await scopeStoreService.move('todos', copy, keys);
    expect((await storedTodo('site')).text).toBe('Renamed elsewhere');

    const set = spyOn(fake.storage.local, 'set');
    expect(await scopeStoreService.move('todos', copy, keys)).toBe(copy);
    expect(set.callCount).toBe(0);
    set.restore();
  });

  it('removes the list a move empties, instead of leaving an empty item', async () => {
    const only = await scopeStoreService.addNote('page', keys.page, 'Only one');
    await scopeStoreService.addNote('page', keys.page, 'Second');
    const [, second] = (await scopeStoreService.load(keys)).page.notes;
    await scopeStoreService.move('notes', only, keys);
    expect(fake.storage.local.data.has(`notes:page:${keys.page}`)).toBe(true);

    await scopeStoreService.move('notes', second, keys);
    expect(fake.storage.local.data.has(`notes:page:${keys.page}`)).toBe(false);
    expect((await scopeStoreService.load(keys)).site.notes.length).toBe(2);
  });

  it('refuses to sync more lists than sync storage allows', async () => {
    fake.storage.sync.MAX_ITEMS = 2;
    await scopeStoreService.addNote('page', keys.page, 'A');
    await scopeStoreService.addNote('site', keys.site, 'B');
    await scopeStoreService.addTodo('site', keys.site, 'C');

    let error;
    try {
      await scopeStoreService.migrateTo('sync');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(error.message).toContain('too many pages');
    expect(settingsService.storageArea).toBe('local');
  });
});

describe('ScopeStoreService - switching areas across devices', () => {
  const keys = { page: 'https://example.com/a', site: 'example.com', pageLabel: '/a', siteLabel: 'example.com' };
  const note = (id, text, updatedAt) => ({ id, scope: 'page', key: keys.page, text, items: [], createdAt: 1, updatedAt });
  const pageItem = `notes:page:${keys.page}`;
  let fake;

  beforeEach(async () => {
    fake = installFakeChrome();
    await settingsService.init();
    scopeStoreService.init();
  });

  afterEach(() => {
    scopeStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('merges with notes another computer already synced, the latest edit winning', async () => {
    // Another computer synced: "shared" (edited there later) and "theirs".
    fake.storage.sync.data.set(pageItem, [note('shared', 'Edited there', 300), note('theirs', 'Only there', 100)]);
    fake.storage.sync.data.set('notes:site:other.com', [note('far', 'Other site', 100)]);
    fake.storage.local.data.set(pageItem, [note('shared', 'Older here', 200), note('mine', 'Only here', 100)]);

    await scopeStoreService.migrateTo('sync');

    const merged = fake.storage.sync.data.get(pageItem);
    expect(merged.map((n) => n.id).sort()).toEqual(['mine', 'shared', 'theirs']);
    expect(merged.find((n) => n.id === 'shared').text).toBe('Edited there');
    expect(fake.storage.sync.data.get('notes:site:other.com').length).toBe(1);
    expect(fake.storage.local.data.has(pageItem)).toBe(false);
  });

  it('keeps this device\'s copy when it was edited last', async () => {
    fake.storage.sync.data.set(pageItem, [note('shared', 'Older there', 100)]);
    fake.storage.local.data.set(pageItem, [note('shared', 'Newer here', 200)]);
    await scopeStoreService.migrateTo('sync');
    expect(fake.storage.sync.data.get(pageItem)[0].text).toBe('Newer here');
  });

  it('checks the sync quota on the merged notes, the other computer\'s included', async () => {
    fake.storage.sync.QUOTA_BYTES = 1000;
    fake.storage.sync.data.set('notes:site:other.com', [note('far', 'x'.repeat(700), 100)]);
    fake.storage.local.data.set(pageItem, [note('mine', 'y'.repeat(400), 100)]);

    let error;
    try {
      await scopeStoreService.migrateTo('sync');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(fake.storage.local.data.has(pageItem)).toBe(true);
  });

  it('merges into this device when leaving sync, then clears the synced copy', async () => {
    await settingsService.setStorageArea('sync');
    fake.storage.sync.data.set(pageItem, [note('synced', 'From sync', 100)]);
    fake.storage.local.data.set(pageItem, [note('left', 'Left behind here', 100)]);

    await scopeStoreService.migrateTo('local');

    expect(fake.storage.local.data.get(pageItem).map((n) => n.id).sort()).toEqual(['left', 'synced']);
    expect(fake.storage.sync.data.size).toBe(0);
  });

  it('drops malformed entries of a stored list instead of failing to load', async () => {
    fake.storage.local.data.set(pageItem, [null, 'text', { id: 1 }, { text: 'no id', createdAt: 1 }, note('ok', 'Valid', 1)]);
    const { page } = await scopeStoreService.load(keys);
    expect(page.notes.map((n) => n.id)).toEqual(['ok']);
  });
});
