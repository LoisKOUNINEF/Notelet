import { formKeys, isPlainEnter, lineField, requireElement } from '#root/dist/src/app/lib/dom.js';

describe('requireElement', () => {
  it('returns the element, or throws naming the selector', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p class="x"></p>';
    expect(requireElement(root, '.x')).toBe(root.firstElementChild);
    expect(() => requireElement(root, '.y')).toThrow();
  });
});

describe('lineField', () => {
  let form;
  let textarea;
  let submits;
  let listeners;

  const keydown = (key, options = {}) => {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    textarea.dispatchEvent(event);
    return event;
  };
  const mount = (options) => {
    listeners = lineField(textarea, options);
  };

  beforeEach(() => {
    form = document.getElementById('app').appendChild(document.createElement('form'));
    textarea = form.appendChild(document.createElement('textarea'));
    submits = 0;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submits++;
    });
  });

  afterEach(() => {
    for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
    form.remove();
  });

  it('submits its form with Enter, Ctrl/Cmd+Enter too, once, and adds no line', () => {
    mount();
    const event = keydown('Enter');
    expect(event.defaultPrevented).toBe(true);
    keydown('Enter', { ctrlKey: true });
    keydown('Enter', { metaKey: true });
    expect(submits).toBe(3);
    // Shift+Enter neither submits nor adds a line (see below), nor does a key already handled.
    keydown('Enter', { shiftKey: true });
    const handled = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    handled.preventDefault();
    textarea.dispatchEvent(handled);
    expect(submits).toBe(3);
  });

  it('leaves Enter alone with submitOn: "ctrl-enter", submitting on Ctrl/Cmd+Enter only', () => {
    mount({ submitOn: 'ctrl-enter' });
    expect(keydown('Enter').defaultPrevented).toBe(false);
    expect(submits).toBe(0);
    keydown('Enter', { ctrlKey: true });
    expect(submits).toBe(1);
  });

  it('cancels a line break, whatever key made it', () => {
    mount();
    for (const inputType of ['insertLineBreak', 'insertParagraph']) {
      const event = new window.InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    const text = new window.InputEvent('beforeinput', { inputType: 'insertText', data: 'a', bubbles: true, cancelable: true });
    textarea.dispatchEvent(text);
    expect(text.defaultPrevented).toBe(false);
  });

  it('turns pasted line breaks and tabs into single spaces, the caret after the paste', () => {
    mount();
    textarea.value = 'Buy\r\nmilk\n\n\tand eggs!';
    textarea.setSelectionRange(14, 14);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(textarea.value).toBe('Buy milk and eggs!');
    expect(textarea.selectionStart).toBe(12);
  });
});

describe('isPlainEnter', () => {
  const key = (options) => new window.KeyboardEvent('keydown', { key: 'Enter', ...options });

  it('is Enter without a modifier, and not while an input method composes', () => {
    expect(isPlainEnter(key())).toBe(true);
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey', 'isComposing']) {
      expect(isPlainEnter(key({ [modifier]: true }))).toBe(false);
    }
    expect(isPlainEnter(new window.KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
  });
});

describe('formKeys', () => {
  let form;
  let button;
  let submits;
  let escapes;
  let reached;
  let listeners;

  const keydown = (target, key, options = {}) => {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
  };
  const onApp = (event) => reached.push(event.key);

  beforeEach(() => {
    form = document.getElementById('app').appendChild(document.createElement('form'));
    button = form.appendChild(document.createElement('button'));
    button.type = 'button';
    submits = 0;
    escapes = 0;
    reached = [];
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submits++;
    });
    document.getElementById('app').addEventListener('keydown', onApp);
  });

  afterEach(() => {
    for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
    document.getElementById('app').removeEventListener('keydown', onApp);
    form.remove();
  });

  it('submits on Ctrl/Cmd+Enter from anywhere in the form, a button included', () => {
    listeners = formKeys(form);
    expect(keydown(button, 'Enter', { ctrlKey: true }).defaultPrevented).toBe(true);
    keydown(button, 'Enter', { metaKey: true });
    keydown(form, 'Enter', { ctrlKey: true, shiftKey: true });
    expect(submits).toBe(3);
    // Not plain Enter, nor one a field handled, nor while an input method composes.
    keydown(button, 'Enter');
    keydown(button, 'Enter', { ctrlKey: true, altKey: true });
    keydown(button, 'Enter', { ctrlKey: true, isComposing: true });
    const handled = new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    handled.preventDefault();
    button.dispatchEvent(handled);
    expect(submits).toBe(3);
  });

  it('calls onEscape on Escape, which goes no further', () => {
    listeners = formKeys(form, { onEscape: () => escapes++ });
    keydown(button, 'Escape');
    expect(escapes).toBe(1);
    expect(reached).toEqual([]);
    keydown(button, 'a');
    expect(reached).toEqual(['a']);
  });

  it('lets Escape through without onEscape', () => {
    listeners = formKeys(form);
    expect(keydown(button, 'Escape').defaultPrevented).toBe(false);
    expect(reached).toEqual(['Escape']);
  });
});
