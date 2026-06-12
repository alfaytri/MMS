import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchRingingCalls } from '../active-calls'
import * as auth from '../auth'

beforeEach(() => {
  process.env['3CX_PBX_URL'] = 'https://pbx.test'
  vi.spyOn(auth, 'getAccessToken').mockResolvedValue('tok-test')
})

function mockCallControlResponse(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch
}

describe('fetchRingingCalls', () => {
  it('returns empty array when no extensions are ringing', async () => {
    mockCallControlResponse([
      { dn: '112', type: 'Wextension', devices: [], participants: [] },
      { dn: '100', type: 'Wextension', devices: [], participants: [] },
    ])
    expect(await fetchRingingCalls()).toEqual([])
  })

  it('groups multiple ringing extensions under one call by callid', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ callid: 40, status: 'Ringing', party_caller_id: '72195504', dn: '112' }],
      },
      {
        dn: '101',
        type: 'Wextension',
        participants: [{ callid: 40, status: 'Ringing', party_caller_id: '72195504', dn: '101' }],
      },
    ])
    const calls = await fetchRingingCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      callId:            40,
      customerPhone:     '+97472195504',
      ringingExtensions: ['101', '112'],
    })
  })

  it('excludes participants that are NOT Ringing', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ callid: 41, status: 'Connected', party_caller_id: '72195504', dn: '112' }],
      },
    ])
    expect(await fetchRingingCalls()).toEqual([])
  })

  it('ignores Wroutepoint and other non-extension dns', async () => {
    mockCallControlResponse([
      { dn: 'mmspro', type: 'Wroutepoint', participants: [] },
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ callid: 42, status: 'Ringing', party_caller_id: '50001234', dn: '112' }],
      },
    ])
    const calls = await fetchRingingCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].ringingExtensions).toEqual(['112'])
  })

  it('normalises an 8-digit Qatar number to +974 prefix', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ callid: 43, status: 'Ringing', party_caller_id: '72195504', dn: '112' }],
      },
    ])
    const calls = await fetchRingingCalls()
    expect(calls[0].customerPhone).toBe('+97472195504')
  })

  it('throws on non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401, text: async () => 'unauthorized',
    }) as unknown as typeof fetch
    await expect(fetchRingingCalls()).rejects.toThrow(/401/)
  })

  it('marks anonymous / empty caller ids as "Unknown"', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ callid: 44, status: 'Ringing', party_caller_id: 'anonymous', dn: '112' }],
      },
    ])
    const calls = await fetchRingingCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].customerPhone).toBe('Unknown')
  })

  it('marks null/undefined caller id as "Unknown" without throwing', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ callid: 45, status: 'Ringing', party_caller_id: null as unknown as string, dn: '112' }],
      },
    ])
    const calls = await fetchRingingCalls()
    expect(calls[0].customerPhone).toBe('Unknown')
  })
})
