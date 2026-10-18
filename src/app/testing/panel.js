// Everything a component test needs from the panel's runtime: a fake `chrome`, the services
// started on it (as main.ts does), the pipes, and toasts captured instead of shown.
import { registerPipes } from '#root/dist/src/core/index.js';
import { registerAppPipes } from '#root/dist/src/app/lib/pipes.js';
import { clearRequestedFocus } from '#root/dist/src/app/lib/focus.js';
import { activeTabService } from '#root/dist/src/app/services/active-tab/active-tab.service.js';
import { notesStoreService } from '#root/dist/src/app/services/notes-store/notes-store.service.js';
import { notifierService } from '#root/dist/src/app/services/notifier/notifier.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { installFakeChrome, uninstallFakeChrome } from './fake-chrome.js';

export const KEYS = {
  page: 'https://example.com/docs',
  site: 'example.com',
  pageLabel: '/docs',
  siteLabel: 'example.com',
};

// The pipe registry is app-wide: pipes are registered once for the whole run.
let pipesRegistered = false;

export async function startPanel({ url = 'https://example.com/docs' } = {}) {
  const fake = installFakeChrome({ url });
  if (!pipesRegistered) {
    // Nutin's own tests may have registered the built-in pipes already.
    silenceConsole('warn', () => registerPipes());
    registerAppPipes();
    pipesRegistered = true;
  }
  await settingsService.init();
  notesStoreService.init();
  await activeTabService.init();

  const toasts = [];
  const notify = spyOn(notifierService, '_notify').andCallFake((message, options) => toasts.push({ message, ...options }));

  return {
    fake,
    toasts,
    async stop() {
      notify.restore();
      clearRequestedFocus();
      activeTabService.dispose();
      notesStoreService.dispose();
      settingsService.dispose();
      uninstallFakeChrome();
      document.getElementById('app').innerHTML = '';
    },
  };
}

// The storage, the store's `notes-changed` and the renders it triggers all resolve as promises.
export async function settle() {
  await flushPromises();
  await flushPromises();
}

export function keydown(target, key, options = {}) {
  target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));
}

export function typeInto(textarea, text) {
  textarea.value = text;
  textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
}
