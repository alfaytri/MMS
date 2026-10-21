// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLineImages } from '../line-images'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

function okResponse(body: Buffer, type = 'image/png') {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('fetchLineImages', () => {
  it('returns data URIs positionally aligned with the input urls', async () => {
    fetchMock.mockResolvedValue(okResponse(PNG))
    const out = await fetchLineImages(['https://a/1.png', 'https://a/2.png'])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatch(/^data:image\/png;base64,/)
    expect(out[1]).toMatch(/^data:image\/png;base64,/)
  })

  it('returns null for a null url without making a request', async () => {
    fetchMock.mockResolvedValue(okResponse(PNG))
    const out = await fetchLineImages([null, 'https://a/1.png', null])
    expect(out[0]).toBeNull()
    expect(out[2]).toBeNull()
    expect(out[1]).toMatch(/^data:/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null for a url that 404s, and does not throw', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response)
    await expect(fetchLineImages(['https://a/gone.png'])).resolves.toEqual([null])
  })

  it('returns null when the request rejects, and does not throw', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'))
    await expect(fetchLineImages(['https://a/slow.png'])).resolves.toEqual([null])
  })

  it('still resolves every other image when one fails', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(PNG))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(okResponse(PNG))
    const out = await fetchLineImages(['https://a/1.png', 'https://a/2.png', 'https://a/3.png'])
    expect(out[0]).toMatch(/^data:/)
    expect(out[1]).toBeNull()
    expect(out[2]).toMatch(/^data:/)
  })

  it('fetches a repeated url only once but fills both positions', async () => {
    fetchMock.mockResolvedValue(okResponse(PNG))
    const out = await fetchLineImages(['https://a/same.png', 'https://a/same.png'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(out[0]).toBe(out[1])
    expect(out[0]).toMatch(/^data:/)
  })

  it('returns an empty array for no urls and makes no request', async () => {
    await expect(fetchLineImages([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
