// Everything a component test needs from the panel's runtime: a fake `chrome`, the services
// started on it (as main.ts does), the pipes, and toasts captured instead of shown.
import { registerPipes, useEventBus } from '#root/dist/src/core/index.js';
import { MockEventBus } from '#root/tools/testin-nutin/mocks/mock-event-bus.js';
import { registerAppPipes } from '#root/dist/src/app/lib/pipes.js';
import { clearRequestedFocus } from '#root/dist/src/app/lib/focus.js';
import { clearDrafts } from '#root/dist/src/app/lib/drafts.js';
import { activeTabService } from '#root/dist/src/app/services/active-tab/active-tab.service.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { notifierService } from '#root/dist/src/app/services/notifier/notifier.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { installFakeChrome, uninstallFakeChrome } from './fake-chrome.js';

export const KEYS = {
  page: 'https://example.com/docs',
  site: 'example.com',
  pageLabel: 'example.com/docs',
  siteLabel: 'example.com',
};

// The pipe registry is app-wide: pipes are registered once for the whole run.
let pipesRegistered = false;
// The panel's event bus while one runs (see startPanel).
let currentBus = null;

// `settings`: saved settings to start from, e.g. `{ contentKind: 'todos' }` to show the to-dos.
// The app's events go through a MockEventBus (`bus`), installed first so every subscription
// lands there: emit on it to simulate an event, read its calls to check what was emitted.
export async function startPanel({ url = 'https://example.com/docs', settings } = {}) {
  const bus = new MockEventBus();
  useEventBus(bus);
  currentBus = bus;
  const fake = installFakeChrome({ url });
  if (settings) fake.storage.local.data.set('settings', settings);
  if (!pipesRegistered) {
    // Nutin's own tests may have registered the built-in pipes already.
    silenceConsole('warn', () => registerPipes());
    registerAppPipes();
    pipesRegistered = true;
  }
  await settingsService.init();
  scopeStoreService.init();
  await activeTabService.init();

  const toasts = [];
  const notify = spyOn(notifierService, '_notify').andCallFake((message, options) => toasts.push({ message, ...options }));

  return {
    bus,
    fake,
    toasts,
    async stop() {
      notify.restore();
      clearRequestedFocus();
      clearDrafts();
      activeTabService.dispose();
      scopeStoreService.dispose();
      settingsService.dispose();
      uninstallFakeChrome();
      document.getElementById('app').innerHTML = '';
      useEventBus(null);
      currentBus = null;
    },
  };
}

// The storage, the store's `scope-content-changed` and the renders it triggers all resolve as promises.
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

// A pointer event as the reorder gestures expect it (jsdom may lack PointerEvent and its fields).
export function pointer(type, target, clientY, extra = {}) {
  const Ctor = window.PointerEvent ?? window.MouseEvent;
  const event = new Ctor(type, { bubbles: true, cancelable: true, clientY, button: 0, pointerId: 1, isPrimary: true, ...extra });
  if (!('pointerId' in event) || event.pointerId === undefined) Object.defineProperty(event, 'pointerId', { value: extra.pointerId ?? 1 });
  if (!('isPrimary' in event) || event.isPrimary === undefined) Object.defineProperty(event, 'isPrimary', { value: extra.isPrimary ?? true });
  target.dispatchEvent(event);
}

// jsdom has no layout: gives each item matched by `selector` a box `height` px tall, stacked from y = 0.
export function layOut(selector, height) {
  $$(selector).forEach((el, i) => {
    el.getBoundingClientRect = () => ({ top: i * height, height, bottom: (i + 1) * height, left: 0, right: 300, width: 300 });
  });
}

// What the panel's live region (lib/announce.ts) says, once its delayed update has run.
export async function spoken() {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return document.getElementById('app-announcer').textContent;
}

// How many listeners each app event has on the panel's bus. For leak checks: compare before
// mounting and after destroying.
export function busListenerCounts() {
  return Object.fromEntries(Object.entries(currentBus.handlers).map(([event, list]) => [event, list.length]).filter(([, count]) => count > 0));
}

// A promise to resolve or reject from outside, e.g. to hold a storage write.
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
