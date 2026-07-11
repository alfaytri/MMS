import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-admin'
import {
  registerTracking, getTrackInfo, extractEvents, extractCarrierName,
  ERR_QUOTA_EXCEEDED, ERR_AMBIGUOUS_CARRIER,
} from '@/lib/tracking/client17track'
import { mapRawEvents } from '@/lib/tracking/normalize'
import { STATUS_MAP_JSON } from '@/lib/tracking/statusMap'

async function storeEvents(
  supabase: ReturnType<typeof createAdminClient>,
  shipmentId: string,
  trackingNumber: string,
  info: Awaited<ReturnType<typeof getTrackInfo>>,
) {
  const rawEvents = info ? extractEvents(info) : []
  const carrierName = info ? extractCarrierName(info) : null
  const events = mapRawEvents(rawEvents)

  if (events.length > 0) {
    await supabase.rpc('append_shipment_events', {
      p_shipment_id: shipmentId,
      p_events: events,
      p_status_map: STATUS_MAP_JSON,
    })
  }

  if (info?.carrier || carrierName) {
    await supabase
      .from('shipments')
      .update({
        carrier: carrierName ?? String(info!.carrier),
        carrier_code: String(info!.carrier),
      })
      .eq('id', shipmentId)
  }

  return events
}

export async function POST(request: Request) {
  const gate = await requirePermission('purchase.shipments.manage')
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const { tracking_number, shipment_id, carrier_code } = await request.json()

  if (!tracking_number || !shipment_id) {
    return NextResponse.json({ error: 'tracking_number and shipment_id required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: lockedShipment, error: lockError } = await supabase
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
    // Step 1: Try fetching events directly first (works if already registered via API)
    const existingInfo = await getTrackInfo(tracking_number, resolvedCarrierCode)
    if (existingInfo && extractEvents(existingInfo).length > 0) {
      const events = await storeEvents(supabase, shipment_id, tracking_number, existingInfo)
      await supabase
        .from('shipments')
        .update({ sync_error: null, last_synced_at: new Date().toISOString() })
        .eq('id', shipment_id)
      return NextResponse.json({ events })
    }

    // Step 2: Not yet registered or no events — register and wait for data
    const result = await registerTracking(tracking_number, resolvedCarrierCode)
    const rejected = result.rejected.find(r => r.number === tracking_number)

    if (rejected) {
      if (rejected.error.code === ERR_QUOTA_EXCEEDED) {
        await supabase
          .from('shipments')
          .update({ sync_error: 'quota_exceeded' })
          .eq('id', shipment_id)
        return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 })
      }
      if (rejected.error.code === ERR_AMBIGUOUS_CARRIER) {
        const candidates: number[] = rejected.error.data ?? []
        return NextResponse.json({ ambiguous: true, candidates })
      }
    }

    if (carrier_code !== undefined) {
      await supabase
        .from('shipments')
        .update({ carrier_code: String(carrier_code) })
        .eq('id', shipment_id)
    }

    // Step 3: Backoff poll — 17track needs time to fetch from the carrier after registration
    let info: Awaited<ReturnType<typeof getTrackInfo>> = null
    for (const delay of [1000, 2000, 3000]) {
      await new Promise(r => setTimeout(r, delay))
      info = await getTrackInfo(tracking_number, resolvedCarrierCode)
      if (info && extractEvents(info).length > 0) break
    }

    const events = await storeEvents(supabase, shipment_id, tracking_number, info)

    await supabase
      .from('shipments')
      .update({ sync_error: null, last_synced_at: new Date().toISOString() })
      .eq('id', shipment_id)

    return NextResponse.json({ events })
  } catch (err) {
    console.error('[register-tracking]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    await supabase.from('shipments').update({ is_syncing: false }).eq('id', shipment_id)
  }
}
