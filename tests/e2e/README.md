# SmartScan browser tests (`tests/e2e`)

End-to-end checks that drive the **real QuoteKeeper app** (`src/App.jsx`) in headless Chrome, on an emulated touch phone, with **Firebase fully mocked**. They cover the SmartScan photo → OCR → two-tap selection → edit → save → back-to-photo flow, the reading session (author and source carried across photographs), and regressions: the header, manual quote entry, and the retired OCR Lab.

```bash
npm run test:e2e          # against the dev server (fast; use while developing)
npm run test:e2e:build    # against a real production build (run before a release)
```

Expected output: one `PASS` / `FAIL` line per check, then `73/73 passed`. The exit code is 0 only if every check passes. A full run takes about 1–2 minutes on a desktop.

`test:e2e:build` runs the same checks against an actual `vite build` (minified code, hashed lazy chunks, production asset paths), written to `tests/e2e/.dist/` (gitignored) and served by Vite's preview server. It catches problems the dev server hides, such as OCR files or lazy chunks that fail to load once bundled. It leaves out the PWA plugin, so no service worker is involved.

## Requirements

- **Node 22+.** The harness uses Node's built-in `WebSocket`, so no extra packages are needed.
- **Google Chrome or Chromium.** Common install paths are found automatically. Otherwise set `CHROME_PATH`:
  ```bash
  CHROME_PATH="/path/to/chrome" npm run test:e2e
  ```
- **`npm install` already run.**
- **OCR assets in `public/ocr/`.** They're prepared automatically on the first run, the same way `npm run build` does it. The first time this downloads the English model once (checksum-verified) into `node_modules/.cache/ocr-models`.

### Ports

The run uses two local ports:

- `5199` for the mocked app (override with `E2E_PORT`)
- `9333` for Chrome's DevTools (override with `E2E_CDP_PORT`)

Both must be free.

## Safety: no production data

- `firebase/app`, `firebase/auth` and `firebase/firestore` are **aliased to `mocks/`**, so the app never loads the real Firebase SDK.
- The test server reads **no `.env` file** (`envDir` is this folder), so the real Firebase config never reaches the page.
- The mock signs in a fake user (`test-uid-123`, `tester@example.test`).
- Every `addDoc` / `updateDoc` / `deleteDoc` is recorded in `window.__fs` in memory and is lost when the page reloads or the browser closes.
- The reading session is stored in the throwaway browser profile's `localStorage`, never in yours.
- One check fails the run if any request reaches a Firebase or Google API host. The existing Google Fonts stylesheet is the only allowed outside request.
- Test photos are the benchmark's **synthetic** pages (`benchmark/ocr/samples.js`: original text with exact word positions). No real book photos are used or stored.
- Chrome runs with a throwaway profile in the system temp folder, deleted after the run.

## What it checks (73)

| Area | Checks |
|---|---|
| Header and loading | Email and Sign out shown on the main form and hidden in SmartScan, with no sign-out. OCR code not loaded until a photo is opened. OCR files served from the app's origin only |
| Workspace | Opens from an upload at original resolution (3024×4032). OCR completes. Fills the screen with no horizontal scroll. All controls on screen and ≥44 px. Zoom controls in one row in the bottom-right corner |
| Zoom and alignment | Pinch zooms, and the word under the fingers stays put. Browser page zoom stays at 1. Overlay matches the photo at fit, after pinch, after button zoom, after rotation, and in landscape. The page can be dragged up past its bottom edge to clear the zoom controls |
| Selection | Anchor on tap 1. Multi-line passage on tap 2 matches the ground truth exactly. Panel below the photo. Reverse selection. Immediate new selection. Two quick taps select without zooming. Clear |
| Copy | Clipboard text equals the passage |
| Draft and save | Draft prefilled with all fields. Corrected text saved to `quotes` with the existing field set and order. Same photo, zoom and position afterwards. Saved passage marked. Next draft prefilled with author and source. A failed save keeps the draft. Second passage saved |
| Zoom buttons | Fit, Zoom out disabled at fit, Zoom in |
| Navigation | Close photo returns to the photo picker. Leaving SmartScan restores the header |
| Manual entry | Saves the same document shape and clears the form |
| Rotation | Sideways photo opens landscape. Rotate makes it upright and refits. Overlay aligned. Selection after re-OCR is exact |
| Landscape phone | Layout and alignment at 844×390 |
| Reading session | Second photograph shows and uses the first photo's author and source. Editing one quote's author affects that quote only. Changing the story applies from the next quote. Only author and source are stored on the device. The session survives a page reload and applies to a third photograph. New Story clears it everywhere, and the next quote is saved without the old values. Set and New Story also work on the photo screen |
| Photo screen | Card starts at the top with no empty band; both photo buttons visible without scrolling |
| OCR Lab retired | No OCR Lab button, even with the old allowlist variable set. The old `#ocr-lab` address shows the normal app. No Lab code requested. The `best_int` model is served; the Lab-only `fast` model is not |
| Hygiene | No requests to real Firebase or Google APIs. No other outside requests. No page errors |

## Files

| File | Purpose |
|---|---|
| `run.mjs` | The checks. Starts the server and Chrome, runs everything, cleans up |
| `server.mjs` | Serves the real app with the Firebase mocks, from the dev server or a production build. Run `node tests/e2e/server.mjs` to keep the mocked app open for manual poking at http://127.0.0.1:5199 |
| `cdp.mjs` | Minimal Chrome DevTools Protocol driver: launch, evaluate, touch tap/drag/pinch, viewport emulation |
| `mocks/` | Firebase app, auth and Firestore stand-ins |

## Notes

- **This doesn't replace testing on a phone.** Touch is emulated, and desktop OCR is much faster than a phone's. Physical Samsung testing remains the acceptance gate.
- Words are tapped at their ground-truth positions, so a selection check fails if either the overlay alignment or the OCR's reading order is wrong.
- **To add a check:** use `check(name, condition, detail)` in `run.mjs`. Page-side helpers live on `window.__h` (see `HELPERS`).
