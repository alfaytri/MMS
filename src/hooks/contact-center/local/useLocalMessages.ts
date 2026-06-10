'use client'

import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createClient } from '@/lib/supabase/client'
import { getDb } from '@/lib/contact-center/local/db'
import * as msgRepo from '@/lib/contact-center/local/repos/messages'
import type { LocalMessage } from '@/lib/contact-center/local/schema'

export interface UseLocalMessagesResult {
  messages: LocalMessage[]
  loading: boolean
}

export function useLocalMessages(
  authUserId: string | null,
  customerId: string | null,
  conversationId?: string | null,
): UseLocalMessagesResult {
  const db = useMemo(() => authUserId ? getDb(authUserId) : null, [authUserId])

  // Resolve the set of conversations to read — prefer customerId join,
  // but always include the active conversationId (so unknown callers
  // and the just-clicked conversation show up immediately).
  const convIds = useLiveQuery(async () => {
    if (!db) return []
    const set = new Set<string>()
    if (conversationId) set.add(conversationId)
    if (customerId) {
      const a = await db.conversations.where('customer_id').equals(customerId).primaryKeys()
      const b = await db.conversations.where('customer_id_v2').equals(customerId).primaryKeys()
      for (const id of a as string[]) set.add(id)
      for (const id of b as string[]) set.add(id)
    }
    return Array.from(set)
  }, [db, customerId, conversationId], [] as string[])

  // Kick off a lazy network fetch for any conversation we don't have cached yet.
  useEffect(() => {
    if (!db) return
    const supabase = createClient()
    for (const cid of convIds ?? []) {
      void msgRepo.lazyFetch(db, supabase, cid)
    }
  }, [db, convIds])

  const rows = useLiveQuery(
    () => (db ? msgRepo.listByConversations(db, convIds ?? []) : Promise.resolve([])),
    [db, convIds],
  )

  // Show cached rows immediately; only spin while convIds itself is unresolved.
  return {
    messages: rows ?? [],
    loading: convIds === undefined || rows === undefined,
  }
}
