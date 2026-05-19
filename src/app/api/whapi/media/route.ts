import { type NextRequest, NextResponse } from 'next/server'

const WHAPI_TOKEN = process.env.WHAPI_TOKEN ?? ''

export async function GET(req: NextRequest) {
  let url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })

  // Unwrap double-wrapped URLs: if the `url` param is itself a /api/whapi/media?url=... path,
  // extract the inner URL so old DB rows with double-wrapped URLs still resolve correctly.
  if (url.startsWith('/api/whapi/media')) {
    try {
      const inner = new URL(url, 'http://localhost').searchParams.get('url')
      if (inner) url = inner
    } catch { /* keep url as-is */ }
  }

  if (!WHAPI_TOKEN)
    return NextResponse.json({ error: 'WHAPI_TOKEN not configured' }, { status: 500 })

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${WHAPI_TOKEN}` },
    })
    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status })
    }
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
    const contentDisposition = upstream.headers.get('content-disposition')
    const headers: Record<string, string> = { 'Content-Type': contentType }
    if (contentDisposition) headers['Content-Disposition'] = contentDisposition
    return new Response(upstream.body, { status: 200, headers })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Proxy error' }, { status: 500 })
  }
}
