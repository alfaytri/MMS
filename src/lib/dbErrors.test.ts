import { describe, it, expect } from 'vitest'
import { humanizeDbError, isUnexpectedDbError } from './dbErrors'

describe('humanizeDbError()', () => {
  it('maps a 42501 (RLS) error to a clean permission message using the given action', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy for table "customers"' }
    expect(humanizeDbError(error, 'create customers')).toBe("You don't have permission to create customers.")
  })

  it('falls back to a generic permission message when no action is given', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy for table "payments"' }
    expect(humanizeDbError(error)).toBe("You don't have permission to do this.")
  })

  it('detects permission errors by message text even without a 42501 code', () => {
    const error = { message: 'permission denied for table "payments"' }
    expect(humanizeDbError(error, 'record payments')).toBe("You don't have permission to record payments.")
  })

  it('maps a foreign-key violation to a friendly still-referenced message', () => {
    const error = { code: '23503', message: 'update or delete on table "warehouses" violates foreign key constraint' }
    expect(humanizeDbError(error)).toBe(
      "This can't be removed or changed because other records still use it. Remove or reassign those first.",
    )
  })

  it('uses the action in the foreign-key message when one is given', () => {
    const error = { code: '23503', message: 'violates foreign key constraint' }
    expect(humanizeDbError(error, 'delete this warehouse')).toBe(
      "Can't delete this warehouse — it's still linked to other records. Remove or reassign those first.",
    )
  })

  it('maps a unique violation to a friendly duplicate message', () => {
    const error = { code: '23505', message: 'duplicate key value violates unique constraint' }
    expect(humanizeDbError(error)).toBe('That already exists — please use a different value.')
  })

  it('maps a not-null violation to a friendly required-field message', () => {
    const error = { code: '23502', message: 'null value in column "name" violates not-null constraint' }
    expect(humanizeDbError(error)).toBe('Please fill in all the required fields and try again.')
  })

  it('maps a check violation to a friendly not-allowed message', () => {
    const error = { code: '23514', message: 'new row violates check constraint "qty_positive"' }
    expect(humanizeDbError(error)).toBe("That value isn't allowed — please review your input and try again.")
  })

  it('passes through a business rule raised by our RPCs (P0001) verbatim', () => {
    const error = { code: 'P0001', message: "This warehouse still has stock and can't be deleted." }
    expect(humanizeDbError(error)).toBe("This warehouse still has stock and can't be deleted.")
  })

  it('maps "insufficient available stock (available: X, requested: Y)" to a friendly, numbers-aware message', () => {
    const error = { code: 'P0001', message: 'Insufficient available stock for item 3f2a1b0c-9d (available: 2, requested: 5)' }
    expect(humanizeDbError(error)).toBe(
      'Not enough stock — only 2 available but 5 requested. Adjust the quantity or restock, then try again.',
    )
  })

  it('maps "insufficient stock … missing N units" even when wrapped by a mutation hook', () => {
    const error = new Error('Complete delivery failed: P0001 Insufficient stock: requested 5, missing 3 units for variant abc')
    expect(humanizeDbError(error)).toBe(
      'Not enough stock — short by 3 units. Adjust the quantity or restock, then try again.',
    )
  })

  it('maps a generic insufficient-stock (damaged pile) message to a friendly fallback', () => {
    const error = { code: 'P0001', message: '_consume_damaged_stock_fifo: insufficient damaged stock at x / y (short by 4)' }
    expect(humanizeDbError(error)).toBe(
      'Not enough stock to complete this — check the available quantity and try again.',
    )
  })

  it('maps a network failure to a friendly connectivity message', () => {
    const error = { message: 'TypeError: Failed to fetch' }
    expect(humanizeDbError(error)).toBe('Network problem — please check your connection and try again.')
  })

  it('shows a plain thrown-Error message as-is', () => {
    expect(humanizeDbError(new Error('Custom hook message'))).toBe('Custom hook message')
  })

  it('preserves raw detail verbatim for an unmapped error code', () => {
    const error = { code: '99999', message: 'weird db error', details: 'x', hint: 'try again' }
    expect(humanizeDbError(error)).toBe('[99999] · weird db error · details: x · hint: try again')
  })

  it('falls back to "Something went wrong" for an unmapped error with no message', () => {
    expect(humanizeDbError({ code: '99999' })).toBe('[99999] · Something went wrong')
  })
})

describe('isUnexpectedDbError()', () => {
  it.each([
    ['42501', 'permission'],
    ['23503', 'foreign key'],
    ['23505', 'duplicate'],
    ['23502', 'not-null'],
    ['23514', 'check'],
    ['P0001', 'business rule'],
  ])('treats an expected class (%s) as NOT worth reporting', (code) => {
    expect(isUnexpectedDbError({ code, message: 'x' })).toBe(false)
  })

  it('treats a network failure as NOT worth reporting', () => {
    expect(isUnexpectedDbError({ message: 'Failed to fetch' })).toBe(false)
  })

  it('treats an unmapped/unknown fault as worth reporting to Sentry', () => {
    expect(isUnexpectedDbError({ code: '99999', message: 'boom' })).toBe(true)
    expect(isUnexpectedDbError(new TypeError('x is not a function'))).toBe(true)
  })
})
