'use client'

import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createClient } from '@/lib/supabase/client'
import { getDb } from '@/lib/contact-center/local/db'
import * as repo from '@/lib/contact-center/local/repos/orders'
import type { LocalOrder } from '@/lib/contact-center/local/schema'

export function useLocalOrders(authUserId: string | null, customerId: string | null): { orders: LocalOrder[]; loading: boolean } {
  const db = useMemo(() => authUserId ? getDb(authUserId) : null, [authUserId])

  useEffect(() => {
    if (!db || !customerId) return
    const supabase = createClient()
    void repo.lazyFetch(db, supabase, customerId)
  }, [db, customerId])

  const orders = useLiveQuery(
    () => (db && customerId) ? repo.listByCustomer(db, customerId) : Promise.resolve([]),
    [db, customerId],
  )
  return { orders: orders ?? [], loading: orders === undefined }
}
