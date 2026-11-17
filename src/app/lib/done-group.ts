import { settingsService } from '../services/settings/settings.service.js';

// Unfolds "Done" before a to-do moves into it, so it stays in view (and keeps the focus). Saved like
// the group's own toggle. A failed save leaves it folded: the caller then acts as if it always was.
export async function revealDoneGroup(): Promise<void> {
  if (!settingsService.doneExpanded) await settingsService.setDoneExpanded(true).catch(() => undefined);
}
