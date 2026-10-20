import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// Only the data hook is replaced. The real helpers (remainingAmount, payLinkFor,
// httpUrl, invoiceKind) stay, so these tests pin that the PAGE wires them - not just
// that the helpers work in isolation.
vi.mock('@/hooks/useAllInvoices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAllInvoices')>()
  return { ...actual, useAllInvoices: vi.fn() }
})

import AllInvoicesPage from '../page'
import { useAllInvoices, type AllInvoiceRow } from '@/hooks/useAllInvoices'

const BASE: AllInvoiceRow = {
  id: 'h',
  invoice_id: 'INV-BASE',
  detail_table: 'tl_invoices',
  detail_id: 'd',
  customer_name: 'Customer',
  total_amount: 100,
  paid_amount: 0,
  payment_status: 'unpaid',
  dispatch_status: 'sent',
  dibsy_checkout_url: null,
  pdf_url: null,
  sent_at: '2026-10-01T08:00:00Z',
  created_at: '2026-10-01T07:00:00Z',
}
const mk = (over: Partial<AllInvoiceRow>): AllInvoiceRow => ({ ...BASE, ...over })

// Desktop table columns, in order.
const COL = { remaining: 5, send: 7, payLink: 8, pdf: 9 } as const

function renderPage(rows: AllInvoiceRow[]) {
  vi.mocked(useAllInvoices).mockReturnValue({
    data: rows,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAllInvoices>)
  render(<AllInvoicesPage />)
  // DataTable also renders a card per row (hidden by CSS on desktop), so scope to the table.
  const table = screen.getByRole('table')
  const rowOf = (invoiceId: string) => within(table).getByText(invoiceId).closest('tr') as HTMLElement
  const cellsOf = (invoiceId: string) => within(rowOf(invoiceId)).getAllByRole('cell')
  return { rowOf, cellsOf }
}

beforeEach(() => {
  vi.mocked(useAllInvoices).mockReset()
})

describe('All Invoices page', () => {
  it('clamps Remaining, dashes a missing link, and shows no pay link on a paid or void row', () => {
    const { rowOf, cellsOf } = renderPage([
      mk({ invoice_id: 'INV-OVERPAID', total_amount: 100, paid_amount: 150, payment_status: 'paid', dibsy_checkout_url: 'https://pay.example/over' }),
      mk({ invoice_id: 'INV-NOLINKS' }),
      mk({ invoice_id: 'INV-VOID', total_amount: 500, payment_status: 'void', dibsy_checkout_url: 'https://pay.example/void' }),
      mk({ invoice_id: 'INV-PAID', total_amount: 50, paid_amount: 50, payment_status: 'paid', dibsy_checkout_url: 'https://pay.example/paid' }),
      mk({ invoice_id: 'INV-OWED', total_amount: 100, paid_amount: 25, payment_status: 'partially_paid', dibsy_checkout_url: 'https://pay.example/owed' }),
    ])

    // The clamp is wired into the page: an overpaid row never shows a negative balance.
    expect(cellsOf('INV-OVERPAID')[COL.remaining]).toHaveTextContent('QAR 0.00')
    expect(rowOf('INV-OVERPAID').textContent).not.toMatch(/-\s?QAR|-\d/)

    // A missing link is a dash, not an empty or dead link.
    expect(cellsOf('INV-NOLINKS')[COL.payLink]).toHaveTextContent('—')
    expect(cellsOf('INV-NOLINKS')[COL.pdf]).toHaveTextContent('—')
    expect(within(rowOf('INV-NOLINKS')).queryAllByRole('link')).toHaveLength(0)

    // No forwardable pay link once nothing is owed - in the table AND in the mobile card
    // (both are in the DOM; link names carry the invoice id, so query the whole screen).
    for (const id of ['INV-OVERPAID', 'INV-VOID', 'INV-PAID']) {
      expect(screen.queryAllByRole('link', { name: new RegExp(`^pay link for invoice ${id} `, 'i') }), id).toHaveLength(0)
      expect(cellsOf(id)[COL.payLink], id).toHaveTextContent('—')
    }
    // ...but it stays while money is owed.
    const owedLinks = screen.getAllByRole('link', { name: /^pay link for invoice INV-OWED /i })
    expect(owedLinks.length).toBeGreaterThanOrEqual(1)
    for (const a of owedLinks) expect(a).toHaveAttribute('href', 'https://pay.example/owed')
  })

  it('renders hub URLs as links only when they are plain http(s)', () => {
    const { rowOf } = renderPage([
      mk({ invoice_id: 'INV-UNSAFE', dibsy_checkout_url: 'javascript:alert(1)', pdf_url: 'data:text/html,<b>x</b>' }),
      mk({ invoice_id: 'INV-SAFE', dibsy_checkout_url: 'https://pay.example/safe', pdf_url: 'https://files.example/a.pdf' }),
    ])

    // Neither the pay link nor the PDF link is rendered for an unsafe scheme - table or card.
    expect(within(rowOf('INV-UNSAFE')).queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('link', { name: /for invoice INV-UNSAFE /i })).toHaveLength(0)
    expect(document.body.innerHTML).not.toMatch(/javascript:|data:text/i)

    const links = within(rowOf('INV-SAFE')).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://pay.example/safe', 'https://files.example/a.pdf'])
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('does not claim "Sent" for a row that has no sent_at (backfilled rows)', () => {
    const { cellsOf } = renderPage([
      mk({ invoice_id: 'INV-SENT', dispatch_status: 'sent', sent_at: '2026-10-01T08:00:00Z' }),
      mk({ invoice_id: 'INV-BACKFILL', dispatch_status: 'sent', sent_at: null }),
      mk({ invoice_id: 'INV-PENDING', dispatch_status: 'pending', sent_at: null }),
      mk({ invoice_id: 'INV-FAILED', dispatch_status: 'failed', sent_at: null }),
    ])

    expect(cellsOf('INV-SENT')[COL.send]).toHaveTextContent('Sent')
    expect(cellsOf('INV-BACKFILL')[COL.send]).toHaveTextContent('—')
    expect(cellsOf('INV-BACKFILL')[COL.send]).not.toHaveTextContent('Sent')
    expect(cellsOf('INV-PENDING')[COL.send]).toHaveTextContent('Pending')
    expect(cellsOf('INV-FAILED')[COL.send]).toHaveTextContent('Failed')
  })

  it('names the payment-status filter "Payment" (the Send status column is separate)', () => {
    renderPage([mk({})])

    const group = screen.getByRole('group', { name: 'Payment' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'All', 'Unpaid', 'Partially paid', 'Paid', 'Overdue', 'Void',
    ])
    expect(screen.queryByRole('group', { name: 'Status' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument()
  })
})
