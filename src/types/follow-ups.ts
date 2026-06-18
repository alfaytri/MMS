// src/types/follow-ups.ts

export type FollowUpRequestStatus = 'pending' | 'confirmed' | 'cancelled' | 'rejected'

export interface ServiceToFollowUp {
  order_service_id: string
  name: string
}

export interface FollowUpRequest {
  id: string
  request_number: string
  parent_order_id: string
  requested_by_user_id: string
  requested_team_id: string
  requested_date:    string | null   // YYYY-MM-DD
  requested_time_from: string | null // HH:MM
  requested_time_to:   string | null // HH:MM
  time_note: string | null
  services_to_followup: ServiceToFollowUp[]
  notes: string | null
  status: FollowUpRequestStatus
  confirmed_by_user_id: string | null
  confirmed_at: string | null
  resulting_order_id: string | null
  cancelled_reason: string | null
  created_at: string
  updated_at: string
}

// Joined shape returned by the Task-channel list endpoint
export interface FollowUpRequestWithContext extends FollowUpRequest {
  parent_order_number: string         // orders.order_id (e.g. "N/2026/05/0014")
  customer_name: string
  customer_phone: string | null
  team_name: string
  requested_by_name: string
}

// Body for POST /api/follow-up-requests
export interface CreateFollowUpRequestBody {
  parent_order_id: string
  services_to_followup: ServiceToFollowUp[]
  requested_date: string | null        // YYYY-MM-DD or null when time_note is used
  requested_time_from: string | null   // HH:MM
  requested_time_to:   string | null   // HH:MM
  time_note: string | null
  notes: string | null
}

// 409 response shape from POST /api/follow-up-requests
export interface FreeSlot {
  date: string       // YYYY-MM-DD
  from: string       // HH:MM
  to:   string       // HH:MM
}

export interface FollowUpRequestConflictResponse {
  error: 'team_busy'
  free_slots: FreeSlot[]
}

// Body for POST /api/follow-up-requests/[id]/confirm
// and POST /api/orders/follow-up
export interface ConfirmFollowUpBody {
  team_id: string
  scheduled_date: string         // YYYY-MM-DD
  scheduled_time: string | null  // "10:00-12:00" or null
  customer_id: string
  address: string | null
  // Services from parent at 0 QAR
  reused_services: Array<{
    parent_order_service_id: string
    name: string
    qty: number
    duration: number | null
  }>
  // New services charged at normal price
  new_services: Array<{
    service_id: string
    name: string
    path: string[]
    qty: number
    price: number
    duration: number | null
  }>
  notes: string | null
}
