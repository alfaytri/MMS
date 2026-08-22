import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../make/route'
import * as makeCallMod from '@/lib/3cx/make-call'

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
  return new Request('http://localhost/api/3cx/call/make', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

describe('POST /api/3cx/call/make', () => {
  it('401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req({ destination: '+97455123456' }))
    expect(res.status).toBe(401)
  })

  it('400 when destination missing', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('409 when caller has no threecx_extension assigned', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: null } })
    const res = await POST(req({ destination: '+97455123456' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/extension/i)
  })

  it('200 when call is initiated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: '101' } })
    const spy = vi.spyOn(makeCallMod, 'makeCall').mockResolvedValue()
    const res = await POST(req({ destination: '+97455123456' }))
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledWith({ extension: '101', destination: '+97455123456' })
  })

  it('502 when upstream MakeCall fails', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: '101' } })
    vi.spyOn(makeCallMod, 'makeCall').mockRejectedValue(new Error('3CX MakeCall failed: 500'))
    const res = await POST(req({ destination: '+97455123456' }))
    expect(res.status).toBe(502)
  })

  it('strips spaces, dashes, and parens from destination before validation', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.maybeSingle.mockResolvedValue({ data: { threecx_extension: '101' } })
    const spy = vi.spyOn(makeCallMod, 'makeCall').mockResolvedValue()
    const res = await POST(req({ destination: '+974 (5512)-3456' }))
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledWith({ extension: '101', destination: '+97455123456' })
  })
})
