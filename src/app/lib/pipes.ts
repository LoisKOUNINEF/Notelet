import { AppPipeRegistry } from '../../core/index.js';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

// One formatter per locale, for every time shown and each minute's refresh.
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

// The panel's language (index.html's lang): its times read in the same language as its text,
// whatever the browser's.
export function uiLocale(): string {
  return document.documentElement.lang || 'en';
}

/**
 * "just now", "5 minutes ago", "yesterday"... for a timestamp (epoch ms, as a number or the
 * string a template gives) or a date string.
 */
export function formatTimeAgo(value: string | number, now: number = Date.now(), locale: string = uiLocale()): string {
  const time = typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (Number.isNaN(time)) return String(value);

  const seconds = Math.round((time - now) / 1000);
  let format = relativeFormats.get(locale);
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relativeFormats.set(locale, format);
  }

  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'second');
}

// A timestamp's date and time in full (a tooltip), in the panel's language.
export function formatDateTime(time: Timestamp): string {
  return new Date(time).toLocaleString(uiLocale());
}

// App pipes, next to Nutin's built-in ones (registerPipes()).
export function registerAppPipes(): void {
  AppPipeRegistry.register('timeAgo', (value: string) => formatTimeAgo(value));
}
