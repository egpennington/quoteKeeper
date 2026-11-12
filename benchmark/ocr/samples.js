// Synthetic "phone photo of a book page" generator with exact ground truth.
// Pages are rendered at 3024x4032 (12 MP portrait, a common phone resolution)
// and record every word's text and bounding box in photo pixels, so OCR
// accuracy and box alignment can be scored without hand-typed ground truth.
// The sample prose is original text written for this benchmark (no copyright).

const PROSE = [
  'There is a particular silence that settles over a reader who has found the right book at the right hour. The room does not change, yet everything in it seems to lean a little closer, as though the lamp and the chair and the half-finished cup of tea were listening too. We underline in those moments not because we fear forgetting, but because we want to leave a mark that says: here, on this page, something mattered.',
  'My grandmother kept a pencil tucked behind her ear for exactly this purpose. She read slowly, often aloud, and when a sentence pleased her she would draw a soft gray line beneath it and write the date in the margin. Years later I found her copy of an old travel diary with forty-three underlined passages, the earliest from March 1961 and the latest from a winter afternoon in 1998.',
  '"A good sentence," she told me once, "is a door you can walk through more than once." I did not understand her then. I thought a book was something to finish, a road with an end; she thought of it as a house with many rooms, each one worth returning to.',
  'Collecting quotations is a way of furnishing that house. Each line we copy down is a small object carried home from somewhere else: a stone from a riverbank, a postcard, a ticket stub with the ink beginning to fade. On their own they are modest things. Gathered together, arranged and re-read, they become a kind of map of who we were when we first noticed them.',
  'The habit asks for very little. Keep a pencil nearby. Read with patience. When a phrase stops you, let it stop you, and mark the place before the feeling passes. Later, when the book has gone back to the shelf, the words will still be waiting, exactly where you left them, ready to open the door again.',
];

const HEADER = 'THE QUIET ART OF MARGINS';
const PAGE_NUMBER = '47';
const FONT = 'Georgia, "Noto Serif", "Times New Roman", serif';

// Photo and page geometry (page ≈ 5.5 x 7.5 in at ~495 px/in).
const W = 3024;
const H = 4032;
const PW = 2720;
const PH = 3700;
const PX_PER_PT = 495 / 72;

export const SAMPLE_SPECS = [
  { id: 'clean', label: 'Clean 11 pt, even light', pt: 11 },
  { id: 'underline', label: 'Pencil underlines, 11 pt', pt: 11, underlines: true },
  { id: 'curved', label: 'Curved near spine + tilt + underlines', pt: 11, underlines: true, curve: 70, tilt: 1.5 },
  { id: 'small', label: 'Small 7.5 pt text + underlines', pt: 7.5, underlines: true },
  { id: 'lowlight', label: 'Low / uneven light + noise + underlines', pt: 11, underlines: true, lowlight: true },
  {
    id: 'hard',
    label: 'Combined: 8.5 pt, curve, tilt, low light, underlines',
    pt: 8.5,
    underlines: true,
    curve: 90,
    tilt: 2,
    lowlight: true,
  },
];

// Deterministic PRNG so every device renders the same pages.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Lays out justified text; returns lines of words with page-space boxes. */
function layoutPage(ctx, fs) {
  const left = PW * 0.12;
  const right = PW * 0.9;
  const lineH = fs * 1.42;
  const lines = [];

  const measure = (text) => {
    const m = ctx.measureText(text);
    return { w: m.width, l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent };
  };
  const place = (text, x, baseline) => {
    const m = measure(text);
    return { text, x, baseline, bbox: { x0: x - m.l, y0: baseline - m.a, x1: x + m.r, y1: baseline + m.d } };
  };

  // Running head
  ctx.font = `${Math.round(fs * 0.72)}px ${FONT}`;
  const headW = measure(HEADER).w;
  let baseline = PH * 0.075;
  lines.push({ kind: 'head', font: ctx.font, words: [place(HEADER, (PW - headW) / 2, baseline)] });
  // treat the head as one word box for text, split for GT words later
  ctx.font = `${fs}px ${FONT}`;
  baseline += lineH * 1.6;

  const bottom = PH * 0.9;
  const space = measure(' ').w;
  const indent = fs * 1.5;

  outer: for (let round = 0; round < 4; round++) {
    for (const para of PROSE) {
      const words = para.split(' ');
      let i = 0;
      let first = true;
      while (i < words.length) {
        if (baseline > bottom) break outer;
        const startX = left + (first ? indent : 0);
        const avail = right - startX;
        const lineWords = [];
        let used = 0;
        while (i < words.length) {
          const w = measure(words[i]).w;
          const need = lineWords.length ? used + space + w : w;
          if (need > avail && lineWords.length) break;
          lineWords.push({ text: words[i], w });
          used = need;
          i++;
        }
        const last = i >= words.length;
        const gaps = lineWords.length - 1;
        const gap = !last && gaps > 0 ? space + (avail - used) / gaps : space;
        let x = startX;
        const placed = lineWords.map((lw) => {
          const p = place(lw.text, x, baseline);
          x += lw.w + gap;
          return p;
        });
        lines.push({ kind: 'body', font: ctx.font, words: placed });
        baseline += lineH;
        first = false;
      }
    }
  }

  // Page number
  ctx.font = `${Math.round(fs * 0.8)}px ${FONT}`;
  const pnW = measure(PAGE_NUMBER).w;
  lines.push({ kind: 'foot', font: ctx.font, words: [place(PAGE_NUMBER, (PW - pnW) / 2, PH * 0.955)] });
  ctx.font = `${fs}px ${FONT}`;
  return lines;
}

function drawPencilLine(ctx, x0, x1, y, fs, rand) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const slope = (rand() - 0.5) * fs * 0.15;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(70, 70, 72, ${0.38 + rand() * 0.2})`;
    ctx.lineWidth = fs * (0.05 + rand() * 0.03);
    for (let x = x0; x <= x1; x += fs * 0.6) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      const yy = y + slope * t + (rand() - 0.5) * fs * 0.05 + pass * fs * 0.02;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Renders one sample page and returns { file, gtText, gtWords, ... }. */
export async function renderSample(spec, seed = 7) {
  const rand = rng(seed + spec.id.length * 101);
  const fs = Math.round(spec.pt * PX_PER_PT);

  // 1. Flat page with text, underlines, and spine shading
  const page = makeCanvas(PW, PH);
  const pc = page.getContext('2d');
  pc.fillStyle = spec.lowlight ? '#e6dfcf' : '#f4efe4';
  pc.fillRect(0, 0, PW, PH);
  pc.textBaseline = 'alphabetic';
  pc.font = `${fs}px ${FONT}`;
  const lines = layoutPage(pc, fs);

  pc.fillStyle = spec.lowlight ? '#3b3936' : '#1d1c1a';
  for (const line of lines) {
    pc.font = line.font;
    for (const w of line.words) pc.fillText(w.text, w.x, w.baseline);
  }

  if (spec.underlines) {
    const body = lines.filter((l) => l.kind === 'body');
    const marked = [2, 3, 4, 9, 10, 16, 17, 18].filter((i) => i < body.length);
    marked.forEach((idx, k) => {
      const ws = body[idx].words;
      const from = k === 0 ? Math.min(3, ws.length - 1) : 0; // start mid-line on first
      const to = k === marked.length - 1 ? Math.max(from, ws.length - 3) : ws.length - 1;
      const x0 = ws[from].bbox.x0 - fs * 0.1;
      const x1 = ws[to].bbox.x1 + fs * 0.1;
      // sits slightly above the descender line, so it crosses g/p/y tails like real pencil
      drawPencilLine(pc, x0, x1, ws[0].baseline + fs * 0.12, fs, rand);
    });
  }

  if (spec.curve) {
    const g = pc.createLinearGradient(0, 0, PW * 0.3, 0);
    g.addColorStop(0, 'rgba(60, 50, 40, 0.45)');
    g.addColorStop(1, 'rgba(60, 50, 40, 0)');
    pc.fillStyle = g;
    pc.fillRect(0, 0, PW * 0.3, PH);
  }

  // 2. Page curvature near the spine (left edge), as a per-column vertical shift
  const curveSpan = PW * 0.3;
  const A = spec.curve || 0;
  const margin = Math.ceil(A) + 2;
  const dy = (x) => (x < curveSpan ? -A * ((curveSpan - x) / curveSpan) ** 2 : 0);
  const warped = makeCanvas(PW, PH + margin);
  const wc = warped.getContext('2d');
  if (A) {
    const strip = 4;
    for (let x = 0; x < PW; x += strip) wc.drawImage(page, x, 0, strip, PH, x, margin + dy(x), strip, PH);
  } else {
    wc.drawImage(page, 0, margin);
  }

  // 3. Place the page in the photo: background, tilt, blur
  const photo = makeCanvas(W, H);
  const ctx = photo.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#4a3b2c');
  bg.addColorStop(1, '#2b231b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const theta = ((spec.tilt || 0) * Math.PI) / 180;
  const ox = W / 2 + 20;
  const oy = H / 2 + 10;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(theta);
  if (spec.lowlight) ctx.filter = 'blur(1.2px)';
  ctx.drawImage(warped, -PW / 2, -(PH + margin) / 2);
  ctx.restore();

  // 4. Lighting and sensor noise
  if (spec.lowlight) {
    const light = ctx.createRadialGradient(W * 0.85, H * 0.1, W * 0.1, W * 0.5, H * 0.6, H * 0.95);
    light.addColorStop(0, 'rgba(255,255,255,0)');
    light.addColorStop(1, 'rgba(25,20,15,0.62)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
  }
  const noise = makeCanvas(256, 256);
  const nc = noise.getContext('2d');
  const img = nc.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = spec.lowlight ? 34 : 14;
  }
  nc.putImageData(img, 0, 0);
  ctx.fillStyle = ctx.createPattern(noise, 'repeat');
  ctx.fillRect(0, 0, W, H);

  // 5. Ground truth: map page-space boxes through warp + tilt into photo space
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const toPhoto = (x, y) => {
    const wx = x - PW / 2;
    const wy = y + margin + dy(x) - (PH + margin) / 2;
    return [ox + wx * cos - wy * sin, oy + wx * sin + wy * cos];
  };
  const mapBox = (b) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k <= 4; k++) {
      const x = b.x0 + ((b.x1 - b.x0) * k) / 4;
      for (const y of [b.y0, b.y1]) {
        const [px, py] = toPhoto(x, y);
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      }
    }
    return { x0, y0, x1, y1 };
  };

  const gtWords = [];
  const textLines = [];
  for (const line of lines) {
    textLines.push(line.words.map((w) => w.text).join(' '));
    // The running head is drawn as one string; score body/foot words only.
    if (line.kind === 'head') continue;
    for (const w of line.words) gtWords.push({ text: w.text, bbox: mapBox(w.bbox) });
  }

  const blob = await new Promise((resolve) => photo.toBlob(resolve, 'image/jpeg', 0.88));
  const file = new File([blob], `synthetic-${spec.id}.jpg`, { type: 'image/jpeg' });
  return {
    id: spec.id,
    label: spec.label,
    kind: 'synthetic',
    file,
    width: W,
    height: H,
    gtText: textLines.join('\n'),
    gtWords,
    tags: [spec.underlines && 'underline', spec.curve && 'curved', spec.pt < 9 && 'small', spec.lowlight && 'lowlight'].filter(Boolean),
  };
}
