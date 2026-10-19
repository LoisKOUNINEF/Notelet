import { getScopeKeys, pageLabelOf, storageKey, isScopeContentKey } from '#root/dist/src/app/lib/scope-keys.js';

describe('getScopeKeys', () => {
  it('keys a page by its URL and a site by its host', () => {
    expect(getScopeKeys('https://example.com/docs/intro')).toEqual({
      page: 'https://example.com/docs/intro',
      site: 'example.com',
      pageLabel: '/docs/intro',
      siteLabel: 'example.com',
    });
  });

  it('works for http pages and keeps a non-default port in the page key', () => {
    const keys = getScopeKeys('http://localhost:9090/app');
    expect(keys.page).toBe('http://localhost:9090/app');
    expect(keys.site).toBe('localhost');
  });

  it('ignores the hash: anchors of one page share its notes', () => {
    expect(getScopeKeys('https://example.com/a#section-2').page).toBe('https://example.com/a');
  });

  it('keeps the query string, which often identifies the page', () => {
    expect(getScopeKeys('https://www.youtube.com/watch?v=abc').page).toBe('https://youtube.com/watch?v=abc');
  });

  it('drops tracking parameters and sorts the others', () => {
    const keys = getScopeKeys('https://example.com/a?utm_source=x&b=2&fbclid=y&a=1&gclid=z');
    expect(keys.page).toBe('https://example.com/a?a=1&b=2');
    expect(keys.pageLabel).toBe('/a?a=1&b=2');
  });

  it('treats www and a trailing slash as the same page and site', () => {
    const a = getScopeKeys('https://www.Example.com/docs/');
    const b = getScopeKeys('https://example.com/docs');
    expect(a.page).toBe(b.page);
    expect(a.site).toBe('example.com');
  });

  it('labels the home page "/"', () => {
    const keys = getScopeKeys('https://example.com/');
    expect(keys.page).toBe('https://example.com');
    expect(keys.pageLabel).toBe('/');
  });

  it('treats a home page in one of the site\'s languages as the home page', () => {
    const home = getScopeKeys('https://example.com/').page;
    for (const url of ['https://example.com/en', 'https://example.com/en/', 'https://example.com/fr-CA', 'https://www.example.com/pt_br', 'https://example.com/zh-Hans']) {
      expect(getScopeKeys(url).page).toBe(home);
      expect(getScopeKeys(url).pageLabel).toBe('/');
    }
  });

  it('keeps the language of deeper pages, and query strings of a localized home page', () => {
    expect(getScopeKeys('https://example.com/en/docs').page).toBe('https://example.com/en/docs');
    const keys = getScopeKeys('https://example.com/en?tab=2');
    expect(keys.page).toBe('https://example.com?tab=2');
    expect(keys.pageLabel).toBe('?tab=2');
  });

  it('keeps two-letter home paths that aren\'t languages', () => {
    expect(getScopeKeys('https://example.com/go').page).toBe('https://example.com/go');
    expect(getScopeKeys('https://example.com/xx').page).toBe('https://example.com/xx');
    expect(getScopeKeys('https://example.com/en-toolong').page).toBe('https://example.com/en-toolong');
  });

  it('returns null for pages that can\'t have notes', () => {
    expect(getScopeKeys('chrome://extensions')).toBe(null);
    expect(getScopeKeys('file:///Users/me/a.html')).toBe(null);
    expect(getScopeKeys('about:blank')).toBe(null);
    expect(getScopeKeys('not a url')).toBe(null);
    expect(getScopeKeys('')).toBe(null);
    expect(getScopeKeys(null)).toBe(null);
    expect(getScopeKeys(undefined)).toBe(null);
  });
});

describe('pageLabelOf', () => {
  it('shows a stored page key as its path and query', () => {
    expect(pageLabelOf('https://example.com/docs/intro')).toBe('/docs/intro');
    expect(pageLabelOf('https://example.com/watch?v=abc')).toBe('/watch?v=abc');
    expect(pageLabelOf('https://example.com?tab=2')).toBe('?tab=2');
    expect(pageLabelOf('https://example.com')).toBe('/');
    // Saved before localized home pages were merged: shown as it was saved.
    expect(pageLabelOf('https://example.com/en')).toBe('/en');
  });
});

describe('storageKey', () => {
  it('prefixes the scope key with its kind and scope', () => {
    expect(storageKey('notes', 'page', 'https://example.com/a')).toBe('notes:page:https://example.com/a');
    expect(storageKey('todos', 'site', 'example.com')).toBe('todos:site:example.com');
  });

  it('is recognized as scope content, unlike settings', () => {
    expect(isScopeContentKey(storageKey('notes', 'site', 'example.com'))).toBe(true);
    expect(isScopeContentKey(storageKey('todos', 'page', 'https://example.com/a'))).toBe(true);
    expect(isScopeContentKey('settings')).toBe(false);
  });
});
