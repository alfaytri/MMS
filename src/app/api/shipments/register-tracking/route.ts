import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  registerTracking, getTrackInfo,
  ERR_QUOTA_EXCEEDED, ERR_AMBIGUOUS_CARRIER,
} from '@/lib/tracking/client17track'
import { mapRawEvents } from '@/lib/tracking/normalize'
import { STATUS_MAP_JSON } from '@/lib/tracking/statusMap'

// Kept short to stay within Vercel Hobby 10s limit (total delay ≤ 5s + API call time)
const BACKOFF_DELAYS_MS = [500, 1500, 3000]

async function fetchWithBackoff(trackingNumber: string, carrierCode?: number) {
  for (const delay of BACKOFF_DELAYS_MS) {
    await new Promise(r => setTimeout(r, delay))
    const info = await getTrackInfo(trackingNumber, carrierCode)
    if (info?.track?.z0?.a?.length) return info
  }
  return null
}


export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const { tracking_number, shipment_id, carrier_code } = await request.json()

  if (!tracking_number || !shipment_id) {
    return NextResponse.json({ error: 'tracking_number and shipment_id required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Atomic semaphore: only acquires the lock if is_syncing is currently false.
  // Prevents race conditions in serverless environments where two requests can
  // both read is_syncing: false before either sets it to true.
  const { data: lockedShipment, error: lockError } = await (supabase as any)
    .from('shipments')
    .update({ is_syncing: true })
    .eq('id', shipment_id)
    .eq('is_syncing', false)
    .select('carrier_code')
    .maybeSingle()

  if (lockError || !lockedShipment) {
    return NextResponse.json({ error: 'Sync already in progress' }, { status: 409 })
  }

  const resolvedCarrierCode: number | undefined =
    carrier_code !== undefined
      ? Number(carrier_code)
      : lockedShipment.carrier_code != null
        ? Number(lockedShipment.carrier_code)
        : undefined

  try {
    const result = await registerTracking(tracking_number, resolvedCarrierCode)
    const rejected = result.rejected.find(r => r.number === tracking_number)

    if (rejected) {
      if (rejected.error.code === ERR_QUOTA_EXCEEDED) {
        await (supabase as any)
          .from('shipments')
          .update({ sync_error: 'quota_exceeded' })
          .eq('id', shipment_id)
        return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 })
      }
      if (rejected.error.code === ERR_AMBIGUOUS_CARRIER) {
        // rejected.error.data contains candidate carrier code numbers per 17track API docs
        const candidates: number[] = rejected.error.data ?? []
        return NextResponse.json({ ambiguous: true, candidates })
      }
      // Other rejections (not found yet) are non-fatal — webhook fires when carrier scans
    }

    if (carrier_code !== undefined) {
      await (supabase as any)
        .from('shipments')
        .update({ carrier_code: String(carrier_code) })
        .eq('id', shipment_id)
    }

    const info = await fetchWithBackoff(tracking_number, resolvedCarrierCode)
    const rawEvents = info?.track?.z0?.a ?? []
    const events = mapRawEvents(rawEvents)

    if (events.length > 0) {
      await (supabase as any).rpc('append_shipment_events', {
        p_shipment_id: shipment_id,
        p_events: events,
        p_status_map: STATUS_MAP_JSON,
      })
    }

    await (supabase as any)
      .from('shipments')
      .update({ sync_error: null })
      .eq('id', shipment_id)

    return NextResponse.json({ events })
  } catch (err) {
    console.error('[register-tracking]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    // Always release the semaphore — runs on every exit path including early returns
    await (supabase as any).from('shipments').update({ is_syncing: false }).eq('id', shipment_id)
  }
}
