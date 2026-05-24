// src/types/team-leader.ts

export type VisitType =
  | 'order'
  | 'site-visit-single'
  | 'site-visit-contract'
  | 'contract'
  | 'backwork'
  | 'follow-up'
  | 'qc'

export interface TlService {
  id: string
  name: string
  unit_price: number
  qty: number
}

export type VisitStatus =
  | 'scheduled'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'customer-unavailable'
  | 'no-show'

export interface TlVisit {
  id: string
  date: string
  scheduled_time: string | null
  status: VisitStatus
  type: VisitType
  source_id: string
  source_type: string
  team_id: string
  order_id: string | null
  // Joined customer/location data
  customer_name: string
  address: string
  waze_link: string | null
  services: TlService[]
  customer_phone: string | null
  location_phone: string | null
  team_ids: string[]   // all team IDs sharing this visit (for Multi-Team badge)
  // Type-specific context (only present when relevant)
  backwork_context?: { customer_reason: string | null; note: string | null }
  followup_context?: { previous_visit_id: string | null; agent_note: string | null }
  // Contract visit tree
  building_node?: BuildingNode | null
  // QC
  qc_items?: QcItem[]
}

// ── UI-only / computed shapes ─────────────────────────────────────────────
// These types represent UI and API shapes, not DB rows. camelCase field names
// are intentional (they differ from snake_case DB column names).
export interface BuildingNode {
  name: string
  floors: FloorNode[]
}

export interface FloorNode {
  name: string
  rooms: RoomNode[]
}

export interface RoomNode {
  name: string
  serviceId: string
}

export interface QcItem {
  serviceId: string
  serviceName: string
  maxScore: number
}

/** Display/form shape: per-service inventory usage breakdown for the completion dialog. */
export interface InventoryUsageRecord {
  brandVariantId: string
  brandVariantName: string
  qtyUsed: number
}

/** Write/submission shape: flat deduction record sent to the stock-deduction API. */
export interface StockDeductionItem {
  serviceId: string
  brandVariantId: string
  qtyUsed: number
}

/**
 * Browser-only shape — `photos`, `signature`, and `damageReport.photos` use
 * the browser `Blob` API. Do NOT import or instantiate this type in server
 * routes or server actions.
 */
export interface OrderCompletionData {
  orderId: string
  visitId: string
  visitType: VisitType
  serviceStatuses: Record<string, 'done' | 'skipped' | 'issue'>
  inventoryUsage: Record<string, InventoryUsageRecord[]>
  photos: Blob[]
  damageReport: { noted: boolean; description?: string; photos?: Blob[] }
  signature?: Blob
  qcScores?: Record<string, number>
  addedServices?: AddedBillableService[]
}

export interface TlTeamOption {
  id: string
  name: string
  division_name: string | null
}

export interface TlIdentity {
  teamId: string | null
  isAdmin: boolean
  isDivisionManager: boolean
  profileId: string
  divisionIds: string[]
}

export type FollowUpStatus =
  | 'issue-resolved'
  | 'improvement-noted'
  | 'no-change'
  | 'condition-worsened'
  | 'retreatment-required'

export type BackworkReason =
  | 'issue-confirmed'
  | 'partially-resolved-previously'
  | 'new-issue-found'
  | 'equipment-needed'
  | 'access-issue-previously'

export interface DamageReportEntry {
  id: string
  description: string
  photos: Blob[]
  customerNotified: boolean
}

export interface AddedBillableService {
  id: string
  name: string
  path: string
  qty: number
  unitPrice: number
}
