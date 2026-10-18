import { clearDrafts, getDraft, getEditDraft, setDraft, setEditDraft } from '#root/dist/src/app/lib/drafts.js';

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

  it('forgets everything with clearDrafts', () => {
    setDraft('a', '1');
    clearDrafts();
    expect(getDraft('a')).toBe('');
  });
});
