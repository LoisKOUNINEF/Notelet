// Extension background script: the toolbar action (and, in Chrome, its Alt+Shift+N shortcut)
// toggles the side panel. Chrome runs it as a service worker, Firefox as a background script.

// Firefox's sidebar API, which @types/chrome doesn't know.
declare const browser: { sidebarAction: { toggle(): Promise<void> } };

if (chrome.sidePanel) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error('Could not set the side panel behavior:', error));
} else {
  // Firefox: toggle() only works from a user action, so it's called right in the click handler.
  chrome.action.onClicked.addListener(() => {
    browser.sidebarAction.toggle().catch((error: unknown) => console.error('Could not toggle the sidebar:', error));
  });
}
