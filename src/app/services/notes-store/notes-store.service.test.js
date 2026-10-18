import { notesStoreService, QuotaExceededError } from '#root/dist/src/app/services/notes-store/notes-store.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { AppEventBus } from '#root/dist/src/core/index.js';
import { installFakeChrome, uninstallFakeChrome } from '../../testing/fake-chrome.js';

const keys = {
  page: 'https://example.com/a',
  site: 'example.com',
  pageLabel: '/a',
  siteLabel: 'example.com',
};

describe('NotesStoreService', () => {
  let fake;
  let changes;
  const onChange = () => changes++;

  beforeEach(async () => {
    fake = installFakeChrome();
    changes = 0;
    await settingsService.init();
    notesStoreService.init();
    AppEventBus.subscribe('notes-changed', onChange);
  });

  afterEach(() => {
    AppEventBus.off('notes-changed', onChange);
    notesStoreService.dispose();
    settingsService.dispose();
    uninstallFakeChrome();
  });

  it('loads empty lists for a tab without notes', async () => {
    expect(await notesStoreService.load(keys)).toEqual({ page: [], site: [] });
  });

  it('adds notes to their own scope, newest first, with timestamps', async () => {
    const now = spyOn(Date, 'now').andReturn(1000);
    const first = await notesStoreService.add('page', keys.page, 'First');
    now.andReturn(2000);
    const second = await notesStoreService.add('page', keys.page, 'Second');
    now.restore();
    await notesStoreService.add('site', keys.site, 'Site-wide');

    const notes = await notesStoreService.load(keys);
    expect(notes.page.map((n) => n.text)).toEqual(['Second', 'First']);
    expect(notes.site.map((n) => n.text)).toEqual(['Site-wide']);
    expect(typeof first.createdAt).toBe('number');
    expect(first.updatedAt).toBe(first.createdAt);
    expect(first.id).not.toBe(second.id);
  });

  it('stores one item per scope key, in local storage by default', async () => {
    await notesStoreService.add('page', keys.page, 'A');
    await notesStoreService.add('site', keys.site, 'B');
    expect([...fake.storage.local.data.keys()]).toEqual(['notes:page:https://example.com/a', 'notes:site:example.com']);
    expect(fake.storage.sync.data.size).toBe(0);
  });

  it('loads both scopes of a tab in a single read', async () => {
    const get = spyOn(fake.storage.local, 'get');
    await notesStoreService.load(keys);
    expect(get.callCount).toBe(1);
    expect(get.lastCall).toEqual([['notes:page:https://example.com/a', 'notes:site:example.com']]);
    get.restore();
  });

  it('updates a note\'s text and its updatedAt only', async () => {
    const note = await notesStoreService.add('page', keys.page, 'Draft');
    const updated = await notesStoreService.update({ ...note, updatedAt: 0 }, 'Final');
    const [stored] = (await notesStoreService.load(keys)).page;

    expect(stored.text).toBe('Final');
    expect(stored.createdAt).toBe(note.createdAt);
    expect(stored.updatedAt).toBe(updated.updatedAt);
    expect(updated.updatedAt).toBeGreaterThan(0);
  });

  it('removes a note, and its storage item with the last one', async () => {
    const note = await notesStoreService.add('page', keys.page, 'Bye');
    await notesStoreService.remove(note);
    expect((await notesStoreService.load(keys)).page).toEqual([]);
    expect(fake.storage.local.data.size).toBe(0);
  });

  it('restores a removed note as it was', async () => {
    const note = await notesStoreService.add('page', keys.page, 'Back');
    await notesStoreService.remove(note);
    await notesStoreService.restore(note);
    expect((await notesStoreService.load(keys)).page).toEqual([note]);
  });

  it('moves a note between page and site in a single write', async () => {
    const note = await notesStoreService.add('page', keys.page, 'Whole site');
    const set = spyOn(fake.storage.local, 'set');

    const moved = await notesStoreService.move(note, keys);
    expect(set.callCount).toBe(1);
    set.restore();

    expect(moved.scope).toBe('site');
    expect(moved.key).toBe('example.com');
    let notes = await notesStoreService.load(keys);
    expect(notes.page).toEqual([]);
    expect(notes.site.map((n) => n.id)).toEqual([note.id]);

    await notesStoreService.move(moved, keys);
    notes = await notesStoreService.load(keys);
    expect(notes.page.map((n) => n.id)).toEqual([note.id]);
    expect(notes.site).toEqual([]);
  });

  it('runs writes one at a time, so concurrent adds are all kept', async () => {
    await Promise.all(['a', 'b', 'c'].map((text) => notesStoreService.add('page', keys.page, text)));
    expect((await notesStoreService.load(keys)).page.length).toBe(3);
  });

  it('reports a failed write to its caller, and still runs the next ones', async () => {
    fake.storage.local.failNextSet = new Error('QUOTA_BYTES quota exceeded');
    let error;
    try {
      await notesStoreService.add('page', keys.page, 'Too big');
    } catch (e) {
      error = e;
    }
    expect(error.message).toContain('quota');

    await notesStoreService.add('page', keys.page, 'Fine');
    expect((await notesStoreService.load(keys)).page.map((n) => n.text)).toEqual(['Fine']);
  });

  it('emits notes-changed when the notes change, here or in another window', async () => {
    await notesStoreService.add('page', keys.page, 'Here');
    expect(changes).toBe(1);

    await fake.storage.local.set({ 'notes:site:other.com': [] });
    expect(changes).toBe(2);
  });

  it('does not emit notes-changed for settings or for the area not in use', async () => {
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
      notesStoreService.init();
      AppEventBus.subscribe('notes-changed', onChange);
      AppEventBus.subscribe('storage-area-changed', onArea);
    });

    afterEach(() => {
      AppEventBus.off('notes-changed', onChange);
      AppEventBus.off('storage-area-changed', onArea);
      notesStoreService.dispose();
      settingsService.dispose();
      uninstallFakeChrome();
    });

    it('moves every note to sync, switches the setting and leaves settings in local', async () => {
      await notesStoreService.add('page', keys.page, 'A');
      await notesStoreService.add('site', 'other.com', 'B');

      await notesStoreService.migrateTo('sync');

      expect(settingsService.storageArea).toBe('sync');
      expect(areaEvents).toEqual(['sync']);
      expect([...fake.storage.sync.data.keys()].sort()).toEqual(['notes:page:https://example.com/a', 'notes:site:other.com']);
      expect([...fake.storage.local.data.keys()]).toEqual(['settings']);
      expect((await notesStoreService.load(keys)).page.map((n) => n.text)).toEqual(['A']);
    });

    it('moves them back to local', async () => {
      await notesStoreService.add('page', keys.page, 'A');
      await notesStoreService.migrateTo('sync');
      await notesStoreService.migrateTo('local');

      expect(settingsService.storageArea).toBe('local');
      expect(fake.storage.sync.data.size).toBe(0);
      expect((await notesStoreService.load(keys)).page.map((n) => n.text)).toEqual(['A']);
    });

    it('does nothing when already in that area', async () => {
      await notesStoreService.migrateTo('local');
      expect(areaEvents).toEqual([]);
    });

    it('refuses notes too large for one sync item, and keeps everything in place', async () => {
      await notesStoreService.add('page', keys.page, 'x'.repeat(9000));

      let error;
      try {
        await notesStoreService.migrateTo('sync');
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(QuotaExceededError);
      expect(settingsService.storageArea).toBe('local');
      expect(fake.storage.sync.data.size).toBe(0);
      expect((await notesStoreService.load(keys)).page.length).toBe(1);
    });

    it('refuses notes too large for sync altogether', async () => {
      fake.storage.sync.QUOTA_BYTES = 1000;
      await notesStoreService.add('page', keys.page, 'x'.repeat(600));
      await notesStoreService.add('site', keys.site, 'y'.repeat(600));

      let error;
      try {
        await notesStoreService.migrateTo('sync');
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(QuotaExceededError);
      expect(settingsService.storageArea).toBe('local');
    });
  });
});
