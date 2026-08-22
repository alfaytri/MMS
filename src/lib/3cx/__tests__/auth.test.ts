import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getAccessToken, __resetTokenCacheForTests } from '../auth'

const ORIG_ENV = { ...process.env }

beforeEach(() => {
  __resetTokenCacheForTests()
  process.env['3CX_PBX_URL']      = 'https://pbx.test'
  process.env['3CX_CLIENT_ID']    = 'cid'
  process.env['3CX_CLIENT_SECRET'] = 'csec'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  process.env = { ...ORIG_ENV }
})

function mockTokenResponse(token: string, expiresIn: number) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, token_type: 'Bearer', expires_in: expiresIn }),
    text: async () => JSON.stringify({ access_token: token, expires_in: expiresIn }),
  }) as unknown as typeof fetch
}

describe('getAccessToken', () => {
  it('fetches a token on first call', async () => {
    mockTokenResponse('tok-1', 60)
    const t = await getAccessToken()
    expect(t).toBe('tok-1')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('reuses cached token within validity window', async () => {
    mockTokenResponse('tok-1', 60)
    await getAccessToken()
    await getAccessToken()
    await getAccessToken()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes when token is within the refresh margin of expiry', async () => {
    // Preflight against the live PBX confirmed expires_in is 60 s, so the
    // refresh margin must be small (5 s). With a 60 s TTL, we refresh once
    // less than 5 s remain.
    mockTokenResponse('tok-1', 60)
    await getAccessToken()
    vi.setSystemTime(new Date('2026-06-11T10:00:56Z'))  // 4 s before expiry
    mockTokenResponse('tok-2', 60)
    const t = await getAccessToken()
    expect(t).toBe('tok-2')
  })

  it('reuses cached token until close to expiry', async () => {
    mockTokenResponse('tok-1', 60)
    await getAccessToken()
    vi.setSystemTime(new Date('2026-06-11T10:00:50Z'))  // 10 s before expiry — still cached
    const t = await getAccessToken()
    expect(t).toBe('tok-1')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('throws on non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      text: async () => 'invalid_client',
    }) as unknown as typeof fetch
    await expect(getAccessToken()).rejects.toThrow(/401/)
  })

  it('throws if env vars are missing', async () => {
    delete process.env['3CX_CLIENT_ID']
    await expect(getAccessToken()).rejects.toThrow(/3CX_CLIENT_ID/)
  })
})
