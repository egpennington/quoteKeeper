// Prepares self-hosted assets for the standalone OCR benchmark in
// benchmark/ocr/public/ocr/ (gitignored). Includes the diagnostic `best` model.
//
//   npm run bench:ocr:prepare

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareOcrAssets } from '../../scripts/ocr-assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
await prepareOcrAssets(join(here, 'public', 'ocr'), { models: ['fast', 'best_int', 'best'] });
