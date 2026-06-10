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

export const threeCx = {
  async makeCall(extension: string, destinationE164: string): Promise<ApiResult<{ callId: string }>> {
    return callThreeCx<{ callId: string }>(`/callcontrol/${extension}/makecall`, {
      method: 'POST',
      body: JSON.stringify({
        destination: destinationE164,
        auto_answer: true,
      }),
    })
  },

  async answer(extension: string, callId: string): Promise<ApiResult<void>> {
    return callThreeCx<void>(`/callcontrol/${extension}/answer`, {
      method: 'POST',
      body: JSON.stringify({ callId }),
    })
  },

  async drop(extension: string, callId: string): Promise<ApiResult<void>> {
    return callThreeCx<void>(`/callcontrol/${extension}/drop`, {
      method: 'POST',
      body: JSON.stringify({ callId }),
    })
  },

  async getStatus(extension: string, callId: string): Promise<ApiResult<{ state: string }>> {
    return callThreeCx<{ state: string }>(
      `/callcontrol/${extension}/calls/${encodeURIComponent(callId)}`,
      { method: 'GET' },
    )
  },

  async getExtension(extension: string): Promise<ApiResult<{ registered: boolean; endpoint?: string }>> {
    return callThreeCx<{ registered: boolean; endpoint?: string }>(
      `/callcontrol/${extension}`,
      { method: 'GET' },
    )
  },
}
