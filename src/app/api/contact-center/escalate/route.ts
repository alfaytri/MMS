import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const visitId  = formData.get('visit_id') as string
    const teamId   = formData.get('team_id')  as string
    const notes    = formData.get('notes')    as string | null

    if (!visitId || !teamId) {
      return NextResponse.json({ error: 'visit_id and team_id required' }, { status: 400 })
    }

    // Upload building photos
    const buildingUrls: string[] = []
    let i = 0
    while (formData.has(`building_${i}`)) {
      const blob = formData.get(`building_${i}`) as File
      const path = `escalations/${visitId}/building_${i}_${Date.now()}.jpg`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).storage
        .from('team-escalations')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (!error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: { publicUrl } } = (supabase as any).storage
          .from('team-escalations').getPublicUrl(path)
        buildingUrls.push(publicUrl)
      }
      i++
    }

    // Upload call screenshots
    const callUrls: string[] = []
    i = 0
    while (formData.has(`call_${i}`)) {
      const blob = formData.get(`call_${i}`) as File
      const path = `escalations/${visitId}/call_${i}_${Date.now()}.jpg`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).storage
        .from('team-escalations')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (!error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: { publicUrl } } = (supabase as any).storage
          .from('team-escalations').getPublicUrl(path)
        callUrls.push(publicUrl)
      }
      i++
    }

    // Update visit status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('visits')
      .update({ status: 'customer-unavailable' })
      .eq('id', visitId)

    // Create CC escalation task
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: taskErr } = await (supabase as any)
      .from('contact_center_tasks')
      .insert({
        visit_id:              visitId,
        team_id:               teamId,
        type:                  'customer-unavailable',
        building_photo_urls:   buildingUrls,
        call_screenshot_urls:  callUrls,
        notes:                 notes ?? null,
        status:                'open',
        created_by:            user.id,
      })

    if (taskErr) throw taskErr

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Escalation failed' },
      { status: 500 }
    )
  }
}
