// src/types/orders.ts

export interface CustomerPhone {
  id: string
  customer_id: string
  phone: string
  label: string | null
  is_primary: boolean
  created_at: string
}

export interface CustomerAddress {
  id: string
  customer_id: string
  phone_id: string
  label: string | null
  address_type: 'blue_plate' | 'coordinates'
  blue_plate_no: string | null
  unit_no: string | null
  building_no: string | null
  street_no: string | null
  zone_no: string | null
  lat: number | null
  lng: number | null
  is_primary: boolean
  created_at: string
}

export interface InstalledProduct {
  id: string
  customer_id: string
  phone_id: string
  address_id: string | null
  order_id: string
  product_name: string
  brand: string | null
  model: string | null
  serial_number: string | null
  installed_at: string
  warranty_months: number
  warranty_expires_at: string | null
  notes: string | null
  created_at: string
}

export type OrderStatus =
  | 'tentative' | 'scheduled' | 'confirmed' | 'in-progress'
  | 'completed' | 'cancelled' | 'waitlist'
  | 'pending-confirmation' | 'pending-approval'

export type ConfirmationStatus =
  | 'not_sent' | 'msg_sent' | 'customer_confirmed'
  | 'agent_confirmed' | 'no_response' | 'manually_confirmed'

export type OrderMode = 'normal' | 'emergency' | 'waitlist'
export type OrderType = 'order' | 'site-visit' | 'quotation'

export interface OrderServiceDraft {
  serviceId: string
  serviceName: string
  path: string[]
  qty: number
  price: number
  duration: number
  configuration?: Record<string, unknown>
  rootSkillId?: string
  /** Requested arrival window — set per service in the order form */
  fromTime?: string | null
  toTime?: string | null
}

export interface TeamAssignmentDraft {
  id: string
  teamId: string
  teamName: string
  services: Array<{ serviceId: string; qty: number }>
  timeSlot: string
  toTime: string | null   // end of window; null → fall back to timeSlot + duration
  duration: number
}

export interface OrderAttachment {
  url: string
  name: string
  type: string
}

export interface VisitDateWindow {
  date: string           // ISO date string e.g. "2026-05-09"
  fromTime: string | null  // "09:00" — null means no preference
  toTime: string | null    // "12:00" — null means no preference
}

export interface OrderDraft {
  customerId: string
  phoneId: string
  customerName: string
  phone: string
  addressId: string | null
  addressSnapshot: CustomerAddress | null
  type: OrderType
  services: OrderServiceDraft[]
  visitDate: string
  visitDates: VisitDateWindow[] // multi-date selection with optional arrival windows
  visitEndDate: string | null
  mode: OrderMode
  assignments: TeamAssignmentDraft[]
  voucherCode: string
  voucherDiscount: number
  notes: string
  arrivalPhone: string          // phone to call on arrival
  attachments: OrderAttachment[] // uploaded file/image URLs
}

export interface OrderListItem {
  id: string
  order_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  type: OrderType
  division: string | null
  status: OrderStatus
  confirmation_status: ConfirmationStatus
  scheduled_date: string | null
  total_amount: number
  agent_name: string | null
  address: string | null
  has_invoice: boolean
  invoice_number: string | null
  created_at: string
  services_summary: string
}

export interface OrderDetail extends OrderListItem {
  order_services: Array<{
    id: string
    service_id: string | null
    name: string
    qty: number
    price: number
    duration: number
    path: string[]
  }>
  order_visit_dates: Array<{
    id: string
    visit_date: string
    from_time: string | null
    to_time: string | null
    sort_order: number
  }>
  order_team_assignments: Array<{
    id: string
    team_id: string
    team_name: string
    services: Array<{ serviceId: string; qty: number }>
    scheduled_date: string
    time_slot: string
    duration: number
  }>
  order_log: Array<{
    id: string
    action: string
    user_name: string
    details: string | null
    created_at: string
  }>
}

export type WarrantyStatus = 'active' | 'expiring_soon' | 'expired'

export interface WarrantyInfo {
  status: WarrantyStatus
  label: string
}

export interface CustomerHistoryOrder {
  id: string
  order_id: string
  status: OrderStatus
  scheduled_date: string | null
  has_invoice: boolean
  invoice_number: string | null
  services_summary: string
}

export interface OrdersFilter {
  statusChip?: string
  bookingDateFrom?: string
  bookingDateTo?: string
  visitDateFrom?: string
  visitDateTo?: string
  customerName?: string
  customerPhone?: string
  agent?: string
  team?: string
  orderNumber?: string
  division?: string
  sortBy?: 'date_asc' | 'date_desc' | 'amount_asc' | 'amount_desc'
}
