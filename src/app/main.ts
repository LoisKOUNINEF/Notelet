import 'a11y-elements/components/checkbox';
import 'a11y-elements/components/input';
import 'a11y-elements/components/radio-group';
import 'a11y-elements/components/textarea';
import 'a11y-elements/components/visually-hidden';
import 'a11y-elements/overlays/snackbar';
import { initI18n, registerPipes } from '../core/index.js';
import { SidebarComponent } from './components/sidebar/sidebar.component.js';
import { registerAppPipes } from './lib/pipes.js';
import { activeTabService } from './services/active-tab/active-tab.service.js';
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

document.addEventListener('DOMContentLoaded', async () => {
  await initI18n();
  // Settings first: they say which storage area the notes are in.
  await settingsService.init();
  scopeStoreService.init();
  await activeTabService.init();
  new App();
});
