/**
 * The element `selector` matches in `root`, for one its template always renders. Throws, naming
 * the selector, rather than failing later on a null.
 */
export function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

/**
 * Whether `element`'s text overflows its width once kept on one line: whether a single line of
 * text wraps (or is cut), at the width it's laid out at now. Clipped while measured: a grid or
 * flex item that overflows visibly would grow to fit its text instead.
 */
export function overflowsOneLine(element: HTMLElement): boolean {
  const { whiteSpace, overflow } = element.style;
  element.style.whiteSpace = 'nowrap';
  element.style.overflow = 'hidden';
  const overflows = element.scrollWidth > element.clientWidth;
  element.style.whiteSpace = whiteSpace;
  element.style.overflow = overflow;
  return overflows;
}

/**
 * Calls `measure` each time `element`'s width changes, until the returned function is called.
 * Its height doesn't count: what a measure shows or moves (an arrow, a row of actions) changes
 * only that, so it can't set the measure off again. Without ResizeObserver (jsdom), never.
 */
export function onWidthChange(element: HTMLElement, measure: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  let width = element.getBoundingClientRect().width;
  const observer = new ResizeObserver(() => {
    const current = element.getBoundingClientRect().width;
    if (current === width) return;
    width = current;
    measure();
  });
  observer.observe(element);
  return () => observer.disconnect();
}

/** A listener to add, kept to be removed later (a component's `eventListeners`). */
export type ListenerEntry = [EventTarget, string, EventListener];

/**
 * Whether a keydown is Enter on its own: no modifier, and not confirming an IME composition
 * (that Enter belongs to the input method).
 */
export function isPlainEnter(event: KeyboardEvent): boolean {
  const { key, ctrlKey, metaKey, shiftKey, altKey, isComposing } = event;
  return key === 'Enter' && !ctrlKey && !metaKey && !shiftKey && !altKey && !isComposing;
}

/**
 * The keys every editor and composer form shares, wherever the focus is in it (a field or a
 * button): Ctrl/Cmd+Enter submits it, Escape calls `onEscape` (if given) and goes no further,
 * so it doesn't also close an overlay. Keys a field already handled (prevented, or stopped
 * there) are left alone, so nothing runs twice. Returns the listeners, for the caller to remove
 * (push them onto `this.eventListeners`).
 */
export function formKeys(form: HTMLFormElement, { onEscape }: { onEscape?: () => void } = {}): ListenerEntry[] {
  const onKeydown = (event: Event) => {
    const { key, ctrlKey, metaKey, altKey, isComposing } = event as KeyboardEvent;
    if (event.defaultPrevented || isComposing) return;
    if (key === 'Enter' && (ctrlKey || metaKey) && !altKey) {
      event.preventDefault();
      form.requestSubmit();
    } else if (key === 'Escape' && onEscape) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    }
  };
  form.addEventListener('keydown', onKeydown);
  return [[form, 'keydown', onKeydown]];
}

/**
 * A `<textarea>` used as a one-line field that wraps: it grows with its text and takes no line
 * breaks (Enter never adds one, pasted ones become spaces). Enter submits its form, as in an
 * `<input>`; with `submitOn: 'ctrl-enter'`, only Ctrl/Cmd+Enter does (the field handles Enter
 * itself). No length limit: it grows instead. Returns the listeners, for the caller to remove (push them onto `this.eventListeners`).
 * Sized at once.
 */
export function lineField(textarea: HTMLTextAreaElement, { submitOn = 'enter' }: { submitOn?: 'enter' | 'ctrl-enter' } = {}): ListenerEntry[] {
  const onBeforeInput = (event: Event) => {
    const { inputType } = event as InputEvent;
    if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') event.preventDefault();
  };
  const onInput = () => {
    if (/[\r\n\t]/.test(textarea.value)) {
      const caret = textarea.selectionStart;
      const before = textarea.value.slice(0, caret).replace(/[\r\n\t]+/g, ' ');
      textarea.value = textarea.value.replace(/[\r\n\t]+/g, ' ');
      textarea.setSelectionRange(before.length, before.length);
    }
    fitHeight(textarea);
  };
  const onResize = () => fitHeight(textarea);
  // Prevented: a form-level Ctrl/Cmd+Enter (the quick add's) doesn't submit it again.
  const onKeydown = (event: Event) => {
    const { key, ctrlKey, metaKey, shiftKey, altKey, isComposing } = event as KeyboardEvent;
    if (key !== 'Enter' || shiftKey || altKey || isComposing || event.defaultPrevented) return;
    if (submitOn === 'ctrl-enter' && !ctrlKey && !metaKey) return;
    event.preventDefault();
    textarea.form?.requestSubmit();
  };
  const listeners: ListenerEntry[] = [
    [textarea, 'beforeinput', onBeforeInput],
    [textarea, 'input', onInput],
    [textarea, 'keydown', onKeydown],
    [window, 'resize', onResize],
  ];
  for (const [target, type, listener] of listeners) target.addEventListener(type, listener);
  fitHeight(textarea);
  return listeners;
}

/** Grows (or shrinks) a `lineField` to its text: to call after setting its value. */
export function fitHeight(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  // Its borders aren't in scrollHeight; jsdom lays nothing out (0): left to its rows.
  if (textarea.scrollHeight === 0) {
    textarea.style.height = '';
    return;
  }
  textarea.style.height = `${textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight}px`;
}
