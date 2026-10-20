import { describe, it, expect } from 'vitest'
import { kindForDetailTable } from '../types'

describe('kindForDetailTable', () => {
  it.each([
    ['so_invoices', 'sales'],
    ['tl_invoices', 'service'],
    ['contract_invoices', 'contract'],
  ] as const)('%s -> %s', (detailTable, kind) => {
    expect(kindForDetailTable(detailTable)).toBe(kind)
  })

  it('throws on a detail table the hub does not mirror', () => {
    expect(() => kindForDetailTable('supplier_bills')).toThrow('unknown detail_table: supplier_bills')
  })

  it('throws on an empty detail table', () => {
    expect(() => kindForDetailTable('')).toThrow('unknown detail_table')
  })
})
