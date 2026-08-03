/**
 * Client-side image compression before upload.
 *
 * Phone-shot 12 MP JPEGs land at 4-8 MB — the recipient (operator opening
 * a receival PDF, a credit doc, a consumption attachment) doesn't need
 * the full resolution and the storage bucket doesn't need to hold it.
 * We downscale to a max longest edge + re-encode at a slightly lossy
 * quality; typical result is 5-10× smaller with no visible degradation
 * on the modules that display these files.
 *
 * PDFs and any non-image formats pass through untouched — a job card
 * or receival scan may contain fine print that a re-render would ruin.
 *
 * Wire via:
 *   const compressed = await compressImageBeforeUpload(file)
 *   await supabase.storage.from(BUCKET).upload(path, compressed)
 *
 * If the canvas / bitmap decode fails (corrupt JPEG, unsupported HEIC on
 * a Safari that lacks the codec), the ORIGINAL file is returned — we
 * don't want a compression failure to block the upload the operator
 * cared about.
 */

const DEFAULT_MAX_EDGE = 1600        // px on the longest side
const DEFAULT_QUALITY  = 0.75        // JPEG quality
const COMPRESSIBLE_MIME_PREFIXES = ['image/']
const SKIP_MIMES = new Set([
  'image/gif',    // preserves animation
  'image/svg+xml',
])

export interface CompressImageOptions {
  maxEdgePx?: number
  quality?:   number
}

export async function compressImageBeforeUpload(
  file: File,
  opts: CompressImageOptions = {},
): Promise<File> {
  const type = (file.type ?? '').toLowerCase()

  // Skip non-images and formats we can't safely re-encode.
  if (!COMPRESSIBLE_MIME_PREFIXES.some((p) => type.startsWith(p))) return file
  if (SKIP_MIMES.has(type)) return file

  // Browsers without ImageBitmap fall through and return the original.
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return safeCanvasCompress(file, opts)
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const maxEdge = opts.maxEdgePx ?? DEFAULT_MAX_EDGE
    const quality = opts.quality ?? DEFAULT_QUALITY

    const longest = Math.max(bitmap.width, bitmap.height)
    const scale   = longest > maxEdge ? maxEdge / longest : 1
    const width   = Math.max(1, Math.round(bitmap.width  * scale))
    const height  = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    // Force JPEG for JPEG-like sources (heic / heif land as jpeg or the
    // browser handles them opaquely; encoding as jpeg is safe). Keep PNG
    // as PNG (quality is ignored for PNG but this preserves transparency).
    const outType = type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await canvas.convertToBlob({ type: outType, quality })

    // If the "compressed" version is somehow bigger (e.g. tiny source at
    // low native compression), keep the original.
    if (blob.size >= file.size) return file

    const outName = swapExtension(file.name, outType === 'image/png' ? '.png' : '.jpg')
    return new File([blob], outName, { type: outType, lastModified: Date.now() })
  } catch {
    // ImageBitmap path unavailable (Safari HEIC without codec, corrupt
    // header, etc.) — fall back to <img> + <canvas>, then to original.
    return safeCanvasCompress(file, opts)
  }
}

async function safeCanvasCompress(file: File, opts: CompressImageOptions): Promise<File> {
  if (typeof document === 'undefined') return file
  try {
    const dataUrl = await readAsDataUrl(file)
    const img = await loadImage(dataUrl)
    const maxEdge = opts.maxEdgePx ?? DEFAULT_MAX_EDGE
    const quality = opts.quality ?? DEFAULT_QUALITY
    const longest = Math.max(img.width, img.height)
    const scale = longest > maxEdge ? maxEdge / longest : 1
    const width  = Math.max(1, Math.round(img.width  * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, width, height)
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, outType, quality))
    if (!blob || blob.size >= file.size) return file
    const outName = swapExtension(file.name, outType === 'image/png' ? '.png' : '.jpg')
    return new File([blob], outName, { type: outType, lastModified: Date.now() })
  } catch {
    return file
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error('Image decode failed'))
    img.src = src
  })
}

function swapExtension(name: string, ext: string): string {
  const idx = name.lastIndexOf('.')
  const base = idx >= 0 ? name.slice(0, idx) : name
  return base + ext
}
