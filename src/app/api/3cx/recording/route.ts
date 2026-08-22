import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken } from '@/lib/3cx/auth'

export const runtime = 'nodejs'

// GET /api/3cx/recording?url=<encoded 3CX recording URL>
//
// Proxies 3CX call recordings through our backend so:
//  1. The browser doesn't need an Authorization header (it can't add one to
//     a plain <audio src=...> tag).
//  2. 3CX sees one authenticated request per recording instead of N
//     anonymous concurrent requests from the browser — fixes the 429 storm
//     that happened when opening any chat with multiple call bubbles.
//  3. We can attach Cache-Control so the browser doesn't refetch on every
//     re-render. Recordings are immutable, 24 h cache is safe.
//
// Long-term: media_download_jobs is supposed to migrate recordings to
// Supabase Storage, but no worker processes that queue today. This proxy
// makes the immediate UX work without building the worker.

const PBX_URL = (process.env['3CX_PBX_URL'] ?? '').replace(/\/$/, '')

export async function GET(req: NextRequest): Promise<Response> {
  // Auth gate (middleware doesn't enforce this for /api/3cx/* by design — the
  // webhook routes are intentionally public and use shared secrets)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('url required', { status: 400 })

  if (!PBX_URL) {
    console.error('[3cx/recording] 3CX_PBX_URL not configured')
    return new NextResponse('3CX not configured', { status: 500 })
  }

  // Security: only proxy URLs that point at OUR configured PBX. Otherwise this
  // becomes an authenticated open-proxy.
  if (!url.startsWith(`${PBX_URL}/recording/`)) {
    return new NextResponse('invalid url', { status: 400 })
  }

  try {
    const token = await getAccessToken()
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow',
    })

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '')
      console.warn('[3cx/recording] upstream', upstream.status, body.slice(0, 200))
      return new NextResponse(`upstream ${upstream.status}`, { status: upstream.status })
    }

    const headers: Record<string, string> = {
      'Content-Type':  upstream.headers.get('content-type') ?? 'audio/mpeg',
      'Cache-Control': 'private, max-age=86400',  // 24 h — recordings are immutable
    }
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers['Content-Length'] = contentLength

    return new NextResponse(upstream.body, { status: 200, headers })
  } catch (err) {
    console.error('[3cx/recording] proxy error', err)
    return new NextResponse('proxy error', { status: 502 })
  }
}
