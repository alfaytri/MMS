// src/types/contact-center.ts

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
export type ConversationType = 'customer' | 'team'
export type CrmMode = 'view' | 'edit' | 'unknown'
export type UnknownCallerStep = 'prompt' | 'attach' | 'create'
export type SidebarView = 'collapsed' | 'list' | 'detail'

export interface ChatConversation {
  id: string
  customer_id: string | null
  conversation_type: ConversationType
  wati_phone: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  created_at: string
  // joined
  customer_name?: string | null
}

export interface ChatAttachment {
  name: string
  type: string
  url: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  from_type: 'customer' | 'agent'
  source: 'whatsapp_api' | 'manual'
  text: string | null
  agent_name: string | null
  attachments: ChatAttachment[] | null
  delivery_status: DeliveryStatus
  external_id: string | null
  reply_to_external_id: string | null
  sent_by_profile_id: string | null
  created_at: string
}

export interface WatiTemplateParam {
  name: string
}

export interface WatiTemplateComponent {
  type: 'BODY' | 'HEADER' | 'FOOTER' | 'BUTTONS'
  text?: string
  parameters?: WatiTemplateParam[]
}

export interface WatiTemplate {
  id: string
  elementName: string
  bodyOriginal?: string
  components: WatiTemplateComponent[]
  variableCount: number
  unsupported: boolean
}

export interface WindowStatus {
  isOpen: boolean
  expiresAt: Date | null
  minutesRemaining: number
}

export interface SelectedCustomer {
  customerId: string
  customerName: string
  primaryPhone: string
  conversationId: string | null
}

export interface CustomerBlock {
  id: string
  customer_id: string
  reason: string
  notes: string | null
  image_url: string | null
  blocked_by: string | null
  created_at: string
}
