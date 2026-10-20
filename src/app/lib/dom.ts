/**
 * The element `selector` matches in `root`, for one its template always renders. Throws, naming
 * the selector, rather than failing later on a null.
 */
export function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}
