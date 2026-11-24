// Isolated (nutin.config.js): <a11y-textarea> has to be defined in this file's own jsdom window.
import 'a11y-elements/components/textarea';
import { requireText } from '#root/dist/src/app/lib/dom.js';

describe('requireText', () => {
  let form;
  let textarea;
  const nodeAbortController = globalThis.AbortController;

  // a11y-elements listens with an AbortSignal: it has to be jsdom's, not Node's.
  beforeAll(() => { globalThis.AbortController = window.AbortController; });
  afterAll(() => { globalThis.AbortController = nodeAbortController; });

  const typed = (value) => {
    textarea.value = value;
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    return textarea.checkValidity();
  };

  beforeEach(() => {
    form = document.createElement('form');
    form.innerHTML = '<a11y-textarea><a11y-label>Text</a11y-label><textarea required></textarea></a11y-textarea>';
    document.body.append(form);
    textarea = form.querySelector('textarea');
    requireText(textarea);
  });

  afterEach(() => form.remove());

  it('makes blank text invalid, spaces only included', () => {
    expect(typed('')).toBe(false);
    expect(typed('  \t ')).toBe(false);
    expect(typed(' a ')).toBe(true);
  });

  it('blocks the form\'s submit while the text is blank', () => {
    let submits = 0;
    form.addEventListener('submit', (event) => { event.preventDefault(); submits++; });
    typed('   ');
    form.requestSubmit();
    expect(submits).toBe(0);
    typed('Tickets');
    form.requestSubmit();
    expect(submits).toBe(1);
  });

  it('throws when the textarea has no <a11y-textarea>', () => {
    expect(() => requireText(document.createElement('textarea'))).toThrow();
  });
});
