import { altModifierKey, isMac, modifierKey, submitShortcut } from '#root/dist/src/app/lib/platform.js';

describe('platform', () => {
  const setPlatform = (platform, userAgentData) => {
    Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
    Object.defineProperty(window.navigator, 'userAgentData', { value: userAgentData, configurable: true });
  };

  // Own properties shadowing jsdom's (on Navigator.prototype): removed, they're back.
  afterEach(() => {
    delete window.navigator.platform;
    delete window.navigator.userAgentData;
  });

  it('shows ⌘ on macOS', () => {
    setPlatform('MacIntel');
    expect(isMac()).toBe(true);
    expect(modifierKey()).toBe('⌘');
    expect(submitShortcut()).toBe('⌘+Enter');
    expect(altModifierKey()).toBe('⌥');
  });

  it('shows Ctrl elsewhere', () => {
    for (const platform of ['Win32', 'Linux x86_64', '']) {
      setPlatform(platform);
      expect(isMac()).toBe(false);
      expect(modifierKey()).toBe('Ctrl');
      expect(submitShortcut()).toBe('Ctrl+Enter');
      expect(altModifierKey()).toBe('Alt');
    }
  });

  it('prefers the user-agent data platform when there is one', () => {
    setPlatform('', { platform: 'macOS' });
    expect(isMac()).toBe(true);
    setPlatform('MacIntel', { platform: 'Windows' });
    expect(isMac()).toBe(false);
  });
});
