// Synthetic OCR output shaped like ocrEngine.recognizePhoto() words, for tests.
// No real book text or photos (the repository is public).
//
// makeWords([{ block, x, y, lines: ['first line', 'second line'] }, ...])
// Each character is 10 px wide, words are separated by 10 px, lines are 20 px
// tall and start 30 px apart. Words come out in Tesseract order
// (block -> line -> word) with a global line counter, like the real engine.

export function makeWords(blocks, { charW = 10, gap = 10, lineH = 20, lineGap = 30, confidence = 95 } = {}) {
  const words = [];
  let line = 0;
  blocks.forEach((blk, blockIndex) => {
    const x0 = blk.x ?? 50;
    const y0 = blk.y ?? 50;
    blk.lines.forEach((text, i) => {
      let x = x0;
      const y = y0 + i * lineGap;
      for (const token of text.split(' ').filter(Boolean)) {
        const w = token.length * charW;
        words.push({
          id: words.length,
          text: token,
          confidence,
          bbox: { x0: x, y0: y, x1: x + w, y1: y + lineH },
          line,
          paragraph: blockIndex,
          block: blk.block ?? blockIndex,
        });
        x += w + gap;
      }
      line++;
    });
  });
  return words;
}

export const centerOf = (word) => ({ x: (word.bbox.x0 + word.bbox.x1) / 2, y: (word.bbox.y0 + word.bbox.y1) / 2 });

export const PAGE = [
  {
    lines: [
      'The quick brown fox jumps',
      'over the lazy dog while the',
      'patient reader keeps remem-',
      'bering every well-known word.',
    ],
  },
];
