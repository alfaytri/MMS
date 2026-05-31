// src/app/api/traccar/geofences/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getGeofences as getTraccarGeofences,
  createGeofence as createTraccarGeofence,
  traccarWKTToLeaflet,
  leafletToTraccarWKT,
  type LeafletGeometry,
} from '@/lib/traccar'

export interface GeofenceResponse {
  id: string
  traccarGeofenceId: number
  name: string
  description: string | null
  color: string
  area: string
  geometry: ReturnType<typeof traccarWKTToLeaflet>
  createdBy: string | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const admin = createAdminClient()
    const [traccarGeofences, localRes] = await Promise.all([
      getTraccarGeofences(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from('traccar_geofences').select('*'),
    ])

    if (localRes.error) throw localRes.error

    const localMap = new Map<number, any>()
    for (const local of (localRes.data ?? [])) {
      localMap.set(local.traccar_geofence_id, local)
    }

    const traccarIds = new Set<number>()
    const merged: GeofenceResponse[] = []

    for (const tg of traccarGeofences) {
      traccarIds.add(tg.id)
      const local = localMap.get(tg.id)
      merged.push({
        id: local?.id ?? '',
        traccarGeofenceId: tg.id,
        name: local?.name ?? tg.name,
        description: local?.description ?? tg.description ?? null,
        color: local?.color ?? '#3B82F6',
        area: tg.area,
        geometry: traccarWKTToLeaflet(tg.area),
        createdBy: local?.created_by ?? null,
      })
    }

    // GUARD: If Traccar returned 0 geofences but we have local records,
    // skip cleanup — Traccar may be having a momentary API glitch
    if (traccarGeofences.length === 0 && localMap.size > 0) {
      console.warn('[traccar/geofences] Traccar returned 0 geofences but local DB has records. Skipping orphan cleanup to prevent accidental data loss.')
    } else {
      const orphanedIds: string[] = []
      for (const [traccarId, local] of localMap) {
        if (!traccarIds.has(traccarId)) {
          orphanedIds.push(local.id)
        }
      }
      if (orphanedIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('traccar_geofences').delete().in('id', orphanedIds)
      }
    }

    return NextResponse.json(merged)
  } catch (err) {
    console.error('[traccar/geofences] GET', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Traccar API error' },
      { status: 502 }
    )
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as {
      name: string
      description?: string
      color?: string
      geometry: LeafletGeometry
    }

    if (!body.name || !body.geometry) {
      return NextResponse.json({ error: 'name and geometry required' }, { status: 400 })
    }

    const area = leafletToTraccarWKT(body.geometry)

    const traccarResult = await createTraccarGeofence({
      name: body.name,
      description: body.description ?? '',
      area,
    })

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: local, error: dbError } = await (admin as any)
      .from('traccar_geofences')
      .insert({
        traccar_geofence_id: traccarResult.id,
        name: body.name,
        description: body.description ?? null,
        color: body.color ?? '#3B82F6',
        created_by: user.id,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[traccar/geofences] POST db insert failed', dbError)
    }

    return NextResponse.json({
      id: local?.id ?? '',
      traccarGeofenceId: traccarResult.id,
      name: body.name,
      description: body.description ?? null,
      color: body.color ?? '#3B82F6',
      area: traccarResult.area,
      geometry: body.geometry,
      createdBy: user.id,
    })
  } catch (err) {
    console.error('[traccar/geofences] POST', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Traccar API error' },
      { status: 502 }
    )
  }
}
