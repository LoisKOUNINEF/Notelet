import 'a11y-elements/components/checkbox';
import 'a11y-elements/components/input';
import 'a11y-elements/components/radio-group';
import 'a11y-elements/components/select';
import 'a11y-elements/components/textarea';
import 'a11y-elements/components/visually-hidden';
import 'a11y-elements/overlays/dropdown';
import 'a11y-elements/overlays/modal';
import 'a11y-elements/overlays/snackbar';
import { initI18n, registerPipes } from '../core/index.js';
import { SidebarComponent } from './components/sidebar/sidebar.component.js';
import { errorMessage } from './lib/errors.js';
import { registerAppPipes } from './lib/pipes.js';
import { activeTabService } from './services/active-tab/active-tab.service.js';
import { clockService } from './services/clock/clock.service.js';
import { notifierService } from './services/notifier/notifier.service.js';
import { scopeStoreService } from './services/scope-store/scope-store.service.js';
import { settingsService } from './services/settings/settings.service.js';

// The side panel page: no router (the panel only ever shows index.html), one root component.
class App {
  constructor() {
    registerPipes();
    registerAppPipes();
    new SidebarComponent('#app').render();
  }
}

// Each step that can fail (the extension reloaded under an open panel...) is reported, and the
// panel still mounts: a blank panel would say nothing.
async function start(step: string, run: () => unknown): Promise<void> {
  try {
    await run();
  } catch (error) {
    notifierService.error(`Couldn't ${step}. ${errorMessage(error)} Try closing and reopening the panel.`);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await start('load the translations', () => initI18n());
  // Settings first: they say which storage area the notes are in.
  await start('load your settings', () => settingsService.init());
  scopeStoreService.init();
  await start('read the current tab', () => activeTabService.init());
  clockService.start();
  new App();
});
