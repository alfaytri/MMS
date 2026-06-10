import { getThreeCxToken } from './auth'

export type ApiError =
  | { kind: 'pbx_unreachable' }
  | { kind: 'unauthorized' }
  | { kind: 'not_found' }
  | { kind: 'busy' }
  | { kind: 'invalid_number' }
  | { kind: 'unknown'; status: number; body: string }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

async function callThreeCx<T>(
  path: string,
  init: RequestInit = {},
  retryOn401 = true,
): Promise<ApiResult<T>> {
  const pbxUrl = process.env['3CX_PBX_URL']
  if (!pbxUrl) return { ok: false, error: { kind: 'pbx_unreachable' } }

  let token: string
  try {
    token = await getThreeCxToken()
  } catch {
    return { ok: false, error: { kind: 'pbx_unreachable' } }
  }

  let res: Response
  try {
    res = await fetch(`${pbxUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  } catch {
    return { ok: false, error: { kind: 'pbx_unreachable' } }
  }

  if (res.status === 401 && retryOn401) {
    const { _resetTokenCache } = await import('./auth')
    _resetTokenCache()
    return callThreeCx<T>(path, init, false)
  }
  if (res.status === 401) return { ok: false, error: { kind: 'unauthorized' } }
  if (res.status === 404) return { ok: false, error: { kind: 'not_found' } }
  if (res.status === 409) return { ok: false, error: { kind: 'busy' } }
  if (res.status === 400) return { ok: false, error: { kind: 'invalid_number' } }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: { kind: 'unknown', status: res.status, body } }
  }

  const data = (await res.json().catch(() => ({}))) as T
  return { ok: true, data }
}

// 3CX V20 response envelope
interface ThreeCxEnvelope {
  finalstatus: string
  reason: string
  reasontext: string
  result: Record<string, unknown>
}

// 3CX extension info shape
interface ThreeCxExtInfo {
  dn: string
  type: string
  devices: Array<{ device_id: string; user_agent: string }>
}

export const threeCx = {
  /**
   * Place an outbound call. Returns the PBX call ID as a string.
   * The agent's softphone will ring — they must answer manually.
   * (3CX V20 Call Control API has no programmatic answer endpoint.)
   */
  async makeCall(extension: string, destinationE164: string): Promise<ApiResult<{ callId: string }>> {
    const raw = await callThreeCx<ThreeCxEnvelope>(`/callcontrol/${extension}/makecall`, {
      method: 'POST',
      body: JSON.stringify({ destination: destinationE164 }),
    })
    if (!raw.ok) return raw
    const id = raw.data.result?.callid ?? raw.data.result?.id
    if (id == null) {
      return { ok: false, error: { kind: 'unknown', status: 200, body: 'no callid in response' } }
    }
    return { ok: true, data: { callId: String(id) } }
  },

  async drop(extension: string, callId: string): Promise<ApiResult<void>> {
    return callThreeCx<void>(`/callcontrol/${extension}/drop`, {
      method: 'POST',
      body: JSON.stringify({ callid: callId }),
    })
  },

  /**
   * Poll the extension for active participants. The call's state
   * comes from the participants array in the extension info.
   */
  async getStatus(extension: string, callId: string): Promise<ApiResult<{ state: string }>> {
    const raw = await callThreeCx<ThreeCxExtInfo & { participants?: Array<{ callid: number; status: string }> }>(
      `/callcontrol/${extension}`,
      { method: 'GET' },
    )
    if (!raw.ok) return raw
    const p = raw.data.participants?.find(
      (x: { callid: number }) => String(x.callid) === callId,
    )
    return { ok: true, data: { state: p?.status ?? 'ended' } }
  },

  async getExtension(extension: string): Promise<ApiResult<{ registered: boolean; endpoint?: string }>> {
    const raw = await callThreeCx<ThreeCxExtInfo>(`/callcontrol/${extension}`, { method: 'GET' })
    if (!raw.ok) return raw
    const devices = raw.data.devices ?? []
    return {
      ok: true,
      data: {
        registered: devices.length > 0,
        endpoint: devices[0]?.user_agent,
      },
    }
  },
}
