# Notelet - Built with Nutin

```text
Notes & tasks, at a glance.
```

Notes and to-dos for each page and each site, in Chrome's side panel or Firefox's sidebar.

Requires Node.js 24 or later.

## Build

- `npm run build`: build the extension into `dist/chrome` and `dist/firefox` (unminified; the Nutin build itself stays in `dist/src`)
- `npm run build:prod`: the same, for production
- `npm run typecheck`: type-check the application without building it

## Load the extension in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist/chrome`.
3. Click the toolbar button (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>) to open or close the notes side panel.

After a rebuild, click the reload button on the extension's card.

## Load the extension in Firefox (140 or later)

1. Run `npm run build`.
2. Open `about:debugging`, then **This Firefox** → **Load Temporary Add-on…** and pick `dist/firefox/manifest.json`. It stays until Firefox restarts.
3. Click the toolbar button (it may be in the extensions menu, pin it there) or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> to open or close the sidebar.

After a rebuild, click **Reload** on its card in `about:debugging`.

The sources are `src/extension/` (Chrome's manifest and the background script) and `src/app/` (the panel, a Nutin app mounted without the router). The build derives Firefox's manifest from Chrome's (sidebar instead of side panel, background script instead of service worker, add-on id `extension.geckoId` in `nutin.config.js`, `notelet@kouninef.dev`).

## Release

- `npm run package:extension`: production build, then `dist/notelet-chrome-<version>.zip` for the Chrome Web Store and `dist/notelet-firefox-<version>.zip` for addons.mozilla.org, each with a `.sha256` (needs the `zip` command). `package:extension:chrome` / `package:extension:firefox` make only one. The ZIPs are reproducible: with the same `SOURCE_DATE_EPOCH` (CI uses the commit's time), the same sources give the same bytes.
- `npm run validate:extension` checks both packages (manifest, contents, versions; `-- --tag vX.Y.Z` also checks a release tag); `npm run lint:extension` runs Mozilla's `web-ext lint` on `dist/firefox`.
- Store listing drafts, permission justifications and image requirements are kept outside this repository. Privacy policy: [PRIVACY.md](PRIVACY.md).

### CI/CD

- `.github/workflows/ci.yml` (pushes to `main` and pull requests): build with type-checking, unit tests, then for Chrome and Firefox: package, validate, addons-linter (Firefox), and a second build that must give the same ZIP. The ZIPs are kept as workflow artifacts.
- `.github/workflows/release.yml` (tags `vX.Y.Z`): runs CI, checking that the tag matches the version, then creates the GitHub Release with both ZIPs and their checksums. The Chrome Web Store and addons.mozilla.org submissions then wait for approval in the `store` environment.
- To release, bump `version` in `package.json` (the build writes it into the manifests), commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`.
- Third-party actions are pinned to commit SHAs; Dependabot (`.github/dependabot.yml`) opens weekly PRs to bump them.

## Known limitations

- Switching the storage area (this device ↔ Chrome or Firefox sync) while another window is saving at that very moment can leave that one save in the previous area.
- Each window has its own panel, and each panel saves on its own: if two windows change the same page's (or site's) notes, or its to-dos, at the very same moment, one of the two changes can be lost. Changes made one after the other are fine: each panel sees the other's.
- Browser sync keeps one entry per page list: if two computers change the same page's notes (or to-dos) at the same time, the last write wins for that list. (Turning sync on merges lists item by item, the latest edit winning.)
- Unsaved text (a note being written, an edit left open) survives closing the panel, not quitting the browser (it's kept in `storage.session`).
- Dragging a to-do doesn't follow the panel scrolling during the drag: positions are measured when it starts.

## Tests

`npm run testin-nutin` runs tests. App tests fake the `chrome.*` APIs with `src/app/testing/fake-chrome.js` (`browser: 'firefox'` to run as in Firefox).

## Getting started

See [Getting Started](GETTING_STARTED.md) for project-specific guidance.
