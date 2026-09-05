import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CustomerInvoiceDetailContent } from '../CustomerInvoiceDetailContent'
import type { CustomerPending, CustomerPhone, PendingInvoice } from '@/hooks/usePendingPayments'

const PHONE_A: CustomerPhone = { id: 'phone-a', phone: '+97412345678', is_primary: true, label: null }
const PHONE_B: CustomerPhone = { id: 'phone-b', phone: '+97487654321', is_primary: false, label: 'Work' }

function inv(id: string, amount: number): PendingInvoice {
  return {
    id,
    invoice_id: `INV-${id}`,
    division_id: null,
    division_name: null,
    source_type: 'order',
    source_id: 'src-' + id,
    issued_date: '2026-06-01',
    due_date: null,
    total_amount: amount,
    paid_amount: 0,
    payment_status: 'unpaid',
  }
}

function cust(overrides: Partial<CustomerPending>): CustomerPending {
  return {
    group_key: 'cust-1',
    customer_id: 'cust-1',
    customer_name: 'Test Customer',
    customer_phone: PHONE_A.phone,
    is_blocked: false,
    phones: [PHONE_A],
    total_pending: 0,
    invoice_count: 0,
    oldest_pending_date: '2026-06-01',
    invoices: [],
    ...overrides,
  }
}

describe('CustomerInvoiceDetailContent', () => {
  it('renders customer name and all phones as chips', () => {
    render(<CustomerInvoiceDetailContent customer={cust({ phones: [PHONE_A, PHONE_B] })} />)
    expect(screen.getByText('Test Customer')).toBeInTheDocument()
    expect(screen.getByText('+97412345678')).toBeInTheDocument()
    expect(screen.getByText('+97487654321')).toBeInTheDocument()
  })

  it('renders each unpaid invoice as a card', () => {
    render(<CustomerInvoiceDetailContent customer={cust({
      customer_name: 'Test',
      total_pending: 600,
      invoice_count: 4,
      invoices: [inv('1', 100), inv('2', 200), inv('3', 150), inv('4', 150)],
    })} />)

    expect(screen.getByText('INV-1')).toBeInTheDocument()
    expect(screen.getByText('INV-2')).toBeInTheDocument()
    expect(screen.getByText('INV-3')).toBeInTheDocument()
    expect(screen.getByText('INV-4')).toBeInTheDocument()
  })

  it('shows "No pending invoices" when all are paid', () => {
    render(<CustomerInvoiceDetailContent customer={cust({
      customer_name: 'Test',
      invoice_count: 1,
      invoices: [{ ...inv('paid', 100), paid_amount: 100 }],
    })} />)
    expect(screen.getByText('No pending invoices')).toBeInTheDocument()
  })
})
