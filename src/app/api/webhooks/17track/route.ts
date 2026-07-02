import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Track17Event } from '@/lib/tracking/client17track'
import { mapRawEvents } from '@/lib/tracking/normalize'
import { STATUS_MAP_JSON } from '@/lib/tracking/statusMap'

// 17track sends the HMAC-SHA256 signature in the `17track-signature` header.
function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.SEVENTEEN_TRACK_WEBHOOK_SECRET
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    // Constant-time comparison prevents timing-based signature oracle attacks
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false // length mismatch — timingSafeEqual throws if buffers differ in length
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('17track-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: { data?: unknown }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const updates: unknown[] = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : []

  const supabase = createAdminClient()

  type TrackUpdate = {
    number: string
    track_info?: {
      tracking?: {
        providers?: Array<{ events: Track17Event[] }>
      }
    }
  }

  const results = await Promise.allSettled(
    updates
      .filter((u): u is TrackUpdate => !!(u as TrackUpdate).number)
      .map(async u => {
        const { data: shipment } = await supabase
          .from('shipments')
          .select('id')
          .eq('tracking_number', u.number)
          .maybeSingle()

        if (!shipment) return

        const rawEvents = u.track_info?.tracking?.providers?.[0]?.events ?? []
        const events = mapRawEvents(rawEvents)
        if (events.length > 0) {
          await supabase.rpc('append_shipment_events', {
            p_shipment_id: shipment.id,
            p_events: events,
            p_status_map: STATUS_MAP_JSON,
          })
        }
      })
  )

  results.forEach(r => {
    if (r.status === 'rejected') console.error('[webhook/17track]', r.reason)
  })

  return NextResponse.json({ ok: true })
}
