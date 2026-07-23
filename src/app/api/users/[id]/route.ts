import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logUserEvent } from '@/lib/auth/audit'
import type { Database } from '@/types/database.types'

const bodySchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  is_active: z.boolean().optional(),
  role_ids: z.array(z.string().uuid()).optional(),
  role_assignments: z.array(z.object({
    role_id:         z.string().uuid(),
    approval_scopes: z.array(z.enum(['po','inv_check','stock_adj','sales_margin','sales_credit'])).nullable().optional(),
  })).optional(),
  is_division_manager: z.boolean().optional(),
  has_contact_centre_access: z.boolean().optional(),
  // 3CX extension: empty string clears it. 2–8 digits when set.
  threecx_extension: z.string().trim().regex(/^\d{2,8}$|^$/, 'Extension must be 2-8 digits').nullable().optional(),
  phone: z.string().trim().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetAuthUserId } = await params

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
  const changes = parsed.data

  if (targetAuthUserId === gate.authUserId && changes.is_active === false) {
    return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 400 })
  }

  const admin = createAdminClient()

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

  const profileUpdates: Record<string, unknown> = {}
  if (changes.full_name !== undefined) profileUpdates.full_name = changes.full_name
  if (changes.email !== undefined) profileUpdates.email = changes.email
  if (changes.is_active !== undefined) profileUpdates.is_active = changes.is_active
  if (changes.is_division_manager !== undefined) profileUpdates.is_division_manager = changes.is_division_manager
  if (changes.has_contact_centre_access !== undefined) profileUpdates.has_contact_centre_access = changes.has_contact_centre_access
  if (changes.phone !== undefined) profileUpdates.phone = changes.phone && changes.phone.length > 0 ? changes.phone : null
  if (changes.threecx_extension !== undefined) {
    profileUpdates.threecx_extension = changes.threecx_extension && changes.threecx_extension.length > 0
      ? changes.threecx_extension
      : null
  }

  let profileId: string | null = null
  if (Object.keys(profileUpdates).length > 0 || changes.role_ids !== undefined || changes.role_assignments !== undefined) {
    const { data: existingProfile, error: selErr } = await admin
      .from('user_data')
      .select('id')
      .eq('auth_user_id', targetAuthUserId)
      .maybeSingle()
    if (selErr || !existingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    profileId = existingProfile.id as string

    if (Object.keys(profileUpdates).length > 0) {
      const { error: updErr } = await admin
        .from('user_data')
        .update(profileUpdates as Database['public']['Tables']['profiles']['Update'])
        .eq('auth_user_id', targetAuthUserId)
      if (updErr) {
        if (/duplicate|unique/i.test(updErr.message) && /threecx|extension/i.test(updErr.message)) {
          return NextResponse.json({ error: 'That extension is already assigned to another user' }, { status: 409 })
        }
        return NextResponse.json({ error: `Profile update failed: ${updErr.message}` }, { status: 500 })
      }
    }
  }

  if ((changes.role_assignments !== undefined || changes.role_ids !== undefined) && profileId) {
    const assignments =
      changes.role_assignments ??
      (changes.role_ids ?? []).map((role_id) => ({ role_id, approval_scopes: null }))

    const { error: rpcErr } = await admin.rpc('replace_user_custom_roles_v2', {
      p_user_id:     profileId,
      p_assignments: assignments,
    })
    if (rpcErr) return NextResponse.json({ error: `Role replace failed: ${rpcErr.message}` }, { status: 500 })
  }

  await logUserEvent({
    action: 'user.admin_update',
    actorAuthUserId: gate.authUserId,
    targetProfileId: profileId,
    targetEmail: changes.email ?? null,
    changedFields: Object.keys(changes),
  })

  return NextResponse.json({ ok: true, profile_id: profileId, changed_fields: Object.keys(changes) })
}
