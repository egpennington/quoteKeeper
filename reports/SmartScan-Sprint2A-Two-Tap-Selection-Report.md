# SmartScan Sprint 2A: Two-Tap Passage Selection Report

**Project:** QuoteKeeper · **Feature:** SmartScan · **Lead Engineer:** CODI (Claude Code) · **QA:** cipherMuse
**Date:** 2026-11-12 · **Branch:** `feature/smartscan-two-tap-selection`, from `main` @ `e3d360c`
**Status:** Built and verified on desktop and an emulated phone. cipherMuse QA reviewed it. The browser harness has been added to the repository (§11). **Committed locally. Not merged, pushed, or deployed.** Awaiting the project lead's merge and Samsung acceptance testing.

---

## 1. Summary

The core flow now works inside QuoteKeeper: **photograph a book page → tap the first word → tap the last word → edit the text → save the quote → back to the same photo for the next passage.**

- After a photo is taken or uploaded, it opens in a **full-screen workspace**. The photo fills the screen, you can pinch to zoom, drag to pan, and rotate it. The compact controls are all at least 44 px. The signed-in/Sign out header is hidden while SmartScan is open.
- Text recognition runs on the phone automatically, using the **same OCR engine as the OCR Lab** (`ocr/ocrEngine.js`). Settings are the 2A-0 benchmark defaults: `best_int` at 2000 px.
- **Two-tap selection** works in either direction and across lines. A new tap after a finished selection immediately starts a new one. Each selected line gets its own highlight, like phone text selection. A small panel **below** the photo shows the text, with **Clear**, **Copy** and **Add Quote**.
- **Add Quote** opens an editable draft: quote, author, source, tags and notes. It saves to the existing Firestore `quotes` collection with the **exact existing document shape**. Manual entry now builds its documents with the same function, so the two can't drift apart.
- After saving, you're back on the same photo with the same zoom and position. The saved passage is marked in green. The next draft starts with the same author and source.

**Verification:** lint passes. Build passes. **70/70** automated unit tests pass (new, with no new dependencies). **51/51** browser checks pass in headless Chrome against the real app, with Firebase mocked. They're now committed and run with `npm run test:e2e`. **Not yet tested on the Samsung phone** (instructions in §8).

---

## 2. Architecture decisions

1. **One OCR engine.** The workspace calls the existing `ocrEngine.js`: the same worker setup, self-hosted `/ocr/` assets and coordinate contract the Lab uses. The only engine change is an optional `rotation` argument for `prepareOcrInput()`. It defaults to 0, so the Lab behaves exactly as before, and a browser check confirms that.
2. **Pure logic, thin UI.** All selection, reading-order, geometry and workflow logic lives in plain modules with no browser APIs:
   - `selection/readingOrder.js`
   - `selection/selection.js`
   - `workspace/viewport.js`
   - `workspace/workspaceModel.js`
   - `utils/quoteRecord.js`

   That's why it can be tested with Node's built-in test runner. The React components only handle wiring, gestures and rendering.
3. **Coordinates stay in full-resolution pixels.** OCR boxes are stored in "page" pixels: the original photo after the user's rotation. Display is **page → screen** using a single `{scale, tx, ty}`. The photo and the SVG overlay share one container, so they can't drift apart.
   - The photo is drawn at `page size × scale`, not with a CSS `scale()`. The browser re-samples the original at every zoom, so small print stays sharp.
4. **Rotation never re-encodes the photo.**
   - On screen, the original image is turned with a CSS matrix.
   - For OCR, only the temporary 2000 px copy is turned, with the same matrix (`rotationMatrix()`).
   - The original file and its resolution are never changed.
5. **The workspace replaces the old "preview" step.** A loaded photo opens straight into the workspace (`STAGES.WORKSPACE`). The workspace code and the OCR engine are lazy-loaded, so nothing OCR-related downloads until a photo is opened. Main bundle: 855.5 KB, previously 855.9 KB.
6. **Workflow state is a reducer.** `workspaceModel.js` holds OCR status, words, selection, saved ranges, the draft and saving. Saving is the only async step, and it only touches the draft. That is what guarantees "return to the same photo": the photo, the words and the view are never part of what saving resets.
7. **Saving goes through an injected writer.** `persistQuote(draft, write)` builds and validates the record. The app passes `addDoc(collection(db, 'quotes'), …)` and the tests pass a mock. No test can reach Firestore.
8. **Tesseract's layout is trusted for reading order** (see §6 for why GAI's geometric re-clustering wasn't adopted).

---

## 3. Files

### Created

| File | Purpose |
|---|---|
| `src/components/smartscan/workspace/SmartScanWorkspace.jsx` | Full-screen workspace: viewport, gestures, overlay, selection panel |
| `src/components/smartscan/workspace/QuoteDraftSheet.jsx` | Editable quote draft (quote, author, source, tags, notes) |
| `src/components/smartscan/workspace/useOcr.js` | Runs the shared OCR engine for the open photo. Handles worker life-cycle, cancel on rotate, and retry |
| `src/components/smartscan/workspace/workspaceModel.js` | Workflow reducer (pure) |
| `src/components/smartscan/workspace/viewport.js` | Fit, clamp, focal zoom, pinch, screen↔page mapping, rotation matrices, reveal (pure) |
| `src/components/smartscan/workspace/workspace.css` | Workspace styles, scoped under `.smartscan` |
| `src/components/smartscan/selection/readingOrder.js` | Reading order, noise filtering, passage text joining with hyphen healing (pure) |
| `src/components/smartscan/selection/selection.js` | Two-tap state machine, hit testing, per-line highlight rects (pure) |
| `src/utils/quoteRecord.js` | The `quotes` document shape, shared by manual entry and SmartScan (pure) |
| `tests/**/*.test.js`, `tests/fixtures/` | 70 unit tests plus a synthetic OCR fixture (no book text or photos) |
| `tests/e2e/` | Browser test harness: `run.mjs` (checks), `server.mjs` (mocked dev server), `cdp.mjs` (Chrome driver), `mocks/` (Firebase stand-ins), `README.md` (how to run). Added after QA review (§11) |
| `reports/SmartScan-Sprint2A-Two-Tap-Selection-Report.md` | This report |

### Modified

| File | Change |
|---|---|
| `src/App.jsx` | The account header isn't rendered while `view === 'scan'`. Authentication is untouched |
| `src/components/SmartScan.jsx` | Opens the lazy workspace when a photo loads, and passes the Firestore writer |
| `src/components/smartscan/scanModel.js` | `PREVIEW` stage → `WORKSPACE` |
| `src/components/smartscan/ocr/ocrEngine.js` | `prepareOcrInput(bitmap, size, rotation = 0)` |
| `src/components/smartscan/smartscan.css` | Removed the unused preview styles; added the loading screen |
| `src/components/QuoteForm.jsx` | Builds its document with `persistQuote()`: same fields and order |
| `src/components/TagSelect.jsx` | Forwards optional extra props (label, menu placement). The default behavior is unchanged |
| `package.json` | Adds `"test": "node --test \"tests/**/*.test.js\""` and `"test:e2e": "node tests/e2e/run.mjs"`. **No dependencies added or changed** |
| `eslint.config.js` | Lints the harness's Node `.mjs` files with Node globals |

### Deleted

- `src/components/smartscan/PhotoPreview.jsx`: replaced by the workspace. Its disabled "Recognize Text" placeholder is gone.

---

## 4. Functionality

| Requirement | Implementation |
|---|---|
| Photo fills the screen, no page scrolling | The workspace is `position: fixed` at `100dvh`, and page scrolling is locked while it's open |
| Pinch zoom, drag to pan | Pointer Events. The pinch is computed from the gesture's start, so the word between your fingers stays put. Wheel / trackpad zoom works on desktop |
| Zoom control | **+**, **−** and **Fit** buttons, bottom-right |
| Rotate | 90° clockwise per tap. Re-runs OCR and refits the page |
| No double-tap conflicts | No double-tap handler exists, and `touch-action: none` stops the browser's double-tap and pinch page zoom. Verified: two taps 20 ms apart select a passage, with no zoom |
| Header hidden in SmartScan | Hidden only while the SmartScan view is open. The session is unchanged; verified that no sign-out happens |
| Original resolution kept | The `<img>` shows the original blob; verified 3024×4032. OCR uses a separate 2000 px copy |
| Overlay alignment | The photo and overlay share one container. Verified 0.000 px difference at fit, after a pinch, after button zoom, after rotation and in landscape |
| Two-tap selection | Tap 1 = blue anchor box with "Now tap the last word." Tap 2 = yellow highlight on each line. Reverse order works. Tapping the anchor again selects that one word. The next tap starts a new selection |
| Finger-friendly taps | A 22 px allowance on screen, the same at every zoom. The closest word wins, and vertical distance counts more, so a tap between lines goes to the nearer one. A tap on empty margin is ignored (it doesn't clear the selection) |
| Compact panel | Below the photo, not over it. Shows about 5 lines of text, then scrolls. **✕ / Copy / Add Quote**. If the chosen passage sits behind where the panel appears, the view pans just enough to show it |
| Editable draft | Quote (prefilled), Author, Source, Tags (existing picker), Notes. Focus moves to the heading, so the phone keyboard doesn't pop up over the text you're checking. Escape or **Back to photo** keeps the selection |
| Save | Existing `quotes` collection, existing shape `{quote, author, source, tags[], notes, createdAt}`. An empty quote is refused. A failed save keeps the draft and shows an error |
| Return to the photo | Same photo, words, rotation, zoom and position. Selection cleared. Saved passages shown in green. "Quote saved. Tap another passage to keep going." |
| Multiple passages | Unlimited. The next draft starts with the same author and source (tags start empty) |
| Manual entry | Unchanged UI. Now uses the shared record builder |

---

## 5. Verification

### Automated checks (actual results)

- `npm run lint`: **passes** (0 problems).
- `npm run build`: **passes**.
  - Main bundle 855.5 KB (231.6 KB gzipped), down from 855.9 KB.
  - New lazy files: `SmartScanWorkspace` 16.4 KB JS + 4.9 KB CSS, and a shared `ocrEngine` 19.0 KB (8.3 KB gzipped) used by the workspace and the Lab.
  - The precache grows from 7 to 10 files: those 3 new ones. The OCR worker, engine and models (`/ocr/**`) and the Lab are still excluded.
- `npm audit`: **27**, unchanged (no dependency changes).
- `npm test`: **70/70 pass** (Node 22 `node:test`, about 2 s).

| Required test area | Tests (file) |
|---|---|
| Selecting words on a single line | `selection.test.js`: tap positions → "quick brown fox" |
| Selecting across multiple lines | `selection.test.js`: 3-line passage, 3 highlight rects |
| Reverse selections | `selection.test.js` (state and tap positions), `workspaceModel.test.js` |
| Reading-order accuracy | `readingOrder.test.js`: line order, left-to-right sort of scrambled engine output, two columns read separately, noise filtering, punctuation kept |
| Hyphenated words | `readingOrder.test.js`: "remem-/bering" → "remembering"; "well-known" kept; "Anglo-/Saxon" → "Anglo-Saxon"; soft hyphen and Unicode hyphen |
| Zoom and coordinate alignment | `viewport.test.js`: rotation matrices at all 4 angles, fit, screen↔page round trip, focal zoom, **pinch with one-finger-at-a-time events**, pinch from fit, clamping, reveal, a tap on every word's on-screen centre at 3 zoom levels hits that word, finger allowance constant across zoom |
| Editing OCR text before saving | `workspaceModel.test.js`: the edited text, author, source, tags and notes are written exactly (mock writer) |
| Returning to the photograph after saving | `workspaceModel.test.js`: photo, words, rotation and OCR state kept; selection cleared; saved range recorded |
| Multiple passages from one photo | `workspaceModel.test.js`: two saves, author and source carried over, both ranges marked |
| Existing functionality | `quoteRecord.test.js`: the document shape matches what manual entry wrote before this sprint. `scanModel.test.js`: Sprint 1 photo and camera flow, OCR Lab access rules |

Database-write tests use an in-memory mock writer. **No test imports Firebase or touches production data.**

Two regressions came up during testing and are now pinned by tests:

1. **Pinch drift.** The word under your fingers slid about 150 px when pinching from the whole-page view. Clamping on every frame kept re-centring the short page. The fix computes each frame from the gesture's start. I confirmed the new unit test fails against the old code.
2. **Hit testing at low zoom.** The first version, adapted from GAI, picked the first padded box in reading order. That favoured earlier words when boxes overlapped. It now picks the closest box.

### Browser tests (simulated, not a physical device): 51/51

Run with `npm run test:e2e` (see `tests/e2e/README.md`). The original run had 50 checks; the 51st, the real-Firebase request guard, was added in §11. These ran in headless Chrome 390×844 @3x with touch emulation, against the **real `App.jsx`**. Firebase was replaced by a mock that records every write. Gestures are real touch events (`Input.dispatchTouchEvent`), which Chrome turns into pointer events, as on a phone. The page images are the benchmark's synthetic 12 MP pages (original text, with exact word boxes).

- **Header and loading:**
  - The email and Sign out are shown on the main form and hidden in SmartScan, with no sign-out call.
  - The workspace and OCR code aren't requested until a photo is opened.
  - OCR files load from this origin only.
- **Workspace:**
  - Opens straight from the upload at 3024×4032.
  - OCR is ready in 3.5 s on desktop.
  - Fills 390×844 with no horizontal scrolling. All 5 controls are on screen and 44×44.
- **Zoom and alignment:**
  - Pinch zooms ×3.25, and the word under the fingers moves **0.0 px**.
  - The browser's page zoom stays at 1.
  - The overlay matches the photo to **0.000 px** at fit, after pinch, after button zoom, after rotation, and in landscape.
- **Selection:**
  - Tap 1 anchors the first word ("Starting at “to”"). Tap 2 selects 25 words over 3 lines, **matching the ground truth exactly**.
  - A reverse selection, started straight after the previous one, gives the same text.
  - Two taps 20 ms apart select a passage and don't zoom.
  - Clear works.
  - The panel sits fully below the photo.
- **Copy:** the clipboard text equals the passage.
- **Draft and save:**
  - The draft shows the passage and all five fields.
  - A corrected quote with author, source and notes is saved to `quotes` with the exact existing keys and order.
  - Afterwards: same photo, same zoom and position (to within 0.5 px), selection cleared, saved passage marked green, success message shown.
- **Second passage:** author and source are prefilled.
  - A simulated failed save keeps the draft open with an error and nothing written.
  - The retry saves.
- **Zoom buttons:** Fit shows the whole page, Zoom out is disabled at fit, and Zoom in works.
- **Navigation:** Close photo returns to Take/Upload. Back restores the header.
- **Manual entry:** saves the same document shape and clears the form.
- **Rotation:** a sideways photo opens landscape. Rotate turns it upright and refits. OCR re-runs, and a selection on the rotated page **matches the ground truth exactly**.
- **Landscape phone (844×390):** fills the screen, controls on screen, panel below the photo, overlay aligned.
- **OCR Lab regression:** still runs with the shared engine (1500×2000 input, 280 words), with word boxes drawn and **no Firestore writes**.
- **Hygiene:**
  - No request reached a real Firebase or Google API host (added in §11).
  - No requests leave the app's origin except the existing Google Fonts stylesheet.
  - No page errors, apart from the deliberate simulated save failure, which is logged on purpose.

**Selection accuracy on harder pages** (a 25-word, 3-line selection on each synthetic page, desktop):

| Page | OCR time | Selected text vs. truth |
|---|---|---|
| Clean 11 pt | 3.4 s | exact |
| Pencil underlines | 3.2 s | exact |
| Low / uneven light | 3.2 s | exact |
| Small 7.5 pt | 4.6 s | exact |
| Curved near spine + tilt | 2.9 s | right words; OCR added one stray `“` (CER 0.8%) |
| Combined hard (8.5 pt, curve, tilt, low light) | 4.3 s | right span; OCR misread 4 words (CER 4.5%, WER 16%) |

The selection always covered the intended span. The remaining errors are OCR misreads, which the editable draft exists to fix.

The browser harness is now committed under `tests/e2e/` (§11).

### Not tested

- **The Samsung phone or any physical device.** Touch was emulated. Real finger accuracy, Samsung Internet or Chrome gesture quirks, real camera photos, actual OCR speed and memory, and the on-screen keyboard over the draft all still need the phone.
- **Real Firebase** (auth and Firestore were mocked) and **Netlify**: not deployed, per instructions.
- **The installed PWA's update cycle** after deploy.
- I couldn't fetch `origin` because the network was unavailable from my shell, so the branch is based on local `main` @ `e3d360c`, which was the last known `origin/main`.

---

## 6. Ideas adopted or rejected from GAI

| GAI idea | Decision | Notes |
|---|---|---|
| Anchor / start / end state machine | **Adopted** | `selection.js`: three phases; a tap after a finished selection starts a new one |
| Clear the selection after save so the next passage can be picked | **Adopted** | `SAVE_SUCCESS` in the reducer, plus a green "saved" mark GAI didn't have |
| Joining words in reading order, healing line-break hyphens | **Adopted and extended** | Adds soft and Unicode hyphens; keeps the hyphen before a capital ("Anglo-Saxon"); handles curly quotes; doesn't guess about lone straight quotes |
| Finger-friendly snapping, vertical distance weighted | **Adopted, changed** | The allowance is in **screen** pixels (constant at any zoom), not a fraction of the image. The closest box wins, instead of the first padded box (a bias found in testing) |
| Pointer gesture model: tap-vs-pan threshold, two-finger pinch, wheel zoom, simple taps reserved for words | **Adopted, fixed** | GAI clamps on every pinch frame, which caused the same ~150 px drift I measured. Here each frame is computed from the gesture's start |
| Quick zoom toggle | **Adapted** | Separate **+ / − / Fit** buttons, easier for people who can't pinch |
| Copy / Add Quote panel | **Adapted** | Placed **below** the photo in the layout rather than floating over it, so it never covers the passage |
| Speck filter | **Partly adopted** | Lone low-confidence symbols, plus marks far shorter than the page's normal text height |
| Re-clustering lines by y-position, plus two-page gutter detection | **Rejected for now** | Y-clustering breaks on curved and tilted pages, and Tesseract's lines already follow curved baselines. Its layout analysis handles columns (verified by a two-column test). Revisit if real two-page spreads come out in the wrong order on the Samsung |
| Normalized [0–1] coordinates | **Rejected** | Kept the existing full-resolution pixel coordinates, which give exact alignment |
| `rotateImageUrl` / `normalizeUploadedImage` (re-encode to ≤3000–3200 px JPEG) | **Rejected** | Lowers resolution and re-compresses the photo, against this sprint's "preserve original resolution". Here rotation is a display transform plus a rotated OCR copy |
| Draggable start/end handles | **Not built** | Not requested, and re-tapping two words is fast. Recommended only if Samsung testing shows people need fine adjustment |
| Extra draft fields (`pageNumber`, `isFavorite`, `captureMethod`) | **Rejected** | Would change the Firestore schema |
| `underlineDetector.ts` | **Not implemented** | Out of scope |
| Local shadow correction (`prepareOcrCanvas(enhance)`) | **Not implemented. A later benchmark is worth doing** | See below |

**Shadow correction: is it worth a benchmark?** Yes, as a controlled A/B test in the OCR Lab, not as a default.

- **What it does:** GAI's method estimates the paper brightness in 16 px blocks, blurs that estimate, divides it out, then stretches the contrast. It's a sound, standard way to flatten spine shadows.
- **What our data says:**
  - On our synthetic low-light page, plain OCR already reads the selection perfectly.
  - The errors on the "hard" page came from noise and pencil marks, not shadow.
  - So there's no evidence yet that we need it.
- **Risks:**
  - It's a per-pixel JavaScript pass over about 4 MP, roughly 0.1–0.3 s more on a phone (not measured).
  - The fixed contrast stretch (`(v − 0.34) / 0.56`) can wash out light pencil marks and thin serifs.
- **Suggested benchmark:**
  - Add an "Enhance" toggle to the Lab.
  - Run real Samsung photos of spine-shadowed pages with and without it, recording CER/WER and time.
  - Adopt it only if shadowed pages improve without making clean pages worse.

---

## 7. Known issues and limitations

1. **Small print needs zooming before tapping.** At whole-page view a book line is only a few screen pixels tall. The finger allowance snaps to the nearest word, but accurate taps need a pinch or **+** first. This is by design, and it should be checked on the Samsung.
2. **No fine-adjust handles.** Fixing a selection means re-tapping both ends. Small mistakes can also be fixed in the draft.
3. **Words under the zoom buttons** (bottom-right) can't be tapped until you pan them out from under the buttons.
4. **Hyphen guess.** A line ending in "word-" followed by a lowercase word is always joined ("remem-" + "bering"), which also turns a split compound like "well-" / "known" into "wellknown". This can be corrected in the draft.
5. **Paragraph breaks become single spaces** in the extracted text.
6. **Reading order follows Tesseract's layout.** Running heads, footnotes, marginal notes and two-page spreads haven't been tested on real photos.
7. **Rotating re-runs OCR** and clears that photo's green "saved" marks. Quotes already saved aren't affected.
8. **Closing the photo discards the OCR result.** Reopening it runs OCR again.
9. **Saving offline:** Firestore waits for the server, so offline the button stays on "Saving…" until the connection returns. Manual entry behaves the same way today.
10. **Keyboard and screen-reader access to word selection is limited.** Words on the photo aren't individually focusable. The panel, draft and all buttons are accessible.
11. **Small behavior changes:**
    - Manual entry now trims surrounding whitespace, so a whitespace-only quote is refused. Before, it would save.
    - The photo-info caption (size and dimensions) from the removed preview isn't shown.
12. **SmartScan now runs OCR for every signed-in user.** That's the point of this sprint. On first use it downloads the 2.9 MB `best_int` model from our own origin and then caches it on the device. The OCR Lab is still restricted to the allowlisted UIDs.
13. **The OCR defaults come from the desktop 2A-0 benchmark** (`best_int` @ 2000 px). I haven't received Samsung OCR Lab numbers, so phone speed is unconfirmed.

---

## 8. Samsung testing instructions

Deploying isn't approved, so test over USB the same way as in 2A-0. If you approve a Netlify deploy preview, test there instead.

1. **On the PC:** `git switch feature/smartscan-two-tap-selection`, then `npm run build`, then `npx vite preview --host 127.0.0.1 --port 5174`.
2. **Connect the phone:**
   - Connect it by USB with USB debugging on.
   - In desktop Chrome, open `chrome://inspect` → **Port forwarding**, map `5174` → `127.0.0.1:5174`, and tick **Enable**.
   - On the phone, open `http://localhost:5174`. Localhost counts as secure, so the camera works.
3. **Sign in with your real account.** Saving creates **real quotes in your library**. Use a test passage and delete the test quotes from Q Library afterwards. (The automated tests never touched real data.)

**Checklist** (note pass or fail and anything that feels awkward):

1. **SmartScan opens:** tap SmartScan. The email and Sign out bar disappear, and come back when you leave.
2. **Take Photo** of a real book page with the phone camera. Also try **Upload Photo** with an existing gallery photo.
3. **Full screen:** the photo fills the screen with no page scrolling. The ←, ⟳, +, − and ⤢ controls aren't hidden by the status bar or the gesture bar.
4. **Speed:** time from the photo appearing to "Tap the first word of a passage." Note the seconds, and whether it's faster the second time (the model is cached).
5. **Zoom:** pinch in and out, and drag. It should be smooth, the word between your fingers should stay put, the page itself mustn't zoom, and text should be sharp at high zoom.
6. **Two taps:** tap the first word of a passage (blue box). Tap the last word on a later line (yellow on each line). Check the panel text against the page.
7. **Selection variations:**
   - Select a passage last word first.
   - Start a new selection straight away.
   - Tap two words quickly: it should select, not zoom.
   - Tap the margin: nothing should change.
8. **Rotate:** photograph a page sideways, tap ⟳ until it's upright, then select.
9. **Copy:** copy, then paste into another app (e.g. Samsung Notes).
10. **Edit and save:**
    - Tap **Add Quote**.
    - Check that the keyboard doesn't hide **Save quote** while you edit the text.
    - Fix a word, add the author and source, choose a tag, and save.
    - You should be back on the same photo at the same zoom, with the passage in green.
11. **Second passage:** select another passage. Author and source should already be filled in. Save.
12. **Q Library:** both quotes should appear with the right text, author, source and tags. Delete the test quotes.
13. **Landscape:** turn the phone sideways and repeat steps 5–6 once.
14. **After a deploy is approved:** repeat steps 1–7 in the installed PWA.

**Please send back:**

- Phone model and Chrome version.
- The OCR time from step 4 (first use and second use).
- Any taps that picked the wrong word, and at what zoom.
- Any passage where the word order was wrong.
- Screenshots of anything that looked off.

---

## 9. Recommended follow-up work

1. **Fix whatever the Samsung run finds** before adding features.
2. **Sentence and paragraph quick-expand chips,** from the approved Sprint 2A proposal: one tap grows the selection to the full sentence or paragraph.
3. **Drag handles for fine adjustment,** only if the Samsung test shows re-tapping is a real problem.
4. **Keep OCR results** when a photo is closed and reopened in the same session, and **save offline** with a "pending" indicator instead of a long "Saving…".
5. **Accessibility:** keyboard word navigation (arrow keys plus Enter for start and end), or a "select from text" list.
6. **Shadow-correction A/B benchmark** in the OCR Lab (§6).
7. **Decide the OCR Lab's future** now that SmartScan uses the same engine: keep it as a diagnostics tool or retire it.
8. **Pencil-underline suggestions:** a separate sprint, benchmarked first, as planned.

---

## 10. Git

- **Branch:** `feature/smartscan-two-tap-selection`, from `main` @ `e3d360c`.
- **Commits:**
  1. `31fd5e4` `feat(smartscan): two-tap passage selection workspace (Sprint 2A)`
  2. `test(e2e): add reusable SmartScan browser test harness`
- **Not committed:** `public/ocr/` (generated at build time and by the browser harness, gitignored).
- **Not merged, pushed or deployed.** Awaiting the project lead's merge, then Samsung acceptance testing (§8).

---

## 11. QA follow-up: browser harness added (2026-11-12)

cipherMuse asked for the browser checks to be kept in the repository so they can be re-run in future sprints.

### What was added

- **`tests/e2e/`**, run with **`npm run test:e2e`**. It's self-contained: it starts its own mocked dev server and a headless Chrome with a throwaway profile, runs every check, prints `PASS`/`FAIL` per check, and shuts both down again.
  - It exits with code 0 only if every check passes.
  - Verified after a run: the port was released, no Chrome processes were left behind, and the temporary profile was deleted.
- **`tests/e2e/README.md`** covers requirements (Node 22+, Chrome, optional `CHROME_PATH`, `E2E_PORT`, `E2E_CDP_PORT`), the safety model, the list of checks, and how to add one.
- **No new dependencies.** The Chrome driver uses Node's built-in `WebSocket`.
- **Fresh checkouts work.** The harness reuses the app's OCR-assets plugin, so `public/ocr/` is prepared automatically. I verified this by moving `public/ocr/` aside and starting the server: the worker and both models were recreated from the local model cache and served.
- **ESLint now covers the harness.** The project config only matched `*.js`/`*.jsx`, so the harness's `.mjs` files weren't being linted. They now are, with Node globals (0 problems).

### Firebase stays mocked, and production data can't be touched

- `firebase/app`, `firebase/auth` and `firebase/firestore` are aliased to in-memory mocks. Every write is recorded in the page and lost when the browser closes.
- The test server reads **no `.env`** (`envDir` is `tests/e2e/`), so the real Firebase configuration never reaches the page. Before, the scratch version still loaded `.env` values, although the mocks ignored them.
- **New check (51st):** the run fails if any request reaches a Firebase or Google API host. The existing Google Fonts stylesheet is the only allowed outside request.
- Test photos are the benchmark's synthetic pages. No real book images are used or stored.

### Final results (re-run after all changes, actual)

| Check | Result |
|---|---|
| `npm run lint` | **Passes** (0 problems; now includes `tests/e2e/*.mjs`) |
| `npm test` | **70/70** (17 suites, about 2 s) |
| `npm run test:e2e` | **51/51**, exit code 0 (OCR ready in 2.3 s on desktop; pinch drift 0.0 px; selection after rotation exact) |
| `npm run build` | **Passes.** Main bundle 855.5 KB (231.6 KB gzipped), precache 10 entries. Unchanged from §5 |
| `npm audit` | 27, unchanged (no dependency changes) |

The app code is unchanged since `31fd5e4`. This follow-up only adds test tooling, docs and lint config.

### Still required

Physical Samsung acceptance testing (§8) remains the gate. The browser harness emulates touch and runs desktop-speed OCR. It can't replace real fingers, the real camera, phone OCR speed, or the on-screen keyboard.
