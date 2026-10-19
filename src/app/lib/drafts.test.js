import { clearDrafts, getDraft, getEditDraft, getJsonDraft, setDraft, setEditDraft, setJsonDraft } from '#root/dist/src/app/lib/drafts.js';

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
