import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomerInvoiceDetailContent } from '../CustomerInvoiceDetailContent'
import type { CustomerPending, CustomerPhone, PendingInvoice } from '@/hooks/usePendingPayments'

// sonner toast triggers act warnings if not stubbed.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PHONE_A: CustomerPhone = { id: 'phone-a', phone: '+97412345678', is_primary: true, label: null }
const PHONE_B: CustomerPhone = { id: 'phone-b', phone: '+97487654321', is_primary: false, label: 'Work' }

function inv(id: string, phone_id: string | null, amount: number): PendingInvoice {
  return {
    id,
    invoice_id: `INV-${id}`,
    phone_id,
    division_id: null,
    division_name: null,
    source_type: 'order',
    source_id: 'src-' + id,
    issued_date: '2026-06-01',
    due_date: '2026-06-30',
    total_amount: amount,
    paid_amount: 0,
    payment_status: 'unpaid',
  }
}

describe('CustomerInvoiceDetailContent', () => {
  it('renders customer name and all phones as chips', () => {
    const customer: CustomerPending = {
      customer_id: 'cust-1',
      customer_name: 'Test Customer',
      phones: [PHONE_A, PHONE_B],
      division_id: null,
      division_name: null,
      total_pending: 0,
      invoice_count: 0,
      overdue_count: 0,
      invoices: [],
    }
    render(<CustomerInvoiceDetailContent customer={customer} />)
    expect(screen.getByText('Test Customer')).toBeInTheDocument()
    expect(screen.getByText('+97412345678')).toBeInTheDocument()
    expect(screen.getByText('+97487654321')).toBeInTheDocument()
  })

  it('groups invoices by phone_id and adds an "Other" group for unattributed', () => {
    const customer: CustomerPending = {
      customer_id: 'cust-1',
      customer_name: 'Test',
      phones: [PHONE_A, PHONE_B],
      division_id: null,
      division_name: null,
      total_pending: 600,
      invoice_count: 4,
      overdue_count: 0,
      invoices: [
        inv('1', 'phone-a', 100),
        inv('2', 'phone-a', 200),
        inv('3', 'phone-b', 150),
        inv('4', null, 150),
      ],
    }
    render(<CustomerInvoiceDetailContent customer={customer} />)

    // 4 invoice cards
    expect(screen.getByText('INV-1')).toBeInTheDocument()
    expect(screen.getByText('INV-2')).toBeInTheDocument()
    expect(screen.getByText('INV-3')).toBeInTheDocument()
    expect(screen.getByText('INV-4')).toBeInTheDocument()

    // "Other" group label for the unattributed invoice
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('shows "No pending invoices" when all are paid', () => {
    const customer: CustomerPending = {
      customer_id: 'cust-1',
      customer_name: 'Test',
      phones: [PHONE_A],
      division_id: null,
      division_name: null,
      total_pending: 0,
      invoice_count: 1,
      overdue_count: 0,
      invoices: [{ ...inv('paid', 'phone-a', 100), paid_amount: 100 }],
    }
    render(<CustomerInvoiceDetailContent customer={customer} />)
    expect(screen.getByText('No pending invoices')).toBeInTheDocument()
  })

  it('disables the Generate Link button when nothing is selected', () => {
    const customer: CustomerPending = {
      customer_id: 'cust-1',
      customer_name: 'Test',
      phones: [PHONE_A],
      division_id: null,
      division_name: null,
      total_pending: 100,
      invoice_count: 1,
      overdue_count: 0,
      invoices: [inv('1', 'phone-a', 100)],
    }
    render(<CustomerInvoiceDetailContent customer={customer} />)
    const btn = screen.getByRole('button', { name: /Link/i })
    expect(btn).toBeDisabled()
  })

  it('orphan phone_id (not in customer.phones) lands in "Other"', () => {
    const customer: CustomerPending = {
      customer_id: 'cust-1',
      customer_name: 'Test',
      phones: [PHONE_A],
      division_id: null,
      division_name: null,
      total_pending: 100,
      invoice_count: 1,
      overdue_count: 0,
      invoices: [inv('orphan', 'phone-deleted', 100)],
    }
    render(<CustomerInvoiceDetailContent customer={customer} />)
    expect(screen.getByText('Other')).toBeInTheDocument()
    expect(screen.getByText('INV-orphan')).toBeInTheDocument()
  })
})
