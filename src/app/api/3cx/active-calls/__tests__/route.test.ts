import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import * as activeCalls from '@/lib/3cx/active-calls'

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  maybeSingle: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function req(): Request {
  return new Request('http://localhost/api/3cx/active-calls', { method: 'GET' })
}

describe('GET /api/3cx/active-calls', () => {
  it('401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns empty array when caller has no extension assigned', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: null } })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ calls: [] })
  })

  it('returns only ringing calls that include the caller extension', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: '112' } })
    vi.spyOn(activeCalls, 'fetchRingingCalls').mockResolvedValue([
      { callId: 40, customerPhone: '+97472195504', ringingExtensions: ['101', '112'], startedAt: '2026-06-12T20:35:21Z' },
      { callId: 41, customerPhone: '+97455000000', ringingExtensions: ['101'],        startedAt: '2026-06-12T20:35:25Z' },
    ])
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.calls).toHaveLength(1)
    expect(body.calls[0].callId).toBe(40)
  })

  it('502 when upstream /callcontrol fails', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: '112' } })
    vi.spyOn(activeCalls, 'fetchRingingCalls').mockRejectedValue(new Error('3CX /callcontrol failed: 500'))
    const res = await GET(req())
    expect(res.status).toBe(502)
  })
})
