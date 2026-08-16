import { describe, it, expect } from 'vitest'
import { humanizeDbError } from './dbErrors'

describe('humanizeDbError()', () => {
  it('maps a 42501 (RLS) error to a clean permission message using the given action', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy for table "customers"' }
    expect(humanizeDbError(error, 'create customers')).toBe("You don't have permission to create customers.")
  })

  it('maps a 42501 (RLS) error for the payments action too', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy for table "payments"' }
    expect(humanizeDbError(error, 'record payments')).toBe("You don't have permission to record payments.")
  })

  it('falls back to a generic permission message when no action is given', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy for table "payments"' }
    expect(humanizeDbError(error)).toBe("You don't have permission to do this.")
  })

  it('detects permission errors by message text even without a 42501 code', () => {
    const error = { message: 'permission denied for table "payments"' }
    expect(humanizeDbError(error, 'record payments')).toBe("You don't have permission to record payments.")
  })

  it('preserves the raw error detail verbatim for non-RLS errors (e.g. duplicate key)', () => {
    const error = { code: '23505', message: 'duplicate key', details: 'x' }
    expect(humanizeDbError(error)).toBe('[23505] · duplicate key · details: x')
  })

  it('includes the hint field for non-RLS errors when present', () => {
    const error = { code: '23503', message: 'foreign key violation', hint: 'Check the ref' }
    expect(humanizeDbError(error)).toBe('[23503] · foreign key violation · hint: Check the ref')
  })

  it('does not let a provided action leak into non-RLS error output', () => {
    const error = { code: '23505', message: 'duplicate key', details: 'x' }
    expect(humanizeDbError(error, 'create customers')).toBe('[23505] · duplicate key · details: x')
  })

  it('falls back to "Something went wrong" when a non-RLS error has no message', () => {
    const error = { code: '99999' }
    expect(humanizeDbError(error)).toBe('[99999] · Something went wrong')
  })
})
