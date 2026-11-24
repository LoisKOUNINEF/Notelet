// Chromium's newer platform hint; Firefox has only `navigator.platform`.
type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

// Whether the panel runs on macOS, where shortcuts use ⌘ (Cmd) where others use Ctrl.
export function isMac(): boolean {
  // window's: the page's navigator (Node's own global one stands in for it in tests otherwise).
  const { userAgentData, platform } = window.navigator as NavigatorWithUAData;
  return /mac/i.test(userAgentData?.platform || platform || '');
}

// The modifier of the add/save shortcut, as the keyboard shows it: "⌘" on macOS, "Ctrl" elsewhere.
// Both work everywhere (see lib/dom.ts formKeys); only the label follows the platform.
export function modifierKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

// Alt, as the keyboard shows it: "⌥" (Option) on macOS, "Alt" elsewhere. The manifest's
// Alt+Shift+N opens the panel with Option+Shift+N on macOS, in Chrome and Firefox alike.
export function altModifierKey(): string {
  return isMac() ? '⌥' : 'Alt';
}

// The add/save shortcut, for a hint: "⌘+Enter" on macOS, "Ctrl+Enter" elsewhere.
export function submitShortcut(): string {
  return `${modifierKey()}+Enter`;
}
