'use client'

import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createClient } from '@/lib/supabase/client'
import { getDb } from '@/lib/contact-center/local/db'
import * as customersRepo from '@/lib/contact-center/local/repos/customers'
import * as phonesRepo from '@/lib/contact-center/local/repos/phones'
import * as addressesRepo from '@/lib/contact-center/local/repos/addresses'
import * as productsRepo from '@/lib/contact-center/local/repos/products'
import type { LocalCustomer, LocalPhone, LocalAddress, LocalProduct } from '@/lib/contact-center/local/schema'

export interface UseLocalCustomerResult {
  customer: LocalCustomer | null
  phones: LocalPhone[]
  addresses: LocalAddress[]
  products: LocalProduct[]
  loading: boolean
}

export function useLocalCustomer(authUserId: string | null, customerId: string | null): UseLocalCustomerResult {
  const db = useMemo(() => authUserId ? getDb(authUserId) : null, [authUserId])

  useEffect(() => {
    if (!db || !customerId) return
    const supabase = createClient()
    void customersRepo.lazyFetch(db, supabase, customerId)
    void phonesRepo.lazyFetch(db, supabase, customerId)
    void addressesRepo.lazyFetch(db, supabase, customerId)
    void productsRepo.lazyFetch(db, supabase, customerId)
  }, [db, customerId])

  const customer = useLiveQuery(
    () => (db && customerId) ? customersRepo.getById(db, customerId) : Promise.resolve(undefined),
    [db, customerId],
  )
  const phones = useLiveQuery(
    () => (db && customerId) ? phonesRepo.listByCustomer(db, customerId) : Promise.resolve([]),
    [db, customerId],
  )
  const addresses = useLiveQuery(
    () => (db && customerId) ? addressesRepo.listByCustomer(db, customerId) : Promise.resolve([]),
    [db, customerId],
  )
  const products = useLiveQuery(
    () => (db && customerId) ? productsRepo.listByCustomer(db, customerId) : Promise.resolve([]),
    [db, customerId],
  )

  return {
    customer: customer ?? null,
    phones: phones ?? [],
    addresses: addresses ?? [],
    products: products ?? [],
    loading: customer === undefined && customerId != null,
  }
}
