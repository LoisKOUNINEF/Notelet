# Chrome Web Store listing: Ticknote

Drafts for the developer dashboard. Copy each part into its field.

## Store listing

- **Name:** Ticknote
- **Summary (≤ 132 characters):** Notes and to-dos for each page and each site, in Chrome's side panel.
- **Category:** Productivity → Tools (or Workflow & planning)
- **Description:**

  > Ticknote keeps notes and to-dos next to the pages they're about.
  >
  > Open the side panel on any site: Ticknote shows the notes and to-dos for that page, and for the whole site, a click away. Switch tabs and it follows.
  >
  > - Notes, with checklists inside them
  > - To-do lists you can reorder, with completed items tucked away
  > - Move anything between a page and its site
  > - Kept on this device, or synced with your Chrome profile
  > - Fully usable with the keyboard and screen readers
  > - No account, no servers, no tracking: your notes never leave Chrome's storage

## Privacy practices

- **Single purpose:** Keep notes and to-dos attached to the web page or site currently open, in the side panel.
- **Permission justifications:**
  - `sidePanel`: Ticknote's whole interface is a side panel, opened from the toolbar button or its keyboard shortcut.
  - `storage`: stores the user's notes, to-dos and settings in chrome.storage (local by default, or Chrome sync when the user chooses it).
  - `tabs`: reads the active tab's URL, whenever the user switches tabs or navigates, so the panel shows the notes for that page and site. Page contents are never read. `activeTab` wouldn't work: it only grants the URL after a click on the toolbar button, for that tab only, while the panel stays open across tab switches.
- **Remote code:** No, all code is in the package.
- **Data usage:** check **"Web history"** (URLs are used as keys for the user's notes) and **"Website content"** only if the reviewers count the notes typed about a site (they're user-written, not read from pages). Then certify:
  - not sold to third parties;
  - not used or transferred for purposes unrelated to the single purpose;
  - not used or transferred to determine creditworthiness or for lending.
- **Privacy policy URL:** host `PRIVACY.md` (e.g. as a GitHub Pages page) and paste its URL.

## Images (to provide)

- **Icon:** `src/assets/icons/ticknote-128.png` (the dark tile), 128×128 PNG. The extension ships `src/assets/icons/ticknote-{16,32,48,128}.png`; the panel's favicon is `public/favicon.ico`. Sources (SVGs, and the light tile PNGs for a future theme-aware icon) are in `docs/icons/`.
- **Fonts:** Source Serif 4 and Playfair Display, both under the SIL Open Font License 1.1, bundled in `src/assets/fonts/` with their `LICENSE.txt` (copied into the package by `tools/extension/package-extension.js`). No remote fonts are loaded.
- **Screenshots:** at least one, 1280×800 (or 640×400), PNG or JPEG. Suggested: the panel next to a page (notes and to-dos), a checklist note, and the settings.
- **Small promo tile:** 440×280 PNG or JPEG.
- **Marquee (optional):** 1400×560.

## Before submitting

- Run `npm run package:extension` and upload `dist/ticknote-<version>.zip`.
- On a real install, check:
  - the toolbar button and Alt+Shift+N open the panel (and whether they close it on your Chrome version);
  - the shortcut doesn't clash (users can change it in chrome://extensions/shortcuts).
