import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isRateLimited } from '@/lib/auth/rate-limit'
import { logUserEvent } from '@/lib/auth/audit'
import { passwordSchema } from '@/lib/auth/password-policy'

const bodySchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  username: z.string().trim().toLowerCase()
    .min(1, 'Username is required')
    .regex(/^[a-z0-9._-]+$/, 'Only lowercase letters, numbers, dots, hyphens, and underscores'),
  password: passwordSchema,
  role_ids: z.array(z.string().uuid()).default([]),
  is_division_manager: z.boolean().default(false),
  has_contact_centre_access: z.boolean().default(false),
  threecx_extension: z.string().trim().regex(/^\d{2,8}$|^$/, 'Extension must be 2-8 digits').optional(),
  phone: z.string().trim().optional(),
})

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const {
    full_name, username, password, role_ids,
    is_division_manager, has_contact_centre_access, threecx_extension, phone,
  } = parsed.data
  const email = `${username}@mms.local`

  if (await isRateLimited({
    action: 'user.admin_create',
    actorAuthUserId: gate.authUserId,
    max: 10,
    windowSeconds: 60,
  })) {
    return NextResponse.json({ error: 'Rate limit: 10 creates per minute. Wait and retry.' }, { status: 429 })
  }

  const admin = createAdminClient()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  })
  if (createErr || !created.user) {
    return NextResponse.json({ error: `Auth user creation failed: ${createErr?.message ?? 'unknown'}` }, { status: 400 })
  }
  const authUserId = created.user.id

  const { data: profile, error: profErr } = await admin
    .from('user_data')
    .insert({
      auth_user_id: authUserId,
      email,
      full_name,
      user_type: 'internal',
      is_active: true,
      created_by: gate.authUserId,
      is_division_manager,
      has_contact_centre_access,
      threecx_extension: threecx_extension && threecx_extension.length > 0 ? threecx_extension : null,
      phone: phone && phone.length > 0 ? phone : null,
    })
    .select('id')
    .single()
  if (profErr) {
    if (/duplicate|unique/i.test(profErr.message) && /threecx|extension/i.test(profErr.message)) {
      await admin.auth.admin.deleteUser(authUserId)
      return NextResponse.json({ error: 'That extension is already assigned to another user' }, { status: 409 })
    }
    return NextResponse.json(
      { error: `Auth user created but profile insert failed: ${profErr.message}` },
      { status: 500 }
    )
  }

  let roleWarning: string | null = null
  if (role_ids.length > 0) {
    const { error: rpcErr } = await admin.rpc('replace_user_custom_roles_v2', {
      p_user_id: profile.id,
      p_assignments: (role_ids ?? []).map((role_id: string) => ({ role_id, approval_scopes: null })),
    })
    if (rpcErr) roleWarning = `Roles not assigned: ${rpcErr.message}`
  }

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
