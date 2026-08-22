// OAuth2 client-credentials token cache for the 3CX XAPI.
// Cached in module memory — one cache per Node.js process. Safe under Next.js
// because every server-side route hits the same process.

interface CachedToken {
  token:     string
  expiresAt: number  // epoch ms
}

let cached: CachedToken | null = null
// 3CX V20 issues access tokens with a 60 s TTL (verified 2026-06-11 against
// alfaytri.3cx.asia). Refresh 5 s before expiry so a call initiated near the
// boundary still has a valid token by the time the MakeCall round-trips.
const REFRESH_MARGIN_MS = 5_000

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

async function fetchToken(): Promise<CachedToken> {
  const pbx = requireEnv('3CX_PBX_URL').replace(/\/$/, '')
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     requireEnv('3CX_CLIENT_ID'),
    client_secret: requireEnv('3CX_CLIENT_SECRET'),
  })
  const res = await fetch(`${pbx}/connect/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`3CX token request failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const json = await res.json() as { access_token?: string, expires_in?: number }
  if (typeof json.access_token !== 'string') {
    throw new Error('3CX token response missing access_token')
  }
  const expiresInMs = (json.expires_in ?? 60) * 1000
  return { token: json.access_token, expiresAt: Date.now() + expiresInMs }
}

// No in-flight promise dedup: concurrent callers during a cold cache will
// each fetch a token; the last write wins. Acceptable for the dialer's low
// concurrency profile (one user, one button click at a time).
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cached.token
  }
  cached = await fetchToken()
  return cached.token
}

// Test-only hook to reset the in-memory cache between tests.
export function __resetTokenCacheForTests(): void {
  cached = null
}
