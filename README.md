# Specimen / Lab Requisition Scanner — proof of concept

**Proof of concept. Not for clinical use. Always verify against the paper requisition.**

A small web app (PWA) for community nursing that reads the ticked tests on a photographed BC lab requisition (LifeLabs D2350 or a printed EMR test list) and shows them as a checklist for the nurse to confirm.

Live demo: https://kimberleywilliams00-ai.github.io/specimen-scanner-poc/

## Privacy design
- **Everything runs on the device.** Image processing (OpenCV.js) and text recognition (Tesseract.js) are bundled in this repo and run in the browser.
- **Nothing is stored or sent.** Photos stay in memory only and are cleared on *Finish* / *Discard*. No uploads, analytics, cookies, localStorage or IndexedDB. A strict Content-Security-Policy only allows the app's own files.
- The service worker caches only the app's own static files (for offline use); it never sees or stores photos.
- This repository contains no patient data or requisition photos.

## Updates (v3.1+)
The service worker is network-first for the app itself (page, app JS/CSS, `version.json`), so a new deploy loads on the next open while online; the cache is only an offline fallback. Large engine files under `vendor/` are cache-first (cache `req-scanner-vendor-N`; bump N if they change). The page checks for updates on open and when brought back to the foreground, reloads once when a new version takes over (only when idle), and shows *Update available - tap to reload* if `version.json` differs from the running version. The version is shown on the start screen and in the footer.

To release a new version, bump it in `version.json`, `js/app.js` (`APP_VERSION`), `sw.js` (`VERSION`, `Q`) and the `?v=` query strings in `index.html`.

## Using it on an iPhone
1. Open the link above in Safari (first load downloads ~25 MB of engine files, then works offline).
2. Optional: Share → *Add to Home Screen*.
3. Tap **Take photo**, photograph the test list, review the results, and check every item against the paper form before confirming.
