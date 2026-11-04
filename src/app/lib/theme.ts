import { AppEventBus } from '../../core/index.js';
import { settingsService } from '../services/settings/settings.service.js';

// `<html data-theme>` picks the tokens in styles/_styles.scss; absent, they follow the device.
export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
}

/** Applies the saved theme, and each change (here or in another window). Returns the unsubscribe. */
export function initTheme(): () => void {
  const update = () => applyTheme(settingsService.theme);
  update();
  AppEventBus.subscribe('settings-changed', update);
  return () => AppEventBus.off('settings-changed', update);
}
