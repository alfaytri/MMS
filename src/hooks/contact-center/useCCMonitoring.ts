'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface MonitoringHandler {
  name: string | null
  msgs: number
  last: string
}

export interface MonitoringFeedRow {
  conversation_id: string
  wati_phone: string | null
  customer_name: string | null
  provider: string
  last_message_at: string | null
  total_messages: number
  customer_messages: number
  agent_messages: number
  media_messages: number
  handlers: MonitoringHandler[]
  last_handler: string | null
}

/** Per-conversation monitoring feed: who spoke to each customer + message/media counts. */
export function useCCMonitoringFeed(limit = 200) {
  return useQuery<MonitoringFeedRow[]>({
    queryKey: ['cc', 'monitoring-feed', limit],
    queryFn: async () => {
      const sb = createClient()
      const { data, error } = await sb.rpc('cc_monitoring_feed' as never, { p_limit: limit } as never)
      if (error) throw error
      return (data ?? []) as unknown as MonitoringFeedRow[]
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  })
}

export interface TranscriptRow {
  id: string
  from_type: 'agent' | 'customer'
  agent_name: string | null
  text: string | null
  attachments: { url: string; type: string; name: string }[] | null
  reactions: { emoji: string; from_type: string }[] | null
  message_kind: string
  delivery_status: string | null
  created_at: string
}

/** Full read-only transcript (text + media) for one conversation. */
export function useCCTranscript(conversationId: string | null) {
  return useQuery<TranscriptRow[]>({
    queryKey: ['cc', 'transcript', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const sb = createClient()
      const { data, error } = await sb.rpc(
        'cc_conversation_transcript' as never,
        { p_conversation_id: conversationId } as never,
      )
      if (error) throw error
      return (data ?? []) as unknown as TranscriptRow[]
    },
    staleTime: 10_000,
  })
}
