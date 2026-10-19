import { removeOverlaysWithin } from 'a11y-elements/core';

/**
 * a11y-elements' overlays (the "⋯" menus, the confirmation popup) move themselves to <body> once
 * connected (see its guide, "Overlays in a framework"). So a component's re-render or destroy
 * doesn't remove them, and its `data-event` bindings never reach them. A component therefore:
 * - keeps its overlays in one wrapper element, and removes them through it before each render
 *   and on destroy (removeOverlays);
 * - finds each one again by id after rendering, and delegates its clicks (delegateActions).
 */
export function removeOverlays(root: ParentNode, selector: string): void {
  const own = root.querySelector(selector);
  if (own) removeOverlaysWithin(own);
}

/**
 * Clicks inside the overlay `id` on an element with `data-action`, handed over as that action's
 * name. Returns the binding for the component's `eventListeners` (unbound with its own on
 * re-render and destroy), or null when that overlay isn't rendered.
 */
export function delegateActions(id: string, onAction: (action: string) => void): [EventTarget, string, EventListener] | null {
  const overlay = document.getElementById(id);
  if (!overlay) return null;
  const onClick: EventListener = (event) => {
    const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action) onAction(action);
  };
  overlay.addEventListener('click', onClick);
  return [overlay, 'click', onClick];
}
