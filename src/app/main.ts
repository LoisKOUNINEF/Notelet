import 'a11y-elements/components/checkbox';
import 'a11y-elements/components/input';
import 'a11y-elements/components/radio-group';
import 'a11y-elements/components/select';
import 'a11y-elements/components/spinner';
import 'a11y-elements/components/textarea';
import 'a11y-elements/components/visually-hidden';
import 'a11y-elements/overlays/dropdown';
import 'a11y-elements/overlays/modal';
import 'a11y-elements/overlays/snackbar';
import 'a11y-elements/overlays/tooltip';
import { initI18n, registerPipes } from '../core/index.js';
import { SidebarComponent } from './components/sidebar/sidebar.component.js';
import { initDrafts } from './lib/drafts.js';
import { failureMessage } from './lib/errors.js';
import { initTheme } from './lib/theme.js';
import { registerAppPipes } from './lib/pipes.js';
import { activeTabService } from './services/active-tab/active-tab.service.js';
import { clockService } from './services/clock/clock.service.js';
import { notifierService } from './services/notifier/notifier.service.js';
import { scopeStoreService } from './services/scope-store/scope-store.service.js';
import { settingsService } from './services/settings/settings.service.js';

class App {
  constructor() {
    registerPipes();
    registerAppPipes();
    new SidebarComponent('#app').render();
  }
}

// Each step that can fail is reported, and the panel still mounts: a blank panel would say nothing.
async function start(step: string, run: () => unknown): Promise<void> {
  try {
    await run();
  } catch (error) {
    notifierService.error(`${failureMessage(`Couldn't ${step}.`, error)} Try closing and reopening the panel.`);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await start('load the translations', () => initI18n());
  // Settings first: they say which storage area the notes are in.
  await start('load your settings', () => settingsService.init());
  // Before the panel mounts: it shows in the chosen theme from the start.
  initTheme();
  await start('watch for changes to your notes', () => scopeStoreService.init());
  await start('read the current tab', () => activeTabService.init());
  // Unsaved text from the panel's last opening.
  await start('restore your unsaved text', () => initDrafts());
  clockService.start();
  new App();
});
