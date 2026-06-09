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
): UseLocalMessagesResult {
  const db = useMemo(() => authUserId ? getDb(authUserId) : null, [authUserId])

  const convIds = useLiveQuery(async () => {
    if (!db || !customerId) return []
    const a = await db.conversations.where('customer_id').equals(customerId).primaryKeys()
    const b = await db.conversations.where('customer_id_v2').equals(customerId).primaryKeys()
    return Array.from(new Set([...(a as string[]), ...(b as string[])]))
  }, [db, customerId], [] as string[])

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

  return {
    messages: rows ?? [],
    loading: rows === undefined,
  }
}
