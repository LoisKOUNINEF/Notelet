// Query parameters that only track where a visit came from.
// Two links to the same page that differ by these alone should share their notes.
const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_eid|igshid)$/i;

// A site's home page in one of its languages (`/en`, `/fr-CA`) is its home page. Only languages
// Codes that are also everyday paths (`/my`, `/hr`, `/id`, `/it`...) only count with a region (`/it-IT`)
const LANGUAGE_CODES = new Set((
  'ar bg bn cs da de el en es et fa fi fr he hi hu ja ka kk ko lt lv nb nl pl pt ro ru sk sl sr ' +
  'sv th tr uk ur uz vi zh'
).split(' '));
const REGION_ONLY_CODES = new Set('am an as ca co ga gl hr id ie is it la ml ms my no or pa sa so sq to'.split(' '));
const LOCALE_SEGMENT = /^\/([a-z]{2})([-_][a-z0-9]{2,4})?$/i;

/**
 * Notes keys for a URL: the page key is the URL without its hash and tracking parameters
 * The site key is its host without `www.`. Only http(s) pages can have notes
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

  // `/docs/` and `/docs` are the same page.
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

// `/en`, `/pt-BR`, `/zh_Hans`, `/it-IT`... but not deeper paths: `/en/docs` stays its own page.
function isLocaleRoot(pathname: string): boolean {
  const [, code, region] = LOCALE_SEGMENT.exec(pathname) ?? [];
  if (!code) return false;
  const language = code.toLowerCase();
  return LANGUAGE_CODES.has(language) || (!!region && REGION_ONLY_CODES.has(language));
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
// Characters with a meaning in URLs (`%2F`, `%3F`...) stay encoded.
function readable(label: string): string {
  try {
    const decoded = decodeURI(label);
    return HIDDEN_CHARACTERS.test(decoded) ? label : decoded;
  } catch {
    return label;
  }
}

export function storageKey(kind: ScopeContentKind, scope: NoteScope, key: string): string {
  return `${kind}:${scope}:${key}`;
}

// Every item holding notes or to-dos (unlike settings).
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

// The site a storage item belongs to.
export function siteOf(storageItem: string): string | null {
  const [, scope, ...rest] = storageItem.split(':');
  const key = rest.join(':');
  return scope === 'site' ? key : scope === 'page' ? hostOf(key) : null;
}

export function isSitePageKey(storageItem: string, site: string): boolean {
  return isScopeContentKey(storageItem) && storageItem.split(':')[1] === 'page' && siteOf(storageItem) === site;
}

// Which kind a storage item holds (`notes:…` or `todos:…`).
export function kindOf(key: string): ScopeContentKind | null {
  if (key.startsWith('notes:')) return 'notes';
  return key.startsWith('todos:') ? 'todos' : null;
}
