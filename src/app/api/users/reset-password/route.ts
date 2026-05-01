import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isRateLimited } from '@/lib/auth/rate-limit'
import { logUserEvent } from '@/lib/auth/audit'
import { passwordSchema } from '@/lib/auth/password-policy'

const bodySchema = z.object({
  user_id: z.string().uuid(),           // profiles.auth_user_id
  password: passwordSchema,
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
  const { user_id, password } = parsed.data

  if (await isRateLimited({
    action: 'user.admin_reset_password',
    actorAuthUserId: gate.authUserId,
    max: 10,
    windowSeconds: 60,
  })) {
    return NextResponse.json({ error: 'Rate limit: 10 resets per minute. Wait and retry.' }, { status: 429 })
  }

  const admin = createAdminClient()

  // Read existing metadata so we merge instead of overwrite.
  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(user_id)
  if (getErr || !existing.user) {
    return NextResponse.json({ error: `User not found: ${getErr?.message ?? 'unknown'}` }, { status: 404 })
  }
  const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
    password,
    user_metadata: existing.user.user_metadata ?? {},
  })
  if (updErr) return NextResponse.json({ error: `Password reset failed: ${updErr.message}` }, { status: 400 })

  // Audit (no password in details).
  await logUserEvent({
    action: 'user.admin_reset_password',
    actorAuthUserId: gate.authUserId,
    targetProfileId: null,
    targetEmail: existing.user.email ?? null,
  })

  return NextResponse.json({ ok: true })
}
