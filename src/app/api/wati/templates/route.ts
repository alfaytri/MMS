import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Lists WATI message templates directly, bypassing the api-wati Edge Function
// (which 403s on user JWTs). Feeds the Contact Centre template picker.
const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!WATI_URL || !WATI_TOKEN) return NextResponse.json({ messageTemplates: [] })

  try {
    const res = await fetch(`${WATI_URL}/api/v1/getMessageTemplates?pageSize=250&pageNumber=0`, {
      headers: { Authorization: `Bearer ${WATI_TOKEN}` },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json().catch(() => ({}))
    return NextResponse.json({ messageTemplates: data?.messageTemplates ?? [] })
  } catch {
    return NextResponse.json({ messageTemplates: [] })
  }
}
