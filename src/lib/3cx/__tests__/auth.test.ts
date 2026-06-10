import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getThreeCxToken, _resetTokenCache } from '../auth'

const originalFetch = global.fetch

beforeEach(() => {
  _resetTokenCache()
  process.env['3CX_PBX_URL'] = 'https://pbx.test.local'
  process.env['3CX_CLIENT_ID'] = 'test_client'
  process.env['3CX_CLIENT_SECRET'] = 'test_secret'
})

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('getThreeCxToken', () => {
  it('fetches token on first call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok_abc', expires_in: 3600 }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const token = await getThreeCxToken()
    expect(token).toBe('tok_abc')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://pbx.test.local/connect/token',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns cached token on second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok_abc', expires_in: 3600 }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await getThreeCxToken()
    await getThreeCxToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws on non-OK token response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid_client',
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(getThreeCxToken()).rejects.toThrow(/3cx_auth_failed/)
  })
})
