import { describe, it, expect } from 'vitest'
import { thumbPathFor, thumbDimensions, THUMB_MAX_EDGE } from '../catalogThumb'

describe('thumbPathFor', () => {
  it('derives a stable thumb path from the service id', () => {
    expect(thumbPathFor('abc-123')).toBe('catalog/abc-123_thumb.webp')
  })

  it('does not collide with the full image path for the same service', () => {
    expect(thumbPathFor('abc-123')).not.toBe('catalog/abc-123.png')
  })
})

describe('thumbDimensions', () => {
  it('caps the long edge at 200px and preserves aspect ratio', () => {
    expect(thumbDimensions(800, 400)).toEqual({ width: THUMB_MAX_EDGE, height: 100 })
  })

  it('caps a portrait image on its height', () => {
    expect(thumbDimensions(400, 800)).toEqual({ width: 100, height: THUMB_MAX_EDGE })
  })

  it('does not upscale an image already under the cap', () => {
    expect(thumbDimensions(80, 60)).toEqual({ width: 80, height: 60 })
  })

  it('never returns a zero dimension for an extreme aspect ratio', () => {
    // 2000x3 scales by 0.1 -> height 0.3, which rounds to 0 and would make
    // the canvas throw. Guarding at 1px is the only thing keeping this alive.
    const d = thumbDimensions(2000, 3)
    expect(d.width).toBe(THUMB_MAX_EDGE)
    expect(d.height).toBeGreaterThanOrEqual(1)
  })
})
