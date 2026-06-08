/** Wati / WhatsApp external API response types. */

export interface WatiMessageItem {
  id: string | number
  whatsappMessageId?: string
  type: string
  text?: string
  finalText?: string
  caption?: string
  body?: string
  note?: string
  created?: string
  timestamp?: number
  owner?: boolean
  eventType?: string
  eventDescription?: string
  statusString?: string
  senderName?: string
  replyContextId?: string
  data?: Record<string, unknown> | string
  media?: { url?: string; link?: string; mimeType?: string; caption?: string; fileName?: string }
  image?: { url?: string; link?: string }
  document?: { url?: string; link?: string; filename?: string; fileName?: string; mimeType?: string }
  video?: { url?: string; link?: string }
  audio?: { url?: string; link?: string }
  sticker?: { url?: string; link?: string }
  contacts?: Array<{ name?: { formatted_name?: string; first_name?: string } }>
  reactions?: Array<{ emoji?: string; text?: string; reactionText?: string; owner?: boolean; senderType?: string }>
  reactionDetails?: Array<{ emoji?: string; text?: string; reactionText?: string; owner?: boolean; senderType?: string }>
  reactionMessage?: { key?: { id?: string }; text?: string }
  reaction?: { messageId?: string; emoji?: string }
  referredMessageId?: string
  targetMessageId?: string
  messageId?: string
  mediaHeaderLink?: string | null
  mediaUrl?: string
  url?: string
  filePath?: string
  templateComponents?: unknown[]
  templateBody?: string
  templateName?: string
  elementName?: string
  templateHeader?: { document?: { url?: string; link?: string; filename?: string; fileName?: string }; image?: { url?: string; link?: string } }
  mimeType?: string
  fileName?: string
  assignedTo?: { name?: string; fullName?: string } | string
  operatorName?: string
}

export interface WatiSendResponse {
  message?: { whatsappMessageId?: string }
  info?: { whatsAppMessageId?: string }
  id?: string
  messageId?: string
  error?: string
  raw?: string
}

export interface WatiTemplateComponent {
  type: string
  format?: string
  text?: string
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>
  document?: { url?: string; link?: string; filename?: string; fileName?: string }
  image?: { url?: string; link?: string }
}

export interface WatiTemplate {
  id: string
  elementName: string
  category: string
  language: string
  status: string
  components: WatiTemplateComponent[]
  bodyOriginal?: string
}

export interface WatiContact {
  phone?: string
  wAid?: string
  firstName?: string
  lastName?: string
  fullName?: string
  name?: string
  lastReceivedMessageDate?: string
  lastUpdated?: string
  lastMessage?: string
  assignedTo?: { name?: string; fullName?: string } | string
  operatorName?: string
  agentName?: string
}

export interface WatiGetMessagesResponse {
  messages?: {
    items?: WatiMessageItem[]
  }
}

export interface WatiGetContactsResponse {
  contact_list?: WatiContact[]
}

export interface WatiTemplateListResponse {
  messageTemplates?: WatiTemplate[]
}
