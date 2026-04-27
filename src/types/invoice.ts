// src/types/invoice.ts

export type DocStatus =
  | 'draft'
  | 'ready_to_send'
  | 'sent'
  | 'pending_approval'
  | 'approved'
  | 'rejected'

export type BillPaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue'

export type MatchStatus =
  | 'matched'
  | 'qty_discrepancy'
  | 'price_discrepancy'
  | 'unmatched'
  | 'accepted_with_note'

export type InvoiceLineItem = {
  id: string
  invoice_id: string
  description: string
  qty: number | null
  unit_price: number | null
  total: number | null
  match_status: MatchStatus | null
  match_note: string | null
}

/** AR invoice — customer-facing, generated from Sale Order */
export type ArInvoice = {
  id: string
  invoice_id: string               // display string e.g. "INV-00001"
  direction: 'ar'
  customer_id: string
  sale_order_id: string | null
  sale_delivery_id: string | null
  invoice_type: 'cash' | 'credit'  // set at generation time from customer_type
  doc_status: 'draft' | 'ready_to_send' | 'sent'
  payment_status: BillPaymentStatus
  needs_refresh: boolean
  total_amount: number | null
  subtotal: number | null
  tax: number | null
  issued_date: string
  due_date: string
  notes: string | null
  created_at: string | null
  // joined
  customer_name?: string
  so_number?: string
  invoice_line_items?: InvoiceLineItem[]
}

/** AP bill — supplier-facing, created against a PO */
export type ApInvoice = {
  id: string
  invoice_id: string               // display string e.g. "BILL-00001"
  direction: 'ap'
  supplier_id: string | null
  purchase_order_id: string | null
  receival_id: string | null
  doc_status: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  payment_status: BillPaymentStatus
  needs_refresh: false
  total_amount: number | null
  subtotal: number | null
  tax: number | null
  issued_date: string
  due_date: string
  notes: string | null
  created_at: string | null
  // joined
  supplier_name?: string
  po_number?: string
  invoice_line_items?: InvoiceLineItem[]
}

export const PAYMENT_PLAN_THRESHOLD = 10000 // QAR

export type PaymentPlan = {
  id: string
  invoice_id: string
  plan_type: 'schedule' | 'adhoc'
  total_amount: number
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  payment_installments?: PaymentInstallment[]
}

export type PaymentInstallment = {
  id: string
  plan_id: string
  due_date: string | null
  amount: number
  paid_amount: number
  status: 'pending' | 'paid' | 'overdue' | 'partial'
  payment_id: string | null
  created_at: string
}
