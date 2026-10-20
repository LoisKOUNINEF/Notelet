# Notelet - Built with Nutin

```text
Notes & tasks, at a glance.
```

Notes and to-dos for each page and each site, in Chrome's side panel.

## Build

- `npm run build`: build the application
- `npm run build:prod`: build the application for production
- `npm run build:extension`: production build packaged as a Chrome extension in `dist/src` (`build:extension:dev` for an unminified one)

## Load the extension in Chrome

1. Run `npm run build:extension`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist/src`.
3. Click the toolbar button (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>) to open or close the notes side panel.

After a rebuild, click the reload button on the extension's card. Its sources are `src/extension/` (manifest, service worker) and `src/app/` (the side panel, a Nutin app mounted without the router).

## Release

- `npm run package:extension`: production build, then `dist/notelet-<version>.zip` for the Chrome Web Store (needs the `zip` command).
- Store listing drafts, permission justifications and image requirements: [docs/store-listing.md](docs/store-listing.md). Privacy policy: [PRIVACY.md](PRIVACY.md).

## Known limitations

- Switching the storage area (this device ↔ Chrome sync) while another window is saving at that very moment can leave that one save in the previous area.
- Chrome sync keeps one entry per page list: if two computers change the same page's notes (or to-dos) at the same time, the last write wins for that list. (Turning sync on merges lists item by item, the latest edit winning.)
- Dragging a to-do doesn't follow the panel scrolling during the drag: positions are measured when it starts.

## Tests

`npm run testin-nutin` runs tests. App tests fake the `chrome.*` APIs with `src/app/testing/fake-chrome.js`.

## Getting started

See [Getting Started](GETTING_STARTED.md) for project-specific guidance.
