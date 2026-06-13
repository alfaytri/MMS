import { getAccessToken, requireEnv } from './auth'

export type CallStatus = 'ringing' | 'connected'

export interface ActiveCall {
  callId:        number
  customerPhone: string                      // E.164, e.g. "+97472195504"
  status:        CallStatus                  // 'connected' wins over 'ringing' for the same callid
  participants:  Array<{ extension: string, participantId: number }>
  startedAt:     string                      // ISO; first time we saw this callid
}

interface CallControlParticipant {
  id:              number
  callid:          number
  status:          string
  party_caller_id: string
  dn:              string
}

interface CallControlEntry {
  dn:           string
  type:         string
  participants: CallControlParticipant[] | undefined
}

// Qatar local numbers are 8 digits starting with 3/5/6/7/8. 3CX strips the country code on local
// calls — re-attach +974 to be consistent with chat_messages and the inbound banner UI.
//
// Anonymous / withheld / empty caller ids: 3CX may send "anonymous", "Unknown", "", or null.
// Surface as the literal string "Unknown" so the UI can branch without doing a wasted Supabase
// lookup (and so we never form a malformed "+" or "" query).
const UNKNOWN = 'Unknown'

function normalisePhone(raw: string | null | undefined): string {
  if (!raw) return UNKNOWN
  if (/^(anonymous|unknown|withheld|private)$/i.test(raw.trim())) return UNKNOWN
  const digits = raw.replace(/\D/g, '')
  if (!digits) return UNKNOWN
  if (digits.length === 8 && /^[35678]/.test(digits)) return `+974${digits}`
  if (digits.startsWith('974')) return `+${digits}`
  return `+${digits}`
}

export async function fetchActiveCalls(): Promise<ActiveCall[]> {
  const pbx   = requireEnv('3CX_PBX_URL').replace(/\/$/, '')
  const token = await getAccessToken()
  // Next.js fetch cache with 1s revalidate — collapses concurrent polls across
  // serverless instances (Vercel / Cloudflare via OpenNext) down to ~1 req/sec
  // to 3CX. Critical: Next.js 15 disabled fetch caching by default; the explicit
  // `next: { revalidate: 1 }` is required to opt in. Cache key includes the
  // bearer token, so a token refresh (every 60s) won't serve a stale-auth response.
  const res = await fetch(`${pbx}/callcontrol`, {
    method:  'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    next:    { revalidate: 1 },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`3CX /callcontrol failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const entries = await res.json() as CallControlEntry[]

  // Flatten into active-call rows grouped by callid. We include both Ringing and
  // Connected participants so the banner can keep showing the call after pickup.
  const byCallId = new Map<number, ActiveCall>()
  for (const entry of entries) {
    if (entry.type !== 'Wextension') continue
    for (const p of entry.participants ?? []) {
      const isRinging   = p.status === 'Ringing'
      const isConnected = p.status === 'Connected'
      if (!isRinging && !isConnected) continue
      const existing = byCallId.get(p.callid)
      if (existing) {
        existing.participants.push({ extension: p.dn, participantId: p.id })
        // Connected wins over ringing for the call-level status
        if (isConnected) existing.status = 'connected'
      } else {
        byCallId.set(p.callid, {
          callId:        p.callid,
          customerPhone: normalisePhone(p.party_caller_id),
          status:        isConnected ? 'connected' : 'ringing',
          participants:  [{ extension: p.dn, participantId: p.id }],
          startedAt:     new Date().toISOString(),
        })
      }
    }
  }

  // Sort participants by extension ascending for stable comparison in tests + UI.
  return Array.from(byCallId.values()).map((c) => ({
    ...c,
    participants: [...c.participants].sort((a, b) => a.extension.localeCompare(b.extension)),
  }))
}
