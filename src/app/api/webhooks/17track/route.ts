import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeTimestamp, computeEventHash } from '@/lib/tracking/normalize'
import { map17trackTag, STATUS_MAP_JSON } from '@/lib/tracking/statusMap'

// 17track sends the HMAC-SHA256 signature in the `17track-signature` header.
function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.SEVENTEEN_TRACK_WEBHOOK_SECRET
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return expected === signature
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('17track-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const updates: unknown[] = Array.isArray(payload.data) ? payload.data : [payload.data]

  const supabase = createAdminClient()

  for (const update of updates) {
    const u = update as {
      number: string
      track?: { z0?: { a?: Array<{ a: string; b: string; c: string; z: string }> } }
    }
    if (!u.number) continue

    const { data: shipment } = await (supabase as any)
      .from('shipments')
      .select('id')
      .eq('tracking_number', u.number)
      .maybeSingle()

    if (!shipment) continue // ghost tracking — acknowledge and ignore

    const rawEvents = u.track?.z0?.a ?? []
    const events = rawEvents
      .map(e => {
        const normalizedTimestamp = normalizeTimestamp(e.a)
        const location = e.b ?? ''
        const description = e.c ?? ''
        const status = map17trackTag(e.z)
        if (!status) return null
        const hash = computeEventHash(normalizedTimestamp, location, description)
        return { hash, normalizedTimestamp, date: normalizedTimestamp, location, notes: description, status }
      })
      .filter(Boolean)

    if (events.length > 0) {
      await (supabase as any).rpc('append_shipment_events', {
        p_shipment_id: shipment.id,
        p_events: events,
        p_status_map: STATUS_MAP_JSON,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
