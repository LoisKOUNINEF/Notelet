// Nutin re-renders replace the focused element, so whoever triggers a render (a save, a delete,
// a tab switch) says where focus should land, and the component that renders it applies it.
let requested: string[] = [];

// Selectors in order of preference: the first one found when the focus is applied wins.
export function requestFocus(...selectors: string[]): void {
  requested = selectors;
}

// A target inside a hidden element (e.g. a collapsed "Done" group) can't take the focus: the
// next selector is tried instead.
export function applyRequestedFocus(root: ParentNode = document): boolean {
  for (const selector of requested) {
    const target = root.querySelector<HTMLElement>(selector);
    if (target && !target.closest('[hidden]')) {
      requested = [];
      target.focus();
      return true;
    }
  }
  return false;
}

export function clearRequestedFocus(): void {
  requested = [];
}

export function hasRequestedFocus(): boolean {
  return requested.length > 0;
}

// `[data-<name>="<value>"]` for a value from storage (an id): quotes and backslashes are escaped,
// so an unexpected id can't break the selector (querySelector would throw mid-render).
export function byData(name: string, value: string): string {
  return `[data-${name}="${value.replace(/["\\]/g, '\\$&')}"]`;
}

/**
 * Runs `render`, which rebuilds the controls `selectors` match, then gives the focus back to the
 * one that had it, or the next one still usable (a control just disabled can't keep it). Leaves it
 * alone when the action that caused the render asked for it elsewhere (requestFocus), or when it
 * survived the render.
 */
export function renderKeepingFocus(root: HTMLElement, selectors: string[], render: () => void): void {
  const active = document.activeElement;
  const index = active instanceof HTMLElement && root.contains(active) ? selectors.findIndex((selector) => active.matches(selector)) : -1;
  const requested = hasRequestedFocus();
  render();
  if (index === -1 || requested || root.contains(document.activeElement)) return;
  [...selectors.slice(index), ...selectors.slice(0, index)]
    .map((selector) => root.querySelector<HTMLElement>(selector))
    .find((el) => el !== null && !(el as HTMLButtonElement).disabled)
    ?.focus();
}
