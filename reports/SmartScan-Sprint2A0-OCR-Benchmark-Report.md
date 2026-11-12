# SmartScan Sprint 2A-0: OCR Benchmark Report

**Project:** QuoteKeeper · **Feature:** SmartScan · **Lead Engineer:** CODI (Claude Code)
**Date:** 2026-11-12 · **Branch:** `bench/smartscan-ocr-2a0` (from `main` @ `bc576bd`)
**Status:** Desktop benchmark complete. **Samsung phone measurements pending** (instructions in §7).

---

## 1. Decision

**Conditional GO for Tesseract.js 7.0.0, on device, with the `best_int` model at 2000 px as the provisional default.**

- **Proven on desktop:**
  - Word boxes map back to the full-resolution photo with sub-pixel accuracy.
  - The output format needed for selecting words on the photo is confirmed.
  - First-use download is about 4 MB.
  - Accuracy is near-perfect on clean, underlined, small-text and low-light synthetic pages, and about 5–6% character error on the combined "hard" page.
- **Not yet proven:** phone speed, phone memory, and accuracy on real book photos. Desktop CPU throttling turned out not to affect the OCR worker, so emulated phone timings are not valid (§5.4). These numbers must come from the Samsung run.
- **The final GO or NO-GO is decided by the Samsung run against the criteria in §8.**

**Do not use `best` (full-precision tessdata_best).** It crashes on the SIMD engine build every modern phone uses. On the non-SIMD build it runs 6–8× slower than `best_int` for no meaningful accuracy gain.

## 2. What was built

A standalone benchmark page, kept separate from the app:

| File | Purpose |
|---|---|
| `benchmark/ocr/index.html`, `bench.js` | Benchmark UI and runner (plain JS, phone-friendly) |
| `benchmark/ocr/samples.js` | Synthetic 12 MP page generator with exact ground-truth text and word boxes |
| `benchmark/ocr/metrics.js` | CER/WER (partial-passage aware) and bounding-box metrics |
| `benchmark/ocr/prepare-assets.mjs` | Copies the engine from `node_modules`; downloads models with SHA-256 checks |
| `benchmark/ocr/vite.config.js` | Separate build and serve config (localhost only) |

**Other changes:**

- **Packages:** `tesseract.js@7.0.0` added as an exact-pinned dev dependency.
- **npm scripts:** `bench:ocr:prepare` and `bench:ocr`.
- **`.gitignore`:** ignores models, build output, photos and results.
- **`eslint.config.js`:** ignores the generated and vendored benchmark output (one line).

**Not changed:** app source, `vite.config.js`, PWA config, Firestore schema or data, and existing SmartScan features. The app build is unchanged (7 precache entries, 850 KB) and contains no Tesseract code.

**Privacy and security:**

- Everything runs in the browser. Photos are read from memory and never uploaded.
- The worker, engine and models are served from the local machine. All 9 requests in an automated run stayed on the local server, none to any third party.
- Exported results contain **numbers only**: no images, no filenames (photos are relabeled "Photo 1, 2…"), and no recognized or ground-truth text. Automated checks verified this.
- Real photos and results are gitignored. Synthetic pages use original prose written for this benchmark.

## 3. Method

**Engine:** Tesseract.js 7.0.0, LSTM-only engine (`oem 1`), default page segmentation, one Web Worker. Model caching is turned off (`cacheMethod: 'none'`), so every load is a true first-use load.

**Models:**

| Id | Source | Download (gzipped) |
|---|---|---|
| `fast` | tessdata_fast `eng` | 1.96 MB |
| `best_int` | tessdata_best, integer-compressed (Tesseract.js default) | 2.95 MB |
| `best` | tessdata_best, full precision | 12.8 MB |

**Input sizes:** the photo is scaled down to a long edge of 1600, 2000 or 2500 px for OCR (plus 1200 px as a diagnostic). It is never scaled up. **The original photo is never changed.** OCR word boxes are scaled back to original-photo pixels before scoring.

**Samples:** six synthetic 3024×4032 JPEG "phone photos" (12 MP), each about 280 words (589 for small text), with known word positions:

| Sample | Conditions |
|---|---|
| clean | 11 pt, even light |
| underline | 11 pt, pencil underlines crossing the letter tails, uneven pressure |
| curved | Page curving near the spine, 1.5° tilt, spine shadow, underlines |
| small | 7.5 pt text, underlines |
| lowlight | Uneven dim light, sensor noise, slight blur, lower contrast, underlines |
| hard | 8.5 pt, curve, 2° tilt, dim light, noise, blur, underlines |

**Metrics:**

| Metric | Meaning |
|---|---|
| CER / WER | Character and word error rate after normalizing typography. Partial ground truth is allowed, so a typed underlined passage can be scored against a full page of OCR |
| Center hit | Share of real words whose center falls inside the matched OCR box. This is what tap-to-select needs |
| Box hit | Share of real words matched by an OCR box with overlap (IoU) of at least 0.5 |
| Offset (dx/dy) | Median center offset in original-photo pixels; reveals a coordinate-mapping bug |
| Timing | Decode, prepare (scale and encode), recognize, and cold worker plus model load |

**Desktop environment:** headless Chrome 156 on Windows 11, 12 logical cores, 16 GB RAM, WebAssembly SIMD available. OCR runs on one worker thread, so effectively one core.

## 4. Output configuration (requirement 4: confirmed for 7.0.0)

```js
const worker = await createWorker('eng', 1 /* LSTM only */, {
  workerPath: '<self-hosted>/worker.min.js',
  corePath:   '<self-hosted>/core',          // directory: Tesseract picks the SIMD / non-SIMD build
  langPath:   '<self-hosted>/models/best_int', // expects eng.traineddata.gz
  gzip: true,
  cacheMethod: 'none',                         // benchmark only; production should cache (see §9)
});
const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
// data.blocks[].paragraphs[].lines[].words[] → { text, confidence, bbox:{x0,y0,x1,y1}, symbols[] }
// lines also provide baseline and rowAttributes
```

- **By default, 7.0.0 returns only `text`.** `blocks: true` is required to get word boxes.
- **Boxes come back in OCR-input pixels.** Scaling by `original / input` maps them to original-photo pixels. This was verified (see §5.2).
- **`corePath` must be the directory, not a single file**, so each device gets the right engine build.

## 5. Desktop results (synthetic pages; not phone measurements)

### 5.1 Model × size summary (6 pages each)

| Model | Size | Median recognize | Max recognize | Median CER | Median WER | Center hit | Box hit | Cold load |
|---|---|---|---|---|---|---|---|---|
| fast | 1600 | 1.33 s | 1.96 s | 0.06% | 0.36% | 99.2% | 95.1% | 0.32 s |
| fast | 2000 | 1.46 s | 2.19 s | 0.03% | 0.00% | 99.0% | 96.7% | 0.32 s |
| fast | 2500 | 1.93 s | 2.73 s | 0.03% | 0.00% | 99.1% | 97.1% | 0.32 s |
| **best_int** | 1600 | 1.76 s | 2.99 s | 0.01% | 0.00% | 99.96% | 96.2% | 0.20 s |
| **best_int** | **2000** | **1.89 s** | **3.24 s** | **0.00%** | **0.00%** | **99.96%** | **97.7%** | 0.20 s |
| best_int | 2500 | 2.31 s | 3.68 s | 0.01% | 0.00% | 99.9% | 98.0% | 0.20 s |
| best | any | **crash** on SIMD build: `Aborted(missing function: DotProductSSE)` | | | | | | |
| best (forced non-SIMD) | 2000 | 11.9 s (clean) / 22.2 s (hard) | | 0% / 5.34% | 0% / 10.5% | 100% / 99.8% | | 0.63 s |

Scaling and encoding the OCR input took 0.08–0.23 s. Decoding the 12 MP photo is measured separately per sample.

### 5.2 Per-condition highlights

| Page | fast @2000 CER / WER | best_int @2000 CER / WER | Mean confidence | Center hit |
|---|---|---|---|---|
| clean | 0% / 0% | 0% / 0% | 96 | 98.9% / 100% |
| underline | 0.07% / 0% | 0% / 0% | 94–96 | 98.9% / 100% |
| curved + tilt | 0.80% / 1.07% | 0.53% / 0.36% | 94 | 99.6% / 100% |
| small 7.5 pt | 0% / 0% | 0% / 0% | 96 | 98.8% / 100% |
| low light | 0% / 0% | 0% / 0% | 94–95 | 98.9% / 100% |
| **hard (combined)** | **5.60% / 9.45%** | **5.83% / 10.88%** | **85** | 99.0% / 99.8% |

- **Coordinate mapping is correct.** In every successful run, the median box-center offset was **0.5 px or less** on the 3024×4032 original, with median overlap (IoU) of 0.86–0.97. There's no systematic offset, so the scale-back approach in the architecture proposal works.
- **Pencil underlines did not hurt synthetic accuracy**, even crossing the letter tails.
- **Curved and tilted pages make boxes looser,** because Tesseract's boxes are always axis-aligned (box hit at 1600 px is about 86%). Taps still land: center hit stays at 99.3% or higher.
- **Confidence tracks difficulty** (about 85 on the hard page vs about 95 elsewhere). It's usable for flagging words to check during review.
- **On the hard page, `best_int` was no more accurate than `fast`.** Its advantage is a near-100% center hit on easier pages.

### 5.3 Floor at 1200 px (diagnostic)

| Model @1200 | curved CER / box hit | small CER | hard CER | Recognize time |
|---|---|---|---|---|
| fast | 1.26% / 82.9% | 0.16% | 4.77% | 0.9–1.4 s |
| best_int | 0.66% / 85.1% | 0.16% | 6.14% | 2.7–5.6 s |

Errors start rising at 1200 px, and `best_int` gets *slower* on small or hard text at that size. **Treat 1600 px as the floor.**

### 5.4 Emulated phone speed: not valid

Chrome's CPU throttle (4×) slowed only the main thread: preparing the input went from 151 to 553 ms. Recognition in the worker was unaffected (1565 vs 1575 ms). **So there are no emulated phone OCR timings in this report.**

A rough expectation, *not a measurement*, from typical single-core performance: a recent flagship might be 1.5–3× slower than this desktop, and a mid-range phone 3–5× slower. That would put `best_int` @2000 at roughly 3–10 s per page. This must be confirmed on the Samsung phone.

### 5.5 Download size (first use)

Measured on the wire from the local static server with compression, which is comparable to Firebase Hosting:

| Asset | Size |
|---|---|
| Worker | 0.03 MB |
| Engine (SIMD-LSTM build) | 1.46 MB |
| fast model | 1.96 MB |
| best_int model | 2.95 MB |
| best model | 12.8 MB |
| **First-use total** | **fast ≈ 3.5 MB · best_int ≈ 4.4 MB · best ≈ 14.3 MB** |

At about 10 Mbps (typical 4G), `best_int` takes roughly 4 s on first use. Desktop download times over localhost aren't meaningful; the phone run measures its own.

### 5.6 Memory

- **Main-thread JS heap:** 3–20 MB during runs.
- **OCR worker memory can't be measured from the page.** `performance.memory` covers only the main thread, and per-worker measurement requires cross-origin isolation headers, which were deliberately not added.
- **No failures on desktop** across 49 successful OCR runs (36 matrix runs plus 13 diagnostic and smoke runs). The only failures were the 18 `best` runs on the SIMD build, caused by a missing engine function, not memory.
- **Crash detection for the phone:** a "pending run" marker is saved before each run. If the tab dies, for example from running out of memory, the next load names the exact model, sample and size and records it as a failure. This was verified in automated tests.

## 6. Verification of the benchmark tool

**Automated:**

- `npm run lint` passes.
- `npm run build` (app) passes and is unchanged.
- The benchmark builds.

**UI checks: 12/12 pass** in mobile emulation (412×915, touch). Functional only, not performance:

- Crash-marker recovery.
- No horizontal scrolling.
- The download check passes.
- Photo upload with tags and typed ground truth gives a CER.
- The export contains no text, filenames or image data.
- Copy and download of results work.
- `best` is unchecked by default.
- No page errors.

**Not done:** any run on a physical phone. Everything in §5 is desktop or synthetic.

## 7. How to run it on the Samsung phone (secure, USB, nothing exposed on Wi-Fi)

**One-time setup on the phone:**

1. **Settings → About phone → Software information → tap Build number 7 times** to enable Developer options.
2. **Settings → Developer options → USB debugging: On.**
3. Connect the phone to the PC by USB and accept the "Allow USB debugging?" prompt.

**On the PC** (in `C:\Users\egpen\dev\quoteKeeper`, on the benchmark branch):

```bash
npm run bench:ocr:prepare   # once: copies the engine, downloads and verifies the models (~18 MB)
npm run bench:ocr           # builds and serves on http://127.0.0.1:5174 (localhost only); Ctrl+C to stop
```

**Connect the phone to the benchmark:**

1. In desktop Chrome, open `chrome://inspect/#devices` and click **Port forwarding…**.
2. Add **port `5174` → `localhost:5174`**, tick **Enable port forwarding**, and click **Done**. The phone should appear in the device list.
3. **On the phone, in Chrome** (not Samsung Internet; port forwarding is a Chrome feature), open **`http://localhost:5174/`**.
4. Because it's `localhost`, the page counts as secure, and nothing is reachable from your Wi-Fi network.

**Run it:**

1. Keep the phone plugged in, set the screen timeout to 10 minutes or more, and close other apps.
2. Tap **Run download check**. This measures model download times over the forwarding link; the sizes are the real numbers.
3. **Synthetic pass:**
   - Tap **Generate 6 synthetic pages**.
   - Leave **fast + best_int** and **1600 / 2000 / 2500** selected.
   - Tap **Run benchmark**. That's 36 runs, likely 5–15 minutes.
4. **Real-photo pass:**
   - Tap **Clear results**, then **Add book photos…**, and pick 6–10 photos from the Gallery.
   - Cover pencil underlines, curved pages near the spine, small text (footnotes) and dim or uneven light.
   - Use the camera's normal mode, ideally full resolution, including at least one 50 MP photo if the phone supports it, as a memory test.
   - **Tag each photo**, and optionally type the exact text of its underlined passage. The text is used for scoring and is never exported.
   - Tap **Run benchmark**.
5. After each pass, tap **Download results** or **Copy results**.
   - Send me the JSON by pasting it, or save it to `benchmark/ocr/results/` (gitignored).
   - It contains only numbers and your device details.
6. If the page reloads mid-run, reopen it. The red banner names the run that crashed; still export the results.
7. **Optional memory view:** in `chrome://inspect`, click **inspect** under the phone tab to open DevTools. The Performance Monitor shows memory while it runs.

**Fallback without USB:** not recommended. It means serving over home Wi-Fi with `--host`, which exposes a development server to the local network, and the page is then not a secure context (Copy would be disabled; use Download). If you need it, ask me first and I'll walk you through it.

## 8. Final gate criteria (to be applied to the Samsung results)

| Criterion | GO | Needs tuning | NO-GO (evaluate PaddleOCR / ONNX) |
|---|---|---|---|
| Median recognize time, chosen setup, real photos | ≤ 8 s | 8–15 s → try `fast` and/or 1600 px | > 15 s even with `fast` @1600 |
| Worst-case recognize time | ≤ 15 s | ≤ 25 s | > 25 s |
| Tab crashes (any photo, including 50 MP) | 0 | Only on 50 MP photos → shrink before decoding | Crashes on normal 12 MP photos |
| Underlined-passage WER, real photos (median) | ≤ 10% | 10–20% → better capture guidance, partial re-OCR | > 20% |
| Synthetic center hit on the phone | ≥ 98% | 95–98% | < 95% (alignment problem) |
| First-use download | ≤ 5 MB | ≤ 8 MB | n/a |

## 9. Recommendations for Sprint 2A (once approved)

1. **Engine:** Tesseract.js 7.0.0, moved to `dependencies`, self-hosted exactly as the benchmark does (worker, engine directory, models). No CDN.
2. **Model:** `best_int` @2000 px provisionally. Switch to `fast` (about 25% faster, 1 MB smaller) if the phone misses the time budget. Never `best`.
3. **Input size:** 2000 px by default, 1600 px as the floor. Never re-encode or reduce the stored original. Scale boxes back with the exact factor, as validated here.
4. **Caching:** in production, cache the model and engine after first use (Tesseract's IndexedDB cache or a Workbox runtime cache) so the about 4 MB download happens once. Keep them out of the PWA install bundle.
5. **Startup:** create the OCR worker as soon as a photo is accepted, so loading overlaps with the user looking at the photo. Shut the worker down when leaving SmartScan.
6. **Review flags:** highlight words below about 70 confidence on the review screen. Plan full-resolution re-reading of a region for low-confidence areas in 2B or later.
7. **Box handling:** use center-in-box hit testing (99%+ reliable here) rather than box overlap, because boxes on curved or tilted lines are loose.
8. **Keep the benchmark** on its branch, or merge it as a dev-only tool, to re-run on real devices after engine or model upgrades.
9. **Phone camera path:** the Sprint 1 decision is still open. Photos from the phone's own camera app (full resolution) should produce better OCR input than the live camera.

## 10. Limitations

- **Synthetic pages probably flatter Tesseract.** Real photos add focus blur, perspective, real page curvature (which also squashes letters), glare, show-through from the other side of the page, and paper texture. Expect real-photo error rates to be higher than §5.
- **All desktop numbers come from a 12-core desktop CPU.** No phone performance was measured, and CPU throttling can't emulate the worker.
- **Synthetic pages use the system serif font**, which differs between Windows and Android, so phone synthetic results won't match exactly.
- **OCR worker memory isn't directly measurable**; failures are detected instead.
- **Only English, single-column pages with default page segmentation were tested.** Two-column layouts and footnote ordering weren't.
- **The `best` crash** is a gap in the Tesseract.js-core 7.0.0 SIMD build (no floating-point SSE dot product). It's moot given its speed.

## 11. Dependencies and security

- **Added:** `tesseract.js@7.0.0` (Apache-2.0, dev dependency, exact pin), plus its dependencies:
  - `tesseract.js-core@7.0.0` (the engine)
  - `bmp-js`, `idb-keyval`, `is-url`, `opencollective-postinstall`, `regenerator-runtime`, `wasm-feature-detect`, `zlibjs`
  - `node-fetch@2`, which is only used under Node.
- **`npm audit`:** **27 before and after**, so no new advisories.
- **Model integrity:** models are downloaded from GitHub (tessdata) and jsDelivr (best_int), each pinned by SHA-256.
- **Exposure:** the benchmark server listens on `127.0.0.1` only, and Vite's preview server avoids the dev-server advisories from Sprint 1.

## 12. Git

- **Branch:** `bench/smartscan-ocr-2a0` from `main` @ `bc576bd`.
- **Commits:**
  1. `docs(reports): add SmartScan Sprint 2A architecture proposal`
  2. `bench(smartscan): Sprint 2A-0 OCR benchmark and report`
- **Not committed:** models, engine copies, build output, photos and results (all gitignored).
- **Not pushed or merged.** Stopped at the benchmark gate, awaiting the Samsung results and project-lead approval.
