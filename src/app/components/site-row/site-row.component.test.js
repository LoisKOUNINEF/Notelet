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
  });

  it('marks the active tab\'s site', () => {
    mount('example.com');
    expect($('.site-row__name').textContent).toBe('example.com (current)');
  });
});
