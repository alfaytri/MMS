import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import * as activeCalls from '@/lib/3cx/active-calls'
import * as callControl from '@/lib/3cx/call-control'

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

function req(body: unknown): Request {
  return new Request('http://localhost/api/3cx/call/hangup', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

describe('POST /api/3cx/call/hangup', () => {
  it('401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req({ callId: 50 }))
    expect(res.status).toBe(401)
  })

  it('400 when callId is missing or not a number', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/callId/)
  })

  it('403 when caller has no extension assigned', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: null }, error: null })
    const res = await POST(req({ callId: 50 }))
    expect(res.status).toBe(403)
  })

  it('404 when the callId is not in active calls', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: '112' }, error: null })
    vi.spyOn(activeCalls, 'fetchActiveCalls').mockResolvedValue([])
    const res = await POST(req({ callId: 50 }))
    expect(res.status).toBe(404)
  })

  it('403 when the agent is not a participant on this call', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: '112' }, error: null })
    vi.spyOn(activeCalls, 'fetchActiveCalls').mockResolvedValue([
      {
        callId:        50,
        customerPhone: '+97472195504',
        status:        'connected',
        participants:  [{ extension: '101', participantId: 700 }],
        startedAt:     '2026-06-13T08:10:00Z',
      },
    ])
    const res = await POST(req({ callId: 50 }))
    expect(res.status).toBe(403)
  })

  it('200 when drop succeeds — and dropCall was called with the agent\'s ext + participantId', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: '112' }, error: null })
    vi.spyOn(activeCalls, 'fetchActiveCalls').mockResolvedValue([
      {
        callId:        50,
        customerPhone: '+97472195504',
        status:        'connected',
        participants:  [{ extension: '112', participantId: 701 }],
        startedAt:     '2026-06-13T08:10:00Z',
      },
    ])
    const dropMock = vi.spyOn(callControl, 'dropCall').mockResolvedValue()
    const res = await POST(req({ callId: 50 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(dropMock).toHaveBeenCalledWith('112', 701)
  })
})
