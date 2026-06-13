import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchActiveCalls } from '../active-calls'
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

describe('fetchActiveCalls', () => {
  it('returns empty array when no extensions are ringing', async () => {
    mockCallControlResponse([
      { dn: '112', type: 'Wextension', devices: [], participants: [] },
      { dn: '100', type: 'Wextension', devices: [], participants: [] },
    ])
    expect(await fetchActiveCalls()).toEqual([])
  })

  it('calls /callcontrol on the configured PBX with a Bearer auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => [],
      text: async () => '[]',
    })
    global.fetch = fetchMock as unknown as typeof fetch
    await fetchActiveCalls()
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://pbx.test/callcontrol')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-test')
  })

  it('groups multiple ringing extensions under one call by callid', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ id: 501, callid: 40, status: 'Ringing', party_caller_id: '72195504', dn: '112' }],
      },
      {
        dn: '101',
        type: 'Wextension',
        participants: [{ id: 502, callid: 40, status: 'Ringing', party_caller_id: '72195504', dn: '101' }],
      },
    ])
    const calls = await fetchActiveCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      callId:        40,
      customerPhone: '+97472195504',
      status:        'ringing',
      participants:  [
        { extension: '101', participantId: 502 },
        { extension: '112', participantId: 501 },
      ],
    })
  })

  it('returns Connected calls (not just Ringing)', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ id: 600, callid: 41, status: 'Connected', party_caller_id: '72195504', dn: '112' }],
      },
    ])
    const calls = await fetchActiveCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].status).toBe('connected')
    expect(calls[0].participants).toEqual([{ extension: '112', participantId: 600 }])
  })

  it('status precedence: connected wins over ringing on the same callid', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ id: 700, callid: 42, status: 'Ringing', party_caller_id: '72195504', dn: '112' }],
      },
      {
        dn: '101',
        type: 'Wextension',
        participants: [{ id: 701, callid: 42, status: 'Connected', party_caller_id: '72195504', dn: '101' }],
      },
    ])
    const calls = await fetchActiveCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].status).toBe('connected')
    expect(calls[0].participants).toHaveLength(2)
  })

  it('participants are sorted by extension ascending', async () => {
    mockCallControlResponse([
      {
        dn: '300',
        type: 'Wextension',
        participants: [{ id: 800, callid: 43, status: 'Ringing', party_caller_id: '72195504', dn: '300' }],
      },
      {
        dn: '101',
        type: 'Wextension',
        participants: [{ id: 801, callid: 43, status: 'Ringing', party_caller_id: '72195504', dn: '101' }],
      },
      {
        dn: '200',
        type: 'Wextension',
        participants: [{ id: 802, callid: 43, status: 'Ringing', party_caller_id: '72195504', dn: '200' }],
      },
    ])
    const calls = await fetchActiveCalls()
    expect(calls[0].participants.map((p) => p.extension)).toEqual(['101', '200', '300'])
  })

  it('excludes participants that are neither Ringing nor Connected', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [
          { id: 850, callid: 48, status: 'Dialing',  party_caller_id: '72195504', dn: '112' },
          { id: 851, callid: 49, status: 'Finished', party_caller_id: '72195504', dn: '112' },
        ],
      },
    ])
    expect(await fetchActiveCalls()).toEqual([])
  })

  it('ignores Wroutepoint and other non-extension dns', async () => {
    mockCallControlResponse([
      { dn: 'mmspro', type: 'Wroutepoint', participants: [] },
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ id: 900, callid: 44, status: 'Ringing', party_caller_id: '50001234', dn: '112' }],
      },
    ])
    const calls = await fetchActiveCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].participants).toEqual([{ extension: '112', participantId: 900 }])
  })

  it('normalises an 8-digit Qatar number to +974 prefix', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ id: 1000, callid: 45, status: 'Ringing', party_caller_id: '72195504', dn: '112' }],
      },
    ])
    const calls = await fetchActiveCalls()
    expect(calls[0].customerPhone).toBe('+97472195504')
  })

  it('throws on non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401, text: async () => 'unauthorized',
    }) as unknown as typeof fetch
    await expect(fetchActiveCalls()).rejects.toThrow(/401/)
  })

  it('marks anonymous / empty caller ids as "Unknown"', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ id: 1100, callid: 46, status: 'Ringing', party_caller_id: 'anonymous', dn: '112' }],
      },
    ])
    const calls = await fetchActiveCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].customerPhone).toBe('Unknown')
  })

  it('marks null/undefined caller id as "Unknown" without throwing', async () => {
    mockCallControlResponse([
      {
        dn: '112',
        type: 'Wextension',
        participants: [{ id: 1200, callid: 47, status: 'Ringing', party_caller_id: null as unknown as string, dn: '112' }],
      },
    ])
    const calls = await fetchActiveCalls()
    expect(calls[0].customerPhone).toBe('Unknown')
  })
})
