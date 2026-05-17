import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'

export async function PATCH(request: Request) {
  // ── 1. Verify authenticated session ──────────────────────────────────────────
  const gate = await requireAuth()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  // ── 2. Parse and validate request body ──────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { provider } = body as { provider?: unknown }

  // ── 3. Validate provider value ──────────────────────────────────────────────
  if (provider !== 'wati' && provider !== 'whapi') {
    return NextResponse.json(
      { error: "provider must be 'wati' or 'whapi'" },
      { status: 400 }
    )
  }

  // ── 4. Upsert into app_settings via service-role client ─────────────────────
  const admin = createAdminClient()
  const { error } = await (admin as any).from('app_settings').upsert(
    {
      key: 'cc_provider',
      value: JSON.stringify(provider), // Produces '"wati"' or '"whapi"' which is valid JSONB
    },
    {
      onConflict: 'key',
    }
  )

  if (error) {
    console.error('[cc-provider] upsert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
