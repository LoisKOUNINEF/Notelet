// Query parameters that only track where a visit came from: two links to the same page
// that differ by these alone should share their notes.
const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_eid|igshid)$/i;

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
  const pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : '';
  const search = parsed.searchParams.toString();
  const pagePath = `${pathname}${search ? `?${search}` : ''}`;

  return {
    page: `${parsed.protocol}//${site}${parsed.port ? `:${parsed.port}` : ''}${pagePath}`,
    site,
    pageLabel: pagePath || '/',
    siteLabel: site,
  };
}

// chrome.storage item that holds one scope's notes, or its to-dos.
export function storageKey(kind: ScopeContentKind, scope: NoteScope, key: string): string {
  return `${kind}:${scope}:${key}`;
}

// Every item holding notes or to-dos (unlike `settings`).
export function isScopeContentKey(key: string): boolean {
  return key.startsWith('notes:') || key.startsWith('todos:');
}
