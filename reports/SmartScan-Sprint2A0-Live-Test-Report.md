# SmartScan Sprint 2A-0: Live Test (OCR Lab) Report

**Project:** QuoteKeeper · **Feature:** SmartScan · **Lead Engineer:** CODI (Claude Code)
**Date:** 2026-11-12 · **Branch:** `feature/smartscan-ocr-lab` (stacked on `bench/smartscan-ocr-2a0`, from `main` @ `bc576bd`)
**Status:** Built and verified locally (desktop and emulated phone). **Not merged, pushed, or deployed.** Awaiting approval.

---

## 1. Summary

The OCR benchmark is now available inside QuoteKeeper as a temporary **OCR Lab**, so it can be tested in the deployed PWA on the Samsung phone over HTTPS, without USB debugging.

- **Who can open it:** only signed-in accounts whose Firebase **UID** is listed in a new environment variable, `VITE_SMARTSCAN_LAB_UIDS`. If the variable is unset, the lab is off for everyone.
- **How to open it:** at `/#ocr-lab`, or from an **OCR Lab** header button that only allowlisted accounts see. The button is needed because the installed PWA has no address bar.
- **What it does:** take or upload a book photo, then run on-device OCR with the benchmark settings (`best_int` or `fast`, at 1600/2000/2500 px). It shows the **recognized text, processing times, model, and original and OCR-input resolutions**, plus word boxes overlaid on the photo. **Tapping a box reports the word** under it, which checks tap-to-select alignment on the real screen.
- **Privacy:** everything runs on the device. No Firestore reads or writes, and no photo uploads. Exports contain numbers only.
- **Assets:** the OCR worker, engine and models are prepared at build time and deployed with the app under `/ocr/`. They are excluded from the PWA's offline cache, so normal users never download them.
- **Existing features:** unchanged and verified, including sign-in and sign-out, manual entry, the Quote Library, SmartScan, and PWA precaching.

## 2. What changed

### New files

| File | Purpose |
|---|---|
| `src/components/smartscan/lab/OcrLab.jsx` | The lab view |
| `src/components/smartscan/lab/ocrLab.css` | Lab styles (builds on SmartScan's scoped styles) |
| `src/components/smartscan/lab/labAccess.js` | UID allowlist; fails closed |
| `src/components/smartscan/ocr/ocrEngine.js` | Reusable OCR wrapper for Sprint 2A: self-hosted paths, downscaled input, **boxes mapped back to original-photo pixels**, word hit-testing |
| `src/components/smartscan/ocr/metrics.js` | Moved from `benchmark/ocr/` and shared by the lab and the benchmark |
| `scripts/ocr-assets.mjs` | Shared asset preparation (copies the engine, downloads models with SHA-256 checks) and a Vite plugin |

### Modified files

| File | Change |
|---|---|
| `src/App.jsx` | Opens the lab only at `#ocr-lab` for allowlisted users. Loads it on demand (`React.lazy`), so the lab code is a separate file. Adds the OCR Lab header button for allowlisted users only. Other views are unchanged |
| `vite.config.js` | Adds the OCR asset plugin. The PWA precache now ignores `ocr/**` and the lab's code files (`assets/OcrLab-*`) |
| `package.json` / `package-lock.json` | `tesseract.js@7.0.0` moved from dev dependencies to runtime dependencies (exact pin), because app code now imports it |
| `.gitignore` | Adds `public/ocr/` (generated) |
| `eslint.config.js` | Ignores `public/ocr` (vendored, minified) |
| `benchmark/ocr/bench.js`, `prepare-assets.mjs` | Use the shared asset layout and module; the standalone benchmark still works |

**Not changed:** Firestore schema, rules and data; the quote form, library, likes, edit and delete; SmartScan capture and preview; authentication; the PWA manifest.

## 3. How it works

### Access control

```text
signed in?  ──no──▶ login screen (lab unreachable)
   │yes
hash == '#ocr-lab' AND user.uid ∈ VITE_SMARTSCAN_LAB_UIDS ?
   ├─yes─▶ lazy-load OcrLab (header hidden)
   └─no──▶ normal QuoteKeeper (hash ignored, lab code never downloaded)
```

- **The UID is used, not the email.** Vite builds `VITE_*` values into the public JavaScript bundle, and the repo is public. Firebase UIDs aren't secret; the data is protected by Firestore rules, not by hiding the UID.
- **Only the one value is embedded.** `labAccess.js` reads `import.meta.env.VITE_SMARTSCAN_LAB_UIDS` directly. With the variable unset, the build compiles to an empty allowlist (verified in `dist`).
- **This is a client-side gate, not a security boundary.** It hides a test tool that reads and writes no user data. The lab's code file and the `/ocr/` files are ordinary public static files, as they are on any website. They contain no data.

### Assets over HTTPS

- During `vite build` (the same on Netlify and locally), the plugin writes these files to `public/ocr/`, and Vite copies them into `dist/ocr/`:
  - `worker.min.js`
  - `core/tesseract-core-{lstm,simd-lstm,relaxedsimd-lstm}.wasm.js`
  - `models/{best_int,fast}/eng.traineddata.gz`
- **Models are downloaded at build time** from GitHub (tessdata_fast) and jsDelivr (best_int), with **SHA-256 checks**, and cached in `node_modules/.cache/ocr-models`.
- **If the download fails, the production build fails.** Netlify then keeps serving the previous deploy, so a broken lab can't ship. In development it only warns.
- **Sizes:** about 16 MB deployed in `dist/ocr`. What a lab user actually downloads on first use is about 4.4 MB compressed for `best_int` (engine about 1.5 MB plus model about 2.9 MB).
- **PWA precache: still the same 7 app files** (`registerSW.js`, `index.html`, app JS/CSS, two icons, manifest). Normal users get no OCR files.

### On-device processing

- **Photo:** decoded once at **full resolution** with EXIF orientation applied. The original file is never changed or uploaded.
- **OCR input:** a scaled-down PNG copy (never scaled up), recognized in a Web Worker. Word boxes are scaled back to original-photo pixels.
- **Overlay:** an SVG with `viewBox` = the original dimensions, layered exactly over the image. This is the shared-coordinate approach from the approved architecture.
- **Crash detection:** a "pending run" marker is saved before each step. If the tab dies (for example, out of memory on a 50 MP photo), reopening the lab shows a banner naming the model, size and photo resolution.

## 4. Lab features

| Area | Details |
|---|---|
| Photo | **Take Photo** opens the phone's camera app (`capture="environment"`, full resolution). **Upload Photo** accepts JPEG/PNG/WebP up to 60 MB, enough for 50 MP photos |
| Settings | Model: `best_int` (default) or `fast`. Input size: 1600, **2000** (default) or 2500 px. Optional model caching (off by default, to measure first-use load) |
| Run | **Run OCR** (one setting) or **Run all 6** (both models × 3 sizes on the same photo) |
| Output | Recognized text; run table (input resolution, load, OCR and total time, word count, mean confidence, CER); original resolution, file size and decode time |
| Alignment check | Word boxes over the photo (orange = confidence below 70). Tapping a box reports its word, confidence and line |
| Accuracy | Optional: type the underlined passage to get CER/WER. The passage is never exported |
| Export | **Copy results** / **Download results**: device details and per-run numbers only. No text, filenames or images |

## 5. Verification

### Automated checks (actual results)

- `npm run lint`: **passes**.
- `npm run build`: **passes**.
  - Main bundle 855.9 KB (231.6 KB gzipped). That's about 2 KB more than before, for the lazy loader and access check.
  - The lab is a separate 30.8 KB file (12.4 KB gzipped), plus 2 KB of CSS.
  - The precache is the same 7 app files.
  - No Tesseract code in the main bundle.
- `npm audit`: **27**, unchanged.
- Access logic, as pure-function tests: **7/7**. Unset or empty fails closed; trimming; allowed or denied UIDs; no user or empty UID; no partial matches.

### Browser tests (simulated, not a physical device)

These ran in headless Chrome against the **real `App.jsx`**, with Firebase replaced by a mock that records every Firestore call.

**OCR Lab: 40/40**

- **Access:**
  - A non-allowlisted user at `/#ocr-lab` sees normal QuoteKeeper, with no lab entry, and the lab code and `/ocr/` files are never requested.
  - A signed-out user sees the login screen.
  - An allowlisted user without the hash gets the normal app plus the header button, and no lab code is loaded until it's opened.
  - The hash change and the header button both open the lab.
- **Lab flow:**
  - The header is hidden in the lab.
  - A 3000×4000 photo is decoded at full resolution.
  - The defaults are `best_int` @ 2000.
  - Text is recognized correctly, with **0% CER and WER** against the typed passage.
  - The table shows a 1500×2000 input with load, OCR and total times.
  - 29 word boxes are overlaid.
  - **Tapping the widest box reported "underlined", confidence 96, line 4, which matches the OCR text**, and tapping empty margin reports no word.
  - **Run all 6** completes without errors.
- **Privacy:**
  - The export has 7 runs with model, size, resolution and timings, and **no recognized text, passage, filename or image data**.
  - **Zero Firestore writes** (no `addDoc`, `updateDoc` or `deleteDoc`).
  - **No requests leave the app's origin**, except QuoteKeeper's existing Google Fonts stylesheet in `index.html`, which carries no user data.
  - The worker, engine and both models are served from `/ocr/`.
- **Hosting:** OCR works when models are served **as raw `.gz` with no `Content-Encoding`**, as many static hosts do. This was simulated by intercepting the request.
- **Mobile (390×844, touch):**
  - Take Photo uses `capture="environment"`.
  - After a run there's no horizontal scrolling, no off-screen buttons, and no wrapped labels.
  - This caught and fixed a real bug: the runs table widened the page.
- **Crash banner:** names the unfinished run, and the marker is cleared afterwards.
- No page errors.

**Regression suites:**

| Suite | Result | Notes |
|---|---|---|
| Sprint 1 SmartScan | **55/55** | |
| Sprint 1.1 camera, landscape stream | **80/80** | The first attempt printed no output at all; the cause wasn't found, and the rerun passed in full |
| Sprint 1.1 camera, portrait stream | **79/80** | The one failure is the known, pre-existing short-desktop-window case documented in Sprint 1.1 |
| Standalone benchmark | Smoke run OK, **UI checks 12/12** | Both models load with no off-origin requests; results consistent with the earlier report |

### Not tested

- **Netlify itself:** not deployed, per instructions. The raw-`.gz` serving was simulated, and Netlify's real headers and caching are unverified.
- **The Samsung phone or any physical device.**
- **Real Firebase sign-in** (mocked), and the real PWA update cycle after deploy.

## 6. Merge and deploy instructions (after approval)

### Before merging (one-time)

1. **Get your Firebase UID:** Firebase Console → **Authentication → Users**, find your test account, and copy the **User UID**.
2. **Netlify:** Site configuration → **Environment variables** → **Add a variable**:
   - Key: `VITE_SMARTSCAN_LAB_UIDS`
   - Value: your UID (separate several UIDs with commas)
   - Scope: Builds, all deploy contexts.
3. **Check Netlify's build settings:**
   - Build command `npm run build` (or `vite build`; the plugin runs either way)
   - Publish directory `dist`
   - Node 18 or newer
   - Outbound HTTPS to `github.com` and `cdn.jsdelivr.net` (needed for the first build's model download, about 5 MB)
4. **Optional, for local development:** add `VITE_SMARTSCAN_LAB_UIDS=<your UID>` to `.env`. It's already gitignored.

### Merge

```bash
git fetch origin
git switch main
git merge --ff-only origin/main          # main must match origin/main (bc576bd)
git merge --no-ff feature/smartscan-ocr-lab -m "Merge SmartScan Sprint 2A-0 OCR benchmark and OCR Lab"
npm ci
npm run lint && npm run build            # expect: OCR assets ready…, precache 7 entries
git push origin main                     # triggers the Netlify deploy
```

**What the merge brings in:** three commits:

| Commit | Content |
|---|---|
| `3eb0ef8` | Sprint 2A architecture proposal |
| `1a9374b` | OCR benchmark and report |
| *(this branch)* | OCR Lab and this report |

**After the deploy:** check that `https://<your-site>/ocr/worker.min.js` loads in a browser.

### Testing on the Samsung phone

1. Open QuoteKeeper in Chrome, or in the installed PWA, and sign in with the allowlisted account.
   - If **OCR Lab** doesn't appear in the header, the PWA is still on the old version. Close and reopen it (it updates automatically).
2. Tap **OCR Lab**, then **Take Photo** or **Upload Photo**.
3. Tap **Run OCR** (default `best_int` @ 2000), then **Run all 6**.
4. Tap word boxes to check that they line up with the printed words.
5. Repeat for pencil-underlined, curved, small-text and dim-light pages, including one full 50 MP photo as a memory test.
6. For a few photos, type the underlined passage before running, to get accuracy.
7. Tap **Copy results** and paste the JSON back to me. These numbers decide the go/no-go against the gate criteria in `SmartScan-Sprint2A0-OCR-Benchmark-Report.md` §8.

### Disabling or removing the lab later

- **Disable without code:** remove the Netlify variable and redeploy. The lab and its header button disappear.
- **Remove completely** (at the start of Sprint 2A): delete `src/components/smartscan/lab/`, then remove the lab lines in `App.jsx` and the `assets/OcrLab-*` precache ignore. Keep `ocrEngine.js`, `metrics.js` and the asset plugin, which Sprint 2A reuses.

## 7. Security and privacy notes

- **No Firestore access from the lab**, verified with the recording mock. No changes to rules, schema or data.
- **Photos stay on the device:** in memory only, as object URLs released on change or exit. No uploads.
- **No third-party requests** for OCR. Everything comes from QuoteKeeper's own origin over HTTPS.
- **Model integrity:** pinned SHA-256 checksums are verified at every build.
- **Allowlist value:** UIDs (not emails) are embedded in the bundle. They aren't credentials.
- **Dependencies:** `tesseract.js` 7.0.0 (Apache-2.0) is now a runtime dependency, but it loads only in the lab file. `npm audit` is unchanged at 27.

## 8. Known issues and limitations

- **The gate is client-side.** Anyone who knows the lab's file URL can download its code and the public OCR files. That exposes nothing sensitive.
- **The first-use load time** includes the browser's HTTP cache, which may serve the model on repeat runs even with "cache model" off. Netlify's revalidation headers will affect this.
- **About 16 MB is added to each deploy** (three engine builds plus two models). Only lab users download any of it.
- **The first build on Netlify** needs network access to GitHub and jsDelivr. If either is down, the build fails safely, and Netlify keeps the previous deploy.
- **Live camera preview** (Sprint 1.1) isn't used here. Take Photo uses the phone's camera app for full resolution.
- **Desktop test photos are synthetic.** Real accuracy, speed and memory come from the Samsung run.

## 9. Git

- **Branch:** `feature/smartscan-ocr-lab`, stacked on `bench/smartscan-ocr-2a0` (`3eb0ef8`, `1a9374b`), from `main` @ `bc576bd`.
- **Commit:** `feat(smartscan): access-controlled OCR Lab for live Sprint 2A-0 testing`
- **Not committed:** `public/ocr/` and the benchmark's generated output (gitignored).
- **Not merged, pushed or deployed.** Awaiting project-lead approval.
