/**
 * Logo studio layout math — one pure function used by BOTH the preview
 * stage and the canvas bake, so what you frame is exactly what uploads.
 *
 * Model: cover-fit the image into a square stage, then scale by zoom
 * around the stage center, then pan by (x, y) expressed as FRACTIONS of
 * the stage size (resolution-independent — the 240px preview and the
 * 512px export share the same state).
 */

export interface LogoLayout {
  dw: number;
  dh: number;
  dx: number;
  dy: number;
}

export function layoutCover(
  imgW: number,
  imgH: number,
  stage: number,
  zoom: number,
  x: number,
  y: number,
): LogoLayout {
  const cover = Math.max(stage / imgW, stage / imgH);
  const scale = cover * Math.max(0.2, zoom);
  const dw = imgW * scale;
  const dh = imgH * scale;
  const dx = (stage - dw) / 2 + x * stage;
  const dy = (stage - dh) / 2 + y * stage;
  return { dw, dh, dx, dy };
}

/** Clamp pan so at least a sliver of image always covers the center. */
export function clampPan(v: number, zoom: number): number {
  const limit = 0.5 * Math.max(1, zoom);
  return Math.min(limit, Math.max(-limit, v));
}
