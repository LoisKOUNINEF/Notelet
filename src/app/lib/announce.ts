// One polite live region for the whole panel, outside every component: re-rendered regions
// aren't reliably read, this one is never replaced.
const REGION_ID = 'app-announcer';

export function announce(message: string): void {
  const region = document.getElementById(REGION_ID) ?? createRegion();
  // Cleared first, so the same message twice in a row is read twice.
  region.textContent = '';
  // A new task: screen readers notice the change from empty.
  setTimeout(() => { region.textContent = message; }, 50);
}

function createRegion(): HTMLElement {
  const region = document.createElement('div');
  region.id = REGION_ID;
  region.className = 'a11y-visually-hidden';
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  document.body.append(region);
  return region;
}
