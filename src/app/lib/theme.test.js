import { applyTheme, initTheme } from '#root/dist/src/app/lib/theme.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { useEventBus } from '#root/dist/src/core/index.js';
import { MockEventBus } from '#root/tools/testin-nutin/mocks/mock-event-bus.js';
import { installFakeChrome, uninstallFakeChrome } from '../testing/fake-chrome.js';

describe('theme', () => {
  const theme = () => document.documentElement.getAttribute('data-theme');
  let fake;

  beforeEach(() => {
    useEventBus(new MockEventBus());
    fake = installFakeChrome();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    settingsService.dispose();
    uninstallFakeChrome();
    useEventBus(null);
  });

  it('forces light or dark on <html>, and leaves it to the device otherwise', () => {
    applyTheme('dark');
    expect(theme()).toBe('dark');
    applyTheme('light');
    expect(theme()).toBe('light');
    applyTheme('system');
    expect(theme()).toBe(null);
  });

  it('applies the saved theme, then each change, until stopped', async () => {
    fake.storage.local.data.set('settings:theme', 'dark');
    await settingsService.init();
    const stop = initTheme();
    expect(theme()).toBe('dark');

    await settingsService.setTheme('light');
    expect(theme()).toBe('light');
    // Picked in another window.
    await fake.storage.local.set({ 'settings:theme': 'system' });
    expect(theme()).toBe(null);

    stop();
    await settingsService.setTheme('dark');
    expect(theme()).toBe(null);
  });
});
