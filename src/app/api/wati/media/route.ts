import { type NextRequest, NextResponse } from 'next/server'

const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')

// GET /api/wati/media?path=data/images/uuid.jpg
// Proxies WATI media files so the browser doesn't need to supply the Bearer token.
// WATI serves customer media at relative paths that require Authorization headers;
// the browser can't add those on <img src> or anchor downloads, so all customer
// media URLs are stored as /api/wati/media?path=... pointing here.
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return new NextResponse('path required', { status: 400 })

  // Only allow WATI media paths (prevents open-proxy abuse)
  if (!/^data\/(images|documents|videos|audio|voice|stickers)\/[a-zA-Z0-9_\-\.]+$/.test(path)) {
    return new NextResponse('invalid path', { status: 400 })
  }

  // Try multiple WATI media URL formats — different WATI tenant configurations
  // serve media at different paths. We try each until one returns 200.
  const candidates = [
    `${WATI_URL}/${path}`,
    `${WATI_URL}/api/file/showFile?fileName=${encodeURIComponent(path)}`,
    `${WATI_URL}/api/v1/getMedia?fileName=${encodeURIComponent(path)}`,
  ]

  let res: Response | null = null
  let lastStatus = 0
  let lastBody = ''
  for (const upstream of candidates) {
    console.log('[wati/media] trying', upstream)
    try {
      const r = await fetch(upstream, {
        headers: { Authorization: `Bearer ${WATI_TOKEN}` },
        redirect: 'follow',
      })
      console.log('[wati/media]  → status', r.status, 'content-type', r.headers.get('content-type'))
      if (r.ok) {
        res = r
        break
      }
      lastStatus = r.status
      lastBody = await r.text().catch(() => '')
      console.warn('[wati/media]  → body:', lastBody.slice(0, 200))
    } catch (err) {
      console.error('[wati/media]  → fetch error', err)
    }
  }

  if (!res) {
    return new NextResponse(`upstream ${lastStatus} ${lastBody.slice(0, 80)}`, { status: lastStatus || 502 })
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  const body = await res.arrayBuffer()

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
