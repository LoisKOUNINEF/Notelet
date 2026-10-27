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
