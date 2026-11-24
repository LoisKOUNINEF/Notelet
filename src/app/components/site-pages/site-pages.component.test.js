import { SitePagesComponent } from '#root/dist/src/app/components/site-pages/site-pages.component.js';
import { KEYS, settle, startPanel } from '../../testing/panel.js';

// On its own; the rows' actions are tested in the panel (site-page-row).
describe('SitePagesComponent', () => {
  let panel;
  let list;

  const pages = [
    { key: 'https://example.com', label: '/', notes: 0, todos: 2, openTodos: 0 },
    { key: 'https://example.com/blog', label: '/blog', notes: 1, todos: 3, openTodos: 2 },
    { key: 'https://example.com/docs', label: '/docs', notes: 2, todos: 0, openTodos: 0 },
  ];
  const mount = (config) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    list = new SitePagesComponent(placeholder, { keys: KEYS, kind: 'notes', ...config });
    list.render();
  };
  const toggle = () => $('.site-pages__toggle');
  const labels = () => $$('.site-page-row__label').map((el) => el.textContent);
  const counts = () => $$('.site-page-row__counts').map((el) => el.textContent);

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    list?.destroy();
    list = null;
    await panel.stop();
  });

  it('shows nothing when the site has no pages with items of the kind shown', () => {
    mount({ pages: [] });
    expect($('.site-pages')).toBeFalsy();
    list.destroy();
    mount({ pages: [pages[0]], kind: 'notes' });
    expect($('.site-pages')).toBeFalsy();
  });

  it('starts collapsed, and expands and collapses with its toggle, keeping focus on it', () => {
    mount({ pages });
    expect(toggle().textContent.trim()).toBe('Pages on this site (2)');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect($('#site-pages-list').hidden).toBe(true);

    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect($('#site-pages-list').hidden).toBe(false);
    expect(document.activeElement).toBe(toggle());

    toggle().click();
    expect($('#site-pages-list').hidden).toBe(true);
  });

  it('lists the pages with notes on the Notes tab, with their notes', () => {
    mount({ pages, kind: 'notes' });
    expect($('#site-pages-list').getAttribute('aria-label')).toBe('Pages of this site with notes');
    expect(labels()).toEqual(['/blog', '/docs']);
    expect(counts()).toEqual(['1 note', '2 notes']);
  });

  it('lists the pages with to-dos on the To-dos tab, with their open ones, or their done ones', () => {
    mount({ pages, kind: 'todos' });
    expect(toggle().textContent.trim()).toBe('Pages on this site (2)');
    expect($('#site-pages-list').getAttribute('aria-label')).toBe('Pages of this site with to-dos');
    expect(labels()).toEqual(['/', '/blog']);
    expect(counts()).toEqual(['2 to-dos done', '2 to-dos']);
  });

  it('gives each page a "⋯" menu and a Delete, described by its path', () => {
    mount({ pages });
    const row = $$('.site-page-row')[0];
    expect(row.parentElement.tagName).toBe('LI');
    expect(row.querySelector('.item-menu__trigger').getAttribute('aria-label')).toBe('More actions for: /blog');
    expect(row.querySelector('.site-page-row__delete').getAttribute('aria-describedby')).toBe(row.querySelector('.site-page-row__label').id);
    const menu = document.getElementById('site-page-https://example.com/blog-menu');
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent)).toEqual(['Open in a new tab', 'Move all notes to this site']);
    // The current page is already open.
    const current = document.getElementById('site-page-https://example.com/docs-menu');
    expect([...current.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent)).toEqual(['Move all notes to this site']);
  });

  it('names the to-dos in the menu on the To-dos tab', () => {
    mount({ pages, kind: 'todos' });
    const menu = document.getElementById('site-page-https://example.com/blog-menu');
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent)).toEqual(['Open in a new tab', 'Move all to-dos to this site']);
  });

  it('marks the current page, without a button to open it', () => {
    mount({ pages });
    const current = $('.site-page-row__page--current');
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');
    // Shown as "Manage by site" shows its site: after its path, not part of it.
    expect($$('.site-page-row__current').map((el) => el.textContent)).toEqual(['(current)']);
    expect(current.querySelector('.site-page-row__current')).toBeTruthy();
    expect(current.querySelector('.site-page-row__label').textContent).toBe('/docs');
    expect($$('button.site-page-row__page').map((el) => el.dataset.url)).toEqual(['https://example.com/blog']);
  });

  it('cuts paths to one line, with an arrow only for those too long for it', () => {
    mount({ pages });
    expect($$('.site-page-row__label').every((el) => el.classList.contains('site-page-row__label--folded'))).toBe(true);
    // jsdom lays nothing out: every path fits.
    expect($$('.site-page-row__toggle').every((el) => el.hidden)).toBe(true);
  });

  it('unfolds a long path with its arrow and folds it back, the focus staying on it', () => {
    // jsdom lays nothing out: every span overflows its width here.
    Object.defineProperty(HTMLSpanElement.prototype, 'scrollWidth', { configurable: true, get: () => 500 });
    Object.defineProperty(HTMLSpanElement.prototype, 'clientWidth', { configurable: true, get: () => 100 });
    try {
      mount({ pages });
      $('.site-pages__toggle').click();
      const blog = () => $$('.site-page-row')[0];
      const toggle = () => blog().querySelector('.site-page-row__toggle');
      const label = () => blog().querySelector('.site-page-row__label');
      expect(toggle().hidden).toBe(false);
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(toggle().getAttribute('aria-controls')).toBe(label().id);
      expect(toggle().getAttribute('aria-label')).toBe('Full path: /blog');

      toggle().click();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(label().classList.contains('site-page-row__label--folded')).toBe(false);
      expect(document.activeElement).toBe(toggle());

      // Recreated with new counts: still unfolded, and still focused.
      list.update(pages.map((page) => (page.label === '/blog' ? { ...page, notes: 4 } : page)), KEYS, 'notes');
      expect(counts()[0]).toBe('4 notes');
      expect(label().classList.contains('site-page-row__label--folded')).toBe(false);
      expect(document.activeElement).toBe(toggle());

      toggle().click();
      expect(label().classList.contains('site-page-row__label--folded')).toBe(true);
      expect(document.activeElement).toBe(toggle());
    } finally {
      delete HTMLSpanElement.prototype.scrollWidth;
      delete HTMLSpanElement.prototype.clientWidth;
    }
  });

  it('opens a page in the active tab', async () => {
    mount({ pages });
    $('[data-url="https://example.com/blog"]').click();
    await settle();
    expect(panel.fake.tabs.updated).toEqual([{ tabId: 1, url: 'https://example.com/blog' }]);
  });

  it('reports a page that couldn\'t be opened', async () => {
    mount({ pages });
    const update = spyOn(panel.fake.tabs, 'update').andCallFake(async () => { throw new Error('Tab closed.'); });
    $('[data-url="https://example.com/blog"]').click();
    await settle();
    update.restore();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t open the page. Tab closed.');
  });

  it('takes new pages and another kind through update(), staying open and keeping focus', () => {
    mount({ pages, kind: 'todos' });
    toggle().click();
    $('[data-url="https://example.com/blog"]').focus();

    list.update(pages.slice(1), KEYS, 'todos');
    expect(toggle().textContent.trim()).toBe('Pages on this site (1)');
    expect($('#site-pages-list').hidden).toBe(false);
    expect(document.activeElement).toBe($('[data-url="https://example.com/blog"]'));

    list.update(pages, KEYS, 'notes');
    expect(labels()).toEqual(['/blog', '/docs']);
    expect(document.activeElement).toBe($('[data-url="https://example.com/blog"]'));

    // The focused page gone: the toggle.
    list.update(pages.slice(2), KEYS, 'notes');
    expect(document.activeElement).toBe(toggle());
  });

  it('shows a spinner while the pages are being listed, then the list', () => {
    mount({ pages: null });
    expect($('.site-pages__loading a11y-spinner').classList.contains('a11y-spinner--sm')).toBe(true);
    expect(toggle()).toBeFalsy();

    list.update(pages, KEYS, 'notes');
    expect($('.site-pages__loading')).toBeFalsy();
    expect(toggle().textContent.trim()).toBe('Pages on this site (2)');
  });
});
