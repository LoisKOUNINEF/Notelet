import nutinConfig from '../../nutin.config.js';

const FALLBACK_LANGUAGES: string[] = ['en'];
const i18nOption = nutinConfig.i18n;
const languages = Array.isArray(i18nOption) && i18nOption.length > 0 ? i18nOption : FALLBACK_LANGUAGES;

export const CONFIG = {
  langs: { languages, defaultLanguage: languages[0] as string },
  seo: { routes: [] as { path: string; title: string | Record<string, string> }[] },
  i18n: Array.isArray(i18nOption) ? i18nOption.length > 0 : Boolean(i18nOption),
  generateSEOFiles: nutinConfig.generateSEOFiles,
} as const;
