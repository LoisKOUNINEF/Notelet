import { notifierService } from '../services/notifier/notifier.service.js';
import { errorMessage } from './errors.js';
import { clearRequestedFocus, requestFocus } from './focus.js';

export interface IActionOptions {
  // Where the focus goes once the save re-renders the list (see requestFocus), in order of preference.
  focus?: string[];
  // Puts back what the action showed ahead of the save (a rollback, a re-render, typed text).
  onError?: () => void;
}

/**
 * Runs what a user action saves. If it fails, `onError` puts things back, the focus request is
 * dropped (nothing re-renders to apply it) and a toast says `failure` ("Couldn't delete the note.")
 * and why. Resolves to the task's result, or undefined when it failed.
 */
export async function runAction<T>(failure: string, task: () => Promise<T>, { focus, onError }: IActionOptions = {}): Promise<T | undefined> {
  if (focus) requestFocus(...focus);
  try {
    return await task();
  } catch (error) {
    // Before the request is dropped: a rollback's re-render can still apply it.
    onError?.();
    clearRequestedFocus();
    notifierService.error(`${failure} ${errorMessage(error)}`);
    return undefined;
  }
}
