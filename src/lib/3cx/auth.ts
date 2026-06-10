interface CachedToken {
  token: string
  expiresAt: number
}

let cache: CachedToken | null = null

export function _resetTokenCache(): void {
  cache = null
}

export async function getThreeCxToken(): Promise<string> {
  const now = Date.now()

  if (cache && now < cache.expiresAt - 5 * 60_000) {
    return cache.token
  }

  const pbxUrl = process.env['3CX_PBX_URL']
  const clientId = process.env['3CX_CLIENT_ID']
  const clientSecret = process.env['3CX_CLIENT_SECRET']

  if (!pbxUrl || !clientId || !clientSecret) {
    throw new Error('3cx_auth_failed: missing env vars 3CX_PBX_URL / 3CX_CLIENT_ID / 3CX_CLIENT_SECRET')
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(`${pbxUrl}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`3cx_auth_failed: ${res.status} ${detail}`)
  }

  const json = (await res.json()) as { access_token: string; expires_in: number }
  cache = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  }
  return json.access_token
}
