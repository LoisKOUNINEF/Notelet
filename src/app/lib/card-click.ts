// What a click on a card leaves alone: its own controls (the checkboxes' labels included).
const CONTROLS = 'button, a, input, textarea, select, label, form, [role="menuitem"]';

/**
 * A click on a card (a note, a to-do) anywhere but its controls opens it for editing
 * like itsEdit button, which stays for the keyboard.
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
