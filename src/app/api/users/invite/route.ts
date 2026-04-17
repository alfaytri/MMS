import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

// POST /api/users/invite
// Body: { email, full_name, user_type?: 'internal' | 'external' }
// 1. Requires the caller to be authenticated.
// 2. Uses admin API to send an invite email (creates auth.users row).
// 3. Inserts a matching row in public.profiles so the user is visible immediately.
export async function POST(request: Request) {
  try {
    // ─── Auth check ────────────────────────────────────────────────────────
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ─── Parse body ────────────────────────────────────────────────────────
    let body: { email?: string; full_name?: string; user_type?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const email = (body.email ?? '').trim().toLowerCase()
    const full_name = (body.full_name ?? '').trim()
    const user_type = body.user_type === 'external' ? 'external' : 'internal'

    if (!email || !full_name) {
      return NextResponse.json(
        { error: 'email and full_name are required' },
        { status: 400 }
      )
    }

    // ─── Invite via Supabase admin API ─────────────────────────────────────
    const admin = createAdminClient()

    const { data: inviteRes, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name },
      })

    if (inviteErr) {
      return NextResponse.json(
        { error: `Invite failed: ${inviteErr.message}` },
        { status: 400 }
      )
    }

    const authUserId = inviteRes.user?.id
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Invite succeeded but no auth user id returned' },
        { status: 500 }
      )
    }

    // ─── Create matching profile row ───────────────────────────────────────
    const { data: profile, error: profErr } = await (admin as any)
      .from('profiles')
      .insert({
        auth_user_id: authUserId,
        email,
        full_name,
        user_type,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single()

    if (profErr) {
      // Invite email already sent but profile couldn't be created.
      // Report it so the caller can retry/fix.
      return NextResponse.json(
        {
          error: `Invite email sent to ${email} but profile row failed: ${profErr.message}. ` +
            `The auth user exists — you can add their profile manually or retry.`,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ profile })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
