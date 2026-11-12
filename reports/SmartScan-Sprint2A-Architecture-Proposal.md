# SmartScan Sprint 2A: Architecture and UX Proposal

**Project:** QuoteKeeper · **Feature:** SmartScan · **Lead Engineer:** CODI (Claude Code)
**Date:** 2026-11-11 · **Status:** Proposal for project-lead and cipherMuse review. Not implemented.
**Repo state at writing:** `main` = `origin/main` = `bc576bd` (includes Sprint 1.1). The `egpennington/quoteKeeper` GitHub repo is **public**, which matters for test photos (see Testing).

Recommendation: build Sprint 2A as one full-screen photo workspace. The photo and an OCR word layer share a single coordinate system, and the OCR runs locally with Tesseract.js. Before any UI work, a 1–2 day benchmark on the project lead's Samsung phone should confirm OCR speed and accuracy.

---

## 1. What the current code gives us

- **Workflow model:** `scanReducer` already has slots reserved for the next stages. The camera, upload and validation code carries over unchanged, and so does the full-screen camera layout pattern from Sprint 1.1.
- **Original photo:** the full-resolution `File` is already held in memory. Its width and height are known after it loads.
- **Header:** `App.jsx` always renders the email and Sign out header. Hiding it for SmartScan is a one-line condition (`view !== 'scan'`). Sign-in stays active because `onAuthStateChanged` runs higher up.
- **Saving:** `QuoteForm` writes `{quote, author, source, tags, notes, createdAt}` with `addDoc` to `quotes`. There is no user ID field, so all quotes share one collection. `TagSelect` and `tags.js` can be reused for review.
- **No test runner** in the project yet (lint only).

## 2. OCR technology

**Recommendation: Tesseract.js (Apache-2.0), with its files hosted inside the app.**

| Option | On device | Word positions | Photo accuracy | Effort | Verdict |
|---|---|---|---|---|---|
| **Tesseract.js** | Yes (WebAssembly in a Web Worker) | Yes: page → block → paragraph → line → word, each with a box and confidence | Good on flat, well-lit pages. Weaker on curved pages near the spine | Low | **Recommended**, subject to the benchmark |
| PaddleOCR via ONNX Runtime Web | Yes | Yes, including tilted boxes | Better on photos | High (separate text-finding and text-reading steps; we'd build reading order ourselves) | Fallback if Tesseract fails the benchmark |
| Browser text detection API | Partly | Yes | n/a | n/a | Not available in Android Chrome. Rejected |
| Cloud OCR (Google Vision etc.) | **No** | Yes | Best | Low | Breaks the "stays on the device" rule. Rejected |

**Expectation to set now:** Samsung Gallery uses neural OCR built into the phone. Tesseract will make more mistakes on curved, angled or dim pages. The design treats OCR text as a draft: the user selects on the photo, then edits on the review screen.

**Hosting:**

- **Self-host the OCR files.** Tesseract.js normally downloads its worker, its WebAssembly engine and the English language data from a CDN. We'd serve all three from `/public/ocr/` instead, so nothing goes to a third party.
- **Download size:** English language data is about 2–4 MB (fast model) or about 11 MB (best model). The engine is about 3–5 MB. We'd pick the model in the benchmark.
- **Offline and install size:** these files would be cached on first use (a Workbox runtime-caching rule in `vite.config.js`), not added to the PWA install bundle. The install stays small, and OCR works offline after the first use.
- **Loading:** the OCR code is loaded only when it's needed (`import()`), so the main bundle doesn't grow.

## 3. Coordinate design (main alignment safeguard)

**There is one source of truth: positions in pixels of the upright photo at full resolution** (`imageSpace`).

- **Loading:** decode once with the photo's EXIF orientation applied (`createImageBitmap`, `imageOrientation: 'from-image'`). The resulting width and height define `imageSpace`. All later steps use this upright version.
- **OCR input:** a scaled-down copy (long edge about 2000–2500 px, chosen in the benchmark). Word boxes are multiplied back up by the exact scale factor (`origW / workW`) and stored in `imageSpace`. The full-resolution original is never re-encoded or reduced, and stays available for re-reading a region at full detail later.
- **Rotation:** 90° steps that correct the page's orientation before OCR, so OCR always sees text the right way up. Rotating after OCR either re-runs OCR or converts the stored boxes with an exact 90° formula. Small-angle straightening is deferred to later.
- **Display:** a single transform (one `DOMMatrix`: zoom, pan, rotation) is applied to one container holding both the `<img>` and an `<svg>` overlay. The overlay's coordinate grid is set to the full image size (`viewBox="0 0 W H"`).
  - **Why this matters:** the photo and the highlights move together by construction. Zoom, pan and rotation can't push them out of line, because neither is ever positioned on its own.
  - **No `object-fit`:** "fit to screen" is just the starting zoom, so there's no letterboxing math.
- **Touch input:** a touch point on screen is converted to an image position with the inverse of that same transform, then matched to the nearest word box (with an expanded touch target).

Every conversion between spaces is a small, testable pure function (`coords.js`).

## 4. Components and state

```
SmartScan (full-screen shell, App header hidden)
├─ CaptureStage     ← Sprint 1 picker / camera (kept)
├─ Workspace        ← main photo surface
│   ├─ ImageViewport   (gestures → view transform)
│   │   ├─ <img> original photo
│   │   └─ WordOverlay (SVG: word boxes, selection, saved passages, handles)
│   ├─ TopBar          (Back · step · rotate · text view)
│   └─ ActionBar       (OCR progress · Add passage · passage count · Review)
├─ TextView         ← fallback/accessible: lines with checkboxes + editable text
└─ ReviewStage      ← edit passages, author/source/tags/notes, Save all

src/components/smartscan/ocr/
  ocrEngine.js   lazy worker, self-hosted paths, progress, cancel, shut down
  ocrModel.js    Tesseract output → { words[], lines[], paragraphs[] } in imageSpace
  coords.js      image ↔ view ↔ screen conversions, rotation (pure)
  selection.js   ranges, sentence/paragraph expansion, text joining (pure)
src/services/quotes.js   saveQuote()/saveQuotes(), the existing document shape
```

**State additions to `scanReducer`:**

| Key | Contents |
|---|---|
| `stage` | `source`, `camera`, `workspace`, `review` |
| `ocr` | `{status: idle/loading/recognizing/done/error, progress, result}` |
| `orientation` | 0, 90, 180 or 270 |
| `selection` | `{start, end}`: positions in reading order, or `null` |
| `passages` | `[{id, wordRange, text, edited}]` |
| `meta` | `{author, source, tags, notes}`, shared by all passages, with optional per-passage notes |

Zoom and pan live in a ref inside `ImageViewport`, not React state, so gestures don't re-render the app 60 times a second.

## 5. Interaction model

**Gestures:**

| Gesture | Action |
|---|---|
| Pinch | Zoom |
| One-finger drag | Pan |
| Double-tap | Zoom in/out |
| Long-press a word | Select that word, with two handles |
| Drag a handle | Extend the selection word by word in reading order, across lines, like phone text selection |
| Tap outside | Clear the selection |

**Quick-expand chips** appear after a selection: **Sentence** (extends to the punctuation on each side) and **Paragraph** (uses Tesseract's paragraph grouping).

**Collecting passages:**

- **Add passage** saves the current selection. It stays highlighted in a separate color, and the action bar shows "3 passages".
- Tapping a saved passage selects it so it can be edited or removed.

**Joining the text:**

- Join words with spaces.
- Remove line-end hyphens before joining ("inter-" + "esting" → "interesting").
- Normalize curly quotes and dashes.
- Low-confidence words get a dotted underline, so the user knows to check them on review.

**Built-in browser behavior to turn off on the workspace:** `touch-action: none`, `user-select: none`, `overscroll-behavior: none` (stops pull-to-refresh), and the long-press context menu. Background scrolling is locked, as in Sprint 1.1.

**Android back gesture:** the app has no router, so today a back gesture leaves QuoteKeeper and would throw away the user's passages. Opening SmartScan would add a browser history entry (`pushState`), and back would then step through the stages (review → workspace → capture). If there are unsaved passages, it would ask before leaving.

**Accessibility:**

- Buttons duplicate every gesture: zoom −/+, fit, rotate.
- **TextView** is the accessible and fallback path. It lists the recognized lines with checkboxes for choosing passages and editable text.
- Progress and status updates are announced to screen readers (live regions).
- Touch targets are at least 44 px.

## 6. Performance

- **Size of the OCR input:** this is the main control. A 12 MP photo (4000×3000) takes roughly 10–30 s on a mid-range phone. At a long edge of about 2000 px it's roughly a quarter of the pixels and a few seconds. Book print stays readable at that size; the benchmark confirms it.
- **Off the main thread:** OCR runs in a Web Worker, so the UI keeps responding. OCR starts automatically on entering the workspace, and the user can zoom and inspect while it runs. Cancel is supported.
- **Memory:**
  - A decoded 12 MP image is about 48 MB, and the OCR engine adds roughly 100 MB or more.
  - Only one decoded copy is kept, and the scaled-down copy is freed after OCR.
  - The worker is shut down when leaving SmartScan.
  - iOS Safari has a canvas size limit (about 16.7 MP) that a full-size canvas could hit; scaling down avoids it.
- **Rendering:** the photo is a GPU-scaled `<img>`, and only the transform changes during gestures (`will-change: transform`). The overlay draws about 300–600 SVG boxes per page, which is fine. Selection updates touch only the affected boxes.
- **First run:** a one-time 5–15 MB download for the OCR files, with a visible "Preparing text recognition…" progress message. After that they load from cache.
- **Budgets to confirm in the benchmark (proposed):**
  - Workspace interactive in under 1 s.
  - OCR under 8 s per page on the target phone.
  - Gestures at 60 fps.
  - No tab crashes across 10 scans in a row.

## 7. Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | **Mobile OCR too slow or crashes the tab from memory** | Medium / High | Smaller OCR input, worker, shutting the worker down, benchmark gate first, PaddleOCR as fallback |
| 2 | **Accuracy on real photos**: curve near the spine, angled shots, shadows, small print. **Underlines crossing letter tails** may cause misreads | High / Medium | Capture tips, page-orientation step, low-confidence underlining, editable review, full-resolution re-read of a region (2B+) |
| 3 | **Highlights out of line with text** (EXIF orientation, scale factor, rotation, screen pixel density) | Medium / High | One `imageSpace`; image and overlay share a single transform; EXIF applied once at load; property tests on every conversion; overlap tests on synthetic pages |
| 4 | **Wrong reading order**: running heads, page numbers, footnotes, two columns | Medium / Medium | Selection follows Tesseract's block/line order; handles can't cross blocks unexpectedly; running heads can be excluded |
| 5 | **Gesture conflicts** (long-press vs pan vs handle drag; browser zoom, pull-to-refresh, back gesture) | Medium / Medium | A small pointer-handling state machine with clear rules; built-in behaviors disabled; history handling |
| 6 | **Tilted lines get straight boxes that overlap neighboring lines** | Medium / Low | Highlight word by word; match touches by nearest word center; straightening deferred |
| 7 | **Install size or offline breakage** | Low / Medium | Cache OCR files at runtime instead of bundling them; clear offline message on first use |
| 8 | **Copyright of test photos in a public repo** | High if ignored | Keep real book-page photos local and out of git; use generated pages for automated tests |
| 9 | **Phones still getting the live camera** (see Sprint 1.1) | Known | Phone-camera-app photos are better OCR input. Decision needed (below) |

## 8. Testing strategy

1. **Unit tests (Vitest, development-only dependency):**
   - Coordinate conversions: round trips at every rotation, zoom and pan, and the scale-up from the OCR copy.
   - Selection logic.
   - Sentence and paragraph expansion.
   - Hyphen joining.
   - Conversion of Tesseract output.
2. **Alignment tests (Playwright):**
   - Generate pages with text at known positions, run the real OCR, and check that the boxes overlap the known positions (IoU of at least 0.7).
   - Repeat after rotation and at several zoom levels.
   - Simulate touches and check that the right word is chosen.
3. **Flow tests:** the full capture → OCR → select → add → review → save flow, with Firestore stubbed. Plus layout checks at phone, landscape, tablet and desktop sizes, as in Sprint 1.1.
4. **Accuracy and speed set (local only):**
   - About 15 of the project lead's underlined-page photos, with the correct text typed in.
   - Measure word accuracy and OCR time at each candidate input size on the Samsung phone, using Chrome's remote debugging (`chrome://inspect`).
5. **Real-device checklist each sprint:** Android Chrome, the installed PWA, and iOS Safari if available, always reported separately from simulated results.

## 9. Proposed phasing

- **2A-0 benchmark (1–2 days, go/no-go):**
  - Tesseract.js on the project lead's photos on the target phone, at 1600, 2000 and 2500 px.
  - Fast vs best English model.
  - Report time, memory and accuracy, then decide on the engine.
- **2A:**
  - Full-screen shell with the header hidden.
  - `ImageViewport` with zoom, pan and rotate, plus the coordinate module and its tests.
  - OCR integration with progress and cancel.
  - Word overlay with single selection and handles.
  - TextView fallback.
  - Back-gesture handling.
- **2B:** multiple passages, sentence and paragraph chips, the review screen, the `saveQuotes()` batch write, and the manual form switched to the same helper with its behavior unchanged.
- **2C (research):** underline detection to pre-select passages, full-resolution re-reading of regions, straightening and perspective correction.

## 10. Decisions needed

1. **OCR engine:** Tesseract.js, decided after the benchmark, with PaddleOCR/ONNX as the fallback. *(Recommended.)*
2. **Self-host and runtime-cache the OCR files** instead of using a CDN. *(Recommended.)*
3. **New dependencies:**
   - `tesseract.js` (runtime).
   - Vitest and Playwright (development only).
   - Gesture handling: custom pointer code, or `@use-gesture/react` (MIT, small). Custom code keeps full control of the coordinate math. *(Custom recommended.)*
4. **Firestore document shape:** keep it exactly as it is. Should SmartScan add a field such as `origin: 'smartscan'`? It's a small schema change, so it needs project-lead approval.
5. **Author, source and tags:** shared by all passages from one page, with per-passage overrides? *(Recommended.)*
6. **Phones defaulting to their camera app** (better OCR input) versus the live camera that was seen in testing.
7. **Approval of the 2A-0 benchmark as the first step.**
