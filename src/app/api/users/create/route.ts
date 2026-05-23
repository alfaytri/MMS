import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isRateLimited } from '@/lib/auth/rate-limit'
import { logUserEvent } from '@/lib/auth/audit'
import { passwordSchema } from '@/lib/auth/password-policy'

const bodySchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().toLowerCase().email('Valid email required'),
  password: passwordSchema,
  role_ids: z.array(z.string().uuid()).default([]),
  is_team_leader: z.boolean().default(false),
  employee_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  // 1. Admin gate.
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  // 2. Validate.
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const { full_name, email, password, role_ids, is_team_leader, employee_id } = parsed.data

  // 3. Rate limit.
  if (await isRateLimited({
    action: 'user.admin_create',
    actorAuthUserId: gate.authUserId,
    max: 10,
    windowSeconds: 60,
  })) {
    return NextResponse.json({ error: 'Rate limit: 10 creates per minute. Wait and retry.' }, { status: 429 })
  }

  // 4. Create auth user.
  const admin = createAdminClient()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: is_team_leader
      ? { full_name, is_team_leader: true }
      : { full_name },
  })
  if (createErr || !created.user) {
    return NextResponse.json({ error: `Auth user creation failed: ${createErr?.message ?? 'unknown'}` }, { status: 400 })
  }
  const authUserId = created.user.id

  // 5. Insert profile.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: profErr } = await (admin as any)
    .from('profiles')
    .insert({
      auth_user_id: authUserId,
      email,
      full_name,
      user_type: is_team_leader ? 'team-leader' : 'internal',
      is_active: true,
      created_by: gate.authUserId,
    })
    .select('id')
    .single()
  if (profErr) {
    return NextResponse.json(
      { error: `Auth user created but profile insert failed: ${profErr.message}` },
      { status: 500 }
    )
  }

  // 6a. Link employee if team leader.
  if (is_team_leader && employee_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: emp } = await (admin as any)
      .from('employees')
      .select('id, teams!teams_leader_id_fkey(id)')
      .eq('id', employee_id)
      .maybeSingle()

    const teamId = Array.isArray(emp?.teams) ? emp.teams[0]?.id
      : (emp?.teams as { id: string } | null)?.id ?? null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('employees')
      .update({ profile_id: profile.id })
      .eq('id', employee_id)

    if (teamId) {
      await admin.auth.admin.updateUserById(authUserId, {
        user_metadata: { full_name, is_team_leader: true, team_id: teamId },
      })
    }
  }

  // 6b. Assign roles via atomic RPC (non-fatal on failure, skip for TL).
  let roleWarning: string | null = null
  if (!is_team_leader && role_ids.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (admin as any).rpc('replace_user_custom_roles', {
      p_user_id: profile.id,
      p_role_ids: role_ids,
    })
    if (rpcErr) roleWarning = `Roles not assigned: ${rpcErr.message}`
  }

  // 7. Audit.
  await logUserEvent({
    action: 'user.admin_create',
    actorAuthUserId: gate.authUserId,
    targetProfileId: profile.id,
    targetEmail: email,
  })

  return NextResponse.json({
    profile: { id: profile.id, auth_user_id: authUserId, email, full_name },
    assigned_role_ids: roleWarning ? [] : role_ids,
    ...(roleWarning ? { warning: roleWarning } : {}),
  })
}
