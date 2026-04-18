import { describe, it, expect } from 'vitest'
import { passwordSchema } from './password-policy'

describe('passwordSchema', () => {
  it('accepts a strong password', () => {
    expect(passwordSchema.safeParse('Str0ng!Pass').success).toBe(true)
  })

  it('rejects a password shorter than 10 characters', () => {
    const r = passwordSchema.safeParse('Sh0rt!A')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/10/)
  })

  it('rejects a password with no uppercase', () => {
    const r = passwordSchema.safeParse('str0ng!pass')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/uppercase/i)
  })

  it('rejects a password with no lowercase', () => {
    const r = passwordSchema.safeParse('STR0NG!PASS')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/lowercase/i)
  })

  it('rejects a password with no digit', () => {
    const r = passwordSchema.safeParse('Strong!Pass')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/digit|number/i)
  })

  it('rejects a password with no symbol', () => {
    const r = passwordSchema.safeParse('Str0ngPass1')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/symbol/i)
  })
})
