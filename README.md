# notes-extension - Built with Nutin

## Development

Requires Node.js 24 or later.

- `npm run serve`: build and serve
- `npm run dev`: build and serve with live reload
- Both serve on port 9090 by default. Pass `-- --port 3000` (or set `PORT=3000`) to change it

## Build

- `npm run build`: build the application
- `npm run build:prod`: build the application for production
- `npm run build:extension`: production build packaged as a Chrome extension in `dist/src` (`build:extension:dev` for an unminified one)

## Load the extension in Chrome

1. Run `npm run build:extension`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist/src`.
3. Click the toolbar button (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>) to open or close the notes side panel.

After a rebuild, click the reload button on the extension's card. Its sources are `src/extension/` (manifest, service worker) and `src/app/` (the side panel, a Nutin app mounted without the router).

## Tests

`npm run testin-nutin` runs Nutin's tests and the app's. App tests fake the `chrome.*` APIs with `src/app/testing/fake-chrome.js`.

## Getting started

See [Getting Started](GETTING_STARTED.md) for project-specific guidance.
