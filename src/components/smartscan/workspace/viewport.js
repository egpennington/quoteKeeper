// SmartScan workspace geometry (pure functions, no browser APIs).
//
// Coordinate spaces:
//   image  pixels of the decoded photo (EXIF orientation applied), W x H
//   page   the photo after the user's rotation, in full-resolution pixels.
//          OCR word boxes are stored here. 90/270 swap width and height.
//   screen CSS pixels inside the workspace viewport, origin at its top-left.
//
// View: { scale, tx, ty } maps page -> screen: sx = tx + px * scale.
// The photo is drawn at page size * scale (not a CSS scale transform), so the
// browser resamples the original image at every zoom and print stays sharp.

export const ROTATIONS = [0, 90, 180, 270];

export const nextRotation = (rotation) => (rotation + 90) % 360;

export function rotatedSize(width, height, rotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/**
 * Affine matrix [a, b, c, d, e, f] mapping image -> page for a clockwise
 * rotation: X = a*x + c*y + e, Y = b*x + d*y + f. Same layout as CSS matrix()
 * and CanvasRenderingContext2D.setTransform().
 */
export function rotationMatrix(rotation, width, height) {
  switch (rotation) {
    case 90:
      return [0, 1, -1, 0, height, 0];
    case 180:
      return [-1, 0, 0, -1, width, height];
    case 270:
      return [0, -1, 1, 0, 0, width];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

export function applyMatrix([a, b, c, d, e, f], x, y) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Scale and centre the page so all of it is visible. */
export function fitView(viewW, viewH, pageW, pageH) {
  if (!(viewW > 0 && viewH > 0 && pageW > 0 && pageH > 0)) return { scale: 1, tx: 0, ty: 0 };
  const scale = Math.min(viewW / pageW, viewH / pageH);
  return { scale, tx: (viewW - pageW * scale) / 2, ty: (viewH - pageH * scale) / 2 };
}

/**
 * Zoom range: from "whole page" up to well past 1 CSS px per photo pixel,
 * so small print can be enlarged for accurate taps.
 */
export function scaleLimits(viewW, viewH, pageW, pageH) {
  const min = fitView(viewW, viewH, pageW, pageH).scale;
  return { min, max: Math.max(min * 6, 1.5) };
}

function clampAxis(offset, content, viewport) {
  if (content <= viewport) return (viewport - content) / 2; // centre when smaller
  return Math.min(0, Math.max(viewport - content, offset)); // no empty gap at the edges
}

/** Keeps scale within limits and the page covering (or centred in) the viewport. */
export function clampView(view, viewW, viewH, pageW, pageH) {
  const { min, max } = scaleLimits(viewW, viewH, pageW, pageH);
  const scale = Math.min(max, Math.max(min, view.scale));
  return {
    scale,
    tx: clampAxis(view.tx, pageW * scale, viewW),
    ty: clampAxis(view.ty, pageH * scale, viewH),
  };
}

/** Zooms to `scale` keeping the screen point (fx, fy) over the same page point. */
export function zoomAt(view, scale, fx, fy) {
  const ratio = scale / view.scale;
  return { scale, tx: fx - (fx - view.tx) * ratio, ty: fy - (fy - view.ty) * ratio };
}

/**
 * Pinch from finger midpoint/spread `from` to `to` ({ x, y, dist }): zooms
 * about where the fingers were, then follows them to where they are, so the
 * page point between the fingers stays between the fingers. The workspace
 * applies it from the view at the start of the gesture (clamping only the
 * result); it also composes exactly when applied event by event.
 */
export function pinchStep(view, from, to) {
  const zoomed = zoomAt(view, view.scale * (to.dist / from.dist), from.x, from.y);
  return { ...zoomed, tx: zoomed.tx + to.x - from.x, ty: zoomed.ty + to.y - from.y };
}

export function screenToPage(view, sx, sy) {
  return { x: (sx - view.tx) / view.scale, y: (sy - view.ty) / view.scale };
}

export function pageToScreen(view, px, py) {
  return { x: view.tx + px * view.scale, y: view.ty + py * view.scale };
}

/**
 * Pans the minimum distance so a page rect is on screen with `margin` px to
 * spare. A rect larger than the viewport is left alone if part of it is
 * already visible (the user just tapped inside it), otherwise its nearest
 * edge is brought in.
 */
export function revealRect(view, rect, viewW, viewH, margin = 16) {
  const a = pageToScreen(view, rect.x0, rect.y0);
  const b = pageToScreen(view, rect.x1, rect.y1);
  const shift = (lo, hi, size) => {
    if (hi - lo > size - 2 * margin) {
      if (hi < margin) return margin - hi;
      if (lo > size - margin) return size - margin - lo;
      return 0;
    }
    if (lo < margin) return margin - lo;
    if (hi > size - margin) return size - margin - hi;
    return 0;
  };
  return { ...view, tx: view.tx + shift(a.x, b.x, viewW), ty: view.ty + shift(a.y, b.y, viewH) };
}
