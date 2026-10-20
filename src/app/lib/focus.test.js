import { applyRequestedFocus, byData, clearRequestedFocus, hasRequestedFocus, renderKeepingFocus, requestFocus } from '#root/dist/src/app/lib/focus.js';

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

  it('skips a target inside something hidden, for the next selector', () => {
    app.innerHTML = '<ul hidden><li><button class="a">A</button></li></ul><button class="b">B</button>';
    requestFocus('.a', '.b');
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

  it('builds data-attribute selectors that survive any id', () => {
    app.innerHTML = '<div data-note-id=\'we"ird\\id\'><button class="x">X</button></div>';
    expect(byData('note-id', 'we"ird\\id')).toBe('[data-note-id="we\\"ird\\\\id"]');
    expect(app.querySelector(`${byData('note-id', 'we"ird\\id')} .x`)).toBe($('.x'));
  });

  it('says whether a focus request is pending', () => {
    expect(hasRequestedFocus()).toBe(false);
    requestFocus('.a');
    expect(hasRequestedFocus()).toBe(true);
  });
});

describe('renderKeepingFocus', () => {
  let root;
  // Rebuilds the root's controls, as a Nutin render does.
  const render = (disabled = '') => () => {
    root.innerHTML = `<button class="a" ${disabled === 'a' ? 'disabled' : ''}>A</button><button class="b">B</button>`;
  };

  beforeEach(() => {
    root = document.getElementById('app').appendChild(document.createElement('div'));
    render()();
  });

  afterEach(() => {
    clearRequestedFocus();
    root.remove();
  });

  it('gives the focus back to the rebuilt control', () => {
    root.querySelector('.b').focus();
    renderKeepingFocus(root, ['.a', '.b'], render());
    expect(document.activeElement).toBe(root.querySelector('.b'));
  });

  it('moves it to the next control when that one got disabled', () => {
    root.querySelector('.a').focus();
    renderKeepingFocus(root, ['.a', '.b'], render('a'));
    expect(document.activeElement).toBe(root.querySelector('.b'));
  });

  it('leaves it alone when an action asked for it elsewhere, or it was elsewhere', () => {
    root.querySelector('.a').focus();
    requestFocus('.b');
    renderKeepingFocus(root, ['.a', '.b'], render());
    expect(document.activeElement).not.toBe(root.querySelector('.a'));

    clearRequestedFocus();
    document.body.focus();
    renderKeepingFocus(root, ['.a', '.b'], render());
    expect(root.contains(document.activeElement)).toBe(false);
  });
});
