import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logUserEvent } from '@/lib/auth/audit'

const bodySchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  is_active: z.boolean().optional(),
  role_ids: z.array(z.string().uuid()).optional(),
  is_team_leader: z.boolean().optional(),
  employee_id: z.string().uuid().optional(),
  demote_team_leader: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetAuthUserId } = await params

  // 1. Admin gate.
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  // 2. Parse + validate.
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const changes = parsed.data

  // 3. Self-deactivation guard.
  if (targetAuthUserId === gate.authUserId && changes.is_active === false) {
    return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 3b. Handle team leader promotion (OFF → ON)
  if (changes.is_team_leader === true && changes.employee_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: emp } = await (admin as any)
      .from('employees')
      .select('id, profile_id, teams!teams_leader_id_fkey(id)')
      .eq('id', changes.employee_id)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentProfile } = await (admin as any)
      .from('profiles')
      .select('id')
      .eq('auth_user_id', targetAuthUserId)
      .maybeSingle()

    if (currentProfile) {
      // Clear old employee link if switching employees
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from('employees')
        .update({ profile_id: null })
        .eq('profile_id', currentProfile.id)
        .neq('id', changes.employee_id)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from('employees')
        .update({ profile_id: currentProfile.id })
        .eq('id', changes.employee_id)
    }

    const teamId = Array.isArray(emp?.teams) ? emp.teams[0]?.id
      : (emp?.teams as { id: string } | null)?.id ?? null

    await admin.auth.admin.updateUserById(targetAuthUserId, {
      user_metadata: { is_team_leader: true, team_id: teamId ?? undefined },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('profiles')
      .update({ user_type: 'team-leader' })
      .eq('auth_user_id', targetAuthUserId)
  }

  // 3c. Handle demotion (ON → OFF)
  if (changes.demote_team_leader === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentProfile } = await (admin as any)
      .from('profiles')
      .select('id')
      .eq('auth_user_id', targetAuthUserId)
      .maybeSingle()

    if (currentProfile) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from('employees')
        .update({ profile_id: null })
        .eq('profile_id', currentProfile.id)
    }

    await admin.auth.admin.updateUserById(targetAuthUserId, {
      user_metadata: { is_team_leader: false },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('profiles')
      .update({ user_type: 'internal' })
      .eq('auth_user_id', targetAuthUserId)
  }

  // 4. Email change (hits auth.users) — must not clobber user_metadata.
  if (changes.email) {
    const { data: existing } = await admin.auth.admin.getUserById(targetAuthUserId)
    const mergedMeta = { ...(existing.user?.user_metadata ?? {}) }
    const { error: emailErr } = await admin.auth.admin.updateUserById(targetAuthUserId, {
      email: changes.email,
      email_confirm: true,
      user_metadata: mergedMeta,
    })
    if (emailErr) return NextResponse.json({ error: `Email update failed: ${emailErr.message}` }, { status: 400 })
  }

  // 5. Profile updates (other than roles).
  const profileUpdates: Record<string, unknown> = {}
  if (changes.full_name !== undefined) profileUpdates.full_name = changes.full_name
  if (changes.email !== undefined) profileUpdates.email = changes.email
  if (changes.is_active !== undefined) profileUpdates.is_active = changes.is_active

  let profileId: string | null = null
  if (Object.keys(profileUpdates).length > 0 || changes.role_ids !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingProfile, error: selErr } = await (admin as any)
      .from('profiles')
      .select('id')
      .eq('auth_user_id', targetAuthUserId)
      .maybeSingle()
    if (selErr || !existingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    profileId = existingProfile.id as string

    if (Object.keys(profileUpdates).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (admin as any)
        .from('profiles')
        .update(profileUpdates)
        .eq('auth_user_id', targetAuthUserId)
      if (updErr) return NextResponse.json({ error: `Profile update failed: ${updErr.message}` }, { status: 500 })
    }
  }

  // 6. Role replace via atomic RPC (if role_ids supplied, even empty array).
  if (changes.role_ids !== undefined && profileId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (admin as any).rpc('replace_user_custom_roles', {
      p_user_id: profileId,
      p_role_ids: changes.role_ids,
    })
    if (rpcErr) return NextResponse.json({ error: `Role replace failed: ${rpcErr.message}` }, { status: 500 })
  }

  // 7. Audit.
  await logUserEvent({
    action: 'user.admin_update',
    actorAuthUserId: gate.authUserId,
    targetProfileId: profileId,
    targetEmail: changes.email ?? null,
    changedFields: Object.keys(changes),
  })

  return NextResponse.json({ ok: true, profile_id: profileId, changed_fields: Object.keys(changes) })
}
