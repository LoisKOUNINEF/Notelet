import { requireElement } from '#root/dist/src/app/lib/dom.js';

describe('requireElement', () => {
  it('returns the element, or throws naming the selector', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p class="x"></p>';
    expect(requireElement(root, '.x')).toBe(root.firstElementChild);
    expect(() => requireElement(root, '.y')).toThrow();
  });
});
