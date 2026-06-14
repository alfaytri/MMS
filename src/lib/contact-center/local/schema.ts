export type MessageType =
  | 'text' | 'image' | 'video' | 'audio' | 'document'
  | 'sticker' | 'location' | 'template' | 'event' | 'call'

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

export type MessageSource = 'whatsapp_api' | 'whatsapp_whapi' | '3cx_call' | 'manual'

export interface LocalAttachment {
  url: string
  type: string
  name: string
  provider_url?: string | null
  status?: 'local' | 'pending_download' | 'archived' | 'download_failed' | 'rejected_size' | null
}

export interface LocalReaction {
  emoji: string
  from_type: 'customer' | 'agent'
}

export interface LocalMessage {
  id: string
  conversation_id: string
  from_type: 'customer' | 'agent'
  source: MessageSource
  message_kind: 'message' | 'event'
  message_type: MessageType
  text: string | null
  agent_name: string | null
  attachments: LocalAttachment[] | null
  reactions: LocalReaction[]
  delivery_status: DeliveryStatus
  external_id: string | null
  reply_to_external_id: string | null
  sent_by_profile_id: string | null
  phone_id: string | null
  deleted_at: string | null
  created_at: string
  _pendingWriteId?: number | null
  _localOnly?: boolean
}

export interface LocalConversation {
  id: string
  customer_id: string | null
  customer_id_v2: string | null
  conversation_type: 'customer' | 'team' | null
  wati_phone: string | null
  wati_contact_name: string | null
  last_message: string | null
  last_message_at: string | null
  last_message_from_type: 'agent' | 'customer' | null
  unanswered_dismissed_at: string | null
  unread_count: number
  assigned_agent: string | null
  is_opened: boolean
  wati_status: string | null
  provider: 'wati' | 'whapi'
  created_at: string
}

export interface LocalCustomer {
  id: string
  name: string
  name_ar: string | null
  customer_type: 'individual' | 'business'
  is_blocked: boolean
  pending_payment_amount: number
  created_at: string
}

export interface LocalPhone {
  id: string
  customer_id: string
  phone: string
  is_primary: boolean
  label: string | null
  created_at: string
}

export interface LocalAddress {
  id: string
  customer_id: string
  address_type: 'blue_plate' | 'google_coords'
  label: string | null
  unit: string | null
  building: string | null
  street: string | null
  zone: string | null
  lat: number | null
  lng: number | null
  is_primary: boolean
  is_geocoded: boolean
  waze_link: string | null
  tags: string[]
  created_at: string
}

export interface LocalProduct {
  id: string
  customer_id: string
  product_name: string
  notes: string | null
  created_at: string
}

export interface LocalOrder {
  id: string
  order_id: string
  service_customer_id: string
  status: string | null
  scheduled_date: string | null
  type: string | null
  total_amount: number | null
}

export type PendingWriteKind =
  | 'send_message' | 'send_file' | 'send_template' | 'react'
  | 'update_customer' | 'add_phone' | 'remove_phone'
  | 'add_address' | 'update_address'
  | 'add_product'
  | 'mark_read' | 'mark_opened'

export type PendingWriteStatus = 'queued' | 'in_flight' | 'failed'

export interface PendingWrite {
  id?: number
  kind: PendingWriteKind
  payload: Record<string, unknown>
  status: PendingWriteStatus
  retryCount: number
  lastError: string | null
  createdAt: number
  localMessageId?: string
  fileRef?: string
}

export interface SyncRow {
  key: string
  value: string | number | null
  updatedAt: number
}
