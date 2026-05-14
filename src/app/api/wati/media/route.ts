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

  const upstream = `${WATI_URL}/${path}`
  let res: Response
  try {
    res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${WATI_TOKEN}` },
    })
  } catch {
    return new NextResponse('upstream fetch failed', { status: 502 })
  }

  if (!res.ok) {
    return new NextResponse(`upstream ${res.status}`, { status: res.status })
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
