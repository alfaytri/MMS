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
  provider?: 'wati' | 'whapi',
): UseLocalConversationsResult {
  const db = useMemo(() => authUserId ? getDb(authUserId) : null, [authUserId])

  useEffect(() => {
    if (!db) return
    const supabase = createClient()
    if (provider) {
      void repo.lazyFetch(db, supabase, provider)
    } else {
      void repo.lazyFetch(db, supabase, 'wati')
      void repo.lazyFetch(db, supabase, 'whapi')
    }
  }, [db, provider])

  const rows = useLiveQuery(
    () => {
      if (!db) return Promise.resolve([])
      return provider ? repo.listByProvider(db, provider) : repo.listAll(db)
    },
    [db, provider],
  )

  return {
    conversations: rows ?? [],
    loading: rows === undefined,
  }
}
