import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { logUserEvent } from '@/lib/auth/audit'
import { passwordSchema } from '@/lib/auth/password-policy'

const bodySchema = z.object({
  current_password: z.string().optional(),
  new_password: passwordSchema,
})

export async function POST(request: Request) {
  const gate = await requireAuth()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const { current_password, new_password } = parsed.data

  const supabase = await createServerClient()

  // If current_password is provided, verify it before proceeding.
  // The forced-change flow (admin reset) skips this check.
  if (current_password) {
    if (!gate.email) return NextResponse.json({ error: 'Cannot verify password — no email on account' }, { status: 400 })
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: gate.email,
      password: current_password,
    })
    if (signInErr) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
  }

  const { error: updErr } = await supabase.auth.updateUser({
    password: new_password,
    data: { must_change_password: false },
  })
  if (updErr) return NextResponse.json({ error: `Password update failed: ${updErr.message}` }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('user_data')
    .update({ must_change_password: false })
    .eq('auth_user_id', gate.authUserId)

  await logUserEvent({
    action: 'user.self_change_password',
    actorAuthUserId: gate.authUserId,
    targetProfileId: null,
    targetEmail: gate.email,
  })

  return NextResponse.json({ ok: true })
}
