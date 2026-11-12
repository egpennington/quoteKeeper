# SmartScan browser tests (`tests/e2e`)

End-to-end checks that drive the **real QuoteKeeper app** (`src/App.jsx`) in headless Chrome, on an emulated touch phone, with **Firebase fully mocked**. They cover the SmartScan photo → OCR → two-tap selection → edit → save → back-to-photo flow, plus regressions: the header, manual quote entry, and the OCR Lab.

```bash
npm run test:e2e
```

Expected output: one `PASS` / `FAIL` line per check, then `51/51 passed`. The exit code is 0 only if every check passes. A full run takes about 30–60 s on a desktop.

## Requirements

- **Node 22+.** The harness uses Node's built-in `WebSocket`, so no extra packages are needed.
- **Google Chrome or Chromium.** Common install paths are found automatically. Otherwise set `CHROME_PATH`:
  ```bash
  CHROME_PATH="/path/to/chrome" npm run test:e2e
  ```
- **`npm install` already run.**
- **OCR assets in `public/ocr/`.** They're prepared automatically on the first run, the same way `npm run build` does it. The first time this downloads the two English models once (checksum-verified) into `node_modules/.cache/ocr-models`.

### Ports

The run uses two local ports:

- `5199` for the mocked app (override with `E2E_PORT`)
- `9333` for Chrome's DevTools (override with `E2E_CDP_PORT`)

Both must be free.

## Safety: no production data

- `firebase/app`, `firebase/auth` and `firebase/firestore` are **aliased to `mocks/`**, so the app never loads the real Firebase SDK.
- The test server reads **no `.env` file** (`envDir` is this folder), so the real Firebase config never reaches the page.
- The mock signs in a fake user (`test-uid-123`, `tester@example.test`).
- Every `addDoc` / `updateDoc` / `deleteDoc` is recorded in `window.__fs` in memory and is lost when the browser closes.
- One check fails the run if any request reaches a Firebase or Google API host. The existing Google Fonts stylesheet is the only allowed outside request.
- Test photos are the benchmark's **synthetic** pages (`benchmark/ocr/samples.js`: original text with exact word positions). No real book photos are used or stored.
- Chrome runs with a throwaway profile in the system temp folder, deleted after the run.

## What it checks (51)

| Area | Checks |
|---|---|
| Header and loading | Email and Sign out shown on the main form and hidden in SmartScan, with no sign-out. OCR code not loaded until a photo is opened. OCR files served from the app's origin only |
| Workspace | Opens from an upload at original resolution (3024×4032). OCR completes. Fills the screen with no horizontal scroll. All controls on screen and ≥44 px |
| Zoom and alignment | Pinch zooms, and the word under the fingers stays put. Browser page zoom stays at 1. Overlay matches the photo at fit, after pinch, after button zoom, after rotation, and in landscape |
| Selection | Anchor on tap 1. Multi-line passage on tap 2 matches the ground truth exactly. Panel below the photo. Reverse selection. Immediate new selection. Two quick taps select without zooming. Clear |
| Copy | Clipboard text equals the passage |
| Draft and save | Draft prefilled with all fields. Corrected text saved to `quotes` with the existing field set and order. Same photo, zoom and position afterwards. Saved passage marked. Next draft prefilled with author and source. A failed save keeps the draft. Second passage saved |
| Zoom buttons | Fit, Zoom out disabled at fit, Zoom in |
| Navigation | Close photo returns to the photo picker. Leaving SmartScan restores the header |
| Manual entry | Saves the same document shape and clears the form |
| Rotation | Sideways photo opens landscape. Rotate makes it upright and refits. Overlay aligned. Selection after re-OCR is exact |
| Landscape phone | Layout and alignment at 844×390 |
| OCR Lab | Still runs with the shared engine, draws word boxes, and makes no writes |
| Hygiene | No requests to real Firebase or Google APIs. No other outside requests. No page errors |

## Files

| File | Purpose |
|---|---|
| `run.mjs` | The checks. Starts the server and Chrome, runs everything, cleans up |
| `server.mjs` | Vite dev server for the real app with the Firebase mocks. Run `node tests/e2e/server.mjs` to keep the mocked app open for manual poking at http://127.0.0.1:5199 |
| `cdp.mjs` | Minimal Chrome DevTools Protocol driver: launch, evaluate, touch tap/drag/pinch, viewport emulation |
| `mocks/` | Firebase app, auth and Firestore stand-ins |

## Notes

- **This doesn't replace testing on a phone.** Touch is emulated, and desktop OCR is much faster than a phone's. Physical Samsung testing remains the acceptance gate.
- Words are tapped at their ground-truth positions, so a selection check fails if either the overlay alignment or the OCR's reading order is wrong.
- **To add a check:** use `check(name, condition, detail)` in `run.mjs`. Page-side helpers live on `window.__h` (see `HELPERS`).
