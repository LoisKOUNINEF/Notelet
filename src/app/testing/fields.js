// Whether `textarea` refuses blank text, spaces only included: `required`, plus the validator
// `requireText` sets on its <a11y-textarea> (not defined in these tests: its own are in
// src/app/lib/require-text.test.js).
export function refusesBlank(textarea) {
  const validators = textarea.closest('a11y-textarea')?.validators ?? [];
  const refuses = (value) => validators.some((validate) => Boolean(validate(value, textarea)));
  return textarea.required && refuses('') && refuses('  \t ') && !refuses(' a ');
}
