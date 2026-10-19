// What a click on a card leaves alone: its own controls (the checkboxes' labels included).
const CONTROLS = 'button, a, input, textarea, select, label, form, [role="menuitem"]';

/**
 * A click on a card (a note, a to-do) anywhere but its controls opens it for editing, like its
 * Edit button, which stays for the keyboard. A click that ends a text selection within it (copying
 * a note's text) doesn't. `edit` gets what was clicked (e.g. which item of a list). Returns the
 * binding for the component's `eventListeners`.
 */
export function editOnClick(card: HTMLElement, edit: (target: Element) => void): [EventTarget, string, EventListener] {
  const onClick: EventListener = (event) => {
    const target = event.target as Element;
    if (target.closest(CONTROLS)) return;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed && card.contains(selection.anchorNode)) return;
    edit(target);
  };
  card.addEventListener('click', onClick);
  return [card, 'click', onClick];
}
