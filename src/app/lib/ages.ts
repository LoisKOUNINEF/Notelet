// The ages offered by "Delete all older than" (Settings): weeks, then calendar months.
export type Age = '1w' | '2w' | '3w' | '1m' | '2m' | '3m' | '6m' | '12m';

export interface IAgeOption {
  value: Age;
  // As shown in the dropdown, e.g. "2 weeks".
  label: string;
  // As read in a sentence: "not edited in the last <since>", e.g. "2 weeks", "month".
  since: string;
}

export const AGES: IAgeOption[] = [
  { value: '1w', label: '1 week', since: 'week' },
  { value: '2w', label: '2 weeks', since: '2 weeks' },
  { value: '3w', label: '3 weeks', since: '3 weeks' },
  { value: '1m', label: '1 month', since: 'month' },
  { value: '2m', label: '2 months', since: '2 months' },
  { value: '3m', label: '3 months', since: '3 months' },
  { value: '6m', label: '6 months', since: '6 months' },
  { value: '12m', label: '12 months', since: '12 months' },
];

export const DEFAULT_AGE: Age = '1m';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function isAge(value: string): value is Age {
  return AGES.some((age) => age.value === value);
}

export function ageOption(age: Age): IAgeOption {
  return AGES.find((option) => option.value === age)!;
}

/**
 * The moment `age` before `now`: items last edited before it are older. Months are calendar
 * months, at the same time of day (a month before March 31 is the last day of February).
 */
export function cutoff(age: Age, now: Timestamp): Timestamp {
  const count = Number(age.slice(0, -1));
  if (age.endsWith('w')) return now - count * WEEK;

  const date = new Date(now);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - count);
  // The same day of the month, or that month's last day when it's shorter.
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.getTime();
}
