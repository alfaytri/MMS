'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { primeRealtimeAuth } from '@/lib/contact-center/realtime-auth'

export interface HandlerPresence {
  profileId: string
  name: string
  conversationId: string
}

// Release the chat from "being handled" after this much inactivity, so a badge
// never sticks when an agent leaves a tab open and walks away.
const IDLE_MS = 5 * 60_000
const IDLE_TICK_MS = 30_000

interface Params {
  authUserId: string | null
  profileId: string | null
  name: string | null
  activeConversationId: string | null
}

/**
 * Live "who has which chat open right now", via a Supabase Realtime **presence**
 * channel (`cc:presence`, private — see migration 20261059000000). Each agent
 * tracks the conversation they currently have open; everyone with CC access sees
 * the derived map. Presence auto-clears when a client disconnects; we also
 * release it explicitly on close (activeConversationId → null) and on idle.
 *
 * Side effect: logs each conversation-open to cc_handling_events (the permanent
 * "who handled what" record).
 */
export function useCCPresence({ authUserId, profileId, name, activeConversationId }: Params): {
  byConversation: Map<string, HandlerPresence[]>
} {
  const [byConversation, setByConversation] = useState<Map<string, HandlerPresence[]>>(new Map())

  const channelRef = useRef<ReturnType<SupabaseClient['channel']> | null>(null)
  const idleRef = useRef(false)
  const lastActivityRef = useRef(Date.now())
  const activeRef = useRef<string | null>(activeConversationId)
  activeRef.current = activeConversationId
  const nameRef = useRef<string | null>(name)
  nameRef.current = name

  // What this client currently broadcasts about itself.
  const buildState = useCallback(() => ({
    profileId,
    name: nameRef.current ?? 'Agent',
    conversationId: idleRef.current ? null : (activeRef.current ?? null),
    at: Date.now(),
  }), [profileId])

  const retrack = useCallback(() => {
    const ch = channelRef.current
    if (ch) void ch.track(buildState())
  }, [buildState])

  // ── Presence channel ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUserId || !profileId) return
    const supabase = createClient()
    let cancelled = false
    let ch: ReturnType<SupabaseClient['channel']> | null = null

    void (async () => {
      await primeRealtimeAuth(supabase)
      if (cancelled) return

      const recompute = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = (ch as any).presenceState() as Record<string, Array<Record<string, unknown>>>
        const map = new Map<string, HandlerPresence[]>()
        for (const key of Object.keys(state)) {
          const metas = state[key]
          const meta = metas[metas.length - 1] // most recent for this agent
          const cid = meta?.conversationId as string | null | undefined
          if (!cid) continue
          const list = map.get(cid) ?? []
          list.push({
            profileId: String(meta.profileId ?? key),
            name: String(meta.name ?? 'Agent'),
            conversationId: cid,
          })
          map.set(cid, list)
        }
        setByConversation(map)
      }

      ch = supabase.channel('cc:presence', { config: { private: true, presence: { key: profileId } } })
      channelRef.current = ch
      ch.on('presence', { event: 'sync' }, recompute)
        .on('presence', { event: 'join' }, recompute)
        .on('presence', { event: 'leave' }, recompute)
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') void ch!.track(buildState())
        })
    })()

    return () => {
      cancelled = true
      if (ch) {
        void ch.untrack()
        supabase.removeChannel(ch)
      }
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, profileId])

  // ── Re-track when the open conversation changes + log the open ──────────────
  const lastLoggedRef = useRef<string | null>(null)
  useEffect(() => {
    retrack()
    // Log the handling event (skip nulls and immediate repeats).
    if (!activeConversationId || !authUserId || !profileId) return
    if (lastLoggedRef.current === activeConversationId) return
    lastLoggedRef.current = activeConversationId
    const supabase = createClient()
    // cc_handling_events is a new table not yet in the generated types.
    const table = supabase.from('cc_handling_events' as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (table as any).insert({
      conversation_id: activeConversationId,
      profile_id: profileId,
      agent_name: nameRef.current ?? null,
      auth_user_id: authUserId,
    }).then(({ error }: { error: unknown }) => {
      if (error) console.warn('[useCCPresence] handling-log insert failed', error)
    })
  }, [activeConversationId, authUserId, profileId, retrack])

  // ── Idle detection: release the chat after IDLE_MS of no interaction ────────
  useEffect(() => {
    const bump = () => {
      lastActivityRef.current = Date.now()
      if (idleRef.current) { idleRef.current = false; retrack() } // came back → reclaim
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const iv = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current > IDLE_MS
      if (idle && !idleRef.current) { idleRef.current = true; retrack() } // went idle → release
    }, IDLE_TICK_MS)
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump))
      clearInterval(iv)
    }
  }, [retrack])

  return { byConversation }
}
