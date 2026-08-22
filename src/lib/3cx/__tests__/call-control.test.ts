import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dropCall } from '../call-control'
import * as auth from '../auth'

beforeEach(() => {
  process.env['3CX_PBX_URL'] = 'https://pbx.test'
  vi.spyOn(auth, 'getAccessToken').mockResolvedValue('tok-test')
})

function mockDropResponse(body: unknown, init: { ok?: boolean, status?: number } = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok:     init.ok ?? true,
    status: init.status ?? 200,
    json:   async () => body,
    text:   async () => JSON.stringify(body),
  }) as unknown as typeof fetch
}

describe('dropCall', () => {
  it('POSTs to /callcontrol/{dn}/participants/{id}/drop with bearer auth + JSON content-type + {} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok:     true,
      status: 200,
      json:   async () => ({ finalstatus: 'Success', reason: 'NotSpecified', reasontext: '', result: null }),
      text:   async () => '{}',
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await dropCall('112', 508)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://pbx.test/callcontrol/112/participants/508/drop')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer tok-test')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Accept']).toBe('application/json')
    expect(init.body).toBe('{}')
  })

  it('URL-encodes the extension in the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok:     true,
      status: 200,
      json:   async () => ({ finalstatus: 'Success', reason: 'NotSpecified', reasontext: '', result: null }),
      text:   async () => '{}',
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await dropCall('1 12', 99)

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://pbx.test/callcontrol/1%2012/participants/99/drop')
  })

  it('throws when extension is empty string', async () => {
    await expect(dropCall('', 1)).rejects.toThrow(/extension is required/)
  })

  it('throws on non-2xx with status code in the message', async () => {
    mockDropResponse({ error: 'nope' }, { ok: false, status: 500 })
    await expect(dropCall('112', 508)).rejects.toThrow(/500/)
  })

  it('throws when finalstatus is not Success', async () => {
    mockDropResponse({ finalstatus: 'Failed', reason: 'NoCall', reasontext: 'No such call', result: null })
    await expect(dropCall('112', 508)).rejects.toThrow(/Failed|No such call/)
  })
})
