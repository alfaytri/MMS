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
}

export type BillLineItem = {
  id: string
  bill_id: string
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
  customer_id: string
  sale_order_id: string | null
  sale_delivery_id: string | null
  invoice_type: 'cash' | 'credit'
  payment_status: BillPaymentStatus
  status: string | null
  needs_refresh: boolean
  total_amount: number | null
  subtotal: number | null
  tax: number | null
  paid_amount: number | null
  issued_date: string
  due_date: string
  notes: string | null
  source: string | null
  source_type?: string | null
  source_id: string | null
  source_label: string | null
  agent_name: string | null
  division_id?: string | null
  manually_paid: boolean
  created_at: string | null
  updated_at?: string | null
  // joined
  customer_name?: string
  so_number?: string
  invoice_line_items?: InvoiceLineItem[]
}

/** AP bill — supplier-facing, created against a PO */
export type Bill = {
  id: string
  bill_number: string              // display string e.g. "SUP-INV-00001"
  bill_type: 'cash' | 'credit'
  source: string
  source_id: string
  source_label: string | null
  supplier_id: string | null
  purchase_order_id: string | null
  receival_id: string | null
  doc_status: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  payment_status: BillPaymentStatus
  needs_refresh: boolean
  total_amount: number | null
  subtotal: number | null
  discount_amount: number
  discount_label: string | null
  tax: number | null
  issued_date: string
  due_date: string
  notes: string | null
  division_id: string | null
  pdf_url: string | null
  created_at: string | null
  updated_at?: string | null
  // joined
  supplier_name?: string
  po_number?: string
  bill_line_items?: BillLineItem[]
}

/** @deprecated Use Bill instead */
export type ApInvoice = Bill

export type DebitNote = {
  id: string
  debit_note_id: string
  bill_id: string | null
  purchase_order_id: string | null
  supplier_name: string | null
  reason: string
  type: string
  status: string | null
  total_amount: number
  original_total: number | null
  new_total: number | null
  source_return_id: string | null
  resolution_type: string | null
  notes: string | null
  pdf_url: string | null
  phone: string | null
  approved_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  po_number?: string | null
  return_number?: string | null
}

export type DebitNoteLine = {
  id: string
  debit_note_id: string
  bill_line_id: string | null
  description: string | null
  sku: string | null
  qty: number
  unit_price: number
  total: number | null
  line_type: string
  condition: string | null
  condition_notes: string | null
  created_at: string | null
}

export const PAYMENT_PLAN_THRESHOLD = 10000 // QAR

export type PaymentPlan = {
  id: string
  invoice_id: string | null
  bill_id: string | null
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
