// Extension service worker: the toolbar action (and its Alt+Shift+N shortcut) toggles the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: unknown) => console.error('Could not set the side panel behavior:', error));
