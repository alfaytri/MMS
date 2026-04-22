import { describe, it, expect } from 'vitest'
import { PERMISSION_GROUPS, ALL_PERMISSIONS, roleColor, ROLE_COLORS } from './permissions'

describe('PERMISSION_GROUPS structure', () => {
  it('every group has module, icon, and permissions array', () => {
    for (const group of PERMISSION_GROUPS) {
      expect(typeof group.module).toBe('string')
      expect(group.module.length).toBeGreaterThan(0)
      expect(typeof group.icon).toBe('function')
      expect(Array.isArray(group.permissions)).toBe(true)
      expect(group.permissions.length).toBeGreaterThan(0)
    }
  })

  it('every permission entry has key, label, and description', () => {
    for (const group of PERMISSION_GROUPS) {
      for (const p of group.permissions) {
        expect(typeof p.key).toBe('string')
        expect(p.key.length).toBeGreaterThan(0)
        expect(typeof p.label).toBe('string')
        expect(p.label.length).toBeGreaterThan(0)
        expect(typeof p.description).toBe('string')
        expect(p.description.length).toBeGreaterThan(0)
      }
    }
  })

  it('ALL_PERMISSIONS contains all keys from all groups', () => {
    const fromGroups = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key))
    expect(ALL_PERMISSIONS).toEqual(fromGroups)
  })

  it('no duplicate permission keys', () => {
    const seen = new Set<string>()
    for (const key of ALL_PERMISSIONS) {
      expect(seen.has(key), `Duplicate key: ${key}`).toBe(false)
      seen.add(key)
    }
  })
})

describe('roleColor', () => {
  it('returns a valid color string', () => {
    expect(ROLE_COLORS).toContain(roleColor('Admin'))
    expect(ROLE_COLORS).toContain(roleColor('Accountant'))
    expect(ROLE_COLORS).toContain(roleColor(''))
  })

  it('is deterministic — same name always returns same color', () => {
    expect(roleColor('Manager')).toBe(roleColor('Manager'))
    expect(roleColor('Viewer')).toBe(roleColor('Viewer'))
  })
})

it('includes purchase.approvals.chain.manage permission', () => {
  expect(ALL_PERMISSIONS).toContain('purchase.approvals.chain.manage')
})

it('includes purchase.approvals.bypass permission', () => {
  expect(ALL_PERMISSIONS).toContain('purchase.approvals.bypass')
})
