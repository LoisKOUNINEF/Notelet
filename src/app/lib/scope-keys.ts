// Query parameters that only track where a visit came from: two links to the same page
// that differ by these alone should share their notes.
const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_eid|igshid)$/i;

// ISO 639-1: a site's home page in one of its languages (`/en`, `/fr-CA`) is its home page.
const LANGUAGE_CODES = new Set((
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy ' +
  'da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu ' +
  'hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb ' +
  'lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om ' +
  'or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ' +
  'ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'
).split(' '));
const LOCALE_SEGMENT = /^\/([a-z]{2})(?:[-_][a-z0-9]{2,4})?$/i;

/**
 * Notes keys for a URL: the page key is the URL without its hash and tracking parameters,
 * the site key its host without `www.`. Only http(s) pages can have notes:
 * returns null for chrome://, file://, about:blank, etc.
 */
export function getScopeKeys(url: string | null | undefined): IScopeKeys | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const site = parsed.hostname.replace(/^www\./i, '').toLowerCase();

  [...parsed.searchParams.keys()]
    .filter((param) => TRACKING_PARAMS.test(param))
    .forEach((param) => parsed.searchParams.delete(param));
  parsed.searchParams.sort();

  // `/docs/` and `/docs` are the same page for nearly every site.
  let pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : '';
  if (isLocaleRoot(pathname)) pathname = '';
  const search = parsed.searchParams.toString();
  const query = search ? `?${search}` : '';
  const host = `${site}${parsed.port ? `:${parsed.port}` : ''}`;

  return {
    page: `${parsed.protocol}//${host}${pathname}${query}`,
    site,
    // The page key without its protocol, the home page's `/` shown.
    pageLabel: readable(`${host}${pathname || '/'}${query}`),
    siteLabel: site,
  };
}

// `/en`, `/pt-BR`, `/zh_Hans`... but not deeper paths: `/en/docs` stays its own page.
function isLocaleRoot(pathname: string): boolean {
  const code = LOCALE_SEGMENT.exec(pathname)?.[1];
  return !!code && LANGUAGE_CODES.has(code.toLowerCase());
}

// How a stored page key is shown: its path and query (`/` for the home page).
export function pageLabelOf(pageKey: string): string {
  try {
    const { pathname, search } = new URL(pageKey);
    const label = `${pathname === '/' ? '' : pathname}${search}`;
    return readable(label) || '/';
  } catch {
    return pageKey;
  }
}

// Invisible and direction-changing characters: decoded, they could make a label look like another.
const HIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;

// A label as people read it, `/café` rather than `/caf%C3%A9` (labels only: keys stay encoded).
// Characters with a meaning in URLs (`%2F`, `%3F`...) stay encoded, like in the address bar, and
// so does a label that can't be decoded or would decode to hidden characters.
function readable(label: string): string {
  try {
    const decoded = decodeURI(label);
    return HIDDEN_CHARACTERS.test(decoded) ? label : decoded;
  } catch {
    return label;
  }
}

// chrome.storage item that holds one scope's notes, or its to-dos.
export function storageKey(kind: ScopeContentKind, scope: NoteScope, key: string): string {
  return `${kind}:${scope}:${key}`;
}

// Every item holding notes or to-dos (unlike the settings).
export function isScopeContentKey(key: string): boolean {
  return kindOf(key) !== null;
}

// A page key's host (already without `www.`), or null for a malformed key.
export function hostOf(pageKey: string): string | null {
  try {
    return new URL(pageKey).hostname;
  } catch {
    return null;
  }
}

// The site a storage item belongs to: its key for a site's list, its page's host for a page's.
export function siteOf(storageItem: string): string | null {
  const [, scope, ...rest] = storageItem.split(':');
  const key = rest.join(':');
  return scope === 'site' ? key : scope === 'page' ? hostOf(key) : null;
}

// Whether a storage item is one of `site`'s pages' lists (what its "This site" tab lists).
export function isSitePageKey(storageItem: string, site: string): boolean {
  return isScopeContentKey(storageItem) && storageItem.split(':')[1] === 'page' && siteOf(storageItem) === site;
}

// Which kind a storage item holds (`notes:…` or `todos:…`), or null for any other item.
export function kindOf(key: string): ScopeContentKind | null {
  if (key.startsWith('notes:')) return 'notes';
  return key.startsWith('todos:') ? 'todos' : null;
}
