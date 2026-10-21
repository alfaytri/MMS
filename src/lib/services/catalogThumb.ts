/**
 * Catalog thumbnail derivative.
 *
 * A service's catalog photo is uploaded at whatever size the operator picked,
 * up to 5 MB. The service picker shows a flat search list that can put dozens
 * of those on screen at once, and the invoice PDF embeds one per line as
 * base64 — neither can afford the original. So the upload also writes a small
 * WebP beside it, and both readers use that.
 *
 * `buildCatalogThumb` is browser-only (canvas). The PDF path runs in Node and
 * must read the stored thumb URL rather than calling this.
 */

/** Longest edge, in px, of the stored thumbnail. */
export const THUMB_MAX_EDGE = 200

/** Storage path of a service's thumbnail, beside `catalog/{id}.{ext}`. */
export function thumbPathFor(serviceId: string): string {
  return `catalog/${serviceId}_thumb.webp`
}

export interface ThumbSize {
  width: number
  height: number
}

/**
 * Scale `width`×`height` down so the longest edge is at most `cap`, preserving
 * aspect ratio. An image already within the cap is returned untouched — a
 * thumbnail is never an upscale.
 *
 * Both dimensions are floored at 1: an extreme aspect ratio (2000×3) otherwise
 * rounds the short edge to 0, and a zero-sized canvas throws.
 */
export function thumbDimensions(
  width: number,
  height: number,
  cap: number = THUMB_MAX_EDGE,
): ThumbSize {
  const longest = Math.max(width, height)
  const scale = longest > cap ? cap / longest : 1
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Render `file` to a WebP blob no larger than THUMB_MAX_EDGE on its long edge.
 *
 * Canvas glue over `thumbDimensions`; mirrors the ImageBitmap/OffscreenCanvas
 * approach in `src/lib/compressImage.ts`. Not unit-tested — jsdom has no canvas
 * implementation and the project does not carry the `canvas` package, so the
 * testable logic lives in `thumbDimensions` and this is covered by the
 * operator's upload check.
 *
 * Throws if the browser cannot encode; the caller treats a failed thumbnail as
 * non-fatal and saves the service anyway.
 */
export async function buildCatalogThumb(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { width, height } = thumbDimensions(bitmap.width, bitmap.height)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
  } finally {
    bitmap.close()
  }
}
