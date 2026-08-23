import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-admin'
import { computeAvailability, type Booking } from '@/lib/follow-ups/availability'
import type { CreateFollowUpRequestBody } from '@/types/follow-ups'
import type { Json } from '@/types/database.types'

function parseTimeSlot(slot: string | null): { from: string; to: string } | null {
  if (!slot) return null
  const m = /^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/.exec(slot.trim())
  return m ? { from: m[1], to: m[2] } : null
}

export async function POST(req: Request) {
  try {
    const gate = await requirePermission('follow_ups.request')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

    const body = (await req.json()) as CreateFollowUpRequestBody
    if (!body.parent_order_id || !Array.isArray(body.services_to_followup) || body.services_to_followup.length === 0) {
      return NextResponse.json({ error: 'parent_order_id and services_to_followup required' }, { status: 400 })
    }
    const hasSlot = body.requested_date && body.requested_time_from && body.requested_time_to
    const hasNote = !!body.time_note
    if (!hasSlot && !hasNote) {
      return NextResponse.json({ error: 'requested_date+time or time_note required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Look up the parent order — we need its team for the conflict check.
    const { data: parent, error: pErr } = await admin
      .from('orders')
      .select('id, status')
      .eq('id', body.parent_order_id)
      .single()
    if (pErr || !parent) return NextResponse.json({ error: 'parent_order_not_found' }, { status: 404 })
    // Reject only fully-dead orders. Team leaders submit follow-ups DURING the
    // completion flow, so the parent is usually still 'scheduled' or 'in-progress'
    // when this hits. UX layers above (the team-leader dialog, the standalone
    // /orders/[id]/request-follow-up page) decide which statuses to surface.
    if (parent.status === 'cancelled') {
      return NextResponse.json({ error: 'parent_order_cancelled' }, { status: 422 })
    }

    // Find the team that did the parent order (first assignment row).
    const { data: parentAssign } = await admin
      .from('order_team_assignments')
      .select('team_id')
      .eq('order_id', body.parent_order_id)
      .limit(1)
      .single()
    if (!parentAssign?.team_id) {
      return NextResponse.json({ error: 'parent_order_has_no_team' }, { status: 422 })
    }
    const teamId = parentAssign.team_id as string

    // 2. If a slot was requested, run conflict detection.
    if (hasSlot) {
      const { data: team } = await admin
        .from('teams')
        .select('schedule_start, schedule_end')
        .eq('id', teamId)
        .single()
      const workingFrom = `${String(team?.schedule_start ?? 8).padStart(2, '0')}:00`
      const workingTo   = `${String(team?.schedule_end   ?? 18).padStart(2, '0')}:00`

      const nextDayISO = (d: string) => {
        const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1)
        return x.toISOString().slice(0, 10)
      }
      const dateRange = [body.requested_date!, nextDayISO(body.requested_date!)]

      const { data: ota } = await admin
        .from('order_team_assignments')
        .select('scheduled_date, time_slot')
        .eq('team_id', teamId)
        .in('scheduled_date', dateRange)

      // Pending follow-up requests also reserve the team's time — merge them
      // into the bookings array so a fresh request can't double-book a slot
      // another team-leader already asked for.
      const { data: pendingFur } = await admin
        .from('follow_up_requests')
        .select('requested_date, requested_time_from, requested_time_to')
        .eq('requested_team_id', teamId)
        .eq('status', 'pending')
        .in('requested_date', dateRange)

      const otaBookings: Booking[] = (ota ?? [])
        .map((row: { scheduled_date: string; time_slot: string | null }) => {
          const parsed = parseTimeSlot(row.time_slot)
          return parsed ? { date: row.scheduled_date, from: parsed.from, to: parsed.to } : null
        })
        .filter((b): b is Booking => b !== null)

      const furBookings: Booking[] = (pendingFur ?? [])
        .map((row: { requested_date: string | null; requested_time_from: string | null; requested_time_to: string | null }) => {
          if (!row.requested_date || !row.requested_time_from || !row.requested_time_to) return null
          return {
            date: row.requested_date,
            from: row.requested_time_from.slice(0, 5),
            to:   row.requested_time_to.slice(0, 5),
          }
        })
        .filter((b): b is Booking => b !== null)

      const bookings: Booking[] = [...otaBookings, ...furBookings]

      const result = computeAvailability({
        team: { working_from: workingFrom, working_to: workingTo },
        bookings,
        requested: { date: body.requested_date!, from: body.requested_time_from!, to: body.requested_time_to! },
      })
      if (!result.ok) {
        return NextResponse.json({ error: 'team_busy', free_slots: result.free_slots }, { status: 409 })
      }
    }

    // 3. Insert the request.
    const { data: numRow, error: nErr } = await admin.rpc('next_follow_up_request_number')
    if (nErr) throw nErr
    const requestNumber = numRow as unknown as string

    const { data: inserted, error: iErr } = await admin
      .from('follow_up_requests')
      .insert({
        request_number:        requestNumber,
        parent_order_id:       body.parent_order_id,
        requested_by_user_id:  gate.authUserId,
        requested_team_id:     teamId,
        requested_date:        body.requested_date,
        requested_time_from:   body.requested_time_from,
        requested_time_to:     body.requested_time_to,
        time_note:             body.time_note,
        services_to_followup:  body.services_to_followup as unknown as Json,
        notes:                 body.notes,
        status:                'pending',
      })
      .select('id, request_number')
      .single()
    if (iErr) throw iErr

    return NextResponse.json({ ok: true, request_id: inserted.id, request_number: inserted.request_number }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const gate = await requirePermission('follow_ups.confirm')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

    const url = new URL(req.url)
    const status = (url.searchParams.get('status') ?? 'pending') as 'pending' | 'confirmed' | 'rejected' | 'cancelled'

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('follow_up_requests')
      .select(`
        *,
        parent:orders!follow_up_requests_parent_order_id_fkey ( order_id, customer_id, address ),
        team:teams!follow_up_requests_requested_team_id_fkey ( name )
      `)
      .eq('status', status)
      .order('requested_date', { ascending: true })
      .limit(100)
    if (error) throw error

    type ParentJoin = { order_id: string | null; customer_id: string | null; address: string | null } | null
    type TeamJoin = { name: string | null } | null
    type Row = Record<string, unknown> & { parent?: ParentJoin; team?: TeamJoin }

    const rows = (data ?? []) as Row[]
    const customerIds = Array.from(
      new Set(rows.map((r) => r.parent?.customer_id).filter((id): id is string => !!id))
    )
    const { data: customers } = customerIds.length
      ? await admin.from('customers').select('id, name').in('id', customerIds)
      : { data: [] as Array<{ id: string; name: string }> }
    const custMap = new Map((customers ?? []).map((c) => [c.id, c]))

    const flattened = rows.map((r) => {
      const c = r.parent?.customer_id ? custMap.get(r.parent.customer_id) : null
      return {
        ...r,
        parent_order_number: r.parent?.order_id ?? null,
        customer_name:       c?.name ?? null,
        customer_phone:      null,
        team_name:           r.team?.name ?? null,
      }
    })

    return NextResponse.json({ rows: flattened })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
