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
  const { full_name, email, password, role_ids } = parsed.data

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
    user_metadata: { full_name, must_change_password: true },
  })
  if (createErr || !created.user) {
    return NextResponse.json({ error: `Auth user creation failed: ${createErr?.message ?? 'unknown'}` }, { status: 400 })
  }
  const authUserId = created.user.id

  // 5. Insert profile (dual-write mirror of must_change_password).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: profErr } = await (admin as any)
    .from('profiles')
    .insert({
      auth_user_id: authUserId,
      email,
      full_name,
      user_type: 'internal',
      is_active: true,
      must_change_password: true,
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

  // 6. Assign roles via atomic RPC (non-fatal on failure).
  let roleWarning: string | null = null
  if (role_ids.length > 0) {
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
