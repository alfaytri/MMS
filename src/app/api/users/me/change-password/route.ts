import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { logUserEvent } from '@/lib/auth/audit'
import { passwordSchema } from '@/lib/auth/password-policy'

const bodySchema = z.object({
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
  const { new_password } = parsed.data

  // User's OWN session — not admin client — so Supabase enforces they can
  // only change their own password.
  const supabase = await createServerClient()
  const { error: updErr } = await supabase.auth.updateUser({
    password: new_password,
    data: { must_change_password: false },
  })
  if (updErr) return NextResponse.json({ error: `Password update failed: ${updErr.message}` }, { status: 400 })

  // Mirror to profiles (via admin client so RLS doesn't bite).
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('profiles')
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
