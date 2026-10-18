// Nutin re-renders replace the focused element, so whoever triggers a render (a save, a delete,
// a tab switch) says where focus should land, and the component that renders it applies it.
let requested: string[] = [];

// Selectors in order of preference: the first one found when the focus is applied wins.
export function requestFocus(...selectors: string[]): void {
  requested = selectors;
}

export function applyRequestedFocus(root: ParentNode = document): boolean {
  for (const selector of requested) {
    const target = root.querySelector<HTMLElement>(selector);
    if (target) {
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
