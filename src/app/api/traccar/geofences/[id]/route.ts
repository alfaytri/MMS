// src/app/api/traccar/geofences/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  updateGeofence as updateTraccarGeofence,
  deleteGeofence as deleteTraccarGeofence,
  leafletToTraccarWKT,
  type LeafletGeometry,
} from '@/lib/traccar'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const traccarId = Number(id)
  if (Number.isNaN(traccarId)) {
    return NextResponse.json({ error: 'Invalid geofence ID' }, { status: 400 })
  }

  try {
    const body = await req.json() as {
      name: string
      description?: string
      color?: string
      geometry?: LeafletGeometry
    }

    const area = body.geometry ? leafletToTraccarWKT(body.geometry) : undefined

    await updateTraccarGeofence(traccarId, {
      name: body.name,
      description: body.description ?? '',
      area: area ?? '',
    })

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('traccar_geofences')
      .update({
        name: body.name,
        description: body.description ?? null,
        color: body.color ?? '#3B82F6',
      })
      .eq('traccar_geofence_id', traccarId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[traccar/geofences] PUT', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Traccar API error' },
      { status: 502 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const traccarId = Number(id)
  if (Number.isNaN(traccarId)) {
    return NextResponse.json({ error: 'Invalid geofence ID' }, { status: 400 })
  }

  try {
    await deleteTraccarGeofence(traccarId)

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('traccar_geofences')
      .delete()
      .eq('traccar_geofence_id', traccarId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[traccar/geofences] DELETE', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Traccar API error' },
      { status: 502 }
    )
  }
}
