import { SiteRowComponent } from '#root/dist/src/app/components/site-row/site-row.component.js';
import { startPanel } from '../../testing/panel.js';

// Deleting is tested from the site manager, where the rows live.
describe('SiteRowComponent', () => {
  let panel;
  let row;

  const site = { site: 'example.com', notes: 2, todos: 1, lastEdited: Date.now() - 2 * 24 * 3600 * 1000 };
  const mount = (currentSite = null) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    row = new SiteRowComponent(placeholder, { ...site, index: 0 }, { currentSite, lastFocus: '.site-manager__select' });
    row.render();
  };

  const items = () => [...document.getElementById('site-row-example.com-menu').querySelectorAll('[role="menuitem"]')];

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    row.destroy();
    await panel.stop();
  });

  it('shows the site, what it holds and when it was last edited', () => {
    mount();
    expect($('.site-row__name').textContent).toBe('example.com');
    expect($('.site-row__meta').textContent).toBe('2 notes and 1 to-do · Edited 2 days ago');
    expect($('.site-row__meta time').getAttribute('datetime')).toBe(new Date(site.lastEdited).toISOString());
    expect($('.site-row__delete').getAttribute('aria-describedby')).toBe($('.site-row__name').id);
    expect($('.site-row__delete').textContent).toBe('Delete all');
  });

  it('opens another site\'s home page from its card, and offers its actions in a "⋯" menu', () => {
    mount();
    expect($('.site-row__open').tagName).toBe('BUTTON');
    expect($('.site-row__open').title).toBe('https://example.com/');
    expect($('.item-menu__trigger').getAttribute('aria-label')).toBe('More actions for: example.com');
    expect(items().map((el) => [el.textContent, el.getAttribute('aria-disabled')])).toEqual([
      ['Open in a new tab', null],
      ['Move all to this site', 'true'],
      ['Move all to this page', 'true'],
      ['Delete all notes (2)', null],
      ['Delete all to-dos (1)', null],
    ]);
  });

  it('disables what there\'s nothing to do for: opening the current site, deleting a kind it has none of', () => {
    site.todos = 0;
    try {
      mount('example.com');
    } finally {
      site.todos = 1;
    }
    expect($('.site-row__open')).toBeFalsy();
    expect(items().map((el) => [el.textContent, el.getAttribute('aria-disabled')])).toEqual([
      ['Open in a new tab', 'true'],
      ['Move all to this site', 'true'],
      ['Move all to this page', 'true'],
      ['Delete all notes (2)', null],
      ['Delete all to-dos (0)', 'true'],
    ]);
  });

  it('offers to move it all to the active tab\'s site or page, when that\'s another site', () => {
    mount('other.org');
    expect(items().slice(1, 3).map((el) => [el.textContent, el.getAttribute('aria-disabled')])).toEqual([
      ['Move all to this site', null],
      ['Move all to this page', null],
    ]);
  });

  it('marks the active tab\'s site', () => {
    mount('example.com');
    expect($('.site-row__name').textContent).toBe('example.com (current)');
  });
});
