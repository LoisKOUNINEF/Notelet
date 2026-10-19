import { SitePagesComponent } from '#root/dist/src/app/components/site-pages/site-pages.component.js';
import { settle, startPanel } from '../../testing/panel.js';

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
    list = new SitePagesComponent(placeholder, config);
    list.render();
  };
  const toggle = () => $('.site-pages__toggle');

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    list?.destroy();
    list = null;
    await panel.stop();
  });

  it('shows nothing when the site has no pages with notes', () => {
    mount({ pages: [], currentPage: 'https://example.com/docs' });
    expect($('.site-pages')).toBeFalsy();
  });

  it('starts collapsed, and expands and collapses with its toggle, keeping focus on it', () => {
    mount({ pages, currentPage: 'https://example.com/docs' });
    expect(toggle().textContent.trim()).toBe('Pages on this site (3)');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect($('#site-pages-list').hidden).toBe(true);

    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect($('#site-pages-list').hidden).toBe(false);
    expect(document.activeElement).toBe(toggle());

    toggle().click();
    expect($('#site-pages-list').hidden).toBe(true);
  });

  it('shows each page\'s notes and open to-dos, or its done ones', () => {
    mount({ pages, currentPage: 'https://example.com/docs' });
    expect($$('.site-pages__counts').map((el) => el.textContent)).toEqual([
      '2 to-dos done',
      '1 note, 2 to-dos',
      '2 notes, current page',
    ]);
  });

  it('marks the current page, without a button to open it', () => {
    mount({ pages, currentPage: 'https://example.com/docs' });
    const current = $('.site-pages__page--current');
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect($$('button.site-pages__page').map((el) => el.dataset.url)).toEqual(['https://example.com', 'https://example.com/blog']);
  });

  it('opens a page in the active tab', async () => {
    mount({ pages, currentPage: 'https://example.com/docs' });
    $('[data-url="https://example.com/blog"]').click();
    await settle();
    expect(panel.fake.tabs.updated).toEqual([{ tabId: 1, url: 'https://example.com/blog' }]);
  });

  it('reports a page that couldn\'t be opened', async () => {
    mount({ pages, currentPage: 'https://example.com/docs' });
    const update = spyOn(panel.fake.tabs, 'update').andCallFake(async () => { throw new Error('Tab closed.'); });
    $('[data-url="https://example.com/blog"]').click();
    await settle();
    update.restore();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t open the page. Tab closed.');
  });

  it('takes new pages through update(), staying open and keeping focus', () => {
    mount({ pages, currentPage: 'https://example.com/docs' });
    toggle().click();
    $('[data-url="https://example.com/blog"]').focus();

    list.update(pages.slice(1), 'https://example.com/docs');
    expect(toggle().textContent.trim()).toBe('Pages on this site (2)');
    expect($('#site-pages-list').hidden).toBe(false);
    expect(document.activeElement).toBe($('[data-url="https://example.com/blog"]'));

    // The focused page gone: the toggle.
    list.update(pages.slice(2), 'https://example.com/docs');
    expect(document.activeElement).toBe(toggle());
  });
});
