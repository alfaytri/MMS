import { describe, it, expect } from 'vitest'
import { normalizeForDial } from '../format-phone'

describe('normalizeForDial', () => {
  it('normalizes 8-digit Qatar local number', () => {
    expect(normalizeForDial('72195504')).toEqual({ ok: true, e164: '+97472195504' })
  })

  it('keeps already-formatted Qatar E.164 number unchanged', () => {
    expect(normalizeForDial('+97472195504')).toEqual({ ok: true, e164: '+97472195504' })
  })

  it('accepts international numbers in E.164 form', () => {
    expect(normalizeForDial('+442071838750')).toEqual({ ok: true, e164: '+442071838750' })
  })

  it('strips spaces and dashes', () => {
    expect(normalizeForDial('7219 5504')).toEqual({ ok: true, e164: '+97472195504' })
    expect(normalizeForDial('+974-7219-5504')).toEqual({ ok: true, e164: '+97472195504' })
  })

  it('rejects empty string', () => {
    expect(normalizeForDial('')).toEqual({ ok: false })
  })

  it('rejects gibberish', () => {
    expect(normalizeForDial('abc123')).toEqual({ ok: false })
  })

  it('rejects too-short Qatar number', () => {
    expect(normalizeForDial('1234')).toEqual({ ok: false })
  })
})
