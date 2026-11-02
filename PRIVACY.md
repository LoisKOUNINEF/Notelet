# Notelet privacy policy

_Last updated: 29 October 2026_

Notelet is a browser extension that keeps notes and to-dos for the web pages and sites you visit, in Chrome's side panel or Firefox's sidebar.

## What Notelet reads

- **The address (URL) of the active tab**, while the side panel is open, to show the notes and to-dos of that page and of its site. Notelet reads it through the browser's `tabs` permission. It doesn't read page contents.

## What Notelet stores, and where

- **Your notes and to-dos**, the addresses (without their `#` fragment and tracking parameters such as `utm_*`) and site names they belong to, and your settings.
- They are stored with the browser's extension storage:
  - **on this device** (`storage.local`), by default;
  - or, if you choose "Synced with your Chrome profile" (in Firefox, "Synced with your Firefox account") in Notelet's settings, in the browser's sync storage (`storage.sync`):
    - in Chrome, **Chrome sync**, which Google stores and syncs to the browsers where you're signed in to your Chrome profile, under [Google's privacy policy](https://policies.google.com/privacy);
    - in Firefox, **Firefox Sync**, which Mozilla stores, end-to-end encrypted, and syncs to the Firefox browsers signed in to your Mozilla account with add-ons syncing on, under [Mozilla's privacy notice](https://www.mozilla.org/privacy/mozilla-accounts/).
- **Text you haven't saved yet** (a note being written, an edit left open) is kept in the browser's session storage (`storage.session`), in memory only, so closing the panel doesn't lose it. It's never written to disk nor synced, and it's cleared when you quit the browser.
- If you allow Notelet in incognito or private windows (it isn't allowed by default), notes written there are stored in the same place as the others.

## What Notelet doesn't do

- It doesn't send your data anywhere: it makes no network requests, has no servers, and no analytics or tracking.
- It doesn't sell, share or transfer your data to anyone.
- It doesn't use your data for any purpose other than showing you your own notes and to-dos.

## Backups

- "Export to a file" (Settings, "Backup") saves your notes and to-dos as a JSON file on your computer, where you choose. Notelet doesn't send it anywhere; "Import a file" reads one you pick.

## Deleting your data

- Delete notes and to-dos from Notelet itself.
- Removing the extension deletes everything stored on this device. Data in Chrome sync is removed when you remove the extension from a synced browser, or with Chrome's "Clear data" for synced data. Data in Firefox Sync can be deleted from your Mozilla account's settings.

## Contact

Questions: open an issue on the project's repository, <https://github.com/LoisKOUNINEF/Notelet/issues>, or write to the developer at the address given on the Chrome Web Store or Firefox Add-ons listing.
