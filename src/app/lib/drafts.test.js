import { clearDrafts, flushDrafts, getDraft, getEditDraft, getJsonDraft, initDrafts, keepDraftsOf, saveAllDrafts, setDraft, setEditDraft, setJsonDraft } from '#root/dist/src/app/lib/drafts.js';
import { installFakeChrome, uninstallFakeChrome } from '../testing/fake-chrome.js';

describe('drafts', () => {
  afterEach(() => clearDrafts());

  it('keeps text per id, and forgets it when emptied', () => {
    setDraft('note:page:a', 'Typing');
    expect(getDraft('note:page:a')).toBe('Typing');
    setDraft('note:page:a', '');
    expect(getDraft('note:page:a')).toBe('');
  });

  it('keeps edit drafts as data, per kind and id', () => {
    setEditDraft('note', 'n1', { text: 'Half', items: [] });
    setEditDraft('todo', 'n1', 'Other');
    expect(getEditDraft('note', 'n1')).toEqual({ text: 'Half', items: [] });
    expect(getEditDraft('todo', 'n1')).toBe('Other');
    setEditDraft('note', 'n1', null);
    expect(getEditDraft('note', 'n1')).toBe(null);
  });

  it('ignores an edit draft it can\'t read', () => {
    setDraft('edit:note:broken', '{not json');
    expect(getEditDraft('note', 'broken')).toBe(null);
  });

  it('keeps any data as a JSON draft, and forgets it when set to null', () => {
    setJsonDraft('note-checklist:page:a', [{ id: '1', text: 'Milk', done: false }]);
    expect(getJsonDraft('note-checklist:page:a')).toEqual([{ id: '1', text: 'Milk', done: false }]);
    setJsonDraft('note-checklist:page:a', null);
    expect(getJsonDraft('note-checklist:page:a')).toBe(null);
    expect(getDraft('note-checklist:page:a')).toBe('');
  });

  it('forgets everything with clearDrafts', () => {
    setDraft('a', '1');
    clearDrafts();
    expect(getDraft('a')).toBe('');
  });
});

describe('drafts kept in session storage', () => {
  let fake;

  beforeEach(() => {
    fake = installFakeChrome();
  });

  afterEach(() => {
    clearDrafts();
    useRealTimers();
    uninstallFakeChrome();
  });

  it('restores the drafts kept from the panel\'s last opening', async () => {
    fake.storage.session.data.set('draft:note:page:a', 'Half a note');
    fake.storage.session.data.set('settings:other', 'ignored');
    await initDrafts();
    expect(getDraft('note:page:a')).toBe('Half a note');
    expect(getDraft('settings:other')).toBe('');
  });

  it('saves once typing pauses, in one write', async () => {
    useFakeTimers();
    await initDrafts();
    const set = spyOn(fake.storage.session, 'set');
    setDraft('note:page:a', 'H');
    setDraft('note:page:a', 'Hi');
    setDraft('todo:page:a', 'Milk');
    advanceTimersByTime(100);
    expect(set.callCount).toBe(0);

    advanceTimersByTime(200);
    await flushPromises();
    expect(set.callCount).toBe(1);
    expect(fake.storage.session.data.get('draft:note:page:a')).toBe('Hi');
    expect(fake.storage.session.data.get('draft:todo:page:a')).toBe('Milk');
  });

  it('removes a draft once emptied (sent, or erased)', async () => {
    await initDrafts();
    setDraft('note:page:a', 'Hi');
    await flushDrafts();
    setDraft('note:page:a', '');
    await flushDrafts();
    expect(fake.storage.session.data.has('draft:note:page:a')).toBe(false);
  });

  it('keeps drafts in memory when saving fails', async () => {
    await initDrafts();
    fake.storage.session.failNextSet = new Error('Extension context invalidated.');
    setDraft('note:page:a', 'Hi');
    await flushDrafts();
    expect(getDraft('note:page:a')).toBe('Hi');
  });

  it('asks open editors for their drafts before saving everything', async () => {
    await initDrafts();
    const stop = keepDraftsOf(() => setEditDraft('note', 'n1', { text: 'Edited', name: '' }));
    await saveAllDrafts();
    expect(JSON.parse(fake.storage.session.data.get('draft:edit:note:n1'))).toEqual({ text: 'Edited', name: '' });

    stop();
    setEditDraft('note', 'n1', null);
    await saveAllDrafts();
    expect(fake.storage.session.data.has('draft:edit:note:n1')).toBe(false);
  });

  it('saves everything as soon as the panel is hidden or closed', async () => {
    await initDrafts();
    keepDraftsOf(() => setDraft('edit:note:n1', 'Open edit'));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
    delete document.visibilityState;
    await flushPromises();
    expect(fake.storage.session.data.get('draft:edit:note:n1')).toBe('Open edit');

    setDraft('note:page:a', 'Typed');
    window.dispatchEvent(new window.Event('pagehide'));
    await flushPromises();
    expect(fake.storage.session.data.get('draft:note:page:a')).toBe('Typed');
  });

  it('saves nothing until initialized (tests and a failed read)', async () => {
    setDraft('note:page:a', 'Hi');
    await flushDrafts();
    expect(fake.storage.session.data.size).toBe(0);
  });
});
