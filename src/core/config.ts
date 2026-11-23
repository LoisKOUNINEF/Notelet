export const CONFIG = {
  // An extension has no i18n (the build refuses it), no SEO and no config/seo.json.
  langs: { languages: ['en'] as string[], defaultLanguage: 'en' as string },
  seo: { routes: [] as { path: string; title: string | Record<string, string> }[] },
  generateSEOFiles: false,
  i18n: false,
} as const;
