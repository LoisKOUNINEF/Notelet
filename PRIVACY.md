# Notelet privacy policy

_Last updated: 18 October 2026_

Notelet is a browser extension that keeps notes and to-dos for the web pages and sites you visit, in Chrome's side panel.

## What Notelet reads

- **The address (URL) of the active tab**, while the side panel is open, to show the notes and to-dos of that page and of its site. Notelet reads it through Chrome's `tabs` permission. It doesn't read page contents.

## What Notelet stores, and where

- **Your notes and to-dos**, the addresses (without their `#` fragment and tracking parameters such as `utm_*`) and site names they belong to, and your settings.
- They are stored with Chrome's extension storage:
  - **on this device** (`chrome.storage.local`), by default;
  - or, if you choose "Synced with your Chrome profile" in Notelet's settings, in **Chrome sync** (`chrome.storage.sync`), which Google stores and syncs to the browsers where you're signed in to your Chrome profile, under [Google's privacy policy](https://policies.google.com/privacy).
- If you allow Notelet in incognito windows (it isn't allowed by default), notes written there are stored in the same place as the others.

## What Notelet doesn't do

- It doesn't send your data anywhere: it makes no network requests, has no servers, and no analytics or tracking.
- It doesn't sell, share or transfer your data to anyone.
- It doesn't use your data for any purpose other than showing you your own notes and to-dos.

## Deleting your data

- Delete notes and to-dos from Notelet itself.
- Removing the extension deletes everything stored on this device. Data in Chrome sync is removed when you remove the extension from a synced browser, or with Chrome's "Clear data" for synced data.

## Contact

Questions: open an issue on the project's repository, or write to the developer at the address given on the Chrome Web Store listing.
