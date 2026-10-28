import { errorMessage, failureMessage } from '#root/dist/src/app/lib/errors.js';
import { QuotaExceededError } from '#root/dist/src/app/services/scope-store/sync-quota.js';

describe('errorMessage', () => {
  it('gives an Error\'s message', () => {
    expect(errorMessage(new Error('Quota exceeded.'))).toBe('Quota exceeded.');
  });

  it('explains chrome.storage quota errors', () => {
    expect(errorMessage(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'))).toContain('too long to sync');
    expect(errorMessage(new Error('QUOTA_BYTES quota exceeded'))).toContain('Sync storage is full');
    expect(errorMessage(new Error('MAX_ITEMS quota exceeded'))).toContain('Sync storage is full');
    expect(errorMessage(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded'))).toContain('Wait a minute');
    expect(errorMessage(new Error('MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE quota exceeded'))).toContain('Wait a minute');
  });

  it('explains Firefox\'s storage.sync quota error', () => {
    expect(errorMessage(new Error('QuotaExceededError: storage.sync API call exceeded its quota limitations.'))).toContain('Sync storage is full');
  });

  it('gives anything else as text, as chrome.* callbacks may reject with a string', () => {
    expect(errorMessage('Extension context invalidated.')).toBe('Extension context invalidated.');
    expect(errorMessage(undefined)).toBe('undefined');
  });

  it('drops raw reasons in prod, keeping the messages written for users', () => {
    expect(errorMessage(new Error('Extension context invalidated.'), false)).toBe('');
    expect(errorMessage('Extension context invalidated.', false)).toBe('');
    expect(errorMessage(new Error('QUOTA_BYTES quota exceeded'), false)).toContain('Sync storage is full');
    expect(errorMessage(new Error('QuotaExceededError: storage.sync API call exceeded its quota limitations.'), false)).toContain('Sync storage is full');
    expect(errorMessage(new QuotaExceededError('Some items are too long to sync.'), false)).toBe('Some items are too long to sync.');
  });
});

describe('failureMessage', () => {
  it('follows the failure with the reason', () => {
    expect(failureMessage('Couldn\'t delete the note.', new Error('Nope.'))).toBe('Couldn\'t delete the note. Nope.');
  });

  it('gives the failure alone when there\'s no reason to show', () => {
    expect(failureMessage('Couldn\'t delete the note.', new Error('Nope.'), false)).toBe('Couldn\'t delete the note.');
    expect(failureMessage('Couldn\'t delete the note.', '')).toBe('Couldn\'t delete the note.');
  });
});
