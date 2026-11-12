// SmartScan image helpers.
// Everything here runs locally in the browser. Images are never uploaded.

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

// Value for <input accept>. Listing concrete types (instead of image/*) makes
// iOS Safari transcode HEIC photos to JPEG before handing them to us.
export const UPLOAD_ACCEPT = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_EXTENSIONS].join(',');

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB, generous for phone photos

export class ScanImageError extends Error {}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasAcceptedExtension(name = '') {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Throws ScanImageError with a user-facing message if the file is unusable. */
export function validateImageFile(file) {
  if (!file) throw new ScanImageError('No photo was selected.');

  // Some Android pickers report an empty MIME type, so fall back to the extension.
  const typeOk = file.type
    ? ACCEPTED_IMAGE_TYPES.includes(file.type)
    : hasAcceptedExtension(file.name);

  if (!typeOk) {
    const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
    throw new ScanImageError(
      isHeic
        ? 'HEIC photos are not supported in this browser. Please choose a JPEG, PNG, or WebP image.'
        : 'Unsupported file type. Please choose a JPEG, PNG, or WebP image.',
    );
  }

  if (file.size === 0) throw new ScanImageError('That file is empty. Please choose another photo.');

  if (file.size > MAX_IMAGE_BYTES) {
    throw new ScanImageError(
      `That photo is ${formatBytes(file.size)}. The maximum size is ${formatBytes(MAX_IMAGE_BYTES)}.`,
    );
  }
}

/**
 * Validates and decodes a photo, returning the in-memory scan image used across
 * the SmartScan workflow. The caller owns `url` and must revoke it when done.
 *
 * Shape: { file, url, source, name, type, size, width, height, createdAt }
 * `file` (a Blob) is what Sprint 2 text recognition will consume.
 */
export function loadScanImage(file, source) {
  validateImageFile(file);

  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        file,
        url,
        source, // 'camera' | 'upload'
        name: file.name || 'photo',
        type: file.type,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        createdAt: Date.now(),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ScanImageError('This photo could not be opened. It may be damaged or in an unsupported format.'));
    };
    img.src = url;
  });
}

// ---- Camera support -------------------------------------------------------

/** True when the browser can show a live camera preview (needs HTTPS or localhost). */
export function canUseLiveCamera() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.isSecureContext &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function',
  );
}

/**
 * Phones and tablets get the native camera app via <input capture>, which uses
 * full sensor resolution, autofocus, and flash: better source images for OCR.
 */
export function prefersNativeCamera() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches;
}

/** Maps getUserMedia errors to user-facing messages. */
export function describeCameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera access was blocked. Allow camera access in your browser settings, or use Upload Photo instead.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Use Upload Photo instead.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is in use by another application. Close it and try again, or use Upload Photo.';
    case 'SecurityError':
      return 'Camera access requires a secure (HTTPS) connection. Use Upload Photo instead.';
    case 'AbortError':
      return 'The camera could not be started. Please try again.';
    default:
      return 'The camera could not be started. Use Upload Photo instead.';
  }
}

export const UNSUPPORTED_CAMERA_MESSAGE =
  'Live camera is not available in this browser or connection (camera access requires HTTPS). Use Upload Photo instead.';
