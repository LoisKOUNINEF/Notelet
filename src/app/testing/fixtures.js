// Plain data for tests: the active tab's keys and stored notes and to-dos, with the defaults most
// tests want. Tweak a field by spreading: `{ ...todo('a', 'Open'), position: 2 }`.

export const KEYS = {
  page: 'https://example.com/docs',
  site: 'example.com',
  pageLabel: 'example.com/docs',
  siteLabel: 'example.com',
};

// A page to-do, open or done (checked when it was created).
export function todo(id, text = id, done = false, createdAt = 1) {
  return { id, scope: 'page', key: KEYS.page, text, done, doneAt: done ? createdAt : null, createdAt, updatedAt: createdAt };
}

// A page note.
export function note(id, text = id, createdAt = 1) {
  return { id, scope: 'page', key: KEYS.page, text, createdAt, updatedAt: createdAt };
}
