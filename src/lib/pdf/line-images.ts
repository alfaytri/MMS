/**
 * Fetch per-line images and return them as base64 data URIs for PDF embedding.
 *
 * Two deliberate choices:
 *
 * 1. **Embedded, not linked.** `pdf-fonts.ts` already inlines the logo, footer
 *    and stamp with `readAsBase64`. Letting the renderer pull images over the
 *    network mid-render would make PDF generation fail intermittently, in a way
 *    that only shows up under load.
 *
 * 2. **Degrade, never block.** A deleted object, a Storage hiccup or a slow
 *    response yields `null` for that line and an empty cell — the invoice still
 *    issues. This matters because `api/notifications/send-invoice` already
 *    catches a PDF failure and sends the customer's message with NO PDF
 *    attached; a decorative photo must never be able to trigger that.
 */

/** Per-request ceiling. A photo is not worth making an invoice wait. */
const FETCH_TIMEOUT_MS = 5_000

/** Guard against a pathological upload bloating the PDF. */
const MAX_BYTES = 2 * 1024 * 1024

async function fetchOne(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null
    const type = res.headers?.get('content-type') ?? 'image/png'
    if (!type.startsWith('image/')) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Resolve `urls` to data URIs, positionally. A null input stays null and costs
 * no request; a repeated url is fetched once and reused. Never throws.
 */
export async function fetchLineImages(
  urls: (string | null | undefined)[],
): Promise<(string | null)[]> {
  const unique = Array.from(new Set(urls.filter((u): u is string => !!u)))
  if (unique.length === 0) return urls.map(() => null)

  const resolved = await Promise.all(unique.map(fetchOne))
  const byUrl = new Map(unique.map((u, i) => [u, resolved[i]]))
  return urls.map((u) => (u ? byUrl.get(u) ?? null : null))
}
