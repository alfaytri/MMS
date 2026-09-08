'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type OrderKind = 'po' | 'so'

export type OrderChatAttachment = {
  id: string
  message_id: string
  storage_key: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string
}

export type OrderChatMessage = {
  id: string
  order_kind: OrderKind
  order_id: string
  author_id: string | null
  author_name: string | null
  body: string
  created_at: string
  attachments: OrderChatAttachment[]
}

export function useOrderChat(kind: OrderKind, orderId: string | null) {
  return useQuery({
    queryKey: queryKeys.orderChat.thread(kind, orderId),
    enabled: !!orderId,
    queryFn: async (): Promise<OrderChatMessage[]> => {
      const supabase = createClient()
      const { data: msgs, error } = await supabase
        .from('order_chat_messages' as never)
        .select('*')
        .eq('order_kind', kind)
        .eq('order_id', orderId!)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) throw error
      const messages = (msgs ?? []) as unknown as Omit<OrderChatMessage, 'attachments'>[]
      if (messages.length === 0) return []

      const ids = messages.map((m) => m.id)
      const { data: atts, error: attErr } = await supabase
        .from('order_chat_attachments' as never)
        .select('*')
        .in('message_id', ids)
      if (attErr) throw attErr
      const attachments = (atts ?? []) as unknown as OrderChatAttachment[]

      const byMsg = new Map<string, OrderChatAttachment[]>()
      for (const a of attachments) {
        const arr = byMsg.get(a.message_id) ?? []
        arr.push(a)
        byMsg.set(a.message_id, arr)
      }
      return messages.map((m) => ({ ...m, attachments: byMsg.get(m.id) ?? [] }))
    },
  })
}

export async function getOrderChatAttachmentSignedUrl(storageKey: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('order-chat-attachments')
    .createSignedUrl(storageKey, 300)
  if (error) throw error
  return data.signedUrl
}

export type NewOrderMessage = {
  kind: OrderKind
  orderId: string
  body: string
  attachments: Array<{ storage_key: string; file_name: string; mime_type: string | null; size_bytes: number }>
}

export function useSendOrderMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ kind, orderId, body, attachments }: NewOrderMessage) => {
      const supabase = createClient()

      // Resolve the author (mirror persistBillAttachments' getUser → user_data).
      const { data: { user } } = await supabase.auth.getUser()
      let authorId: string | null = null
      let authorName: string | null = null
      if (user) {
        const { data: profile } = await supabase
          .from('user_data')
          .select('id, full_name')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        authorId = (profile as { id?: string } | null)?.id ?? null
        authorName = (profile as { full_name?: string } | null)?.full_name ?? null
      }

      const { data: msg, error } = await supabase
        .from('order_chat_messages' as never)
        .insert({ order_kind: kind, order_id: orderId, author_id: authorId, author_name: authorName, body } as never)
        .select('id')
        .single()
      if (error) throw error
      const messageId = (msg as unknown as { id: string }).id

      if (attachments.length > 0) {
        const rows = attachments.map((a) => ({
          message_id: messageId,
          storage_key: a.storage_key,
          file_name: a.file_name,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
          uploaded_by: authorId,
        }))
        const { error: attErr } = await supabase
          .from('order_chat_attachments' as never)
          .insert(rows as never)
        if (attErr) throw attErr
      }
      return { kind, orderId }
    },
    onSuccess: ({ kind, orderId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.orderChat.thread(kind, orderId) })
    },
  })
}
