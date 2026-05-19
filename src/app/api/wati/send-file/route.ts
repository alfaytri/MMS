import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'

const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')

// Allow up to 5 minutes — large video files need time to download + upload
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone, url: fileUrl, caption, filename, mime_type } = body as {
    phone?: string
    url?: string
    caption?: string
    filename?: string
    mime_type?: string
  }

  if (!phone || !fileUrl)
    return NextResponse.json({ error: 'phone and url required' }, { status: 400 })

  // Download the file from Supabase Storage (Node.js handles large files fine)
  const fileRes = await fetch(fileUrl)
  if (!fileRes.ok)
    return NextResponse.json({ error: 'Failed to fetch file', httpStatus: fileRes.status }, { status: 502 })

  const fileBlob = await fileRes.blob()

  const form = new FormData()
  form.append('file', new File([fileBlob], filename ?? 'file', { type: mime_type ?? 'application/octet-stream' }))
  if (caption) form.append('caption', caption)

  const watiRes = await fetch(
    `${WATI_URL}/api/v1/sendSessionFile/${encodeURIComponent(phone)}`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${WATI_TOKEN}` },
      body:    form,
    }
  )

  const rawText = await watiRes.text()
  let watiData: unknown
  try { watiData = JSON.parse(rawText) } catch { watiData = { raw: rawText } }

  if (!watiRes.ok) {
    console.error('[wati/send-file] rejected', watiRes.status, rawText.slice(0, 300))
    return NextResponse.json(
      { error: 'wati_rejected', httpStatus: watiRes.status, detail: rawText.slice(0, 300) },
      { status: watiRes.status }
    )
  }

  return NextResponse.json(watiData)
}
