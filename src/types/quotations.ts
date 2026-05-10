// src/types/quotations.ts

export interface QuotationLineDraft {
  serviceId: string
  name: string
  path: string[]
  qty: number
  price: number       // from services.price — read-only
  duration: number | null
  division: string    // services.division slug
}

export interface QuotationDraft {
  quotationId: string
  customerId: string
  phoneId: string
  customerName: string
  phone: string
  division: string    // derived from first service's division
  services: QuotationLineDraft[]
  notes: string
}

// Intentional subset of the DB quotation_status enum — this module only creates/sends.
// Other statuses (approved, converted, etc.) arrive as strings at runtime; components handle them with a style fallback.
export type QuotationStatus = 'draft' | 'sent'

export interface QuotationListItem {
  id: string
  quotation_id: string
  customer_name: string
  customer_phone: string
  division: string
  status: QuotationStatus
  total_amount: number
  created_date: string
}

export interface QuotationDetail {
  id: string
  quotation_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  division: string
  status: QuotationStatus
  total_amount: number
  notes: string | null
  created_date: string
  expiry_date: string | null
  sent_date: string | null
  line_items: QuotationLineItem[]
  logs: QuotationLog[]
}

export interface QuotationLineItem {
  id: string
  service_id: string | null
  name: string
  path: string[]
  qty: number
  price: number
  duration: number | null
}

export interface QuotationLog {
  id: string
  action: string
  user_name: string
  details: string | null
  created_at: string
}

export interface QuotationsFilter {
  division?: string
  statuses?: QuotationStatus[]
  dateFrom?: string
  dateTo?: string
  customerPhone?: string
  quotationNumber?: string
}
