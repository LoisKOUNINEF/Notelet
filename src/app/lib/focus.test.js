import { applyRequestedFocus, clearRequestedFocus, requestFocus } from '#root/dist/src/app/lib/focus.js';

describe('requestFocus / applyRequestedFocus', () => {
  let app;

  beforeEach(() => {
    app = document.getElementById('app');
    app.innerHTML = '<button class="a">A</button><button class="b">B</button>';
  });

  afterEach(() => {
    clearRequestedFocus();
    app.innerHTML = '';
  });

  it('focuses the first requested selector found', () => {
    requestFocus('.missing', '.b', '.a');
    expect(applyRequestedFocus(app)).toBe(true);
    expect(document.activeElement).toBe($('.b'));
  });

  it('applies a request once', () => {
    requestFocus('.a');
    applyRequestedFocus(app);
    $('.b').focus();
    expect(applyRequestedFocus(app)).toBe(false);
    expect(document.activeElement).toBe($('.b'));
  });

  it('keeps a request nothing matches yet, for a later render', () => {
    requestFocus('.later');
    expect(applyRequestedFocus(app)).toBe(false);
    app.insertAdjacentHTML('beforeend', '<input class="later">');
    expect(applyRequestedFocus(app)).toBe(true);
    expect(document.activeElement).toBe($('.later'));
  });

  it('only looks inside the given root', () => {
    requestFocus('.a');
    const other = document.createElement('div');
    expect(applyRequestedFocus(other)).toBe(false);
  });
});
