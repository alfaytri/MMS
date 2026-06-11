import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeCall } from '../make-call'
import * as auth from '../auth'

beforeEach(() => {
  process.env['3CX_PBX_URL'] = 'https://pbx.test'
  vi.spyOn(auth, 'getAccessToken').mockResolvedValue('tok-test')
})

describe('makeCall', () => {
  it('posts to the verified XAPI MakeCall URL with bearer token', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '{}',
    }) as unknown as typeof fetch

    await makeCall({ extension: '101', destination: '+97455123456' })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://pbx.test/xapi/v1/Users/Pbx.MakeCall',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer tok-test',
          'Content-Type':  'application/json',
        }),
        body: JSON.stringify({ dn: '101', destination: '+97455123456' }),
      }),
    )
  })

  it('throws on non-2xx with the upstream message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 403, text: async () => 'forbidden',
    }) as unknown as typeof fetch

    await expect(makeCall({ extension: '101', destination: '+97455123456' }))
      .rejects.toThrow(/403.*forbidden/)
  })

  it('rejects empty extension', async () => {
    await expect(makeCall({ extension: '', destination: '+97455123456' }))
      .rejects.toThrow(/extension/)
  })

  it('rejects empty destination', async () => {
    await expect(makeCall({ extension: '101', destination: '' }))
      .rejects.toThrow(/destination/)
  })

  it('throws a readable error when 3CX_PBX_URL is missing', async () => {
    delete process.env['3CX_PBX_URL']
    await expect(makeCall({ extension: '101', destination: '+97455123456' }))
      .rejects.toThrow(/3CX_PBX_URL/)
  })
})
