import { describe, it, expect } from 'vitest'
import { isValidTransition } from '../contractStateMachine'

describe('isValidTransition', () => {
  it('allows draft → manager_review', () => {
    expect(isValidTransition('draft', 'manager_review')).toBe(true)
  })

  it('blocks draft → active (skips steps)', () => {
    expect(isValidTransition('draft', 'active')).toBe(false)
  })

  it('allows rejected → draft (back to edit)', () => {
    expect(isValidTransition('rejected', 'draft')).toBe(true)
  })

  it('blocks completed → anything (terminal)', () => {
    expect(isValidTransition('completed', 'active')).toBe(false)
    expect(isValidTransition('completed', 'draft')).toBe(false)
  })

  it('blocks cancelled → anything (terminal)', () => {
    expect(isValidTransition('cancelled', 'active')).toBe(false)
  })

  it('allows active → cancelled', () => {
    expect(isValidTransition('active', 'cancelled')).toBe(true)
  })

  it('allows manager_review → customer_pending (approve)', () => {
    expect(isValidTransition('manager_review', 'customer_pending')).toBe(true)
  })

  it('allows manager_review → rejected', () => {
    expect(isValidTransition('manager_review', 'rejected')).toBe(true)
  })

  it('allows approved → active (activation)', () => {
    expect(isValidTransition('approved', 'active')).toBe(true)
  })
})
