import { getScopeKeys, pageLabelOf, storageKey, isScopeContentKey, isSitePageKey, kindOf } from '#root/dist/src/app/lib/scope-keys.js';

describe('getScopeKeys', () => {
  it('keys a page by its URL and a site by its host', () => {
    expect(getScopeKeys('https://example.com/docs/intro')).toEqual({
      page: 'https://example.com/docs/intro',
      site: 'example.com',
      pageLabel: 'example.com/docs/intro',
      siteLabel: 'example.com',
    });
  });

  it('works for http pages and keeps a non-default port in the page key', () => {
    const keys = getScopeKeys('http://localhost:9090/app');
    expect(keys.page).toBe('http://localhost:9090/app');
    expect(keys.site).toBe('localhost');
    expect(keys.pageLabel).toBe('localhost:9090/app');
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
    expect(keys.pageLabel).toBe('example.com/a?a=1&b=2');
  });

  it('treats www and a trailing slash as the same page and site', () => {
    const a = getScopeKeys('https://www.Example.com/docs/');
    const b = getScopeKeys('https://example.com/docs');
    expect(a.page).toBe(b.page);
    expect(a.site).toBe('example.com');
  });

  it('labels the home page with its site and "/"', () => {
    const keys = getScopeKeys('https://example.com/');
    expect(keys.page).toBe('https://example.com');
    expect(keys.pageLabel).toBe('example.com/');
  });

  it('treats a home page in one of the site\'s languages as the home page', () => {
    const home = getScopeKeys('https://example.com/').page;
    for (const url of ['https://example.com/en', 'https://example.com/en/', 'https://example.com/fr-CA', 'https://www.example.com/pt_br', 'https://example.com/zh-Hans']) {
      expect(getScopeKeys(url).page).toBe(home);
      expect(getScopeKeys(url).pageLabel).toBe('example.com/');
    }
  });

  it('shows encoded characters as they read, in labels only', () => {
    const keys = getScopeKeys('https://example.com/caf%C3%A9/men%C3%BC?q=cr%C3%A8me');
    expect(keys.page).toBe('https://example.com/caf%C3%A9/men%C3%BC?q=cr%C3%A8me');
    expect(keys.pageLabel).toBe('example.com/café/menü?q=crème');
    expect(pageLabelOf(keys.page)).toBe('/café/menü?q=crème');
  });

  it('leaves encoded what has a meaning in URLs, can\'t be decoded or would hide characters', () => {
    expect(pageLabelOf('https://example.com/a%2Fb%3Fc')).toBe('/a%2Fb%3Fc');
    expect(pageLabelOf('https://example.com/%E0%A4%A')).toBe('/%E0%A4%A');
    expect(pageLabelOf('https://example.com/pay%E2%80%AEtxt.exe')).toBe('/pay%E2%80%AEtxt.exe');
    expect(pageLabelOf('https://example.com/a%0Ab')).toBe('/a%0Ab');
  });

  it('keeps the language of deeper pages, and query strings of a localized home page', () => {
    expect(getScopeKeys('https://example.com/en/docs').page).toBe('https://example.com/en/docs');
    const keys = getScopeKeys('https://example.com/en?tab=2');
    expect(keys.page).toBe('https://example.com?tab=2');
    expect(keys.pageLabel).toBe('example.com/?tab=2');
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
    expect(isScopeContentKey('settings:contentKind')).toBe(false);
  });
});

describe('isSitePageKey', () => {
  it('matches the lists of a site\'s pages only', () => {
    expect(isSitePageKey('notes:page:https://example.com/docs', 'example.com')).toBe(true);
    expect(isSitePageKey('todos:page:https://example.com', 'example.com')).toBe(true);
    expect(isSitePageKey('notes:site:example.com', 'example.com')).toBe(false);
    expect(isSitePageKey('notes:page:https://other.org/x', 'example.com')).toBe(false);
    expect(isSitePageKey('notes:page:not a url', 'example.com')).toBe(false);
    expect(isSitePageKey('settings', 'example.com')).toBe(false);
  });
});

describe('kindOf', () => {
  it('tells the kind of a notes or to-dos item, and null for anything else', () => {
    expect(kindOf('notes:page:https://example.com/a')).toBe('notes');
    expect(kindOf('todos:site:example.com')).toBe('todos');
    expect(kindOf('settings:storageArea')).toBe(null);
  });
});
