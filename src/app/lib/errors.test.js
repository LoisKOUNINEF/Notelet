import { errorMessage } from '#root/dist/src/app/lib/errors.js';

describe('errorMessage', () => {
  it('gives an Error\'s message', () => {
    expect(errorMessage(new Error('Quota exceeded.'))).toBe('Quota exceeded.');
  });

  it('gives anything else as text, as chrome.* callbacks may reject with a string', () => {
    expect(errorMessage('Extension context invalidated.')).toBe('Extension context invalidated.');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});
