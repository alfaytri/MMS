'use client'

import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createClient } from '@/lib/supabase/client'
import { getDb } from '@/lib/contact-center/local/db'
import * as repo from '@/lib/contact-center/local/repos/conversations'
import type { LocalConversation } from '@/lib/contact-center/local/schema'

export interface UseLocalConversationsResult {
  conversations: LocalConversation[]
  loading: boolean
}

export function useLocalConversations(
  authUserId: string | null,
  provider: 'wati' | 'whapi',
): UseLocalConversationsResult {
  const db = useMemo(() => authUserId ? getDb(authUserId) : null, [authUserId])

  useEffect(() => {
    if (!db) return
    const supabase = createClient()
    void repo.lazyFetch(db, supabase, provider)
  }, [db, provider])

  const rows = useLiveQuery(
    () => (db ? repo.listByProvider(db, provider) : Promise.resolve([])),
    [db, provider],
  )

  return {
    conversations: rows ?? [],
    loading: rows === undefined,
  }
}
